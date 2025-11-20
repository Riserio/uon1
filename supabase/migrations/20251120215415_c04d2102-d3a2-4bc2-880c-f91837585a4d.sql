-- Criar políticas RLS para o bucket termos
-- Permitir autenticados fazerem upload
CREATE POLICY "Authenticated users can upload termos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'termos');

-- Permitir autenticados atualizarem termos
CREATE POLICY "Authenticated users can update termos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'termos');

-- Permitir autenticados deletarem termos
CREATE POLICY "Authenticated users can delete termos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'termos');

-- Permitir todos verem termos (bucket público)
CREATE POLICY "Anyone can view termos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'termos');