-- 1) SGA/MGF import + automation tables: scope to the owning association
DROP POLICY IF EXISTS "Authenticated users can view sga_importacoes" ON public.sga_importacoes;
DROP POLICY IF EXISTS "Authenticated users can insert sga_importacoes" ON public.sga_importacoes;
DROP POLICY IF EXISTS "Authenticated users can update sga_importacoes" ON public.sga_importacoes;
DROP POLICY IF EXISTS "Authenticated users can delete sga_importacoes" ON public.sga_importacoes;
CREATE POLICY "sga_importacoes_tenant_all" ON public.sga_importacoes FOR ALL TO authenticated
USING (public.is_equipe_interna(auth.uid()) OR corretora_id = public.get_user_corretora_id(auth.uid()))
WITH CHECK (public.is_equipe_interna(auth.uid()) OR corretora_id = public.get_user_corretora_id(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view sga_automacao_execucoes" ON public.sga_automacao_execucoes;
DROP POLICY IF EXISTS "Authenticated users can insert sga_automacao_execucoes" ON public.sga_automacao_execucoes;
DROP POLICY IF EXISTS "Authenticated users can update sga_automacao_execucoes" ON public.sga_automacao_execucoes;
DROP POLICY IF EXISTS "Authenticated users can delete sga_automacao_execucoes" ON public.sga_automacao_execucoes;
CREATE POLICY "sga_execucoes_tenant_all" ON public.sga_automacao_execucoes FOR ALL TO authenticated
USING (public.is_equipe_interna(auth.uid()) OR corretora_id = public.get_user_corretora_id(auth.uid()))
WITH CHECK (public.is_equipe_interna(auth.uid()) OR corretora_id = public.get_user_corretora_id(auth.uid()));

DROP POLICY IF EXISTS "Usuários autenticados podem ver importações MGF" ON public.mgf_importacoes;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir importações MGF" ON public.mgf_importacoes;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar importações MGF" ON public.mgf_importacoes;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar importações MGF" ON public.mgf_importacoes;
CREATE POLICY "mgf_importacoes_tenant_all" ON public.mgf_importacoes FOR ALL TO authenticated
USING (public.is_equipe_interna(auth.uid()) OR corretora_id = public.get_user_corretora_id(auth.uid()))
WITH CHECK (public.is_equipe_interna(auth.uid()) OR corretora_id = public.get_user_corretora_id(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view mgf_automacao_execucoes" ON public.mgf_automacao_execucoes;
DROP POLICY IF EXISTS "Authenticated users can insert mgf_automacao_execucoes" ON public.mgf_automacao_execucoes;
DROP POLICY IF EXISTS "Authenticated users can update mgf_automacao_execucoes" ON public.mgf_automacao_execucoes;
DROP POLICY IF EXISTS "Authenticated users can delete mgf_automacao_execucoes" ON public.mgf_automacao_execucoes;
CREATE POLICY "mgf_execucoes_tenant_all" ON public.mgf_automacao_execucoes FOR ALL TO authenticated
USING (public.is_equipe_interna(auth.uid()) OR corretora_id = public.get_user_corretora_id(auth.uid()))
WITH CHECK (public.is_equipe_interna(auth.uid()) OR corretora_id = public.get_user_corretora_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sga_importacoes, public.sga_automacao_execucoes, public.mgf_importacoes, public.mgf_automacao_execucoes TO authenticated;
GRANT ALL ON public.sga_importacoes, public.sga_automacao_execucoes, public.mgf_importacoes, public.mgf_automacao_execucoes TO service_role;

-- 2) termos_aceitos: no more public reading of consent records
DROP POLICY IF EXISTS "Anyone can view termos aceitos" ON public.termos_aceitos;
CREATE POLICY "termos_aceitos_leitura_interna" ON public.termos_aceitos FOR SELECT TO authenticated
USING (
  public.is_equipe_interna(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.vistorias v
    WHERE v.id = termos_aceitos.vistoria_id
      AND v.corretora_id = public.get_user_corretora_id(auth.uid())
  )
);
-- anonymous signing still needs to write its own acceptance, but only for a
-- vistoria that is still open (valid public link)
DROP POLICY IF EXISTS "Anyone can insert termos aceitos" ON public.termos_aceitos;
DROP POLICY IF EXISTS "Anyone can update termos aceitos" ON public.termos_aceitos;
CREATE POLICY "termos_aceitos_assinatura_publica_insert" ON public.termos_aceitos FOR INSERT TO anon, authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.vistorias v
  WHERE v.id = termos_aceitos.vistoria_id
    AND (v.link_expires_at IS NULL OR v.link_expires_at > now())
));
CREATE POLICY "termos_aceitos_assinatura_publica_update" ON public.termos_aceitos FOR UPDATE TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.vistorias v
  WHERE v.id = termos_aceitos.vistoria_id
    AND (v.link_expires_at IS NULL OR v.link_expires_at > now())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.vistorias v
  WHERE v.id = termos_aceitos.vistoria_id
    AND (v.link_expires_at IS NULL OR v.link_expires_at > now())
));

-- 3) veiculo_snapshot_diario: plates/chassis only for the owning association
DROP POLICY IF EXISTS "vsd_leitura" ON public.veiculo_snapshot_diario;
CREATE POLICY "vsd_leitura" ON public.veiculo_snapshot_diario FOR SELECT TO authenticated
USING (public.is_equipe_interna(auth.uid()) OR corretora_id = public.get_user_corretora_id(auth.uid()));