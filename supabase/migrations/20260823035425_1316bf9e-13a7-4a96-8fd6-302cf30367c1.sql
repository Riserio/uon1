CREATE OR REPLACE FUNCTION public.enfileirar_sync_diario()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
-- Reabre o ciclo diário de sincronização em todas as associações com API ativa.
--
-- Por que existe: _processar_fila_sync marca a linha como 'concluido' ao fim
-- do ciclo e como 'erro' após 5 tentativas, e nada devolvia essas linhas para
-- 'pendente'. A fila secava e a importação parava em silêncio.
--
-- 2026-08-23: além de cobranca_recente, agora também reabrimos 'eventos' e
-- 'mgf'. Eles ficaram travados em 'concluido' desde julho — as importações
-- simplesmente nunca mais rodaram, e o painel exibia corretamente "há N dias".
--
-- Base NÃO usa _sync_queue: tem tabela de job e worker próprios.
DECLARE v_cob int; v_base int; v_ev int; v_mgf int;
BEGIN
  INSERT INTO public._sync_queue (corretora_id, modulo, status, tentativas, ultimo_erro, updated_at)
  SELECT h.corretora_id, 'cobranca_recente', 'pendente', 0, NULL, now()
  FROM public.hinova_credenciais h
  WHERE h.usar_api AND h.ativo_cobranca
    AND h.api_token IS NOT NULL AND length(h.api_token) > 10
  ON CONFLICT (corretora_id, modulo) DO UPDATE
    SET status='pendente', tentativas=0, ultimo_erro=NULL, updated_at=now();
  GET DIAGNOSTICS v_cob = ROW_COUNT;

  INSERT INTO public._sync_queue (corretora_id, modulo, status, tentativas, ultimo_erro, updated_at)
  SELECT h.corretora_id, 'eventos', 'pendente', 0, NULL, now()
  FROM public.hinova_credenciais h
  WHERE h.usar_api AND h.ativo_eventos
    AND h.api_token IS NOT NULL AND length(h.api_token) > 10
  ON CONFLICT (corretora_id, modulo) DO UPDATE
    SET status='pendente', tentativas=0, ultimo_erro=NULL, updated_at=now();
  GET DIAGNOSTICS v_ev = ROW_COUNT;

  INSERT INTO public._sync_queue (corretora_id, modulo, status, tentativas, ultimo_erro, updated_at)
  SELECT h.corretora_id, 'mgf', 'pendente', 0, NULL, now()
  FROM public.hinova_credenciais h
  WHERE h.usar_api AND h.ativo_mgf
    AND h.api_token IS NOT NULL AND length(h.api_token) > 10
  ON CONFLICT (corretora_id, modulo) DO UPDATE
    SET status='pendente', tentativas=0, ultimo_erro=NULL, updated_at=now();
  GET DIAGNOSTICS v_mgf = ROW_COUNT;

  -- Só reabre base que não esteja com coleta viva em andamento.
  INSERT INTO public.base_api_jobs (corretora_id, fase, cursor_off, coletados, esperado, ctx, ultimo_erro, iniciado_em, updated_at)
  SELECT h.corretora_id, 'lookups', 0, 0, NULL, '{}'::jsonb, NULL, now(), now()
  FROM public.hinova_credenciais h
  WHERE h.usar_api AND h.api_token IS NOT NULL AND length(h.api_token) > 10
  ON CONFLICT (corretora_id) DO UPDATE
    SET fase='lookups', cursor_off=0, coletados=0, esperado=NULL, ctx='{}'::jsonb,
        ultimo_erro=NULL, iniciado_em=now(), updated_at=now()
  WHERE public.base_api_jobs.fase IN ('concluido','erro')
     OR public.base_api_jobs.updated_at < now() - interval '30 minutes';
  GET DIAGNOSTICS v_base = ROW_COUNT;

  DELETE FROM public.base_api_stg s
  WHERE EXISTS (SELECT 1 FROM public.base_api_jobs j
                WHERE j.corretora_id=s.corretora_id AND j.fase='lookups');

  RETURN jsonb_build_object('success', true, 'cobranca_recente', v_cob,
                            'eventos', v_ev, 'mgf', v_mgf, 'base', v_base);
END;
$fn$;

-- Regulariza imediatamente as associações paradas (eventos/mgf desde julho).
INSERT INTO public._sync_queue (corretora_id, modulo, status, tentativas, ultimo_erro, updated_at)
SELECT h.corretora_id, m.modulo, 'pendente', 0, NULL, now()
FROM public.hinova_credenciais h
CROSS JOIN LATERAL (VALUES ('eventos'), ('mgf')) AS m(modulo)
WHERE h.usar_api AND h.api_token IS NOT NULL AND length(h.api_token) > 10
  AND ((m.modulo = 'eventos' AND h.ativo_eventos) OR (m.modulo = 'mgf' AND h.ativo_mgf))
ON CONFLICT (corretora_id, modulo) DO UPDATE
  SET status='pendente', tentativas=0, ultimo_erro=NULL, updated_at=now();