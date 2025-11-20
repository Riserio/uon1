-- Create storage bucket for atendimento attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('atendimento-anexos', 'atendimento-anexos', false);

-- Allow authenticated users to upload files to their own folder
CREATE POLICY "Users can upload to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'atendimento-anexos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to view files in atendimentos they have access to
CREATE POLICY "Users can view accessible atendimento files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'atendimento-anexos'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM atendimento_anexos aa
      JOIN atendimentos a ON a.id = aa.atendimento_id
      WHERE aa.arquivo_url = name
      AND (
        a.user_id = auth.uid()
        OR has_role(auth.uid(), 'admin')
        OR has_role(auth.uid(), 'superintendente')
        OR (
          has_role(auth.uid(), 'lider')
          AND a.user_id IN (
            SELECT p.id FROM profiles p
            JOIN equipes e ON p.equipe_id = e.id
            WHERE e.lider_id = auth.uid()
          )
        )
      )
    )
  )
);

-- Allow users to update their own files
CREATE POLICY "Users can update own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'atendimento-anexos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own files or files from accessible atendimentos
CREATE POLICY "Users can delete own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'atendimento-anexos'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM atendimento_anexos aa
      JOIN atendimentos a ON a.id = aa.atendimento_id
      WHERE aa.arquivo_url = name
      AND aa.created_by = auth.uid()
    )
  )
);