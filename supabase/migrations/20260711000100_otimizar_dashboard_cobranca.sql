-- Otimização do dashboard de Cobrança: os gráficos não carregavam porque a
-- agregação varria TODOS os boletos (~2M) das importações ativas antes de
-- aplicar o filtro de mês, estourando o timeout em cache frio.
--
-- Mudanças:
-- 1. Índice por (importacao_id, vencimento de referência, dedup_key, valor)
--    para acelerar o recorte por mês.
-- 2. calcular_dashboard_cobranca: o filtro de mês (p_mes_referencia) é
--    aplicado ANTES da deduplicação, reduzindo o conjunto de trabalho de
--    milhões de linhas para apenas o mês exibido. Comparação por faixa de
--    datas (indexável) em vez de to_char().

CREATE INDEX IF NOT EXISTS idx_cobranca_boletos_imp_vencref
ON public.cobranca_boletos (importacao_id, (COALESCE(data_vencimento_original, data_vencimento)), dedup_key, valor DESC);

CREATE OR REPLACE FUNCTION public.calcular_dashboard_cobranca(p_importacao_ids uuid[], p_mes_referencia text DEFAULT NULL::text, p_situacao text DEFAULT NULL::text, p_regional text DEFAULT NULL::text, p_cooperativa text DEFAULT NULL::text, p_dia_vencimento integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET work_mem TO '256MB'
AS $function$
WITH params2 AS MATERIALIZED (
  SELECT
    (now() at time zone 'America/Sao_Paulo')::date AS hoje,
    date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date AS month_start,
    extract(day from (now() at time zone 'America/Sao_Paulo')::date)::int AS dia_hoje,
    extract(day from (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) + interval '1 month - 1 day'))::int AS dias_do_mes
),
mes_range AS MATERIALIZED (
  SELECT
    CASE WHEN p_mes_referencia IS NULL THEN NULL::date
         ELSE to_date(p_mes_referencia || '-01', 'YYYY-MM-DD') END AS ini,
    CASE WHEN p_mes_referencia IS NULL THEN NULL::date
         ELSE (to_date(p_mes_referencia || '-01', 'YYYY-MM-DD') + interval '1 month')::date END AS fim
),
deduped AS MATERIALIZED (
  SELECT DISTINCT ON (cb.dedup_key) cb.*
  FROM cobranca_boletos cb, mes_range mr
  WHERE cb.importacao_id = ANY(p_importacao_ids)
    AND (mr.ini IS NULL OR (
      COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= mr.ini
      AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) < mr.fim))
  ORDER BY cb.dedup_key, cb.valor DESC NULLS LAST
),
filtrado AS MATERIALIZED (
  SELECT
    d.*,
    COALESCE(d.dia_vencimento_veiculo, extract(day from d.data_vencimento_original)::int) AS dia_venc,
    p2.hoje, p2.month_start, p2.dia_hoje, p2.dias_do_mes,
    CASE extract(dow from (p2.month_start + (COALESCE(d.dia_vencimento_veiculo, extract(day from d.data_vencimento_original)::int) - 1) * interval '1 day'))
      WHEN 6 THEN COALESCE(d.dia_vencimento_veiculo, extract(day from d.data_vencimento_original)::int) + 2
      WHEN 0 THEN COALESCE(d.dia_vencimento_veiculo, extract(day from d.data_vencimento_original)::int) + 1
      ELSE COALESCE(d.dia_vencimento_veiculo, extract(day from d.data_vencimento_original)::int)
    END AS dia_util_ref
  FROM deduped d
  CROSS JOIN params2 p2
  WHERE upper(coalesce(d.situacao,'')) <> 'CANCELADO'
    AND (p_situacao IS NULL OR upper(d.situacao) = upper(p_situacao))
    AND (p_regional IS NULL OR d.regional_boleto = p_regional)
    AND (p_cooperativa IS NULL OR d.cooperativa = p_cooperativa)
    AND (p_dia_vencimento IS NULL OR d.dia_vencimento_veiculo = p_dia_vencimento)
),
totals AS MATERIALIZED (
  SELECT
    count(*) AS total_boletos,
    coalesce(sum(valor),0) AS total_valor,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='BAIXADO'),0) AS total_pago,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='ABERTO'),0) AS total_aberto,
    count(*) FILTER (WHERE upper(situacao)='BAIXADO') AS qtde_pagos,
    count(*) FILTER (WHERE upper(situacao)='ABERTO') AS qtde_abertos
  FROM filtrado
),
grouped_dia AS MATERIALIZED (
  SELECT
    dia_venc AS dia,
    count(*) AS emitido,
    coalesce(sum(valor),0) AS emitido_valor,
    count(*) FILTER (WHERE upper(situacao)='BAIXADO') AS pago,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='BAIXADO'),0) AS pago_valor,
    count(*) FILTER (WHERE upper(situacao)='ABERTO') AS aberto,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='ABERTO'),0) AS aberto_valor
  FROM filtrado
  WHERE dia_venc IS NOT NULL
  GROUP BY dia_venc
),
dias_vencimento_data AS MATERIALIZED (
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'dia', 'Dia ' || dia, 'diaNum', dia, 'qtde', emitido, 'valor', emitido_valor,
      'pagos', pago, 'pagosValor', pago_valor, 'abertos', aberto, 'abertosValor', aberto_valor,
      'percPago', CASE WHEN emitido>0 THEN round(pago::numeric/emitido*100,2) ELSE 0 END,
      'percAberto', CASE WHEN emitido>0 THEN round(aberto::numeric/emitido*100,2) ELSE 0 END
    ) ORDER BY dia
  ), '[]'::jsonb) AS j
  FROM grouped_dia
),
regionais_pagos_base AS MATERIALIZED (
  SELECT regional_boleto AS name, count(*) qtde, coalesce(sum(valor),0) valor FROM filtrado
  WHERE upper(situacao)='BAIXADO' AND regional_boleto IS NOT NULL AND regional_boleto <> ''
  GROUP BY regional_boleto
),
regionais_pagos AS MATERIALIZED (
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'qtde', qtde, 'valor', valor) ORDER BY valor DESC), '[]'::jsonb) AS j FROM regionais_pagos_base
),
regionais_abertos_base AS MATERIALIZED (
  SELECT regional_boleto AS name, count(*) qtde, coalesce(sum(valor),0) valor FROM filtrado
  WHERE upper(situacao)='ABERTO' AND regional_boleto IS NOT NULL AND regional_boleto <> ''
  GROUP BY regional_boleto
),
regionais_abertos AS MATERIALIZED (
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'qtde', qtde, 'valor', valor) ORDER BY valor DESC), '[]'::jsonb) AS j FROM regionais_abertos_base
),
cooperativas_pagos_base AS MATERIALIZED (
  SELECT cooperativa AS name, count(*) qtde, coalesce(sum(valor),0) valor FROM filtrado
  WHERE upper(situacao)='BAIXADO' AND cooperativa IS NOT NULL AND cooperativa <> ''
  GROUP BY cooperativa
),
cooperativas_pagos AS MATERIALIZED (
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'qtde', qtde, 'valor', valor) ORDER BY valor DESC), '[]'::jsonb) AS j FROM cooperativas_pagos_base
),
cooperativas_abertos_base AS MATERIALIZED (
  SELECT cooperativa AS name, count(*) qtde, coalesce(sum(valor),0) valor FROM filtrado
  WHERE upper(situacao)='ABERTO' AND cooperativa IS NOT NULL AND cooperativa <> ''
  GROUP BY cooperativa
),
cooperativas_abertos AS MATERIALIZED (
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'qtde', qtde, 'valor', valor) ORDER BY valor DESC), '[]'::jsonb) AS j FROM cooperativas_abertos_base
),
regionais_inad_base AS MATERIALIZED (
  SELECT regional_boleto AS name, count(*) total,
    count(*) FILTER (WHERE upper(situacao)='ABERTO') abertos,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='ABERTO'),0) valor,
    CASE WHEN count(*)>0 THEN round(count(*) FILTER (WHERE upper(situacao)='ABERTO')::numeric/count(*)*100,2) ELSE 0 END percentual
  FROM filtrado
  WHERE regional_boleto IS NOT NULL AND regional_boleto <> ''
  GROUP BY regional_boleto
  HAVING count(*) >= 5
),
regionais_menor AS MATERIALIZED (SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'total',total,'abertos',abertos,'valor',valor,'percentual',percentual) ORDER BY percentual ASC), '[]'::jsonb) j FROM regionais_inad_base),
regionais_maior AS MATERIALIZED (SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'total',total,'abertos',abertos,'valor',valor,'percentual',percentual) ORDER BY percentual DESC), '[]'::jsonb) j FROM regionais_inad_base),
cooperativas_inad_base AS MATERIALIZED (
  SELECT cooperativa AS name, count(*) total,
    count(*) FILTER (WHERE upper(situacao)='ABERTO') abertos,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='ABERTO'),0) valor,
    CASE WHEN count(*)>0 THEN round(count(*) FILTER (WHERE upper(situacao)='ABERTO')::numeric/count(*)*100,2) ELSE 0 END percentual
  FROM filtrado
  WHERE cooperativa IS NOT NULL AND cooperativa <> ''
  GROUP BY cooperativa
  HAVING count(*) >= 5
),
cooperativas_menor AS MATERIALIZED (SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'total',total,'abertos',abertos,'valor',valor,'percentual',percentual) ORDER BY percentual ASC), '[]'::jsonb) j FROM cooperativas_inad_base),
cooperativas_maior AS MATERIALIZED (SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'total',total,'abertos',abertos,'valor',valor,'percentual',percentual) ORDER BY percentual DESC), '[]'::jsonb) j FROM cooperativas_inad_base),
arrecadacao_base AS MATERIALIZED (
  SELECT dia, coalesce(sum(projetado),0) projetado, coalesce(sum(recebido),0) recebido
  FROM (
    SELECT extract(day from data_vencimento)::int AS dia, valor AS projetado, 0 AS recebido
    FROM filtrado WHERE data_vencimento IS NOT NULL
    UNION ALL
    SELECT extract(day from data_pagamento)::int AS dia, 0 AS projetado, valor AS recebido
    FROM filtrado WHERE data_pagamento IS NOT NULL AND upper(situacao)='BAIXADO'
  ) u
  GROUP BY dia
),
arrecadacao AS MATERIALIZED (
  SELECT coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'diaLabel', 'Dia ' || dia, 'projetado', projetado, 'recebido', recebido) ORDER BY dia), '[]'::jsonb) AS j
  FROM arrecadacao_base
),
dias_serie AS MATERIALIZED (
  SELECT generate_series(1, (SELECT dias_do_mes FROM params2)) AS dia
),
emitidos_pontos AS MATERIALIZED (
  SELECT dia_util_ref AS d, count(*) AS c, count(*) FILTER (WHERE upper(situacao)='ABERTO') AS c_ab
  FROM filtrado
  GROUP BY dia_util_ref
),
pagos_pontos AS MATERIALIZED (
  SELECT threshold AS d, count(*) AS c
  FROM (
    SELECT GREATEST(f.dia_util_ref, (f.data_pagamento - f.month_start)::int + 1) AS threshold
    FROM filtrado f
    WHERE upper(f.situacao)='BAIXADO' AND f.data_pagamento IS NOT NULL
  ) x
  GROUP BY threshold
),
all_points AS MATERIALIZED (
  SELECT dia AS d FROM dias_serie
  UNION
  SELECT d FROM emitidos_pontos
  UNION
  SELECT d FROM pagos_pontos
),
emit_cum AS MATERIALIZED (
  SELECT ap.d,
    sum(coalesce(ep.c,0)) OVER (ORDER BY ap.d) AS cum_emitidos,
    sum(coalesce(ep.c_ab,0)) OVER (ORDER BY ap.d) AS cum_abertos
  FROM all_points ap LEFT JOIN emitidos_pontos ep ON ep.d = ap.d
),
pago_cum AS MATERIALIZED (
  SELECT ap.d, sum(coalesce(pp.c,0)) OVER (ORDER BY ap.d) AS cum_pagos
  FROM all_points ap LEFT JOIN pagos_pontos pp ON pp.d = ap.d
),
inad_final AS MATERIALIZED (
  SELECT
    ds.dia,
    ec.cum_emitidos AS qtde_emitidos,
    pc.cum_pagos AS qtde_pagos,
    ec.cum_abertos AS qtde_abertos_ate_dia,
    CASE WHEN ds.dia >= (SELECT dia_hoje FROM params2) THEN
      CASE WHEN (SELECT total_boletos FROM totals) > 0 THEN round((SELECT qtde_abertos FROM totals)::numeric / (SELECT total_boletos FROM totals) * 100, 2) ELSE 0 END
    ELSE
      CASE WHEN ec.cum_emitidos > 0 THEN round((ec.cum_emitidos - pc.cum_pagos)::numeric / ec.cum_emitidos * 100, 2) ELSE 0 END
    END AS inadimplencia_real,
    CASE WHEN ds.dia >= (SELECT dia_hoje FROM params2) THEN ec.cum_abertos ELSE (ec.cum_emitidos - pc.cum_pagos) END AS qtde_vencidos
  FROM dias_serie ds
  JOIN emit_cum ec ON ec.d = ds.dia
  JOIN pago_cum pc ON pc.d = ds.dia
),
inad_json AS MATERIALIZED (
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('dia', dia, 'diaLabel', dia::text, 'inadimplenciaReal', inadimplencia_real,
      'qtdeVencidos', qtde_vencidos, 'qtdePagos', qtde_pagos, 'qtdeEmitidos', qtde_emitidos) ORDER BY dia
  ), '[]'::jsonb) AS j
  FROM inad_final
)
SELECT jsonb_build_object(
  'totalBoletos', t.total_boletos,
  'totalValor', t.total_valor,
  'totalPago', t.total_pago,
  'totalAberto', t.total_aberto,
  'qtdePagos', t.qtde_pagos,
  'qtdeAbertos', t.qtde_abertos,
  'percentualInadimplencia', CASE WHEN t.total_boletos>0 THEN round(t.qtde_abertos::numeric/t.total_boletos*100,2) ELSE 0 END,
  'diasVencimentoData', dv.j,
  'regionaisPagosData', rp.j,
  'regionaisAbertosData', ra.j,
  'cooperativasPagosData', cp.j,
  'cooperativasAbertosData', ca.j,
  'regionaisMenorInadimplencia', rm.j,
  'regionaisMaiorInadimplencia', rma.j,
  'cooperativasMenorInadimplencia', cm.j,
  'cooperativasMaiorInadimplencia', cma.j,
  'arrecadacaoData', arr.j,
  'inadimplenciaPorDia', ij.j
)
FROM totals t, dias_vencimento_data dv, regionais_pagos rp, regionais_abertos ra,
     cooperativas_pagos cp, cooperativas_abertos ca, regionais_menor rm, regionais_maior rma,
     cooperativas_menor cm, cooperativas_maior cma, arrecadacao arr, inad_json ij;
