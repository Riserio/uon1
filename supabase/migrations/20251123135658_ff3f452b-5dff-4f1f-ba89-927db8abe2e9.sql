-- Drop all existing triggers first
DROP TRIGGER IF EXISTS sync_vistoria_trigger ON vistorias;
DROP TRIGGER IF EXISTS trigger_sync_vistoria_to_atendimento ON vistorias;

-- Now drop the function
DROP FUNCTION IF EXISTS sync_vistoria_to_atendimento();

-- Create improved sync function
CREATE OR REPLACE FUNCTION public.sync_vistoria_to_atendimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_nome TEXT;
  v_changes JSONB := '{}'::JSONB;
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

  -- Construir objeto de mudanças apenas para casos importantes
  IF TG_OP = 'INSERT' THEN
    v_changes := jsonb_build_object(
      'origem', 'Vistoria',
      'vistoria_criada', true,
      'tipo_vistoria', NEW.tipo_vistoria,
      'tipo_sinistro', NEW.tipo_sinistro,
      'numero_vistoria', NEW.numero
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_changes := jsonb_build_object(
      'origem', 'Vistoria',
      'status_anterior', OLD.status,
      'status_novo', NEW.status,
      'numero_vistoria', NEW.numero
    );
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
          WHEN TG_OP = 'UPDATE' THEN 'Vistoria atualizada - Status: ' || NEW.status
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
$function$;

-- Create trigger for INSERT and UPDATE on vistorias
CREATE TRIGGER sync_vistoria_trigger
  AFTER INSERT OR UPDATE ON vistorias
  FOR EACH ROW
  EXECUTE FUNCTION sync_vistoria_to_atendimento();