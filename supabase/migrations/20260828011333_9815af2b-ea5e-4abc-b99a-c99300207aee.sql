DROP POLICY IF EXISTS "Authenticated users can manage scheduled messages" ON public.whatsapp_scheduled_messages;

CREATE POLICY "wsm_tenant_select" ON public.whatsapp_scheduled_messages
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.whatsapp_contacts c WHERE c.id = whatsapp_scheduled_messages.contact_id AND c.corretora_id = get_user_corretora_id(auth.uid()))
);

CREATE POLICY "wsm_tenant_insert" ON public.whatsapp_scheduled_messages
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.whatsapp_contacts c WHERE c.id = contact_id AND c.corretora_id = get_user_corretora_id(auth.uid()))
);

CREATE POLICY "wsm_tenant_update" ON public.whatsapp_scheduled_messages
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.whatsapp_contacts c WHERE c.id = whatsapp_scheduled_messages.contact_id AND c.corretora_id = get_user_corretora_id(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.whatsapp_contacts c WHERE c.id = contact_id AND c.corretora_id = get_user_corretora_id(auth.uid()))
);

CREATE POLICY "wsm_tenant_delete" ON public.whatsapp_scheduled_messages
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
  OR EXISTS (SELECT 1 FROM public.whatsapp_contacts c WHERE c.id = whatsapp_scheduled_messages.contact_id AND c.corretora_id = get_user_corretora_id(auth.uid()))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_scheduled_messages TO authenticated;
GRANT ALL ON public.whatsapp_scheduled_messages TO service_role;