-- Os boletos importados da API Hinova não trazem cooperativa/regional (a API
-- de boletos não retorna esses campos), deixando vazios os cards de
-- inadimplência e os rankings de Regionais/Cooperativas em Cobrança.
--
-- Solução: enriquecer cobranca_boletos com cooperativa/regional do CADASTRO
-- ativo da corretora, casando por placa (1ª placa do boleto) e, em fallback,
-- por CPF. Um worker em lotes (pg_cron, a cada minuto) faz o backfill e
-- mantém os novos boletos enriquecidos; linhas processadas são marcadas com
-- dados_extras->'_enr' e saem do índice parcial de pendências.

CREATE INDEX IF NOT EXISTS idx_cobranca_boletos_enr_pending
ON public.cobranca_boletos (COALESCE(data_vencimento_original, data_vencimento) DESC, id)
WHERE (cooperativa IS NULL OR cooperativa = '') AND NOT (COALESCE(dados_extras,'{}'::jsonb) ? '_enr');

CREATE OR REPLACE FUNCTION public.enriquecer_cobranca_worker(p_batch integer DEFAULT 20000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET statement_timeout TO '55s'
AS $function$
DECLARE
  v_scanned int := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _lk_placa (corretora_id uuid, placa_n text, cooperativa text, regional text) ON COMMIT DROP;
  DELETE FROM _lk_placa;
  INSERT INTO _lk_placa
  SELECT DISTINCT ON (ca.corretora_id, x.placa_n) ca.corretora_id, x.placa_n, x.cooperativa, x.regional
  FROM (
    SELECT DISTINCT ON (corretora_id) corretora_id, id FROM cadastro_importacoes WHERE ativo ORDER BY corretora_id, created_at DESC
  ) ca
  JOIN LATERAL (
    SELECT upper(regexp_replace(COALESCE(cr.placa,''), '[^A-Za-z0-9]', '', 'g')) AS placa_n,
           NULLIF(cr.cooperativa,'') AS cooperativa, NULLIF(cr.regional,'') AS regional
    FROM cadastro_registros cr WHERE cr.importacao_id = ca.id
  ) x ON x.placa_n <> '' AND (x.cooperativa IS NOT NULL OR x.regional IS NOT NULL);
  CREATE INDEX IF NOT EXISTS _lk_placa_idx ON _lk_placa (corretora_id, placa_n);

  CREATE TEMP TABLE IF NOT EXISTS _lk_cpf (corretora_id uuid, cpf_n text, cooperativa text, regional text) ON COMMIT DROP;
  DELETE FROM _lk_cpf;
  INSERT INTO _lk_cpf
  SELECT DISTINCT ON (ca.corretora_id, x.cpf_n) ca.corretora_id, x.cpf_n, x.cooperativa, x.regional
  FROM (
    SELECT DISTINCT ON (corretora_id) corretora_id, id FROM cadastro_importacoes WHERE ativo ORDER BY corretora_id, created_at DESC
  ) ca
  JOIN LATERAL (
    SELECT regexp_replace(COALESCE(cr.cpf,''), '[^0-9]', '', 'g') AS cpf_n,
           NULLIF(cr.cooperativa,'') AS cooperativa, NULLIF(cr.regional,'') AS regional
    FROM cadastro_registros cr WHERE cr.importacao_id = ca.id
  ) x ON x.cpf_n <> '' AND (x.cooperativa IS NOT NULL OR x.regional IS NOT NULL);
  CREATE INDEX IF NOT EXISTS _lk_cpf_idx ON _lk_cpf (corretora_id, cpf_n);

  WITH alvo AS (
    SELECT cb.id, ci.corretora_id,
      upper(regexp_replace(split_part(COALESCE(cb.placas,''), ',', 1), '[^A-Za-z0-9]', '', 'g')) AS placa_n,
      regexp_replace(COALESCE(cb.dados_extras->>'cpf',''), '[^0-9]', '', 'g') AS cpf_n
    FROM cobranca_boletos cb
    JOIN cobranca_importacoes ci ON ci.id = cb.importacao_id AND ci.ativo
    WHERE (cb.cooperativa IS NULL OR cb.cooperativa = '')
      AND NOT (COALESCE(cb.dados_extras,'{}'::jsonb) ? '_enr')
    ORDER BY COALESCE(cb.data_vencimento_original, cb.data_vencimento) DESC NULLS LAST
    LIMIT p_batch
  )
  UPDATE cobranca_boletos cb
  SET cooperativa = COALESCE(lp.cooperativa, lc.cooperativa, cb.cooperativa),
      regional_boleto = COALESCE(NULLIF(cb.regional_boleto,''), lp.regional, lc.regional),
      dados_extras = COALESCE(cb.dados_extras,'{}'::jsonb) || '{"_enr":1}'::jsonb
  FROM alvo a
  LEFT JOIN _lk_placa lp ON lp.corretora_id = a.corretora_id AND a.placa_n <> '' AND lp.placa_n = a.placa_n
  LEFT JOIN _lk_cpf lc ON lc.corretora_id = a.corretora_id AND a.cpf_n <> '' AND lc.cpf_n = a.cpf_n
  WHERE cb.id = a.id;
  GET DIAGNOSTICS v_scanned = ROW_COUNT;

  IF v_scanned > 0 THEN
    DELETE FROM cobranca_dashboard_cache;
  END IF;

  RETURN jsonb_build_object('success', true, 'processados', v_scanned);
END;
$function$;

-- Agenda o worker (idempotente: unschedule + schedule)
DO $$
BEGIN
  PERFORM cron.unschedule('enriquecer-cobranca-worker');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('enriquecer-cobranca-worker', '* * * * *', 'SELECT public.enriquecer_cobranca_worker(20000)');
