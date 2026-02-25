
-- Fix RLS policies for email_historico to support system emails (NULL atendimento_id)

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view emails of accessible atendimentos" ON public.email_historico;
DROP POLICY IF EXISTS "Users can insert emails for accessible atendimentos" ON public.email_historico;

-- New SELECT policy: can view emails they sent OR emails linked to their accessible atendimentos
CREATE POLICY "Users can view their emails"
ON public.email_historico FOR SELECT
USING (
  enviado_por = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
  OR (atendimento_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM atendimentos
    WHERE atendimentos.id = email_historico.atendimento_id
    AND (
      atendimentos.user_id = auth.uid()
      OR has_role(auth.uid(), 'lider'::app_role)
    )
  ))
);

-- New INSERT policy: can insert emails they send
CREATE POLICY "Users can insert their emails"
ON public.email_historico FOR INSERT
WITH CHECK (
  enviado_por = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
);
