-- categorias_financeiras
DROP POLICY IF EXISTS "Authenticated users can manage categorias_financeiras" ON public.categorias_financeiras;
CREATE POLICY "Tenant scoped select categorias_financeiras" ON public.categorias_financeiras
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Tenant scoped insert categorias_financeiras" ON public.categorias_financeiras
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Tenant scoped update categorias_financeiras" ON public.categorias_financeiras
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Tenant scoped delete categorias_financeiras" ON public.categorias_financeiras
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Service role full access categorias_financeiras" ON public.categorias_financeiras
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- centros_custo
DROP POLICY IF EXISTS "Authenticated users can manage centros_custo" ON public.centros_custo;
CREATE POLICY "Tenant scoped select centros_custo" ON public.centros_custo
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Tenant scoped insert centros_custo" ON public.centros_custo
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Tenant scoped update centros_custo" ON public.centros_custo
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Tenant scoped delete centros_custo" ON public.centros_custo
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Service role full access centros_custo" ON public.centros_custo
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- cobranca_automacao_config (credenciais Hinova)
DROP POLICY IF EXISTS "Admins podem ver todas as configurações" ON public.cobranca_automacao_config;
DROP POLICY IF EXISTS "Admins podem atualizar configurações" ON public.cobranca_automacao_config;
DROP POLICY IF EXISTS "Admins podem criar configurações" ON public.cobranca_automacao_config;
DROP POLICY IF EXISTS "Admins podem deletar configurações" ON public.cobranca_automacao_config;
CREATE POLICY "Tenant scoped select cobranca_automacao_config" ON public.cobranca_automacao_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Tenant scoped insert cobranca_automacao_config" ON public.cobranca_automacao_config
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Tenant scoped update cobranca_automacao_config" ON public.cobranca_automacao_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Tenant scoped delete cobranca_automacao_config" ON public.cobranca_automacao_config
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente') OR corretora_id = public.get_user_corretora_id(auth.uid()));
CREATE POLICY "Service role full access cobranca_automacao_config" ON public.cobranca_automacao_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);