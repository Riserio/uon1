DROP POLICY IF EXISTS "Authenticated users can insert logs" ON public.bi_audit_logs;
CREATE POLICY "Authenticated users can insert logs"
  ON public.bi_audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can insert contrato_historico" ON public.contrato_historico;
CREATE POLICY "Authenticated users can insert contrato_historico"
  ON public.contrato_historico FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);