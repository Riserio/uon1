-- Base de cálculo da inadimplência por associação: total (padrão) ou somente vencidos
ALTER TABLE public.cobranca_automacao_config
  ADD COLUMN IF NOT EXISTS inadimplencia_base text NOT NULL DEFAULT 'total';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cobranca_automacao_config_inadimplencia_base_check') THEN
    ALTER TABLE public.cobranca_automacao_config
      ADD CONSTRAINT cobranca_automacao_config_inadimplencia_base_check
      CHECK (inadimplencia_base IN ('total','vencidos'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.calcular_resumo_cobranca(p_importacao_ids uuid[], p_mes_referencia text, p_somente_vencidos boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '90s'
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
    upper(coalesce(cb.situacao,'')) AS sit, cb.valor, cb.cooperativa, cb.dia_vencimento_veiculo,
    upper(regexp_replace(split_part(cb.placas, ',', 1), '[^A-Za-z0-9]', '', 'g')) AS placa
  FROM cobranca_boletos cb, mes_range mr
  WHERE cb.importacao_id = ANY(p_importacao_ids)
    AND (mr.ini IS NULL OR (COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= mr.ini
                            AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) < mr.fim))
    AND (NOT p_somente_vencidos
         OR COALESCE(cb.data_vencimento_original, cb.data_vencimento) < current_date)
  ORDER BY COALESCE(cb.dados_extras->>'nosso_numero', cb.dedup_key, cb.id::text), cb.valor DESC NULLS LAST
),
sga AS (
  SELECT * FROM deduped d
  WHERE d.sit <> 'CANCELADO'
    AND NOT EXISTS (SELECT 1 FROM placas_com_debito pcd WHERE pcd.placa = d.placa)
),
agg AS (
  SELECT
    count(*) FILTER (WHERE sit='ABERTO') AS abertos,
    count(*) FILTER (WHERE sit='BAIXADO') AS baixados,
    count(*) AS emitidos,
    coalesce(sum(valor),0) AS valor_total,
    coalesce(sum(valor) FILTER (WHERE sit='BAIXADO'),0) AS valor_pago,
    coalesce(sum(valor) FILTER (WHERE sit='ABERTO'),0) AS valor_aberto
  FROM sga
),
por_dia_calc AS (
  SELECT jsonb_object_agg(d.dia, jsonb_build_object('gerados', gerados, 'abertos', abertos)) AS j
  FROM (
    SELECT d.dia,
      count(*) FILTER (WHERE r.dia_vencimento_veiculo = d.dia) AS gerados,
      count(*) FILTER (WHERE r.dia_vencimento_veiculo = d.dia AND r.sit='ABERTO') AS abertos
    FROM (VALUES (5),(10),(15),(20)) AS d(dia)
    LEFT JOIN sga r ON r.dia_vencimento_veiculo = d.dia
    GROUP BY d.dia
  ) d
),
maior_calc AS (
  SELECT jsonb_build_object('nome', nome, 'percentual', percentual) AS j
  FROM (
    SELECT COALESCE(cooperativa,'Sem cooperativa') AS nome,
      round(count(*) FILTER (WHERE sit='ABERTO')::numeric / count(*) * 100, 1) AS percentual
    FROM sga GROUP BY COALESCE(cooperativa,'Sem cooperativa')
    HAVING count(*) >= 5 ORDER BY percentual DESC LIMIT 1
  ) x
),
menor_calc AS (
  SELECT jsonb_build_object('nome', nome, 'percentual', percentual) AS j
  FROM (
    SELECT COALESCE(cooperativa,'Sem cooperativa') AS nome,
      round(count(*) FILTER (WHERE sit='ABERTO')::numeric / count(*) * 100, 1) AS percentual
    FROM sga GROUP BY COALESCE(cooperativa,'Sem cooperativa')
    HAVING count(*) >= 5 ORDER BY percentual ASC LIMIT 1
  ) x
)
SELECT jsonb_build_object(
  'total_gerados', a.emitidos,
  'total_abertos', a.abertos,
  'total_baixados', a.baixados,
  'faturamento_esperado', a.valor_total,
  'faturamento_recebido', a.valor_pago,
  'valor_aberto', a.valor_aberto,
  'por_dia', COALESCE((SELECT j FROM por_dia_calc), '{}'::jsonb),
  'maior_inadimplencia', COALESCE((SELECT j FROM maior_calc), jsonb_build_object('nome','N/A','percentual',0)),
  'menor_inadimplencia', COALESCE((SELECT j FROM menor_calc), jsonb_build_object('nome','N/A','percentual',100))
) FROM agg a;


$function$;
