DROP FUNCTION IF EXISTS public.get_dashboard_cobranca_cached(uuid[],text,text,text,text,integer,integer,boolean,text);
DROP FUNCTION IF EXISTS public.calcular_dashboard_cobranca(uuid[],text,text,text,text,integer,text);
CREATE OR REPLACE FUNCTION public.calcular_dashboard_cobranca(p_importacao_ids uuid[], p_mes_referencia text DEFAULT NULL::text, p_situacao text DEFAULT NULL::text, p_regional text DEFAULT NULL::text, p_cooperativa text DEFAULT NULL::text, p_dia_vencimento integer DEFAULT NULL::integer, p_criterio text DEFAULT 'total'::text, p_tipos text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET work_mem TO '256MB'
 SET statement_timeout TO '90s'
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
placas_com_debito AS MATERIALIZED (
  SELECT DISTINCT upper(regexp_replace(split_part(cb.placas, ',', 1), '[^A-Za-z0-9]', '', 'g')) AS placa
  FROM cobranca_boletos cb, mes_range mr
  WHERE p_criterio = 'sga' AND mr.ini IS NOT NULL
    AND cb.importacao_id = ANY(p_importacao_ids)
    AND upper(coalesce(cb.situacao,'')) = 'ABERTO'
    AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) <  mr.ini
    AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= (mr.ini - interval '6 months')
    AND upper(regexp_replace(split_part(cb.placas, ',', 1), '[^A-Za-z0-9]', '', 'g')) <> ''
),
deduped AS MATERIALIZED (
  SELECT DISTINCT ON (COALESCE(cb.dados_extras->>'nosso_numero', cb.dedup_key, cb.id::text)) cb.*
  FROM cobranca_boletos cb, mes_range mr
  WHERE cb.importacao_id = ANY(p_importacao_ids)
    AND (mr.ini IS NULL OR (
      COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= mr.ini
      AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) < mr.fim))
  ORDER BY COALESCE(cb.dados_extras->>'nosso_numero', cb.dedup_key, cb.id::text), cb.valor DESC NULLS LAST
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
  WHERE upper(coalesce(d.situacao,'')) NOT IN ('CANCELADO','EXCLUIDO','EXCLUÍDO')
    AND (p_tipos IS NULL OR cardinality(p_tipos) = 0 OR COALESCE(nullif(upper(btrim(d.dados_extras->>'tipo_boleto')),''), 'SEM TIPO') = ANY (SELECT upper(btrim(t)) FROM unnest(p_tipos) t))
    AND (p_criterio <> 'sga' OR NOT EXISTS (
      SELECT 1 FROM placas_com_debito pcd
      WHERE pcd.placa = upper(regexp_replace(split_part(d.placas, ',', 1), '[^A-Za-z0-9]', '', 'g'))))
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
    count(*) FILTER (WHERE upper(situacao)='ABERTO'
      AND COALESCE(data_vencimento, data_vencimento_original) < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS qtde_vencidos_mes,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='ABERTO'
      AND COALESCE(data_vencimento, data_vencimento_original) < (now() AT TIME ZONE 'America/Sao_Paulo')::date),0) AS total_vencido_mes
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
  'qtdeVencidosMes', t.qtde_vencidos_mes,
  'totalVencidoMes', t.total_vencido_mes,
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

CREATE OR REPLACE FUNCTION public.get_dashboard_cobranca_cached(p_importacao_ids uuid[], p_mes_referencia text DEFAULT NULL::text, p_situacao text DEFAULT NULL::text, p_regional text DEFAULT NULL::text, p_cooperativa text DEFAULT NULL::text, p_dia_vencimento integer DEFAULT NULL::integer, p_max_age_minutes integer DEFAULT 20, p_force_refresh boolean DEFAULT false, p_criterio text DEFAULT 'total'::text, p_tipos text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET statement_timeout TO '90s'
AS $function$
DECLARE
  v_key text;
  v_payload jsonb;
  v_computed_at timestamptz;
BEGIN
  v_key := md5(
    (SELECT string_agg(x::text, ',' ORDER BY x) FROM unnest(p_importacao_ids) x) || '|' ||
    coalesce(p_mes_referencia,'') || '|' || coalesce(p_situacao,'') || '|' ||
    coalesce(p_regional,'') || '|' || coalesce(p_cooperativa,'') || '|' || coalesce(p_dia_vencimento::text,'') || '|' || coalesce(p_criterio,'total') || '|' ||
    coalesce((SELECT string_agg(upper(btrim(t)), ',' ORDER BY upper(btrim(t))) FROM unnest(p_tipos) t),'') || '|' ||
    (SELECT md5(pg_get_functiondef(pr.oid)) FROM pg_proc pr
      JOIN pg_namespace ns ON ns.oid=pr.pronamespace AND ns.nspname='public'
     WHERE pr.proname='calcular_dashboard_cobranca' LIMIT 1)
  );

  IF NOT p_force_refresh THEN
    SELECT payload, computed_at INTO v_payload, v_computed_at
    FROM cobranca_dashboard_cache WHERE cache_key = v_key;

    IF v_payload IS NOT NULL AND v_computed_at > now() - (p_max_age_minutes || ' minutes')::interval THEN
      RETURN v_payload;
    END IF;
  END IF;

  v_payload := calcular_dashboard_cobranca(p_importacao_ids, p_mes_referencia, p_situacao, p_regional, p_cooperativa, p_dia_vencimento, p_criterio, p_tipos);

  INSERT INTO cobranca_dashboard_cache (cache_key, payload, computed_at)
  VALUES (v_key, v_payload, now())
  ON CONFLICT (cache_key) DO UPDATE SET payload = excluded.payload, computed_at = excluded.computed_at;

  RETURN v_payload;
END;
$function$;