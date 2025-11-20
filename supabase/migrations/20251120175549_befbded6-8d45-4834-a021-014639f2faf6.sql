-- Fix search_path for the validate function
CREATE OR REPLACE FUNCTION validate_atendimento_tags()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate each tag
  IF NEW.tags IS NOT NULL THEN
    -- Check if any tag is too long or contains suspicious content
    IF EXISTS (
      SELECT 1 FROM unnest(NEW.tags) AS tag
      WHERE length(tag) > 50
         OR tag ~ '<[^>]*>'  -- Contains HTML tags
         OR tag ~ 'javascript:'  -- Contains javascript protocol
         OR tag ~ 'on\w+='  -- Contains event handlers
    ) THEN
      RAISE EXCEPTION 'Invalid tag content: tags must be max 50 characters and cannot contain HTML or scripts';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;