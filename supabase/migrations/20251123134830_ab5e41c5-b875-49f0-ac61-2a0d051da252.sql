-- Cria bucket para fotos de vistoria se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('vistoria-fotos', 'vistoria-fotos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas RLS para bucket vistoria-fotos
-- Permitir que qualquer pessoa (incluindo não autenticados) visualize fotos
DROP POLICY IF EXISTS "Public access to vistoria photos" ON storage.objects;
CREATE POLICY "Public access to vistoria photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'vistoria-fotos');

-- Permitir que usuários autenticados façam upload
DROP POLICY IF EXISTS "Authenticated users can upload vistoria photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload vistoria photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vistoria-fotos');

-- Permitir que qualquer pessoa (incluindo não autenticados) faça upload de fotos
-- Isso é necessário para o fluxo público de envio de fotos adicionais
DROP POLICY IF EXISTS "Public can upload vistoria photos" ON storage.objects;
CREATE POLICY "Public can upload vistoria photos"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'vistoria-fotos');

-- Permitir que usuários autenticados atualizem fotos
DROP POLICY IF EXISTS "Authenticated users can update vistoria photos" ON storage.objects;
CREATE POLICY "Authenticated users can update vistoria photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'vistoria-fotos');

-- Permitir que usuários autenticados deletem fotos
DROP POLICY IF EXISTS "Authenticated users can delete vistoria photos" ON storage.objects;
CREATE POLICY "Authenticated users can delete vistoria photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vistoria-fotos');

-- Políticas RLS para vistoria_fotos table - permitir inserção pública
DROP POLICY IF EXISTS "Public can insert vistoria_fotos" ON vistoria_fotos;
CREATE POLICY "Public can insert vistoria_fotos"
ON vistoria_fotos FOR INSERT
TO public
WITH CHECK (true);