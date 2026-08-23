CREATE OR REPLACE FUNCTION public.calcular_kpis_cobranca_sga(p_importacao_ids uuid[], p_mes_referencia text DEFAULT NULL::text, p_regional text DEFAULT NULL::text, p_cooperativa text DEFAULT NULL::text, p_somente_vencidos boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET statement_timeout TO '90s'
AS $function$
WITH mes_range AS (
  SELECT
    CASE WHEN p_mes_referencia IS NULL THEN NULL::date ELSE to_date(p_mes_referencia||'-01','YYYY-MM-DD') END AS ini,
    CASE WHEN p_mes_referencia IS NULL THEN NULL::date ELSE (to_date(p_mes_referencia||'-01','YYYY-MM-DD') + interval '1 month')::date END AS fim
),
placas_com_debito AS (
  SELECT DISTINCT upper(regexp_replace(split_part(cb.placas, ',', 1), '[^A-Za-z0-9]', '', 'g')) AS placa
  FROM cobranca_boletos cb, mes_range mr
  WHERE mr.ini IS NOT NULL
    AND cb.importacao_id = ANY(p_importacao_ids)
    AND upper(coalesce(cb.situacao,'')) = 'ABERTO'
    AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) <  mr.ini
    AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= (mr.ini - interval '6 months')
    AND upper(regexp_replace(split_part(cb.placas, ',', 1), '[^A-Za-z0-9]', '', 'g')) <> ''
),
deduped AS (
  SELECT DISTINCT ON (COALESCE(cb.dados_extras->>'nosso_numero', cb.dedup_key, cb.id::text))
    upper(coalesce(cb.situacao,'')) AS sit, cb.valor, cb.regional_boleto, cb.cooperativa,
    COALESCE(cb.data_vencimento_original, cb.data_vencimento) AS venc,
    upper(regexp_replace(split_part(cb.placas, ',', 1), '[^A-Za-z0-9]', '', 'g')) AS placa
  FROM cobranca_boletos cb, mes_range mr
  WHERE cb.importacao_id = ANY(p_importacao_ids)
    AND (mr.ini IS NULL OR (COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= mr.ini
                            AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) < mr.fim))
  ORDER BY COALESCE(cb.dados_extras->>'nosso_numero', cb.dedup_key, cb.id::text), cb.valor DESC NULLS LAST
),
base AS (
  SELECT d.*,
         (d.sit = 'ABERTO' AND (NOT p_somente_vencidos OR d.venc < (now() AT TIME ZONE 'America/Sao_Paulo')::date)) AS aberto_ok
  FROM deduped d
  WHERE d.sit <> 'CANCELADO'
    AND (p_regional IS NULL OR d.regional_boleto = p_regional)
    AND (p_cooperativa IS NULL OR d.cooperativa = p_cooperativa)
),
sga AS (
  SELECT * FROM base b
  WHERE NOT EXISTS (SELECT 1 FROM placas_com_debito pcd WHERE pcd.placa = b.placa)
),
agg_bruto AS (
  SELECT count(*) FILTER (WHERE aberto_ok) AS ab, count(*) AS emit,
         coalesce(sum(valor) FILTER (WHERE aberto_ok),0) AS v_ab
  FROM base
),
agg_sga AS (
  SELECT count(*) FILTER (WHERE aberto_ok) AS abertos,
         count(*) FILTER (WHERE sit='BAIXADO') AS pagos,
         count(*) AS emit,
         coalesce(sum(valor),0) AS v_total,
         coalesce(sum(valor) FILTER (WHERE sit='BAIXADO'),0) AS v_pago,
         coalesce(sum(valor) FILTER (WHERE aberto_ok),0) AS v_aberto
  FROM sga
)
SELECT jsonb_build_object(
  'qtdePagos', s.pagos, 'totalPago', s.v_pago,
  'qtdeAbertos', s.abertos, 'totalAberto', s.v_aberto,
  'qtdeEmitidos', s.emit, 'totalValor', s.v_total,
  'percentualInadimplencia', CASE WHEN s.emit>0 THEN round(s.abertos::numeric/s.emit*100,2) ELSE 0 END,
  'qtdeAbertosTotal', b.ab, 'totalAbertoTotal', b.v_ab,
  'qtdeSemProrrogacao', b.ab - s.abertos,
  'qtdeEmitidosTotal', b.emit,
  'percentualInadimplenciaTotal', CASE WHEN b.emit>0 THEN round(b.ab::numeric/b.emit*100,2) ELSE 0 END,
  'somenteVencidos', p_somente_vencidos
) FROM agg_sga s, agg_bruto b;
$function$;