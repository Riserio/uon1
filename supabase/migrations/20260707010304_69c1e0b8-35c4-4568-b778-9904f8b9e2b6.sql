
CREATE OR REPLACE FUNCTION public.executar_importacao_hinova_bg(
  p_modulo text,
  p_corretora_id uuid,
  p_execucao_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET statement_timeout TO '15min'
AS $fn$
DECLARE
  v_result jsonb;
  v_success boolean;
  v_message text;
  v_total int;
  v_exec_table text;
  v_config_table text;
BEGIN
  IF p_modulo = 'cobranca' THEN
    v_exec_table := 'cobranca_automacao_execucoes';
    v_config_table := 'cobranca_automacao_config';
  ELSIF p_modulo = 'eventos' THEN
    v_exec_table := 'sga_automacao_execucoes';
    v_config_table := 'sga_automacao_config';
  ELSIF p_modulo = 'mgf' THEN
    v_exec_table := 'mgf_automacao_execucoes';
    v_config_table := 'mgf_automacao_config';
  ELSE
    RAISE EXCEPTION 'Módulo inválido: %', p_modulo;
  END IF;

  BEGIN
    IF p_modulo = 'cobranca' THEN
      SELECT public.importar_cobranca_api(p_corretora_id) INTO v_result;
    ELSIF p_modulo = 'eventos' THEN
      SELECT public.importar_eventos_api(p_corretora_id, false) INTO v_result;
    ELSIF p_modulo = 'mgf' THEN
      SELECT public.importar_mgf_api(p_corretora_id) INTO v_result;
    END IF;
    v_success := COALESCE((v_result->>'success')::boolean, true);
    v_total := COALESCE(
      NULLIF(v_result->>'total','')::int,
      NULLIF(v_result->>'historico_inserido','')::int,
      NULLIF(v_result->>'incremento','')::int,
      NULLIF(v_result->>'novos','')::int,
      NULL
    );
    v_message := COALESCE(v_result->>'message', 'Importado via API Hinova');
  EXCEPTION WHEN OTHERS THEN
    v_success := false;
    v_message := SQLERRM;
  END;

  IF v_success THEN
    EXECUTE format(
      'UPDATE public.%I SET status=$1, etapa_atual=$2, mensagem=$3, registros_processados=$4, finalizado_at=now() WHERE id=$5',
      v_exec_table
    ) USING 'sucesso','concluido',
            'Importado via API Hinova' || COALESCE(' ('||v_total||' registros)',''),
            v_total, p_execucao_id;

    EXECUTE format(
      'UPDATE public.%I SET ultimo_status=$1, ultimo_erro=NULL, ultima_execucao=now(), ultima_origem=$2 WHERE corretora_id=$3',
      v_config_table
    ) USING 'sucesso', 'api', p_corretora_id;
  ELSE
    EXECUTE format(
      'UPDATE public.%I SET status=$1, etapa_atual=$2, erro=$3, mensagem=$4, finalizado_at=now() WHERE id=$5',
      v_exec_table
    ) USING 'erro','api', v_message, 'Importação via API falhou; fallback GitHub desativado.', p_execucao_id;

    EXECUTE format(
      'UPDATE public.%I SET ultimo_status=$1, ultimo_erro=$2, ultima_execucao=now(), ultima_origem=$3 WHERE corretora_id=$4',
      v_config_table
    ) USING 'erro', v_message, 'api', p_corretora_id;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.executar_importacao_hinova_bg(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.executar_importacao_hinova_bg(text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.agendar_importacao_hinova_async(
  p_modulo text,
  p_corretora_id uuid,
  p_execucao_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'cron'
AS $fn$
DECLARE
  v_job text;
  v_cmd text;
BEGIN
  v_job := 'hinova_bg_' || p_modulo || '_' || replace(p_execucao_id::text, '-', '');
  v_cmd := format(
    'DO $body$ BEGIN BEGIN PERFORM public.executar_importacao_hinova_bg(%L, %L::uuid, %L::uuid); EXCEPTION WHEN OTHERS THEN NULL; END; PERFORM cron.unschedule(%L); END $body$;',
    p_modulo, p_corretora_id, p_execucao_id, v_job
  );
  PERFORM cron.schedule(v_job, '* * * * *', v_cmd);
  RETURN v_job;
END;
$fn$;

REVOKE ALL ON FUNCTION public.agendar_importacao_hinova_async(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agendar_importacao_hinova_async(text, uuid, uuid) TO service_role;
