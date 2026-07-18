-- ============================================================================
-- Cobrança: separar "Em aberto" (a vencer) de "Vencido" (conferência UONI x SGA).
--
-- O SGA reporta "em aberto" apenas os boletos AINDA NO PRAZO. Os vencidos e não
-- pagos ele trata à parte. Nós somávamos os dois num número só, o que inflava
-- tanto o "em aberto" quanto o percentual de inadimplência.
--
-- Junho/2026 (VALECAR): dos 332 "em aberto" que mostrávamos, 182 estão a vencer
-- (R$ 34.434,82 — o SGA reporta 184 / R$ 34.780,01) e 150 estão vencidos.
--
-- Assinatura inalterada: CREATE OR REPLACE aqui é seguro (não gera sobrecarga).
-- Campos antigos preservados; os novos são adicionais.
-- ============================================================================

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
    count(*) FILTER (WHERE upper(situacao)='ABERTO') AS qtde_abertos,
    -- Separa o "em aberto" como o SGA faz: A VENCER (ainda no prazo) x
    -- VENCIDO (passou do vencimento e não foi pago). Antes os dois eram
    -- somados num número só, inflando a inadimplência.
    count(*) FILTER (WHERE upper(situacao)='ABERTO'
      AND COALESCE(data_vencimento, data_vencimento_original) >= hoje) AS qtde_a_vencer,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='ABERTO'
      AND COALESCE(data_vencimento, data_vencimento_original) >= hoje),0) AS total_a_vencer,
    count(*) FILTER (WHERE upper(situacao)='ABERTO'
      AND COALESCE(data_vencimento, data_vencimento_original) < hoje) AS qtde_vencidos,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='ABERTO'
      AND COALESCE(data_vencimento, data_vencimento_original) < hoje),0) AS total_vencido
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
  -- Novos: permitem bater com o SGA, que separa "em aberto" de "vencido".
  'qtdeAVencer', t.qtde_a_vencer,
  'totalAVencer', t.total_a_vencer,
  'qtdeVencidos', t.qtde_vencidos,
  'totalVencido', t.total_vencido,
  'percentualAVencer', CASE WHEN t.total_boletos>0 THEN round(t.qtde_a_vencer::numeric/t.total_boletos*100,2) ELSE 0 END,
  'percentualVencidos', CASE WHEN t.total_boletos>0 THEN round(t.qtde_vencidos::numeric/t.total_boletos*100,2) ELSE 0 END,
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
