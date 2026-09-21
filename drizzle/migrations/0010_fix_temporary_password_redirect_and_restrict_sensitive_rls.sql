CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Authenticated users can delete equipes" ON public.equipes;
DROP POLICY IF EXISTS "Authenticated users can insert equipes" ON public.equipes;
DROP POLICY IF EXISTS "Authenticated users can update equipes" ON public.equipes;

CREATE POLICY "Privileged users can insert equipes"
ON public.equipes
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
);

CREATE POLICY "Privileged users can update equipes"
ON public.equipes
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
);

CREATE POLICY "Privileged users can delete equipes"
ON public.equipes
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
);

DROP POLICY IF EXISTS "Authenticated users can delete equipe_lideres" ON public.equipe_lideres;
DROP POLICY IF EXISTS "Authenticated users can insert equipe_lideres" ON public.equipe_lideres;
DROP POLICY IF EXISTS "Authenticated users can update equipe_lideres" ON public.equipe_lideres;

CREATE POLICY "Privileged users can insert equipe_lideres"
ON public.equipe_lideres
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
);

CREATE POLICY "Privileged users can update equipe_lideres"
ON public.equipe_lideres
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
);

CREATE POLICY "Privileged users can delete equipe_lideres"
ON public.equipe_lideres
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
);

DROP POLICY IF EXISTS "Authenticated users can view sinistro_acompanhamento" ON public.sinistro_acompanhamento;
DROP POLICY IF EXISTS "Authenticated users can view all vistorias" ON public.vistorias;