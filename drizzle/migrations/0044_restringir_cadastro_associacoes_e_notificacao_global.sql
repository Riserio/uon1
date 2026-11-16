CREATE OR REPLACE FUNCTION public.eh_equipe_interna(_uid uuid)
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
REVOKE ALL ON FUNCTION public.eh_equipe_interna(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eh_equipe_interna(uuid) TO authenticated, service_role;

-- Cadastro de associações: só equipe interna aprovada, sempre em nome de quem cadastra
DROP POLICY IF EXISTS "Authenticated users can insert corretoras" ON public.corretoras;
CREATE POLICY "Equipe interna cadastra corretoras" ON public.corretoras
  FOR INSERT TO authenticated
  WITH CHECK (public.eh_equipe_interna(auth.uid()) AND created_by::text = auth.uid()::text);

-- Notificação global do WhatsApp: vale para todas as associações, então só a administração
DROP POLICY IF EXISTS "Authenticated users can insert global notification config" ON public.whatsapp_notificacao_global;
DROP POLICY IF EXISTS "Authenticated users can read global notification config" ON public.whatsapp_notificacao_global;
DROP POLICY IF EXISTS "Authenticated users can update global notification config" ON public.whatsapp_notificacao_global;
CREATE POLICY "Admins manage whatsapp_notificacao_global" ON public.whatsapp_notificacao_global
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role));