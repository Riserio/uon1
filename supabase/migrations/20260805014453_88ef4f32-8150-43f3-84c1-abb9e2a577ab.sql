DROP POLICY IF EXISTS "Public can view vistoria by token" ON public.vistorias;
DROP POLICY IF EXISTS "Public can update vistoria by token" ON public.vistorias;

CREATE POLICY "Public can view vistoria by matching token"
ON public.vistorias FOR SELECT TO anon, authenticated
USING (
  link_token IS NOT NULL
  AND link_expires_at > now()
  AND link_token::text = nullif(current_setting('request.headers', true)::json ->> 'x-vistoria-token', '')
);

CREATE POLICY "Public can update vistoria by matching token"
ON public.vistorias FOR UPDATE TO anon, authenticated
USING (
  link_token IS NOT NULL
  AND link_expires_at > now()
  AND link_token::text = nullif(current_setting('request.headers', true)::json ->> 'x-vistoria-token', '')
)
WITH CHECK (
  link_token IS NOT NULL
  AND link_expires_at > now()
  AND link_token::text = nullif(current_setting('request.headers', true)::json ->> 'x-vistoria-token', '')
);

DROP POLICY IF EXISTS "Users can upload vistoria photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own vistoria photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can update vistorias files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own vistoria uploads" ON storage.objects;

CREATE POLICY "Vistoria photos delete authenticated"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'vistorias');

CREATE POLICY "Vistoria photos update authenticated"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'vistorias')
WITH CHECK (bucket_id = 'vistorias');