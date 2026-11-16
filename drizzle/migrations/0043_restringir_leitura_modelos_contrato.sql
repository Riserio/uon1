CREATE OR REPLACE FUNCTION public.pode_ver_modelos_contrato(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _uid IS NOT NULL
     AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = _uid AND p.ativo AND p.status = 'ativo')
     AND (
       EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = _uid AND r.role <> 'parceiro'::app_role)
       OR NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = _uid)
     )
$$;
REVOKE ALL ON FUNCTION public.pode_ver_modelos_contrato(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_modelos_contrato(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can view contrato_templates" ON public.contrato_templates;
CREATE POLICY "Equipe interna aprovada ve contrato_templates" ON public.contrato_templates
  FOR SELECT TO authenticated
  USING (public.pode_ver_modelos_contrato(auth.uid()));