DROP POLICY IF EXISTS "Auth ver formulários" ON public.formularios;
DROP POLICY IF EXISTS "Auth criar formulários" ON public.formularios;
DROP POLICY IF EXISTS "Auth editar formulários" ON public.formularios;
DROP POLICY IF EXISTS "Auth excluir formulários" ON public.formularios;

CREATE POLICY "Formulários da associação" ON public.formularios
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente')
  OR corretora_id IS NOT DISTINCT FROM public.get_user_corretora_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente')
  OR corretora_id IS NOT DISTINCT FROM public.get_user_corretora_id(auth.uid())
);

DROP POLICY IF EXISTS "Auth gerenciar perguntas" ON public.formulario_perguntas;
DROP POLICY IF EXISTS "Auth ver perguntas" ON public.formulario_perguntas;

CREATE POLICY "Perguntas da associação" ON public.formulario_perguntas
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.formularios f
  WHERE f.id = formulario_perguntas.formulario_id
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente')
         OR f.corretora_id IS NOT DISTINCT FROM public.get_user_corretora_id(auth.uid()))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.formularios f
  WHERE f.id = formulario_perguntas.formulario_id
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente')
         OR f.corretora_id IS NOT DISTINCT FROM public.get_user_corretora_id(auth.uid()))
));

DROP POLICY IF EXISTS "Authenticated users can view gestao_associacao_fluxos" ON public.gestao_associacao_fluxos;
DROP POLICY IF EXISTS "Authenticated users can insert gestao_associacao_fluxos" ON public.gestao_associacao_fluxos;
DROP POLICY IF EXISTS "Authenticated users can update gestao_associacao_fluxos" ON public.gestao_associacao_fluxos;
DROP POLICY IF EXISTS "Authenticated users can delete gestao_associacao_fluxos" ON public.gestao_associacao_fluxos;

CREATE POLICY "Fluxos da associação" ON public.gestao_associacao_fluxos
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente')
  OR corretora_id IS NOT DISTINCT FROM public.get_user_corretora_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superintendente')
  OR corretora_id IS NOT DISTINCT FROM public.get_user_corretora_id(auth.uid())
);