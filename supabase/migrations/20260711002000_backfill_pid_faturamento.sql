-- Reconstrói Faturamento vs Recebido retroativo no PID (pid_operacional) a
-- partir do histórico de boletos da API Hinova. Os meses antigos só tinham
-- placas_ativas (derivadas da data de contrato); faturamento/recebido ficavam
-- zerados e os gráficos não mostravam o período. O worker (pg_cron) processa
-- uma corretora por minuto e se desagenda ao terminar. Meses já preenchidos
-- (ex.: por planilha) NÃO são alterados.

CREATE TABLE IF NOT EXISTS public.backfill_pid_fat_progress (
  corretora_id uuid PRIMARY KEY,
  done_at timestamptz NOT NULL DEFAULT now(),
  meses_atualizados int,
  meses_inseridos int
);

CREATE OR REPLACE FUNCTION public.backfill_pid_faturamento_worker()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET statement_timeout TO '55s'
SET work_mem TO '256MB'
AS $function$
DECLARE
  v_corretora uuid;
  v_upd int := 0;
  v_ins int := 0;
BEGIN
  SELECT ci.corretora_id INTO v_corretora
  FROM cobranca_importacoes ci
  WHERE ci.ativo
    AND NOT EXISTS (SELECT 1 FROM backfill_pid_fat_progress p WHERE p.corretora_id = ci.corretora_id)
  GROUP BY ci.corretora_id
  ORDER BY sum(ci.total_registros) ASC NULLS FIRST
  LIMIT 1;

  IF v_corretora IS NULL THEN
    BEGIN
      PERFORM cron.unschedule('backfill-pid-faturamento');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object('done', true);
  END IF;

  WITH imp AS (
    SELECT id FROM cobranca_importacoes WHERE corretora_id = v_corretora AND ativo
  ),
  dedup AS (
    SELECT DISTINCT ON (cb.dedup_key) cb.valor, cb.situacao,
      date_trunc('month', COALESCE(cb.data_vencimento_original, cb.data_vencimento))::date AS mes_ref
    FROM cobranca_boletos cb JOIN imp ON imp.id = cb.importacao_id
    WHERE COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= '2015-01-01'
      AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) < (date_trunc('month', now()) + interval '1 month')::date
      AND upper(coalesce(cb.situacao,'')) <> 'CANCELADO'
    ORDER BY cb.dedup_key, cb.valor DESC NULLS LAST
  ),
  agg AS (
    SELECT extract(year from mes_ref)::int AS ano, extract(month from mes_ref)::int AS mes,
      round(coalesce(sum(valor),0)::numeric, 2) AS fat,
      round(coalesce(sum(valor) FILTER (WHERE upper(situacao) = 'BAIXADO'),0)::numeric, 2) AS rec
    FROM dedup
    GROUP BY 1, 2
    HAVING coalesce(sum(valor),0) > 0
  ),
  upd AS (
    UPDATE pid_operacional p
    SET faturamento_operacional = a.fat,
        total_recebido = a.rec,
        updated_at = now()
    FROM agg a
    WHERE p.corretora_id = v_corretora AND p.ano = a.ano AND p.mes = a.mes
      AND coalesce(p.faturamento_operacional, 0) = 0
      AND coalesce(p.total_recebido, 0) = 0
    RETURNING 1
  ),
  ins AS (
    INSERT INTO pid_operacional (corretora_id, ano, mes, faturamento_operacional, total_recebido)
    SELECT v_corretora, a.ano, a.mes, a.fat, a.rec
    FROM agg a
    WHERE NOT EXISTS (
      SELECT 1 FROM pid_operacional p WHERE p.corretora_id = v_corretora AND p.ano = a.ano AND p.mes = a.mes
    )
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM upd), (SELECT count(*) FROM ins) INTO v_upd, v_ins;

  INSERT INTO backfill_pid_fat_progress (corretora_id, meses_atualizados, meses_inseridos)
  VALUES (v_corretora, v_upd, v_ins);

  RETURN jsonb_build_object('corretora', v_corretora, 'atualizados', v_upd, 'inseridos', v_ins);
END;
$function$;

DO $$
BEGIN
  PERFORM cron.unschedule('backfill-pid-faturamento');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('backfill-pid-faturamento', '* * * * *', 'SELECT public.backfill_pid_faturamento_worker()');
