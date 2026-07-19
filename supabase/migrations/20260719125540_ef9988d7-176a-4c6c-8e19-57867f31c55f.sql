CREATE OR REPLACE FUNCTION public.calcular_kpis_cobranca_sga(
  p_importacao_ids uuid[],
  p_mes_referencia text DEFAULT NULL,
  p_regional text DEFAULT NULL,
  p_cooperativa text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
SET statement_timeout TO '90s'
AS $function$
WITH mes_range AS (
  SELECT
    CASE WHEN p_mes_referencia IS NULL THEN NULL::date
         ELSE to_date(p_mes_referencia || '-01','YYYY-MM-DD') END AS ini,
    CASE WHEN p_mes_referencia IS NULL THEN NULL::date
         ELSE (to_date(p_mes_referencia || '-01','YYYY-MM-DD') + interval '1 month')::date END AS fim
),
deduped AS (
  SELECT DISTINCT ON (COALESCE(cb.dados_extras->>'nosso_numero', cb.id::text)) cb.*
  FROM cobranca_boletos cb, mes_range mr
  WHERE cb.importacao_id = ANY(p_importacao_ids)
    AND (mr.ini IS NULL OR (
      COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= mr.ini
      AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) < mr.fim))
  ORDER BY COALESCE(cb.dados_extras->>'nosso_numero', cb.id::text), cb.valor DESC NULLS LAST
),
f AS (
  SELECT * FROM deduped d
  WHERE upper(coalesce(d.situacao,'')) NOT IN ('CANCELADO','EXCLUIDO')
    AND (p_regional IS NULL OR d.regional_boleto = p_regional)
    AND (p_cooperativa IS NULL OR d.cooperativa = p_cooperativa)
),
t AS (
  SELECT
    count(*) FILTER (WHERE upper(situacao)='BAIXADO') AS pagos,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='BAIXADO'),0) AS valor_pago,
    count(*) FILTER (WHERE upper(situacao)='ABERTO'
      AND data_vencimento IS DISTINCT FROM data_vencimento_original) AS abertos,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='ABERTO'
      AND data_vencimento IS DISTINCT FROM data_vencimento_original),0) AS valor_aberto,
    count(*) FILTER (WHERE upper(situacao)='ABERTO') AS abertos_total,
    coalesce(sum(valor) FILTER (WHERE upper(situacao)='ABERTO'),0) AS valor_aberto_total
  FROM f
)
SELECT jsonb_build_object(
  'qtdePagos', pagos, 'totalPago', valor_pago,
  'qtdeAbertos', abertos, 'totalAberto', valor_aberto,
  'qtdeEmitidos', pagos + abertos, 'totalValor', valor_pago + valor_aberto,
  'percentualInadimplencia',
    CASE WHEN pagos + abertos > 0 THEN round(abertos::numeric/(pagos+abertos)*100,2) ELSE 0 END,
  'qtdeAbertosTotal', abertos_total, 'totalAbertoTotal', valor_aberto_total,
  'qtdeSemProrrogacao', abertos_total - abertos
) FROM t;
$function$;

CREATE OR REPLACE FUNCTION public.kpis_cobranca_sga(
  p_corretora_id uuid,
  p_mes_referencia text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $function$
  SELECT public.calcular_kpis_cobranca_sga(
    (SELECT array_agg(bi.id) FROM cobranca_importacoes bi
     WHERE bi.corretora_id = p_corretora_id AND bi.ativo),
    p_mes_referencia
  );
$function$;

GRANT EXECUTE ON FUNCTION public.calcular_kpis_cobranca_sga(uuid[], text, text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.kpis_cobranca_sga(uuid, text) TO authenticated, anon;

DO $$
DECLARE d text; n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid=p.pronamespace AND nsp.nspname='public'
  WHERE p.proname='calcular_dashboard_cobranca';

  n := 0;
  IF position('DISTINCT ON (cb.dedup_key)' in d) > 0 THEN n := n + 1; END IF;
  IF position('ORDER BY cb.dedup_key, cb.valor DESC NULLS LAST' in d) > 0 THEN n := n + 1; END IF;
  IF n <> 2 THEN
    RAISE NOTICE 'Trechos nao encontrados (%). Nada alterado.', n;
    RETURN;
  END IF;

  d := replace(d, 'DISTINCT ON (cb.dedup_key)',
                  'DISTINCT ON (COALESCE(cb.dados_extras->>''nosso_numero'', cb.dedup_key, cb.id::text))');
  d := replace(d, 'ORDER BY cb.dedup_key, cb.valor DESC NULLS LAST',
                  'ORDER BY COALESCE(cb.dados_extras->>''nosso_numero'', cb.dedup_key, cb.id::text), cb.valor DESC NULLS LAST');
  EXECUTE d;
END $$;