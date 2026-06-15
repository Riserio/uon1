
-- Helper inline: admin or superintendente check used widely
-- We rely on existing public.has_role and public.get_user_corretora_id functions.

-- =========================
-- cadastro_registros
-- =========================
DROP POLICY IF EXISTS "Authenticated users can manage cadastro_registros" ON public.cadastro_registros;

CREATE POLICY "Tenant scoped select cadastro_registros"
ON public.cadastro_registros FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.cadastro_importacoes ci
    WHERE ci.id = cadastro_registros.importacao_id
      AND ci.corretora_id = public.get_user_corretora_id(auth.uid())
  )
);

CREATE POLICY "Tenant scoped insert cadastro_registros"
ON public.cadastro_registros FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.cadastro_importacoes ci
    WHERE ci.id = cadastro_registros.importacao_id
      AND ci.corretora_id = public.get_user_corretora_id(auth.uid())
  )
);

CREATE POLICY "Tenant scoped update cadastro_registros"
ON public.cadastro_registros FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.cadastro_importacoes ci
    WHERE ci.id = cadastro_registros.importacao_id
      AND ci.corretora_id = public.get_user_corretora_id(auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.cadastro_importacoes ci
    WHERE ci.id = cadastro_registros.importacao_id
      AND ci.corretora_id = public.get_user_corretora_id(auth.uid())
  )
);

CREATE POLICY "Tenant scoped delete cadastro_registros"
ON public.cadastro_registros FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.cadastro_importacoes ci
    WHERE ci.id = cadastro_registros.importacao_id
      AND ci.corretora_id = public.get_user_corretora_id(auth.uid())
  )
);

-- =========================
-- cobranca_boletos
-- =========================
DROP POLICY IF EXISTS "Authenticated users can view cobranca_boletos" ON public.cobranca_boletos;
DROP POLICY IF EXISTS "Authenticated users can insert cobranca_boletos" ON public.cobranca_boletos;
DROP POLICY IF EXISTS "Authenticated users can update cobranca_boletos" ON public.cobranca_boletos;
DROP POLICY IF EXISTS "Authenticated users can delete cobranca_boletos" ON public.cobranca_boletos;

CREATE POLICY "Tenant scoped select cobranca_boletos"
ON public.cobranca_boletos FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.cobranca_importacoes ci
    WHERE ci.id = cobranca_boletos.importacao_id
      AND ci.corretora_id = public.get_user_corretora_id(auth.uid())
  )
);

CREATE POLICY "Tenant scoped insert cobranca_boletos"
ON public.cobranca_boletos FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.cobranca_importacoes ci
    WHERE ci.id = cobranca_boletos.importacao_id
      AND ci.corretora_id = public.get_user_corretora_id(auth.uid())
  )
);

CREATE POLICY "Tenant scoped update cobranca_boletos"
ON public.cobranca_boletos FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.cobranca_importacoes ci
    WHERE ci.id = cobranca_boletos.importacao_id
      AND ci.corretora_id = public.get_user_corretora_id(auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.cobranca_importacoes ci
    WHERE ci.id = cobranca_boletos.importacao_id
      AND ci.corretora_id = public.get_user_corretora_id(auth.uid())
  )
);

CREATE POLICY "Tenant scoped delete cobranca_boletos"
ON public.cobranca_boletos FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.cobranca_importacoes ci
    WHERE ci.id = cobranca_boletos.importacao_id
      AND ci.corretora_id = public.get_user_corretora_id(auth.uid())
  )
);

-- =========================
-- cobranca_automacao_execucoes
-- =========================
DROP POLICY IF EXISTS "Sistema pode gerenciar logs de execução" ON public.cobranca_automacao_execucoes;
-- service_role bypasses RLS; ensure it still has table privileges
GRANT ALL ON public.cobranca_automacao_execucoes TO service_role;

-- =========================
-- estudo_base_importacoes
-- =========================
DROP POLICY IF EXISTS "Users can view estudo_base_importacoes" ON public.estudo_base_importacoes;
DROP POLICY IF EXISTS "Users can insert estudo_base_importacoes" ON public.estudo_base_importacoes;
DROP POLICY IF EXISTS "Users can update estudo_base_importacoes" ON public.estudo_base_importacoes;
DROP POLICY IF EXISTS "Users can delete estudo_base_importacoes" ON public.estudo_base_importacoes;

CREATE POLICY "Tenant scoped select estudo_base_importacoes"
ON public.estudo_base_importacoes FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

CREATE POLICY "Tenant scoped insert estudo_base_importacoes"
ON public.estudo_base_importacoes FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

CREATE POLICY "Tenant scoped update estudo_base_importacoes"
ON public.estudo_base_importacoes FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

CREATE POLICY "Tenant scoped delete estudo_base_importacoes"
ON public.estudo_base_importacoes FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

-- =========================
-- mgf_automacao_config
-- =========================
DROP POLICY IF EXISTS "Authenticated users can view mgf_automacao_config" ON public.mgf_automacao_config;
DROP POLICY IF EXISTS "Authenticated users can insert mgf_automacao_config" ON public.mgf_automacao_config;
DROP POLICY IF EXISTS "Authenticated users can update mgf_automacao_config" ON public.mgf_automacao_config;
DROP POLICY IF EXISTS "Authenticated users can delete mgf_automacao_config" ON public.mgf_automacao_config;

CREATE POLICY "Tenant scoped select mgf_automacao_config"
ON public.mgf_automacao_config FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

CREATE POLICY "Tenant scoped insert mgf_automacao_config"
ON public.mgf_automacao_config FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

CREATE POLICY "Tenant scoped update mgf_automacao_config"
ON public.mgf_automacao_config FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

CREATE POLICY "Tenant scoped delete mgf_automacao_config"
ON public.mgf_automacao_config FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

-- =========================
-- sga_automacao_config
-- =========================
DROP POLICY IF EXISTS "Authenticated users can view sga_automacao_config" ON public.sga_automacao_config;
DROP POLICY IF EXISTS "Authenticated users can insert sga_automacao_config" ON public.sga_automacao_config;
DROP POLICY IF EXISTS "Authenticated users can update sga_automacao_config" ON public.sga_automacao_config;
DROP POLICY IF EXISTS "Authenticated users can delete sga_automacao_config" ON public.sga_automacao_config;

CREATE POLICY "Tenant scoped select sga_automacao_config"
ON public.sga_automacao_config FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

CREATE POLICY "Tenant scoped insert sga_automacao_config"
ON public.sga_automacao_config FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

CREATE POLICY "Tenant scoped update sga_automacao_config"
ON public.sga_automacao_config FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

CREATE POLICY "Tenant scoped delete sga_automacao_config"
ON public.sga_automacao_config FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

-- =========================
-- ouvidoria_config (public SELECT preserved for embedded forms)
-- =========================
DROP POLICY IF EXISTS "Authenticated users can manage ouvidoria config" ON public.ouvidoria_config;

CREATE POLICY "Tenant scoped insert ouvidoria_config"
ON public.ouvidoria_config FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

CREATE POLICY "Tenant scoped update ouvidoria_config"
ON public.ouvidoria_config FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);

CREATE POLICY "Tenant scoped delete ouvidoria_config"
ON public.ouvidoria_config FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR corretora_id = public.get_user_corretora_id(auth.uid())
);
