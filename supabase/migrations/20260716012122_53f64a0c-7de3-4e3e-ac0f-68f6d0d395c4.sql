-- ============================================================
-- CORREÇÃO DE ISOLAMENTO ENTRE ASSOCIAÇÕES (CROSS-TENANT)
-- ============================================================

-- -----------------------------------------------------------
-- 1) cobranca_importacoes
-- As políticas antigas usavam auth.role() = 'authenticated' e
-- se aplicavam ao role public, expondo registros entre tenants.
-- -----------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view cobranca_importacoes" ON public.cobranca_importacoes;
DROP POLICY IF EXISTS "Authenticated users can insert cobranca_importacoes" ON public.cobranca_importacoes;
DROP POLICY IF EXISTS "Authenticated users can update cobranca_importacoes" ON public.cobranca_importacoes;
DROP POLICY IF EXISTS "Authenticated users can delete cobranca_importacoes" ON public.cobranca_importacoes;

CREATE POLICY "cobranca_importacoes_tenant_select" ON public.cobranca_importacoes
  FOR SELECT TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid())
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'superintendente'));

CREATE POLICY "cobranca_importacoes_tenant_insert" ON public.cobranca_importacoes
  FOR INSERT TO authenticated
  WITH CHECK (corretora_id = public.get_user_corretora_id(auth.uid())
              OR public.has_role(auth.uid(), 'admin')
              OR public.has_role(auth.uid(), 'superintendente'));

CREATE POLICY "cobranca_importacoes_tenant_update" ON public.cobranca_importacoes
  FOR UPDATE TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid())
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'superintendente'))
  WITH CHECK (corretora_id = public.get_user_corretora_id(auth.uid())
              OR public.has_role(auth.uid(), 'admin')
              OR public.has_role(auth.uid(), 'superintendente'));

CREATE POLICY "cobranca_importacoes_tenant_delete" ON public.cobranca_importacoes
  FOR DELETE TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid())
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'superintendente'));

-- -----------------------------------------------------------
-- 2) cobranca_inadimplencia_config
-- Políticas USING(true)/WITH CHECK(true) expunham todas as configs.
-- -----------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read inadimplencia config" ON public.cobranca_inadimplencia_config;
DROP POLICY IF EXISTS "Authenticated users can insert inadimplencia config" ON public.cobranca_inadimplencia_config;
DROP POLICY IF EXISTS "Authenticated users can update inadimplencia config" ON public.cobranca_inadimplencia_config;
DROP POLICY IF EXISTS "Authenticated users can delete inadimplencia config" ON public.cobranca_inadimplencia_config;

CREATE POLICY "cobranca_inadimplencia_config_tenant_select" ON public.cobranca_inadimplencia_config
  FOR SELECT TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid())
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'superintendente'));

CREATE POLICY "cobranca_inadimplencia_config_tenant_insert" ON public.cobranca_inadimplencia_config
  FOR INSERT TO authenticated
  WITH CHECK (corretora_id = public.get_user_corretora_id(auth.uid())
              OR public.has_role(auth.uid(), 'admin')
              OR public.has_role(auth.uid(), 'superintendente'));

CREATE POLICY "cobranca_inadimplencia_config_tenant_update" ON public.cobranca_inadimplencia_config
  FOR UPDATE TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid())
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'superintendente'))
  WITH CHECK (corretora_id = public.get_user_corretora_id(auth.uid())
              OR public.has_role(auth.uid(), 'admin')
              OR public.has_role(auth.uid(), 'superintendente'));

CREATE POLICY "cobranca_inadimplencia_config_tenant_delete" ON public.cobranca_inadimplencia_config
  FOR DELETE TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid())
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'superintendente'));

-- -----------------------------------------------------------
-- 3) cobranca_inadimplencia_historico
-- Mesmo padrão de exposição cross-tenant.
-- -----------------------------------------------------------
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar histórico" ON public.cobranca_inadimplencia_historico;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir histórico" ON public.cobranca_inadimplencia_historico;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar histórico" ON public.cobranca_inadimplencia_historico;
DROP POLICY IF EXISTS "Usuários autenticados podem excluir histórico" ON public.cobranca_inadimplencia_historico;

CREATE POLICY "cobranca_inadimplencia_historico_tenant_select" ON public.cobranca_inadimplencia_historico
  FOR SELECT TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid())
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'superintendente'));

CREATE POLICY "cobranca_inadimplencia_historico_tenant_insert" ON public.cobranca_inadimplencia_historico
  FOR INSERT TO authenticated
  WITH CHECK (corretora_id = public.get_user_corretora_id(auth.uid())
              OR public.has_role(auth.uid(), 'admin')
              OR public.has_role(auth.uid(), 'superintendente'));

CREATE POLICY "cobranca_inadimplencia_historico_tenant_update" ON public.cobranca_inadimplencia_historico
  FOR UPDATE TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid())
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'superintendente'))
  WITH CHECK (corretora_id = public.get_user_corretora_id(auth.uid())
              OR public.has_role(auth.uid(), 'admin')
              OR public.has_role(auth.uid(), 'superintendente'));

CREATE POLICY "cobranca_inadimplencia_historico_tenant_delete" ON public.cobranca_inadimplencia_historico
  FOR DELETE TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid())
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'superintendente'));

-- -----------------------------------------------------------
-- 4) contrato_signatarios_salvos
-- Remove as políticas USING(true) que, por OR com as escopadas,
-- anulavam o isolamento entre associações.
-- -----------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view signatarios salvos" ON public.contrato_signatarios_salvos;
DROP POLICY IF EXISTS "Authenticated can insert signatarios salvos" ON public.contrato_signatarios_salvos;
DROP POLICY IF EXISTS "Authenticated can update signatarios salvos" ON public.contrato_signatarios_salvos;
DROP POLICY IF EXISTS "Authenticated can delete signatarios salvos" ON public.contrato_signatarios_salvos;