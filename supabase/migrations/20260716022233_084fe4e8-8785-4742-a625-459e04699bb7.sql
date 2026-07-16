BEGIN;

-- Remove políticas abertas identificadas pelos alertas de segurança
DROP POLICY IF EXISTS "Authenticated users can view all corretoras" ON public.corretoras;
DROP POLICY IF EXISTS "pid_placas_diario_select" ON public.pid_placas_diario;
DROP POLICY IF EXISTS "Authenticated users can view producao_financeira" ON public.producao_financeira;

-- Acesso à própria associação vinculada (via função security definer) + admin/superintendente
CREATE POLICY "Linked users and admins can view corretoras"
  ON public.corretoras
  FOR SELECT
  TO authenticated
  USING (
    id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE POLICY "Linked users and admins can view pid_placas_diario"
  ON public.pid_placas_diario
  FOR SELECT
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE POLICY "Linked users and admins can view producao_financeira"
  ON public.producao_financeira
  FOR SELECT
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

COMMIT;