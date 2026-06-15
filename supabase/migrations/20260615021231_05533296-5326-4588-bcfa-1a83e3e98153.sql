
ALTER TABLE public.cobranca_automacao_execucoes
  DROP CONSTRAINT IF EXISTS cobranca_automacao_execucoes_status_check;

ALTER TABLE public.cobranca_automacao_execucoes
  ADD CONSTRAINT cobranca_automacao_execucoes_status_check
  CHECK (status IN ('pendente','executando','sucesso','erro','parado'));

CREATE POLICY "Admins podem atualizar logs de execução"
ON public.cobranca_automacao_execucoes
FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('admin'::app_role, 'superintendente'::app_role))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('admin'::app_role, 'superintendente'::app_role))
);

CREATE POLICY "Admins podem deletar logs de execução"
ON public.cobranca_automacao_execucoes
FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('admin'::app_role, 'superintendente'::app_role))
);

UPDATE public.cobranca_automacao_execucoes
SET status = 'parado',
    erro = COALESCE(erro, 'Cancelamento manual — execução travada em disparo'),
    finalizado_at = COALESCE(finalizado_at, now())
WHERE id = '60ab399c-6fad-4d76-95c4-80c67641567d'
  AND status = 'executando';
