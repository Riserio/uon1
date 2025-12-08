-- Criar bucket documentos para logos de templates e outros documentos
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso
CREATE POLICY "Anyone can view documentos"
ON storage.objects FOR SELECT
USING (bucket_id = 'documentos');

CREATE POLICY "Authenticated users can upload documentos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documentos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update own documentos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'documentos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete own documentos"
ON storage.objects FOR DELETE
USING (bucket_id = 'documentos' AND auth.uid() IS NOT NULL);