-- Remover políticas antigas da tabela termos_aceitos
DROP POLICY IF EXISTS "Public can insert termos aceitos" ON public.termos_aceitos;
DROP POLICY IF EXISTS "Public can update termos aceitos" ON public.termos_aceitos;
DROP POLICY IF EXISTS "Authenticated users can view termos aceitos" ON public.termos_aceitos;

-- Criar políticas públicas para termos_aceitos (necessário para vistorias públicas)
CREATE POLICY "Anyone can insert termos aceitos"
ON public.termos_aceitos
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Anyone can view termos aceitos"
ON public.termos_aceitos
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Anyone can update termos aceitos"
ON public.termos_aceitos
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Garantir que o bucket vistorias existe e permitir upload público
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'vistorias') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('vistorias', 'vistorias', true);
  ELSE
    UPDATE storage.buckets SET public = true WHERE id = 'vistorias';
  END IF;
END $$;

-- Criar políticas de storage para o bucket vistorias permitindo acesso público
DROP POLICY IF EXISTS "Public can upload to vistorias bucket" ON storage.objects;
DROP POLICY IF EXISTS "Public can view vistorias" ON storage.objects;

CREATE POLICY "Public can upload to vistorias bucket"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'vistorias');

CREATE POLICY "Public can view vistorias"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'vistorias');

-- Permitir updates públicos no bucket vistorias
DROP POLICY IF EXISTS "Public can update vistorias files" ON storage.objects;
CREATE POLICY "Public can update vistorias files"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'vistorias')
WITH CHECK (bucket_id = 'vistorias');