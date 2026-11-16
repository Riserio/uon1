ALTER TABLE public.comunicados ADD COLUMN IF NOT EXISTS publico boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.comunicados.publico IS 'true = aparece também na página pública /radar; false = somente interno';

CREATE OR REPLACE FUNCTION public.radar_comunicados_publicos(p_limite int DEFAULT 30)
RETURNS TABLE (id uuid, titulo text, mensagem text, link text, imagem_url text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.titulo, c.mensagem, c.link, c.imagem_url, c.created_at
  FROM public.comunicados c
  WHERE c.ativo AND c.publico
  ORDER BY c.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 30), 1), 100);
$$;
REVOKE ALL ON FUNCTION public.radar_comunicados_publicos(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.radar_comunicados_publicos(int) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated can delete logos" ON storage.objects;
CREATE POLICY "Authenticated can delete logos" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'logos' AND (owner_id = (SELECT auth.uid()::text) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente')));

DROP POLICY IF EXISTS "Authenticated users can delete own documentos" ON storage.objects;
CREATE POLICY "Authenticated users can delete own documentos" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documentos' AND (owner_id = (SELECT auth.uid()::text) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente')));

DROP POLICY IF EXISTS "Allow authenticated users to update app config images" ON storage.objects;
CREATE POLICY "Allow authenticated users to update app config images" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'app-config' AND (owner_id = (SELECT auth.uid()::text) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente')))
WITH CHECK (bucket_id = 'app-config' AND (owner_id = (SELECT auth.uid()::text) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente')));

DROP POLICY IF EXISTS "Allow authenticated users to delete app config images" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete app config images" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'app-config' AND (owner_id = (SELECT auth.uid()::text) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente')));