-- 1) A fila processava apenas 1 item a cada 5 minutos (288/dia) e a ordenação
-- por (tentativas, id) fazia as mesmas associações de id baixo monopolizarem os
-- ciclos — módulos de outras associações ficavam dias sem rodar.
-- Agora: lote de até 8 itens por execução, com orçamento de tempo, e ordenação
-- justa (quem foi processado por último vai para o fim da fila).
CREATE OR REPLACE FUNCTION public._processar_fila_sync()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row record;
  v_result jsonb;
  v_started timestamptz := clock_timestamp();
  v_done int := 0;
  v_ids bigint[] := '{}';
BEGIN
  LOOP
    EXIT WHEN v_done >= 8;
    EXIT WHEN clock_timestamp() > v_started + interval '150 seconds';

    SELECT * INTO v_row FROM public._sync_queue
    WHERE status = 'pendente' AND NOT (id = ANY(v_ids))
    ORDER BY tentativas ASC, updated_at ASC NULLS FIRST, id ASC
    LIMIT 1;

    EXIT WHEN NOT FOUND;
    v_ids := v_ids || v_row.id::bigint;

    BEGIN
      IF v_row.modulo = 'cobranca' THEN
        SELECT public.importar_cobranca_api(v_row.corretora_id) INTO v_result;
        IF COALESCE((v_result->>'completo')::boolean, false) OR COALESCE((v_result->>'skipped')::boolean, false) THEN
          UPDATE public._sync_queue SET status='concluido', updated_at=now() WHERE id=v_row.id;
        ELSE
          UPDATE public._sync_queue SET tentativas=tentativas+1, updated_at=now(),
            ultimo_erro = COALESCE(v_result->>'message', 'em progresso') WHERE id=v_row.id;
          IF v_row.tentativas >= 60 THEN
            UPDATE public._sync_queue SET status='erro', ultimo_erro='excedeu tentativas' WHERE id=v_row.id;
          END IF;
        END IF;
      ELSIF v_row.modulo = 'cobranca_recente' THEN
        SELECT public.importar_cobranca_recente_api(v_row.corretora_id) INTO v_result;
        IF COALESCE((v_result->>'completo')::boolean, false) OR COALESCE((v_result->>'skipped')::boolean, false) THEN
          UPDATE public._sync_queue SET status='concluido', updated_at=now() WHERE id=v_row.id;
        ELSIF COALESCE((v_result->>'success')::boolean, false) THEN
          UPDATE public._sync_queue SET updated_at=now(), ultimo_erro='em progresso' WHERE id=v_row.id;
          IF v_row.tentativas >= 60 THEN
            UPDATE public._sync_queue SET status='erro', ultimo_erro='excedeu tentativas' WHERE id=v_row.id;
          END IF;
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
      ELSIF v_row.modulo = 'base' THEN
        PERFORM public.importar_base_api(v_row.corretora_id);
        PERFORM public.derivar_indicadores(v_row.corretora_id);
        UPDATE public._sync_queue SET status='concluido', updated_at=now() WHERE id=v_row.id;
      ELSE
        UPDATE public._sync_queue SET status='erro', ultimo_erro='modulo desconhecido', updated_at=now() WHERE id=v_row.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public._sync_queue SET tentativas=tentativas+1, ultimo_erro=SQLERRM, updated_at=now() WHERE id=v_row.id;
      IF v_row.tentativas >= 4 THEN
        UPDATE public._sync_queue SET status='erro' WHERE id=v_row.id;
      END IF;
    END;

    v_done := v_done + 1;
  END LOOP;

  RETURN jsonb_build_object('processados', v_done);
END;
$function$;

-- 2) Rede de segurança: toda hora, qualquer módulo ativo que esteja há mais de
-- 20h sem importação volta para a fila como pendente (inclusive os que ficaram
-- em 'erro'). Garante ao menos uma sincronização por dia por associação.
CREATE OR REPLACE FUNCTION public.reabrir_sync_atrasado()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_n int := 0; v_t int;
BEGIN
  -- Cobrança
  INSERT INTO public._sync_queue (corretora_id, modulo, status, tentativas, ultimo_erro, updated_at)
  SELECT h.corretora_id, 'cobranca_recente', 'pendente', 0, NULL, now()
  FROM public.hinova_credenciais h
  WHERE h.usar_api AND h.ativo_cobranca AND h.api_token IS NOT NULL AND length(h.api_token) > 10
    AND COALESCE((SELECT max(i.updated_at) FROM public.cobranca_importacoes i WHERE i.corretora_id = h.corretora_id),
                 'epoch'::timestamptz) < now() - interval '20 hours'
  ON CONFLICT (corretora_id, modulo) DO UPDATE
    SET status='pendente', tentativas=0, ultimo_erro=NULL, updated_at=now()
  WHERE public._sync_queue.status <> 'pendente';
  GET DIAGNOSTICS v_t = ROW_COUNT; v_n := v_n + v_t;

  -- Eventos
  INSERT INTO public._sync_queue (corretora_id, modulo, status, tentativas, ultimo_erro, updated_at)
  SELECT h.corretora_id, 'eventos', 'pendente', 0, NULL, now()
  FROM public.hinova_credenciais h
  WHERE h.usar_api AND h.ativo_eventos AND h.api_token IS NOT NULL AND length(h.api_token) > 10
    AND COALESCE((SELECT max(i.updated_at) FROM public.sga_importacoes i WHERE i.corretora_id = h.corretora_id),
                 'epoch'::timestamptz) < now() - interval '20 hours'
  ON CONFLICT (corretora_id, modulo) DO UPDATE
    SET status='pendente', tentativas=0, ultimo_erro=NULL, updated_at=now()
  WHERE public._sync_queue.status <> 'pendente';
  GET DIAGNOSTICS v_t = ROW_COUNT; v_n := v_n + v_t;

  -- MGF
  INSERT INTO public._sync_queue (corretora_id, modulo, status, tentativas, ultimo_erro, updated_at)
  SELECT h.corretora_id, 'mgf', 'pendente', 0, NULL, now()
  FROM public.hinova_credenciais h
  WHERE h.usar_api AND h.ativo_mgf AND h.api_token IS NOT NULL AND length(h.api_token) > 10
    AND COALESCE((SELECT max(i.updated_at) FROM public.mgf_importacoes i WHERE i.corretora_id = h.corretora_id),
                 'epoch'::timestamptz) < now() - interval '20 hours'
  ON CONFLICT (corretora_id, modulo) DO UPDATE
    SET status='pendente', tentativas=0, ultimo_erro=NULL, updated_at=now()
  WHERE public._sync_queue.status <> 'pendente';
  GET DIAGNOSTICS v_t = ROW_COUNT; v_n := v_n + v_t;

  RETURN jsonb_build_object('reabertos', v_n);
END;
$function$;

REVOKE ALL ON FUNCTION public.reabrir_sync_atrasado() FROM PUBLIC, anon, authenticated;