-- Trigger to auto-update contract status when all signatures are done
CREATE OR REPLACE FUNCTION public.auto_update_contrato_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_count INT;
  signed_count INT;
  v_contrato_id UUID;
BEGIN
  v_contrato_id := NEW.contrato_id;
  
  SELECT count(*), count(*) FILTER (WHERE status = 'assinado')
  INTO total_count, signed_count
  FROM contrato_assinaturas
  WHERE contrato_id = v_contrato_id;
  
  IF total_count > 0 AND total_count = signed_count THEN
    UPDATE contratos SET status = 'assinado' WHERE id = v_contrato_id AND status = 'aguardando_assinatura';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_update_contrato_status
AFTER UPDATE ON public.contrato_assinaturas
FOR EACH ROW
WHEN (NEW.status = 'assinado')
EXECUTE FUNCTION public.auto_update_contrato_status();