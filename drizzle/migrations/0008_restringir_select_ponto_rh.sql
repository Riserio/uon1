DROP POLICY IF EXISTS "Authenticated users can view banco_horas" ON public.banco_horas;
CREATE POLICY "Ver banco_horas do proprio funcionario ou da corretora"
ON public.banco_horas FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
  OR funcionario_id IN (SELECT f.id FROM public.funcionarios f WHERE f.profile_id = auth.uid())
  OR (
    has_role(auth.uid(), 'administrativo'::app_role)
    AND funcionario_id IN (
      SELECT f.id FROM public.funcionarios f
      WHERE f.corretora_id = public.get_user_corretora_id(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can view fechamentos_ponto" ON public.fechamentos_ponto;
CREATE POLICY "Ver fechamentos do proprio funcionario ou da corretora"
ON public.fechamentos_ponto FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
  OR funcionario_id IN (SELECT f.id FROM public.funcionarios f WHERE f.profile_id = auth.uid())
  OR (
    has_role(auth.uid(), 'administrativo'::app_role)
    AND funcionario_id IN (
      SELECT f.id FROM public.funcionarios f
      WHERE f.corretora_id = public.get_user_corretora_id(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can view justificativas_ausencia" ON public.justificativas_ausencia;
CREATE POLICY "Ver justificativas do proprio funcionario ou da corretora"
ON public.justificativas_ausencia FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
  OR funcionario_id IN (SELECT f.id FROM public.funcionarios f WHERE f.profile_id = auth.uid())
  OR (
    has_role(auth.uid(), 'administrativo'::app_role)
    AND funcionario_id IN (
      SELECT f.id FROM public.funcionarios f
      WHERE f.corretora_id = public.get_user_corretora_id(auth.uid())
    )
  )
);