-- 2026-10-27 — Fecha acesso aberto em cargos, meeting_participants e vistoria_prazo_config.
-- cargos: catálogo global de perfis/funções — leitura para qualquer usuário logado (o app
--   usa nos seletores de cadastro), escrita só admin/superintendente (policy já existente).
-- meeting_participants: gravação acontece 100% na edge function livekit-rooms com
--   service_role; o cliente só lê (SELECT autenticado) e o anfitrião/usuário atualiza a
--   própria linha. Remove a policy de INSERT pública e todo acesso anônimo.
-- vistoria_prazo_config: escopo por associação — leitura para quem pertence à associação
--   (ou administração), escrita só admin/superintendente (tela de configuração global).

-- ================= cargos =================
REVOKE ALL ON public.cargos FROM anon, PUBLIC;
GRANT SELECT ON public.cargos TO authenticated;
GRANT ALL ON public.cargos TO service_role;

-- ============ meeting_participants ============
REVOKE ALL ON public.meeting_participants FROM anon, PUBLIC;
GRANT SELECT, UPDATE ON public.meeting_participants TO authenticated;
GRANT ALL ON public.meeting_participants TO service_role;
DROP POLICY IF EXISTS "Anyone can insert participants" ON public.meeting_participants;

-- ============ vistoria_prazo_config ============
REVOKE ALL ON public.vistoria_prazo_config FROM anon, PUBLIC;
GRANT SELECT ON public.vistoria_prazo_config TO authenticated;
GRANT ALL ON public.vistoria_prazo_config TO service_role;
DROP POLICY IF EXISTS "Authenticated users can view vistoria_prazo_config" ON public.vistoria_prazo_config;
DROP POLICY IF EXISTS "Authenticated users can manage vistoria_prazo_config" ON public.vistoria_prazo_config;
CREATE POLICY "View vistoria prazo config"
  ON public.vistoria_prazo_config FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superintendente')
    OR corretora_id = public.get_user_corretora_id(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.corretora_usuarios cu
      WHERE cu.corretora_id = vistoria_prazo_config.corretora_id
        AND cu.profile_id = auth.uid()
        AND cu.ativo
    )
  );
CREATE POLICY "Manage vistoria prazo config"
  ON public.vistoria_prazo_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente'));