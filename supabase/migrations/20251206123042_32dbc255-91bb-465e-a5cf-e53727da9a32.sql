-- Drop and recreate the UPDATE policy for corretoras to include superintendente
DROP POLICY IF EXISTS "Users can update own corretoras" ON public.corretoras;

CREATE POLICY "Users can update corretoras" 
ON public.corretoras 
FOR UPDATE 
USING (
  (created_by = auth.uid()) 
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superintendente'::app_role)
);