-- 2026-10-15 — Fila de sincronização: rodízio justo + limite de tempo do worker.
-- JÁ APLICADO no banco; este arquivo registra o estado (idempotente).
--
-- 1) O banco tem statement_timeout global de 120 s (postgresql.conf). O
--    "SET statement_timeout" declarado DENTRO das funções de importação não
--    estende esse limite, porque o relógio é armado no comando de nível
--    superior (o do pg_cron). Resultado: todo ciclo acima de 2 min era
--    cancelado e desfeito por inteiro. O job do worker passa a abrir com
--    SET statement_timeout = '280s' (abaixo do intervalo de 5 min; o
--    advisory lock evita sobreposição).
--
-- 2) A ordem da fila era "tentativas ASC" primeiro. Itens de cobrança
--    "em progresso" ficam com tentativas = 0 indefinidamente, então qualquer
--    item que tivesse falhado uma vez nunca mais era escolhido (foi o caso
--    dos eventos da UNIÃO). Agora é rodízio pelo item há mais tempo parado.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.alter_job(jobid, command := $cmd$SET statement_timeout = '280s'; SELECT public._processar_fila_sync();$cmd$)
    FROM cron.job WHERE jobname = 'sync-fila-worker';
  END IF;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public._processar_fila_sync()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record; v_result jsonb; v_started timestamptz := clock_timestamp();
  v_done int := 0; v_ids bigint[] := '{}'; v_mods text[] := '{}';
  v_ok boolean; v_completo boolean; v_msg text; v_timeout boolean := false;
  c_max_tentativas constant int := 6;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('fila_sync')::bigint) THEN
    RETURN jsonb_build_object('skipped', true, 'message', 'ciclo ja em execucao');
  END IF;

  LOOP
    EXIT WHEN v_done >= 5 OR v_timeout;
    -- só começa item novo com folga: um item pode levar alguns minutos
    EXIT WHEN clock_timestamp() > v_started + interval '45 seconds';

    SELECT * INTO v_row FROM public._sync_queue
    WHERE status = 'pendente' AND modulo IN ('cobranca_recente','eventos','mgf')
      AND NOT (id = ANY(v_ids)) AND NOT (modulo = ANY(v_mods))
    ORDER BY updated_at ASC NULLS FIRST, tentativas ASC, id ASC LIMIT 1;
    IF NOT FOUND THEN
      SELECT * INTO v_row FROM public._sync_queue
      WHERE status = 'pendente' AND modulo IN ('cobranca_recente','eventos','mgf')
        AND NOT (id = ANY(v_ids))
      ORDER BY updated_at ASC NULLS FIRST, tentativas ASC, id ASC LIMIT 1;
    END IF;
    EXIT WHEN NOT FOUND;

    v_ids := v_ids || v_row.id::bigint;
    IF NOT (v_row.modulo = ANY(v_mods)) THEN v_mods := v_mods || v_row.modulo; END IF;
    v_result := NULL;

    BEGIN
      IF v_row.modulo = 'cobranca_recente' THEN
        v_result := public.importar_cobranca_recente_api(v_row.corretora_id);
      ELSIF v_row.modulo = 'eventos' THEN
        v_result := public.importar_eventos_api(v_row.corretora_id, false);
      ELSIF v_row.modulo = 'mgf' THEN
        v_result := public.importar_mgf_api(v_row.corretora_id);
      END IF;

      v_ok := COALESCE((v_result->>'success')::boolean, false);
      v_completo := COALESCE((v_result->>'completo')::boolean, true) OR COALESCE((v_result->>'skipped')::boolean, false);
      v_msg := left(COALESCE(v_result->>'message', 'falhou sem mensagem'), 500);

      IF v_ok AND v_completo THEN
        UPDATE public._sync_queue SET status='concluido', tentativas=0, ultimo_erro=NULL, updated_at=now() WHERE id=v_row.id;
      ELSIF v_ok THEN
        UPDATE public._sync_queue SET updated_at=now(), ultimo_erro='em progresso' WHERE id=v_row.id;
      ELSE
        UPDATE public._sync_queue SET tentativas=tentativas+1, updated_at=now(), ultimo_erro=v_msg,
          status = CASE WHEN tentativas+1 >= c_max_tentativas THEN 'erro' ELSE status END
        WHERE id=v_row.id;
      END IF;
    EXCEPTION
      WHEN query_canceled THEN
        v_timeout := true;
        UPDATE public._sync_queue SET tentativas=tentativas+1, updated_at=now(), ultimo_erro='timeout na importação',
          status = CASE WHEN tentativas+1 >= c_max_tentativas THEN 'erro' ELSE status END
        WHERE id=v_row.id;
      WHEN OTHERS THEN
        UPDATE public._sync_queue SET tentativas=tentativas+1, updated_at=now(), ultimo_erro=left(SQLERRM,500),
          status = CASE WHEN tentativas+1 >= c_max_tentativas THEN 'erro' ELSE status END
        WHERE id=v_row.id;
    END;
    v_done := v_done + 1;
  END LOOP;

  RETURN jsonb_build_object('processados', v_done, 'modulos', v_mods, 'timeout', v_timeout);
END;
$function$;
