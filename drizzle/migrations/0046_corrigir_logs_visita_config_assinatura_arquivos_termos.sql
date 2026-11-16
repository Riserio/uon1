-- visitor_logs: grava só em nome de quem está logado
DROP POLICY IF EXISTS "Authenticated users can insert visitor logs" ON public.visitor_logs;
CREATE POLICY "Authenticated users can insert visitor logs" ON public.visitor_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- uonisign_config: leitura só para o administrador do Uon1 Sign (policy uonisign_config_admin já cobre)
DROP POLICY IF EXISTS "uonisign_config_select" ON public.uonisign_config;

-- Arquivos de termos: escrita só para quem gerencia os termos
DROP POLICY IF EXISTS "Authenticated users can upload termos" ON storage.objects;
CREATE POLICY "Authenticated users can upload termos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'termos' AND (public.has_role(auth.uid(), 'superintendente'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));
DROP POLICY IF EXISTS "Authenticated users can update termos" ON storage.objects;
CREATE POLICY "Authenticated users can update termos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'termos' AND (public.has_role(auth.uid(), 'superintendente'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)))
  WITH CHECK (bucket_id = 'termos' AND (public.has_role(auth.uid(), 'superintendente'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));
DROP POLICY IF EXISTS "Authenticated users can delete termos" ON storage.objects;
CREATE POLICY "Authenticated users can delete termos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'termos' AND (public.has_role(auth.uid(), 'superintendente'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));
