DROP POLICY IF EXISTS "Authenticated users can view ponto documents" ON storage.objects;

CREATE POLICY "Ponto documents scoped select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ponto-documentos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superintendente'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.funcionarios f
      WHERE f.id::text = (storage.foldername(objects.name))[1]
        AND (
          f.profile_id = auth.uid()
          OR (
            public.has_role(auth.uid(), 'administrativo'::app_role)
            AND f.corretora_id IS NOT DISTINCT FROM public.get_user_corretora_id(auth.uid())
          )
        )
    )
  )
);