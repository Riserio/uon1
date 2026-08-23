-- 1) RLS nas tabelas internas sem proteção
ALTER TABLE public._diag2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._auditoria_base_imp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._diag2 FROM anon, authenticated;
REVOKE ALL ON public._auditoria_base_imp FROM anon, authenticated;
GRANT ALL ON public._diag2 TO service_role;
GRANT ALL ON public._auditoria_base_imp TO service_role;

-- 2) Isolamento por associação nas políticas de PID baseadas em permissão de menu
DROP POLICY IF EXISTS "Users with PID permission can view pid_estudo_base" ON public.pid_estudo_base;
CREATE POLICY "Users with PID permission can view pid_estudo_base"
ON public.pid_estudo_base FOR SELECT TO authenticated
USING (
  user_can_access_menu(auth.uid(), 'pid'::text, false)
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'superintendente'::app_role)
    OR corretora_id = get_user_corretora_id(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.corretora_usuarios cu
      WHERE cu.profile_id = auth.uid() AND cu.ativo = true
        AND cu.corretora_id = pid_estudo_base.corretora_id
    )
  )
);

DROP POLICY IF EXISTS "Users with PID permission can view pid_operacional" ON public.pid_operacional;
CREATE POLICY "Users with PID permission can view pid_operacional"
ON public.pid_operacional FOR SELECT TO authenticated
USING (
  user_can_access_menu(auth.uid(), 'pid'::text, false)
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'superintendente'::app_role)
    OR corretora_id = get_user_corretora_id(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.corretora_usuarios cu
      WHERE cu.profile_id = auth.uid() AND cu.ativo = true
        AND cu.corretora_id = pid_operacional.corretora_id
    )
  )
);