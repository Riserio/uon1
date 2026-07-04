DROP POLICY IF EXISTS "Admins and owners can delete corretoras" ON public.corretoras;
CREATE POLICY "Admins and owners can delete corretoras"
ON public.corretoras
FOR DELETE
TO authenticated
USING (
  (created_by = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
);