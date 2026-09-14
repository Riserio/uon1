-- contratos-pdfs: escopo por corretora do contrato
DROP POLICY IF EXISTS "Anon can read contract pdfs for signing" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read contract pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update contract pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete contract pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload contract pdfs" ON storage.objects;

CREATE POLICY "Contract pdfs scoped read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contratos-pdfs' AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente')
    OR EXISTS (
      SELECT 1 FROM public.contratos c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
        AND c.corretora_id = public.get_user_corretora_id(auth.uid())
    )
  )
);

CREATE POLICY "Contract pdfs scoped write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'contratos-pdfs' AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente')
    OR EXISTS (
      SELECT 1 FROM public.contratos c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
        AND c.corretora_id = public.get_user_corretora_id(auth.uid())
    )
  )
);

CREATE POLICY "Contract pdfs scoped update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'contratos-pdfs' AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente')
    OR EXISTS (
      SELECT 1 FROM public.contratos c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
        AND c.corretora_id = public.get_user_corretora_id(auth.uid())
    )
  )
);

CREATE POLICY "Contract pdfs scoped delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'contratos-pdfs' AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente')
    OR EXISTS (
      SELECT 1 FROM public.contratos c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
        AND c.corretora_id = public.get_user_corretora_id(auth.uid())
    )
  )
);

-- documentos: somente logos públicas seguem abertas; o resto exige login
DROP POLICY IF EXISTS "Anyone can view documentos" ON storage.objects;

CREATE POLICY "Public can view template logos" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'documentos' AND (storage.foldername(storage.objects.name))[1] = 'template-logos');

CREATE POLICY "Authenticated can view documentos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documentos');

-- financeiro-anexos: apenas anexos de lançamentos da própria corretora
DROP POLICY IF EXISTS "Auth users can view financeiro anexos" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete financeiro anexos" ON storage.objects;

CREATE POLICY "Financeiro anexos scoped read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'financeiro-anexos' AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente')
    OR EXISTS (
      SELECT 1 FROM public.lancamentos_financeiros l
      WHERE l.corretora_id = public.get_user_corretora_id(auth.uid())
        AND l.anexos::text LIKE '%' || storage.objects.name || '%'
    )
  )
);

CREATE POLICY "Financeiro anexos scoped delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'financeiro-anexos' AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superintendente')
    OR EXISTS (
      SELECT 1 FROM public.lancamentos_financeiros l
      WHERE l.corretora_id = public.get_user_corretora_id(auth.uid())
        AND l.anexos::text LIKE '%' || storage.objects.name || '%'
    )
  )
);
