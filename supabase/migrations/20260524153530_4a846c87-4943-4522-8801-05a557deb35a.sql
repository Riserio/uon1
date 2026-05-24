
-- 1. Fix hinova_credenciais RLS: scope to user's corretora
DROP POLICY IF EXISTS "Authenticated users can read hinova_credenciais" ON public.hinova_credenciais;
DROP POLICY IF EXISTS "Authenticated users can insert hinova_credenciais" ON public.hinova_credenciais;
DROP POLICY IF EXISTS "Authenticated users can update hinova_credenciais" ON public.hinova_credenciais;

CREATE POLICY "Users can view own corretora hinova_credenciais"
  ON public.hinova_credenciais FOR SELECT
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superintendente'::app_role)
  );

CREATE POLICY "Admins can insert hinova_credenciais"
  ON public.hinova_credenciais FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superintendente'::app_role)
    OR corretora_id = public.get_user_corretora_id(auth.uid())
  );

CREATE POLICY "Admins can update hinova_credenciais"
  ON public.hinova_credenciais FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superintendente'::app_role)
    OR corretora_id = public.get_user_corretora_id(auth.uid())
  );

-- 2. Fix mutable search_path on update_whatsapp_updated_at
CREATE OR REPLACE FUNCTION public.update_whatsapp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
