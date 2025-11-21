-- Add RLS policy to allow UPDATE on termos_aceitos for anonymous users
CREATE POLICY "Public can update termos aceitos"
ON public.termos_aceitos
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);