$function$;

-- calcular_resumo_cobranca (usada pelo resumo WhatsApp e pelos RELATÓRIOS EM
-- PDF via gerar-resumo-geral/gerar-pdf-resumo-geral): mesmo problema — o
-- filtro de mês com to_char() forçava full scan e a função estourava o
-- timeout, fazendo o PDF sair sem dados. Agora usa faixa de datas indexável
-- e reaproveita a coluna dedup_key mantida por trigger (em vez de recalcular
-- unaccent/regexp por linha).
CREATE OR REPLACE FUNCTION public.calcular_resumo_cobranca(p_importacao_ids uuid[], p_mes_referencia text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_total int; v_abertos int; v_baixados int;
  v_faturamento numeric; v_recebido numeric; v_aberto numeric;
  v_por_dia jsonb;
  v_maior jsonb; v_menor jsonb;
  v_ini date; v_fim date;
BEGIN
  IF p_mes_referencia IS NOT NULL THEN
    v_ini := to_date(p_mes_referencia || '-01', 'YYYY-MM-DD');
    v_fim := (v_ini + interval '1 month')::date;
  END IF;

  WITH base AS (
    SELECT cb.*, cb.dedup_key AS dk
    FROM cobranca_boletos cb
    WHERE cb.importacao_id = ANY(p_importacao_ids)
      AND upper(coalesce(cb.situacao, '')) <> 'CANCELADO'
      AND (
        v_ini IS NULL
        OR (COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= v_ini
            AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) < v_fim)
      )
  ),
  deduped AS (
    SELECT DISTINCT ON (dk) *
    FROM base
    ORDER BY dk, valor DESC NULLS LAST
  ),
  por_dia_calc AS (
    SELECT jsonb_object_agg(d.dia, jsonb_build_object('gerados', gerados, 'abertos', abertos)) AS j
    FROM (
      SELECT d.dia,
        count(*) FILTER (WHERE b.dia_vencimento_veiculo = d.dia) AS gerados,
        count(*) FILTER (WHERE b.dia_vencimento_veiculo = d.dia AND upper(b.situacao) = 'ABERTO') AS abertos
      FROM (VALUES (5),(10),(15),(20)) AS d(dia)
      LEFT JOIN deduped b ON b.dia_vencimento_veiculo = d.dia
      GROUP BY d.dia
    ) d
  ),
  maior_calc AS (
    SELECT jsonb_build_object('nome', nome, 'percentual', percentual) AS j
    FROM (
      SELECT COALESCE(cooperativa, 'Sem cooperativa') AS nome,
        round(count(*) FILTER (WHERE upper(situacao)='ABERTO')::numeric / count(*) * 100, 1) AS percentual
      FROM deduped
      GROUP BY COALESCE(cooperativa, 'Sem cooperativa')
      HAVING count(*) >= 5
      ORDER BY percentual DESC
      LIMIT 1
    ) x
  ),
  menor_calc AS (
    SELECT jsonb_build_object('nome', nome, 'percentual', percentual) AS j
    FROM (
      SELECT COALESCE(cooperativa, 'Sem cooperativa') AS nome,
        round(count(*) FILTER (WHERE upper(situacao)='ABERTO')::numeric / count(*) * 100, 1) AS percentual
      FROM deduped
      GROUP BY COALESCE(cooperativa, 'Sem cooperativa')
      HAVING count(*) >= 5
      ORDER BY percentual ASC
      LIMIT 1
    ) x
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE upper(deduped.situacao) = 'ABERTO'),
    count(*) FILTER (WHERE upper(deduped.situacao) LIKE '%BAIXADO%'),
    COALESCE(sum(deduped.valor), 0),
    COALESCE(sum(deduped.valor) FILTER (WHERE upper(deduped.situacao) LIKE '%BAIXADO%'), 0),
    COALESCE(sum(deduped.valor) FILTER (WHERE upper(deduped.situacao) = 'ABERTO'), 0),
    (SELECT j FROM por_dia_calc),
    (SELECT j FROM maior_calc),
    (SELECT j FROM menor_calc)
  INTO v_total, v_abertos, v_baixados, v_faturamento, v_recebido, v_aberto, v_por_dia, v_maior, v_menor
  FROM deduped;

  RETURN jsonb_build_object(
    'total_gerados', v_total, 'total_abertos', v_abertos, 'total_baixados', v_baixados,
    'faturamento_esperado', v_faturamento, 'faturamento_recebido', v_recebido, 'valor_aberto', v_aberto,
    'por_dia', COALESCE(v_por_dia, '{}'::jsonb),
    'maior_inadimplencia', COALESCE(v_maior, jsonb_build_object('nome','N/A','percentual',0)),
    'menor_inadimplencia', COALESCE(v_menor, jsonb_build_object('nome','N/A','percentual',100))
  );
END;
$function$;
