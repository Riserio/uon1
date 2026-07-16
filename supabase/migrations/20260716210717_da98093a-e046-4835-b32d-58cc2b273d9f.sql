BEGIN;

DROP POLICY IF EXISTS "Parceiros can view own linked pid_operacional" ON public.pid_operacional;
CREATE POLICY "Parceiros can view own linked pid_operacional"
  ON public.pid_operacional
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'parceiro'::app_role)
    AND corretora_id IN (
      SELECT corretora_id FROM public.corretora_usuarios
      WHERE profile_id = auth.uid() AND ativo = true
    )
  );

DROP POLICY IF EXISTS "Parceiros can view own linked pid_estudo_base" ON public.pid_estudo_base;
CREATE POLICY "Parceiros can view own linked pid_estudo_base"
  ON public.pid_estudo_base
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'parceiro'::app_role)
    AND corretora_id IN (
      SELECT corretora_id FROM public.corretora_usuarios
      WHERE profile_id = auth.uid() AND ativo = true
    )
  );

DROP POLICY IF EXISTS "Parceiros can view own linked pid_placas_diario" ON public.pid_placas_diario;
CREATE POLICY "Parceiros can view own linked pid_placas_diario"
  ON public.pid_placas_diario
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'parceiro'::app_role)
    AND corretora_id IN (
      SELECT corretora_id FROM public.corretora_usuarios
      WHERE profile_id = auth.uid() AND ativo = true
    )
  );

COMMIT;