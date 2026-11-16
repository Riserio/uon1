DROP POLICY IF EXISTS "Authenticated users can manage flows" ON public.whatsapp_flows;
CREATE POLICY "Admins manage whatsapp_flows" ON public.whatsapp_flows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role));

DROP POLICY IF EXISTS "Authenticated users can manage flow steps" ON public.whatsapp_flow_steps;
CREATE POLICY "Admins manage whatsapp_flow_steps" ON public.whatsapp_flow_steps
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role));