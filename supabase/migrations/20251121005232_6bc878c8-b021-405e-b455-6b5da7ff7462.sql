-- Criar trigger para registrar TODAS as mudanças nos atendimentos, não apenas status
CREATE OR REPLACE FUNCTION public.registrar_historico_completo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_nome_var TEXT;
  current_user_id UUID;
  campos_alterados_arr TEXT[] := ARRAY[]::TEXT[];
  valores_anteriores_obj JSONB := '{}'::JSONB;
  valores_novos_obj JSONB := '{}'::JSONB;
  acao_descricao TEXT := 'Atualização';
BEGIN
  -- Buscar user_id
  current_user_id := COALESCE(auth.uid(), NEW.user_id);
  
  -- Buscar nome do usuário
  SELECT nome INTO user_nome_var 
  FROM profiles 
  WHERE id = current_user_id;

  -- Verificar cada campo que mudou
  IF OLD.assunto IS DISTINCT FROM NEW.assunto THEN
    campos_alterados_arr := array_append(campos_alterados_arr, 'assunto');
    valores_anteriores_obj := valores_anteriores_obj || jsonb_build_object('assunto', OLD.assunto);
    valores_novos_obj := valores_novos_obj || jsonb_build_object('assunto', NEW.assunto);
  END IF;

  IF OLD.prioridade IS DISTINCT FROM NEW.prioridade THEN
    campos_alterados_arr := array_append(campos_alterados_arr, 'prioridade');
    valores_anteriores_obj := valores_anteriores_obj || jsonb_build_object('prioridade', OLD.prioridade);
    valores_novos_obj := valores_novos_obj || jsonb_build_object('prioridade', NEW.prioridade);
  END IF;

  IF OLD.responsavel_id IS DISTINCT FROM NEW.responsavel_id THEN
    campos_alterados_arr := array_append(campos_alterados_arr, 'responsavel_id');
    valores_anteriores_obj := valores_anteriores_obj || jsonb_build_object('responsavel_id', OLD.responsavel_id);
    valores_novos_obj := valores_novos_obj || jsonb_build_object('responsavel_id', NEW.responsavel_id);
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    campos_alterados_arr := array_append(campos_alterados_arr, 'status');
    valores_anteriores_obj := valores_anteriores_obj || jsonb_build_object('status', OLD.status);
    valores_novos_obj := valores_novos_obj || jsonb_build_object('status', NEW.status);
    acao_descricao := 'Alteração de Status';
  END IF;

  IF OLD.fluxo_id IS DISTINCT FROM NEW.fluxo_id THEN
    campos_alterados_arr := array_append(campos_alterados_arr, 'fluxo_id');
    valores_anteriores_obj := valores_anteriores_obj || jsonb_build_object('fluxo_id', OLD.fluxo_id);
    valores_novos_obj := valores_novos_obj || jsonb_build_object('fluxo_id', NEW.fluxo_id);
    acao_descricao := 'Mudança de Fluxo';
  END IF;

  IF OLD.corretora_id IS DISTINCT FROM NEW.corretora_id THEN
    campos_alterados_arr := array_append(campos_alterados_arr, 'corretora_id');
    valores_anteriores_obj := valores_anteriores_obj || jsonb_build_object('corretora_id', OLD.corretora_id);
    valores_novos_obj := valores_novos_obj || jsonb_build_object('corretora_id', NEW.corretora_id);
  END IF;

  IF OLD.contato_id IS DISTINCT FROM NEW.contato_id THEN
    campos_alterados_arr := array_append(campos_alterados_arr, 'contato_id');
    valores_anteriores_obj := valores_anteriores_obj || jsonb_build_object('contato_id', OLD.contato_id);
    valores_novos_obj := valores_novos_obj || jsonb_build_object('contato_id', NEW.contato_id);
  END IF;

  IF OLD.observacoes IS DISTINCT FROM NEW.observacoes THEN
    campos_alterados_arr := array_append(campos_alterados_arr, 'observacoes');
    valores_anteriores_obj := valores_anteriores_obj || jsonb_build_object('observacoes', OLD.observacoes);
    valores_novos_obj := valores_novos_obj || jsonb_build_object('observacoes', NEW.observacoes);
  END IF;

  IF OLD.tags::TEXT IS DISTINCT FROM NEW.tags::TEXT THEN
    campos_alterados_arr := array_append(campos_alterados_arr, 'tags');
    valores_anteriores_obj := valores_anteriores_obj || jsonb_build_object('tags', OLD.tags);
    valores_novos_obj := valores_novos_obj || jsonb_build_object('tags', NEW.tags);
  END IF;

  -- Registrar apenas se houve mudanças
  IF array_length(campos_alterados_arr, 1) > 0 THEN
    INSERT INTO atendimentos_historico (
      atendimento_id,
      user_id,
      user_nome,
      acao,
      campos_alterados,
      valores_anteriores,
      valores_novos
    ) VALUES (
      NEW.id,
      current_user_id,
      COALESCE(user_nome_var, 'Sistema'),
      acao_descricao,
      to_jsonb(campos_alterados_arr),
      valores_anteriores_obj,
      valores_novos_obj
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Remover trigger antigo e criar novo
DROP TRIGGER IF EXISTS trigger_registrar_historico_status ON public.atendimentos;

CREATE TRIGGER trigger_registrar_historico_completo
AFTER UPDATE ON public.atendimentos
FOR EACH ROW
EXECUTE FUNCTION public.registrar_historico_completo();