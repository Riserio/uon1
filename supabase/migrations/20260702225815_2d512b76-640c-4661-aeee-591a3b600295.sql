
-- Atendimentos: restringir SELECT ao próprio tenant
DROP POLICY IF EXISTS "Authenticated users can view all atendimentos" ON public.atendimentos;
CREATE POLICY "Users view atendimentos of their corretora"
ON public.atendimentos FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR corretora_id = public.get_user_corretora_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'superintendente'::app_role)
);

-- Contrato signatários salvos: escopar todas as políticas
DROP POLICY IF EXISTS "Authenticated users can view contrato_signatarios_salvos" ON public.contrato_signatarios_salvos;
DROP POLICY IF EXISTS "Authenticated users can insert contrato_signatarios_salvos" ON public.contrato_signatarios_salvos;
DROP POLICY IF EXISTS "Authenticated users can update contrato_signatarios_salvos" ON public.contrato_signatarios_salvos;
DROP POLICY IF EXISTS "Authenticated users can delete contrato_signatarios_salvos" ON public.contrato_signatarios_salvos;

CREATE POLICY "Users view signatarios of their corretora"
ON public.contrato_signatarios_salvos FOR SELECT
TO authenticated
USING (
  corretora_id = public.get_user_corretora_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'superintendente'::app_role)
);

CREATE POLICY "Users insert signatarios of their corretora"
ON public.contrato_signatarios_salvos FOR INSERT
TO authenticated
WITH CHECK (
  corretora_id = public.get_user_corretora_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'superintendente'::app_role)
);

CREATE POLICY "Users update signatarios of their corretora"
ON public.contrato_signatarios_salvos FOR UPDATE
TO authenticated
USING (
  corretora_id = public.get_user_corretora_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'superintendente'::app_role)
)
WITH CHECK (
  corretora_id = public.get_user_corretora_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'superintendente'::app_role)
);

CREATE POLICY "Users delete signatarios of their corretora"
ON public.contrato_signatarios_salvos FOR DELETE
TO authenticated
USING (
  corretora_id = public.get_user_corretora_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'superintendente'::app_role)
);

-- Lançamentos financeiros: restringir SELECT
DROP POLICY IF EXISTS "Authenticated users can view lancamentos" ON public.lancamentos_financeiros;
CREATE POLICY "Users view lancamentos of their corretora"
ON public.lancamentos_financeiros FOR SELECT
TO authenticated
USING (
  corretora_id = public.get_user_corretora_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'superintendente'::app_role)
);

-- Notas fiscais: restringir SELECT
DROP POLICY IF EXISTS "Authenticated users can view notas_fiscais" ON public.notas_fiscais;
CREATE POLICY "Users view notas_fiscais of their corretora"
ON public.notas_fiscais FOR SELECT
TO authenticated
USING (
  corretora_id = public.get_user_corretora_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'superintendente'::app_role)
);
