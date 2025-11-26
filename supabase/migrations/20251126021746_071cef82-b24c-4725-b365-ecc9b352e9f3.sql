-- Unificar IDs de vistoria com atendimento
-- Quando uma vistoria é criada vinculada a um atendimento, ela deve usar o mesmo ID

-- Função para garantir que vistoria use o ID do atendimento quando vinculada
CREATE OR REPLACE FUNCTION public.sync_vistoria_id_with_atendimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Se há atendimento_id e o ID da vistoria é diferente, usar o ID do atendimento
  IF NEW.atendimento_id IS NOT NULL AND NEW.id != NEW.atendimento_id THEN
    NEW.id := NEW.atendimento_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Trigger para sincronizar IDs na inserção
DROP TRIGGER IF EXISTS sync_vistoria_id_trigger ON vistorias;
CREATE TRIGGER sync_vistoria_id_trigger
  BEFORE INSERT ON vistorias
  FOR EACH ROW
  EXECUTE FUNCTION sync_vistoria_id_with_atendimento();