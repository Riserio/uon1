CREATE OR REPLACE FUNCTION public._processar_fila_sync()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_result jsonb;
  v_started timestamptz := clock_timestamp();
  v_done int := 0;
  v_ids bigint[] := '{}';
  v_mods text[] := '{}';
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('fila_sync')::bigint) THEN
    RETURN jsonb_build_object('skipped', true, 'message', 'ciclo ja em execucao');
  END IF;

  LOOP
    EXIT WHEN v_done >= 5;
    EXIT WHEN clock_timestamp() > v_started + interval '80 seconds';

    -- 1a tentativa: modulo ainda nao processado neste ciclo (round-robin justo)
    SELECT * INTO v_row FROM public._sync_queue
    WHERE status = 'pendente'
      AND modulo IN ('cobranca_recente','eventos','mgf')
      AND NOT (id = ANY(v_ids))
      AND NOT (modulo = ANY(v_mods))
    ORDER BY tentativas ASC, updated_at ASC NULLS FIRST, id ASC
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT * INTO v_row FROM public._sync_queue
      WHERE status = 'pendente'
        AND modulo IN ('cobranca_recente','eventos','mgf')
        AND NOT (id = ANY(v_ids))
      ORDER BY tentativas ASC, updated_at ASC NULLS FIRST, id ASC
      LIMIT 1;
    END IF;

    EXIT WHEN NOT FOUND;
    v_ids := v_ids || v_row.id::bigint;
    IF NOT (v_row.modulo = ANY(v_mods)) THEN
      v_mods := v_mods || v_row.modulo;
    END IF;

    BEGIN
      IF v_row.modulo = 'cobranca_recente' THEN
        SELECT public.importar_cobranca_recente_api(v_row.corretora_id) INTO v_result;
        IF COALESCE((v_result->>'completo')::boolean, false) OR COALESCE((v_result->>'skipped')::boolean, false) THEN
          UPDATE public._sync_queue SET status='concluido', updated_at=now() WHERE id=v_row.id;
        ELSIF COALESCE((v_result->>'success')::boolean, false) THEN
          UPDATE public._sync_queue SET updated_at=now(), ultimo_erro='em progresso' WHERE id=v_row.id;
        ELSE
          UPDATE public._sync_queue SET tentativas=tentativas+1, updated_at=now(),
            ultimo_erro = COALESCE(v_result->>'message', 'falhou') WHERE id=v_row.id;
          IF v_row.tentativas >= 60 THEN
            UPDATE public._sync_queue SET status='erro', ultimo_erro='excedeu tentativas' WHERE id=v_row.id;
          END IF;
        END IF;
      ELSIF v_row.modulo = 'eventos' THEN
        PERFORM public.importar_eventos_api(v_row.corretora_id, false);
        UPDATE public._sync_queue SET status='concluido', updated_at=now() WHERE id=v_row.id;
      ELSIF v_row.modulo = 'mgf' THEN
        PERFORM public.importar_mgf_api(v_row.corretora_id);
        UPDATE public._sync_queue SET status='concluido', updated_at=now() WHERE id=v_row.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public._sync_queue SET tentativas=tentativas+1, ultimo_erro=SQLERRM, updated_at=now() WHERE id=v_row.id;
      IF v_row.tentativas >= 4 THEN
        UPDATE public._sync_queue SET status='erro' WHERE id=v_row.id;
      END IF;
    END;

    v_done := v_done + 1;
  END LOOP;

  RETURN jsonb_build_object('processados', v_done, 'modulos', v_mods);
END;
$function$;