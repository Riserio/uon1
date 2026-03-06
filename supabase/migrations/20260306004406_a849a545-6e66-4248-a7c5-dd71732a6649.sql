-- Allow anon to read back ouvidoria_registros they just inserted (needed for .select().single() after insert)
CREATE POLICY "Anon can read own ouvidoria registros"
ON public.ouvidoria_registros
FOR SELECT
TO anon
USING (true);