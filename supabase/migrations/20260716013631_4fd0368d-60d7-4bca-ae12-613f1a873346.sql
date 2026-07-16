
-- Remove permissive true policies that override tenant scoping
DROP POLICY IF EXISTS "Authenticated users can manage cadastro_importacoes" ON public.cadastro_importacoes;
DROP POLICY IF EXISTS "Authenticated users can view ouvidoria registros" ON public.ouvidoria_registros;
DROP POLICY IF EXISTS "Authenticated users can update ouvidoria registros" ON public.ouvidoria_registros;

-- Ensure tenant-scoped UPDATE exists for ouvidoria_registros
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='ouvidoria_registros' AND policyname='ouvidoria_registros_tenant_update'
  ) THEN
    CREATE POLICY "ouvidoria_registros_tenant_update"
      ON public.ouvidoria_registros
      FOR UPDATE
      TO authenticated
      USING (
        corretora_id = get_user_corretora_id(auth.uid())
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'superintendente'::app_role)
      )
      WITH CHECK (
        corretora_id = get_user_corretora_id(auth.uid())
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'superintendente'::app_role)
      );
  END IF;
END $$;
