-- Allow anonymous users to read basic corretora info for public ouvidoria form
CREATE POLICY "Anon can view corretoras for public ouvidoria"
ON public.corretoras
FOR SELECT
TO anon
USING (true);