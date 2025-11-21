-- Criar trigger para sincronizar dados de vistoria para atendimento em tempo real

-- Função para atualizar atendimento com dados da vistoria
CREATE OR REPLACE FUNCTION sync_vistoria_to_atendimento()
RETURNS TRIGGER AS $$
DECLARE
  user_nome_var TEXT;
  campo_alterado TEXT;
  valor_anterior TEXT;
  valor_novo TEXT;
  origem TEXT := 'Vistoria';
BEGIN
  -- Se não há atendimento vinculado, não faz nada
  IF NEW.atendimento_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do usuário que fez a alteração
  SELECT nome INTO user_nome_var 
  FROM profiles 
  WHERE id = NEW.created_by;

  -- Atualizar atendimento com dados da vistoria
  UPDATE atendimentos SET
    observacoes = CASE 
      WHEN NEW.observacoes_ia IS NOT NULL THEN 
        COALESCE(observacoes, '') || E'\n\n[Vistoria] ' || NEW.observacoes_ia
      ELSE observacoes
    END,
    updated_at = now()
  WHERE id = NEW.atendimento_id;

  -- Se é UPDATE, registrar as mudanças no histórico
  IF TG_OP = 'UPDATE' THEN
    -- Verificar mudanças em cliente_nome
    IF OLD.cliente_nome IS DISTINCT FROM NEW.cliente_nome THEN
      INSERT INTO atendimentos_historico (
        atendimento_id, user_id, user_nome, acao,
        campos_alterados, valores_anteriores, valores_novos
      ) VALUES (
        NEW.atendimento_id, NEW.created_by,
        COALESCE(user_nome_var, 'Sistema'),
        'Atualização via Vistoria: Nome do Cliente',
        jsonb_build_array('cliente_nome'),
        jsonb_build_object('cliente_nome', OLD.cliente_nome, 'origem', origem),
        jsonb_build_object('cliente_nome', NEW.cliente_nome, 'origem', origem)
      );
    END IF;

    -- Verificar mudanças em veiculo_placa
    IF OLD.veiculo_placa IS DISTINCT FROM NEW.veiculo_placa THEN
      INSERT INTO atendimentos_historico (
        atendimento_id, user_id, user_nome, acao,
        campos_alterados, valores_anteriores, valores_novos
      ) VALUES (
        NEW.atendimento_id, NEW.created_by,
        COALESCE(user_nome_var, 'Sistema'),
        'Atualização via Vistoria: Placa do Veículo',
        jsonb_build_array('veiculo_placa'),
        jsonb_build_object('veiculo_placa', OLD.veiculo_placa, 'origem', origem),
        jsonb_build_object('veiculo_placa', NEW.veiculo_placa, 'origem', origem)
      );
    END IF;

    -- Verificar mudanças em endereco
    IF OLD.endereco IS DISTINCT FROM NEW.endereco THEN
      INSERT INTO atendimentos_historico (
        atendimento_id, user_id, user_nome, acao,
        campos_alterados, valores_anteriores, valores_novos
      ) VALUES (
        NEW.atendimento_id, NEW.created_by,
        COALESCE(user_nome_var, 'Sistema'),
        'Atualização via Vistoria: Endereço',
        jsonb_build_array('endereco'),
        jsonb_build_object('endereco', OLD.endereco, 'origem', origem),
        jsonb_build_object('endereco', NEW.endereco, 'origem', origem)
      );
    END IF;

    -- Verificar mudanças em custos
    IF OLD.custo_reparo IS DISTINCT FROM NEW.custo_reparo OR
       OLD.custo_perda_total IS DISTINCT FROM NEW.custo_perda_total OR
       OLD.custo_perda_parcial IS DISTINCT FROM NEW.custo_perda_parcial OR
       OLD.custo_oficina IS DISTINCT FROM NEW.custo_oficina OR
       OLD.custo_terceiros IS DISTINCT FROM NEW.custo_terceiros OR
       OLD.custo_acordo IS DISTINCT FROM NEW.custo_acordo THEN
      INSERT INTO atendimentos_historico (
        atendimento_id, user_id, user_nome, acao,
        campos_alterados, valores_anteriores, valores_novos
      ) VALUES (
        NEW.atendimento_id, NEW.created_by,
        COALESCE(user_nome_var, 'Sistema'),
        'Atualização via Vistoria: Custos',
        jsonb_build_array('custos'),
        jsonb_build_object(
          'custo_reparo', OLD.custo_reparo,
          'custo_perda_total', OLD.custo_perda_total,
          'custo_perda_parcial', OLD.custo_perda_parcial,
          'custo_oficina', OLD.custo_oficina,
          'custo_terceiros', OLD.custo_terceiros,
          'custo_acordo', OLD.custo_acordo,
          'origem', origem
        ),
        jsonb_build_object(
          'custo_reparo', NEW.custo_reparo,
          'custo_perda_total', NEW.custo_perda_total,
          'custo_perda_parcial', NEW.custo_perda_parcial,
          'custo_oficina', NEW.custo_oficina,
          'custo_terceiros', NEW.custo_terceiros,
          'custo_acordo', NEW.custo_acordo,
          'origem', origem
        )
      );
    END IF;

    -- Verificar mudanças em dados do veículo
    IF OLD.veiculo_marca IS DISTINCT FROM NEW.veiculo_marca OR
       OLD.veiculo_modelo IS DISTINCT FROM NEW.veiculo_modelo OR
       OLD.veiculo_ano IS DISTINCT FROM NEW.veiculo_ano OR
       OLD.veiculo_cor IS DISTINCT FROM NEW.veiculo_cor THEN
      INSERT INTO atendimentos_historico (
        atendimento_id, user_id, user_nome, acao,
        campos_alterados, valores_anteriores, valores_novos
      ) VALUES (
        NEW.atendimento_id, NEW.created_by,
        COALESCE(user_nome_var, 'Sistema'),
        'Atualização via Vistoria: Dados do Veículo',
        jsonb_build_array('veiculo'),
        jsonb_build_object(
          'marca', OLD.veiculo_marca,
          'modelo', OLD.veiculo_modelo,
          'ano', OLD.veiculo_ano,
          'cor', OLD.veiculo_cor,
          'origem', origem
        ),
        jsonb_build_object(
          'marca', NEW.veiculo_marca,
          'modelo', NEW.veiculo_modelo,
          'ano', NEW.veiculo_ano,
          'cor', NEW.veiculo_cor,
          'origem', origem
        )
      );
    END IF;

    -- Verificar mudanças em dados pessoais
    IF OLD.cliente_cpf IS DISTINCT FROM NEW.cliente_cpf OR
       OLD.cliente_email IS DISTINCT FROM NEW.cliente_email OR
       OLD.cliente_telefone IS DISTINCT FROM NEW.cliente_telefone THEN
      INSERT INTO atendimentos_historico (
        atendimento_id, user_id, user_nome, acao,
        campos_alterados, valores_anteriores, valores_novos
      ) VALUES (
        NEW.atendimento_id, NEW.created_by,
        COALESCE(user_nome_var, 'Sistema'),
        'Atualização via Vistoria: Dados Pessoais',
        jsonb_build_array('dados_pessoais'),
        jsonb_build_object(
          'cpf', OLD.cliente_cpf,
          'email', OLD.cliente_email,
          'telefone', OLD.cliente_telefone,
          'origem', origem
        ),
        jsonb_build_object(
          'cpf', NEW.cliente_cpf,
          'email', NEW.cliente_email,
          'telefone', NEW.cliente_telefone,
          'origem', origem
        )
      );
    END IF;
  ELSE
    -- Se é INSERT, registrar criação
    INSERT INTO atendimentos_historico (
      atendimento_id, user_id, user_nome, acao,
      campos_alterados, valores_anteriores, valores_novos
    ) VALUES (
      NEW.atendimento_id, NEW.created_by,
      COALESCE(user_nome_var, 'Sistema'),
      'Dados iniciais via Vistoria',
      jsonb_build_array('vistoria_criada'),
      jsonb_build_object('origem', origem),
      jsonb_build_object(
        'cliente_nome', NEW.cliente_nome,
        'veiculo_placa', NEW.veiculo_placa,
        'endereco', NEW.endereco,
        'tipo_vistoria', NEW.tipo_vistoria,
        'origem', origem
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para INSERT e UPDATE em vistorias
DROP TRIGGER IF EXISTS sync_vistoria_trigger ON vistorias;
CREATE TRIGGER sync_vistoria_trigger
  AFTER INSERT OR UPDATE ON vistorias
  FOR EACH ROW
  WHEN (NEW.atendimento_id IS NOT NULL)
  EXECUTE FUNCTION sync_vistoria_to_atendimento();

-- Habilitar realtime para sincronização em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE vistorias;
ALTER PUBLICATION supabase_realtime ADD TABLE atendimentos;
ALTER PUBLICATION supabase_realtime ADD TABLE atendimentos_historico;