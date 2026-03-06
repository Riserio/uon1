DROP POLICY IF EXISTS "Users can update corretoras" ON public.corretoras;

CREATE POLICY "Users can update corretoras" 
ON public.corretoras 
FOR UPDATE 
TO authenticated
USING (
  (created_by = auth.uid()) 
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superintendente'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
)
WITH CHECK (
  (created_by = auth.uid()) 
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superintendente'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
);