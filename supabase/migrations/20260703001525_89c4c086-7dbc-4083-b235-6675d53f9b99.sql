
-- Tenant scoping for cadastro_importacoes
DROP POLICY IF EXISTS "Authenticated can manage cadastro_importacoes" ON public.cadastro_importacoes;
DROP POLICY IF EXISTS "cadastro_importacoes_all" ON public.cadastro_importacoes;
CREATE POLICY "cadastro_importacoes_tenant_select" ON public.cadastro_importacoes FOR SELECT TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "cadastro_importacoes_tenant_write" ON public.cadastro_importacoes FOR INSERT TO authenticated
  WITH CHECK (corretora_id = public.get_user_corretora_id(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "cadastro_importacoes_tenant_update" ON public.cadastro_importacoes FOR UPDATE TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente'))
  WITH CHECK (corretora_id = public.get_user_corretora_id(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "cadastro_importacoes_tenant_delete" ON public.cadastro_importacoes FOR DELETE TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente'));

-- Tenant scoping for mgf_dados via parent mgf_importacoes
DROP POLICY IF EXISTS "Usuários autenticados podem ver dados MGF" ON public.mgf_dados;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir dados MGF" ON public.mgf_dados;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar dados MGF" ON public.mgf_dados;
CREATE POLICY "mgf_dados_tenant_select" ON public.mgf_dados FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mgf_importacoes i WHERE i.id = mgf_dados.importacao_id
    AND (i.corretora_id = public.get_user_corretora_id(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente'))));
CREATE POLICY "mgf_dados_tenant_insert" ON public.mgf_dados FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.mgf_importacoes i WHERE i.id = mgf_dados.importacao_id
    AND (i.corretora_id = public.get_user_corretora_id(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente'))));
CREATE POLICY "mgf_dados_tenant_delete" ON public.mgf_dados FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mgf_importacoes i WHERE i.id = mgf_dados.importacao_id
    AND (i.corretora_id = public.get_user_corretora_id(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente'))));

-- Remove anonymous read of ouvidoria_registros; scope authenticated to their corretora
DROP POLICY IF EXISTS "Anyone can view ouvidoria_registros" ON public.ouvidoria_registros;
DROP POLICY IF EXISTS "Public can view ouvidoria_registros" ON public.ouvidoria_registros;
DROP POLICY IF EXISTS "Anon can view ouvidoria_registros" ON public.ouvidoria_registros;
DROP POLICY IF EXISTS "Authenticated can view ouvidoria_registros" ON public.ouvidoria_registros;
CREATE POLICY "ouvidoria_registros_tenant_select" ON public.ouvidoria_registros FOR SELECT TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente'));
