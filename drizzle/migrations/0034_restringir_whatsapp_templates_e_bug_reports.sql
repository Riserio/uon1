-- 2026-10-27 — whatsapp_templates: CRUD restrito à administração.
-- A tabela é catálogo global usado pelas telas de configuração (Emails > WhatsApp)
-- e pelas funções de servidor (service_role). Substitui as 4 policies abertas
-- (SELECT/INSERT/UPDATE/DELETE para qualquer usuário logado) por uma só de admin.
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Authenticated users can insert whatsapp_templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Authenticated users can update whatsapp_templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Authenticated users can delete whatsapp_templates" ON public.whatsapp_templates;
CREATE POLICY "Admins can manage whatsapp_templates"
  ON public.whatsapp_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente'));

-- 2026-10-27 — storage bucket bug-reports: anexos visíveis só ao autor e à administração.
-- Antes qualquer usuário logado podia baixar/renomear/apagar anexos de qualquer relato.
-- O upload define owner_id automaticamente com o usuário autenticado.
DROP POLICY IF EXISTS "Auth users can view bug report anexos" ON storage.objects;
CREATE POLICY "Auth users can view bug report anexos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'bug-reports'
    AND (
      owner_id = (SELECT auth.uid())::text
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  );
DROP POLICY IF EXISTS "Auth users can upload bug report anexos" ON storage.objects;
CREATE POLICY "Auth users can upload bug report anexos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bug-reports'
    AND owner_id = (SELECT auth.uid())::text
  );
DROP POLICY IF EXISTS "Auth users can delete bug report anexos" ON storage.objects;
CREATE POLICY "Auth users can delete bug report anexos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'bug-reports'
    AND (
      owner_id = (SELECT auth.uid())::text
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superintendente')
    )
  );