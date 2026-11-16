DROP POLICY IF EXISTS "Vistoria photos update authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Vistoria photos delete authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update vistoria photos" ON storage.objects;

CREATE POLICY "Vistoria photos update authenticated" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'vistorias' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role)))
WITH CHECK (bucket_id = 'vistorias' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role)));

CREATE POLICY "Vistoria photos delete authenticated" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'vistorias' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role)));

CREATE POLICY "Authenticated users can update vistoria photos" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'vistoria-fotos' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role)))
WITH CHECK (bucket_id = 'vistoria-fotos' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role)));