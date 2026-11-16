DROP POLICY IF EXISTS "Authenticated users can update own documentos" ON storage.objects;
CREATE POLICY "Authenticated users can update own documentos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documentos' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superintendente'::public.app_role)))
  WITH CHECK (bucket_id = 'documentos' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superintendente'::public.app_role)));

DROP POLICY IF EXISTS "Authenticated can update logos" ON storage.objects;
CREATE POLICY "Authenticated can update logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superintendente'::public.app_role)))
  WITH CHECK (bucket_id = 'logos' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superintendente'::public.app_role)));

DROP POLICY IF EXISTS "Authenticated users can delete vistoria photos" ON storage.objects;
CREATE POLICY "Authenticated users can delete vistoria photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'vistoria-fotos' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superintendente'::public.app_role)));
