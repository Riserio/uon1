DROP POLICY IF EXISTS "Authenticated users can insert registros_ponto" ON public.registros_ponto;

CREATE POLICY "Ponto: inserir apenas proprio ou gestor da associacao"
ON public.registros_ponto
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.id = registros_ponto.funcionario_id
      AND (
        f.profile_id = auth.uid()
        OR (
          has_role(auth.uid(), 'administrativo'::app_role)
          AND f.corretora_id IS NOT DISTINCT FROM get_user_corretora_id(auth.uid())
        )
      )
  )
);