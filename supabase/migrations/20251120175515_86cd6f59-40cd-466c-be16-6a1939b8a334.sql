-- Make vistorias bucket private and add proper RLS policies
UPDATE storage.buckets 
SET public = false 
WHERE id = 'vistorias';

-- Add RLS policies for vistorias bucket access control
CREATE POLICY "Authenticated users can upload to vistorias bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vistorias' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view vistorias for accessible atendimentos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'vistorias' 
  AND (
    -- Admins and superintendentes can view all
    has_role(auth.uid(), 'superintendente'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      -- Users can view vistorias for their accessible atendimentos
      SELECT 1 FROM vistorias v
      JOIN atendimentos a ON v.atendimento_id = a.id
      WHERE (storage.foldername(name))[1] = v.id::text
      AND (
        a.user_id = auth.uid()
        OR (has_role(auth.uid(), 'lider'::app_role) AND a.user_id IN (
          SELECT p.id FROM profiles p
          JOIN equipes e ON p.equipe_id = e.id
          WHERE e.lider_id = auth.uid()
        ))
      )
    )
    OR EXISTS (
      -- Allow access to public vistoria links (for customers)
      SELECT 1 FROM vistorias v
      WHERE (storage.foldername(name))[1] = v.id::text
      AND v.link_token IS NOT NULL
      AND v.link_expires_at > now()
    )
  )
);

CREATE POLICY "Users can delete own vistoria uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'vistorias'
  AND (
    has_role(auth.uid(), 'superintendente'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM vistorias v
      WHERE (storage.foldername(name))[1] = v.id::text
      AND v.created_by = auth.uid()
    )
  )
);

-- Add trigger to validate tags input to prevent XSS
CREATE OR REPLACE FUNCTION validate_atendimento_tags()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_tags_before_insert
  BEFORE INSERT OR UPDATE ON atendimentos
  FOR EACH ROW
  EXECUTE FUNCTION validate_atendimento_tags();