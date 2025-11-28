-- Atualizar trigger para sincronizar corretora_id e dados do veículo da vistoria para o atendimento
CREATE OR REPLACE FUNCTION public.sync_vistoria_to_atendimento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_nome TEXT;
  v_changes JSONB := '{}'::JSONB;
  v_novo_assunto TEXT;
BEGIN
  -- Verificar se há atendimento_id
  IF NEW.atendimento_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pegar nome do usuário que criou (com fallback seguro)
  SELECT nome INTO v_user_nome 
  FROM profiles 
  WHERE id = NEW.created_by
  LIMIT 1;
  
  IF v_user_nome IS NULL THEN
    v_user_nome := 'Sistema';
  END IF;

  -- Construir assunto atualizado se houver dados de cliente/veículo
  v_novo_assunto := NULL;
  IF NEW.cliente_nome IS NOT NULL AND NEW.veiculo_placa IS NOT NULL THEN
    v_novo_assunto := 'Sinistro - ' || NEW.cliente_nome || ' - ' || NEW.veiculo_placa;
  ELSIF NEW.cliente_nome IS NOT NULL THEN
    v_novo_assunto := 'Sinistro - ' || NEW.cliente_nome;
  END IF;

  -- Construir objeto de mudanças para casos importantes
  IF TG_OP = 'INSERT' THEN
    v_changes := jsonb_build_object(
      'origem', 'Vistoria',
      'vistoria_criada', true,
      'tipo_vistoria', NEW.tipo_vistoria,
      'tipo_sinistro', NEW.tipo_sinistro,
      'numero_vistoria', NEW.numero
    );
    
    -- Ao inserir vistoria, atualizar atendimento com TODOS os dados
    UPDATE atendimentos 
    SET tipo_atendimento = 'sinistro',
        assunto = COALESCE(v_novo_assunto, assunto),
        corretora_id = COALESCE(NEW.corretora_id, corretora_id),
        veiculo_marca = COALESCE(NEW.veiculo_marca, veiculo_marca),
        veiculo_modelo = COALESCE(NEW.veiculo_modelo, veiculo_modelo),
        veiculo_ano = COALESCE(NEW.veiculo_ano, veiculo_ano),
        veiculo_tipo = COALESCE(NEW.veiculo_tipo, veiculo_tipo),
        veiculo_valor_fipe = COALESCE(NEW.veiculo_valor_fipe, veiculo_valor_fipe),
        veiculo_fipe_codigo = COALESCE(NEW.veiculo_fipe_codigo, veiculo_fipe_codigo),
        veiculo_fipe_data_consulta = COALESCE(NEW.veiculo_fipe_data_consulta, veiculo_fipe_data_consulta),
        updated_at = now()
    WHERE id = NEW.atendimento_id;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Detectar mudanças significativas
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_changes := jsonb_build_object(
        'origem', 'Vistoria',
        'status_anterior', OLD.status,
        'status_novo', NEW.status,
        'numero_vistoria', NEW.numero
      );
    END IF;
    
    -- Se dados importantes mudaram, sincronizar com atendimento
    IF (OLD.cliente_nome IS DISTINCT FROM NEW.cliente_nome) OR
       (OLD.veiculo_placa IS DISTINCT FROM NEW.veiculo_placa) OR
       (OLD.cliente_cpf IS DISTINCT FROM NEW.cliente_cpf) OR
       (OLD.cliente_email IS DISTINCT FROM NEW.cliente_email) OR
       (OLD.cliente_telefone IS DISTINCT FROM NEW.cliente_telefone) OR
       (OLD.veiculo_marca IS DISTINCT FROM NEW.veiculo_marca) OR
       (OLD.veiculo_modelo IS DISTINCT FROM NEW.veiculo_modelo) OR
       (OLD.veiculo_ano IS DISTINCT FROM NEW.veiculo_ano) OR
       (OLD.veiculo_tipo IS DISTINCT FROM NEW.veiculo_tipo) OR
       (OLD.veiculo_valor_fipe IS DISTINCT FROM NEW.veiculo_valor_fipe) OR
       (OLD.corretora_id IS DISTINCT FROM NEW.corretora_id) OR
       (OLD.tipo_sinistro IS DISTINCT FROM NEW.tipo_sinistro) THEN
      
      -- Atualizar atendimento com todos os dados sincronizados
      UPDATE atendimentos 
      SET assunto = COALESCE(v_novo_assunto, assunto),
          corretora_id = COALESCE(NEW.corretora_id, corretora_id),
          veiculo_marca = COALESCE(NEW.veiculo_marca, veiculo_marca),
          veiculo_modelo = COALESCE(NEW.veiculo_modelo, veiculo_modelo),
          veiculo_ano = COALESCE(NEW.veiculo_ano, veiculo_ano),
          veiculo_tipo = COALESCE(NEW.veiculo_tipo, veiculo_tipo),
          veiculo_valor_fipe = COALESCE(NEW.veiculo_valor_fipe, veiculo_valor_fipe),
          veiculo_fipe_codigo = COALESCE(NEW.veiculo_fipe_codigo, veiculo_fipe_codigo),
          veiculo_fipe_data_consulta = COALESCE(NEW.veiculo_fipe_data_consulta, veiculo_fipe_data_consulta),
          updated_at = now()
      WHERE id = NEW.atendimento_id;
      
      v_changes := v_changes || jsonb_build_object(
        'dados_atualizados', true,
        'cliente_nome', NEW.cliente_nome,
        'veiculo_placa', NEW.veiculo_placa,
        'corretora_id', NEW.corretora_id
      );
    END IF;
  END IF;

  -- Se houver mudanças, tentar registrar no histórico (sem bloquear)
  IF v_changes != '{}'::JSONB THEN
    BEGIN
      INSERT INTO atendimentos_historico (
        atendimento_id,
        user_id,
        user_nome,
        acao,
        valores_novos
      ) VALUES (
        NEW.atendimento_id,
        NEW.created_by,
        v_user_nome,
        CASE 
          WHEN TG_OP = 'INSERT' THEN 'Vistoria criada'
          WHEN TG_OP = 'UPDATE' THEN 'Vistoria atualizada - ' || COALESCE('Status: ' || NEW.status, 'Dados atualizados')
          ELSE 'Vistoria modificada'
        END,
        v_changes
      );
    EXCEPTION 
      WHEN OTHERS THEN
        -- Log do erro mas continua a operação
        RAISE WARNING 'Erro ao registrar histórico da vistoria %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;