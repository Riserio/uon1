-- Modificar a função do trigger para não bloquear em caso de erro
CREATE OR REPLACE FUNCTION sync_vistoria_to_atendimento()
RETURNS TRIGGER AS $$
DECLARE
  v_user_nome TEXT;
  v_changes JSONB := '{}'::JSONB;
BEGIN
  -- Verificar se há atendimento_id
  IF NEW.atendimento_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pegar nome do usuário que criou
  BEGIN
    SELECT nome INTO v_user_nome FROM profiles WHERE id = NEW.created_by;
  EXCEPTION WHEN OTHERS THEN
    v_user_nome := 'Sistema';
  END;

  -- Construir objeto de mudanças
  IF TG_OP = 'INSERT' THEN
    v_changes := jsonb_build_object(
      'vistoria_criada', true,
      'tipo_vistoria', NEW.tipo_vistoria,
      'tipo_sinistro', NEW.tipo_sinistro
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Verificar mudanças específicas
    IF OLD.cliente_nome IS DISTINCT FROM NEW.cliente_nome THEN
      v_changes := v_changes || jsonb_build_object('cliente_nome', NEW.cliente_nome);
    END IF;
    
    IF OLD.veiculo_placa IS DISTINCT FROM NEW.veiculo_placa THEN
      v_changes := v_changes || jsonb_build_object('veiculo_placa', NEW.veiculo_placa);
    END IF;
    
    IF OLD.endereco IS DISTINCT FROM NEW.endereco THEN
      v_changes := v_changes || jsonb_build_object('endereco', NEW.endereco);
    END IF;

    -- Verificar mudanças de custos
    IF OLD.custo_reparo IS DISTINCT FROM NEW.custo_reparo 
       OR OLD.custo_terceiros IS DISTINCT FROM NEW.custo_terceiros 
       OR OLD.custo_oficina IS DISTINCT FROM NEW.custo_oficina
       OR OLD.custo_perda_total IS DISTINCT FROM NEW.custo_perda_total
       OR OLD.custo_perda_parcial IS DISTINCT FROM NEW.custo_perda_parcial
       OR OLD.custo_acordo IS DISTINCT FROM NEW.custo_acordo THEN
      v_changes := v_changes || jsonb_build_object(
        'custos', jsonb_build_object(
          'custo_reparo', NEW.custo_reparo,
          'custo_terceiros', NEW.custo_terceiros,
          'custo_oficina', NEW.custo_oficina,
          'custo_perda_total', NEW.custo_perda_total,
          'custo_perda_parcial', NEW.custo_perda_parcial,
          'custo_acordo', NEW.custo_acordo
        )
      );
    END IF;

    -- Verificar mudanças de veículo
    IF OLD.veiculo_marca IS DISTINCT FROM NEW.veiculo_marca 
       OR OLD.veiculo_modelo IS DISTINCT FROM NEW.veiculo_modelo 
       OR OLD.veiculo_ano IS DISTINCT FROM NEW.veiculo_ano
       OR OLD.veiculo_cor IS DISTINCT FROM NEW.veiculo_cor THEN
      v_changes := v_changes || jsonb_build_object(
        'veiculo', jsonb_build_object(
          'marca', NEW.veiculo_marca,
          'modelo', NEW.veiculo_modelo,
          'ano', NEW.veiculo_ano,
          'cor', NEW.veiculo_cor
        )
      );
    END IF;

    -- Verificar mudanças de dados pessoais
    IF OLD.cliente_cpf IS DISTINCT FROM NEW.cliente_cpf 
       OR OLD.cliente_telefone IS DISTINCT FROM NEW.cliente_telefone 
       OR OLD.cliente_email IS DISTINCT FROM NEW.cliente_email THEN
      v_changes := v_changes || jsonb_build_object(
        'dados_pessoais', jsonb_build_object(
          'cpf', NEW.cliente_cpf,
          'telefone', NEW.cliente_telefone,
          'email', NEW.cliente_email
        )
      );
    END IF;
  END IF;

  -- Se houver mudanças, registrar no histórico (com tratamento de erro)
  IF jsonb_object_keys(v_changes) IS NOT NULL THEN
    BEGIN
      INSERT INTO atendimentos_historico (
        atendimento_id,
        user_id,
        user_nome,
        acao,
        campos_alterados,
        valores_novos
      ) VALUES (
        NEW.atendimento_id,
        NEW.created_by,
        COALESCE(v_user_nome, 'Sistema'),
        CASE 
          WHEN TG_OP = 'INSERT' THEN 'Vistoria criada'
          ELSE 'Vistoria atualizada'
        END,
        v_changes,
        v_changes
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log do erro mas não bloqueia a operação
      RAISE WARNING 'Erro ao registrar histórico da vistoria: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garantir que o trigger existe
DROP TRIGGER IF EXISTS sync_vistoria_trigger ON vistorias;
CREATE TRIGGER sync_vistoria_trigger
  AFTER INSERT OR UPDATE ON vistorias
  FOR EACH ROW
  WHEN (NEW.atendimento_id IS NOT NULL)
  EXECUTE FUNCTION sync_vistoria_to_atendimento();