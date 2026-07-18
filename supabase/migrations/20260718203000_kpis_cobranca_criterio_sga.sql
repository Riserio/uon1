-- KPIs de cobranca no criterio do Relatorio de Boletos do SGA.
--
-- Conferencia de jun/26 (VALECAR), com o filtro "Boletos Anteriores: NAO POSSUI"
-- + "Referencia: Vencimento Original" na tela legada Relatorio > de Boletos:
--   SGA:   184 abertos / R$ 34.780,01 | 4.675 pagos | 4.859 emitidos
--   Nosso: 182 abertos / R$ 34.434,82 | 4.690 pagos | 4.872 emitidos
--
-- O cruzamento dos 4.959 nosso_numero exportados contra a nossa base mostrou que
-- os 184 do relatorio estao TODOS na nossa base com o mesmo valor, e que o
-- discriminador dos 148 que o SGA descarta e o vencimento PRORROGADO:
--   182 de 184 incluidos tem data_vencimento <> data_vencimento_original
--     0 de 148 excluidos tem.
-- As 2 diferencas sao prorrogacoes feitas entre o import (08h09) e a geracao do
-- relatorio (20h06) do mesmo dia — mesma deriva vista em pagos e emitidos.
--
-- Funcao separada de propósito: a agregacao principal deduplica por dedup_key,
-- que tem colisao e derruba ~200 boletos por mes. Aqui a chave e o nosso_numero,
-- que e unico no SGA (5.022 distintos para 5.022 linhas em jun/26).

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
