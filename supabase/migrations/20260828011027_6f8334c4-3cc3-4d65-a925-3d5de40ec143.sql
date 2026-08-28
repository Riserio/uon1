-- ============ lancamentos_financeiros_historico ============
DROP POLICY IF EXISTS "Authenticated users can view lancamentos_financeiros_historico" ON public.lancamentos_financeiros_historico;
DROP POLICY IF EXISTS "Authenticated users can insert lancamentos_financeiros_historic" ON public.lancamentos_financeiros_historico;

CREATE POLICY "Tenant scoped select lf_historico"
ON public.lancamentos_financeiros_historico FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.lancamentos_financeiros lf
    WHERE lf.id = lancamentos_financeiros_historico.lancamento_id
      AND lf.corretora_id = get_user_corretora_id(auth.uid())
  )
);

CREATE POLICY "Tenant scoped insert lf_historico"
ON public.lancamentos_financeiros_historico FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.lancamentos_financeiros lf
    WHERE lf.id = lancamentos_financeiros_historico.lancamento_id
      AND lf.corretora_id = get_user_corretora_id(auth.uid())
  )
);

-- ============ ppr_programas ============
DROP POLICY IF EXISTS "Authenticated users can view ppr_programas" ON public.ppr_programas;
DROP POLICY IF EXISTS "Authenticated users can insert ppr_programas" ON public.ppr_programas;
DROP POLICY IF EXISTS "Authenticated users can update ppr_programas" ON public.ppr_programas;
DROP POLICY IF EXISTS "Authenticated users can delete ppr_programas" ON public.ppr_programas;

CREATE POLICY "Tenant scoped select ppr_programas"
ON public.ppr_programas FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role) OR corretora_id = get_user_corretora_id(auth.uid()));

CREATE POLICY "Tenant scoped insert ppr_programas"
ON public.ppr_programas FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role) OR corretora_id = get_user_corretora_id(auth.uid()));

CREATE POLICY "Tenant scoped update ppr_programas"
ON public.ppr_programas FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role) OR corretora_id = get_user_corretora_id(auth.uid()))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role) OR corretora_id = get_user_corretora_id(auth.uid()));

CREATE POLICY "Tenant scoped delete ppr_programas"
ON public.ppr_programas FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role) OR corretora_id = get_user_corretora_id(auth.uid()));

-- ============ ppr_tarefas (via programa_id) ============
DROP POLICY IF EXISTS "Authenticated users can view ppr_tarefas" ON public.ppr_tarefas;
DROP POLICY IF EXISTS "Authenticated users can insert ppr_tarefas" ON public.ppr_tarefas;
DROP POLICY IF EXISTS "Authenticated users can update ppr_tarefas" ON public.ppr_tarefas;
DROP POLICY IF EXISTS "Authenticated users can delete ppr_tarefas" ON public.ppr_tarefas;

CREATE POLICY "Tenant scoped select ppr_tarefas"
ON public.ppr_tarefas FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.ppr_programas p WHERE p.id = ppr_tarefas.programa_id AND p.corretora_id = get_user_corretora_id(auth.uid())));

CREATE POLICY "Tenant scoped insert ppr_tarefas"
ON public.ppr_tarefas FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.ppr_programas p WHERE p.id = ppr_tarefas.programa_id AND p.corretora_id = get_user_corretora_id(auth.uid())));

CREATE POLICY "Tenant scoped update ppr_tarefas"
ON public.ppr_tarefas FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.ppr_programas p WHERE p.id = ppr_tarefas.programa_id AND p.corretora_id = get_user_corretora_id(auth.uid())))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.ppr_programas p WHERE p.id = ppr_tarefas.programa_id AND p.corretora_id = get_user_corretora_id(auth.uid())));

CREATE POLICY "Tenant scoped delete ppr_tarefas"
ON public.ppr_tarefas FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.ppr_programas p WHERE p.id = ppr_tarefas.programa_id AND p.corretora_id = get_user_corretora_id(auth.uid())));

-- ============ whatsapp_contact_flow_state (via contact_id) ============
DROP POLICY IF EXISTS "Authenticated users can manage flow state" ON public.whatsapp_contact_flow_state;

CREATE POLICY "Tenant scoped manage whatsapp_contact_flow_state"
ON public.whatsapp_contact_flow_state FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.whatsapp_contacts c WHERE c.id = whatsapp_contact_flow_state.contact_id AND c.corretora_id = get_user_corretora_id(auth.uid())))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.whatsapp_contacts c WHERE c.id = whatsapp_contact_flow_state.contact_id AND c.corretora_id = get_user_corretora_id(auth.uid())));