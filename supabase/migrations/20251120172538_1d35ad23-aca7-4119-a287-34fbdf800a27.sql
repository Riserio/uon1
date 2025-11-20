-- Recriar o trigger de progressão de workflow para atualizar o mesmo card em vez de criar novo
DROP TRIGGER IF EXISTS trigger_workflow_progression ON atendimentos;
DROP FUNCTION IF EXISTS handle_workflow_progression() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_workflow_progression()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_fluxo RECORD;
  current_status_config RECORD;
  first_status_next_fluxo TEXT;
  user_nome_var TEXT;
  fluxo_nome_novo TEXT;
BEGIN
  -- Only trigger when status changes
  IF NEW.status != OLD.status THEN
    -- Get current status configuration to check if it's final
    SELECT sc.* INTO current_status_config
    FROM public.status_config sc
    WHERE sc.nome = NEW.status
      AND sc.fluxo_id = NEW.fluxo_id
      AND sc.ativo = true;
    
    -- Check if this is a final status that should trigger next workflow
    IF current_status_config.is_final THEN
      -- Get current workflow info
      SELECT f.* INTO current_fluxo
      FROM public.fluxos f
      WHERE f.id = NEW.fluxo_id;
      
      -- Check if should move to next workflow
      IF current_fluxo.gera_proximo_automatico AND current_fluxo.proximo_fluxo_id IS NOT NULL THEN
        -- Get the first status (backlog) of the next workflow
        SELECT sc.nome INTO first_status_next_fluxo
        FROM public.status_config sc
        WHERE sc.fluxo_id = current_fluxo.proximo_fluxo_id
          AND sc.ativo = true
        ORDER BY sc.ordem
        LIMIT 1;
        
        -- Update the same card to next workflow if we found a status
        IF first_status_next_fluxo IS NOT NULL THEN
          -- Get next workflow name
          SELECT nome INTO fluxo_nome_novo
          FROM fluxos
          WHERE id = current_fluxo.proximo_fluxo_id;
          
          -- Get user name
          SELECT nome INTO user_nome_var 
          FROM profiles 
          WHERE id = NEW.user_id;
          
          -- Update the card to the next workflow
          NEW.fluxo_id := current_fluxo.proximo_fluxo_id;
          NEW.status := first_status_next_fluxo;
          NEW.status_changed_at := now();
          
          -- Register history of workflow change
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
            NEW.user_id,
            COALESCE(user_nome_var, 'Sistema'),
            'Mudança de Fluxo: ' || current_fluxo.nome || ' → ' || fluxo_nome_novo,
            jsonb_build_array('fluxo_id', 'status'),
            jsonb_build_object('fluxo_id', OLD.fluxo_id, 'status', OLD.status),
            jsonb_build_object('fluxo_id', NEW.fluxo_id, 'status', NEW.status)
          );
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_workflow_progression
  BEFORE UPDATE ON atendimentos
  FOR EACH ROW
  EXECUTE FUNCTION handle_workflow_progression();