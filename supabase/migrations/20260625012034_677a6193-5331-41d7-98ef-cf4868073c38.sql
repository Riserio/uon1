
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS arquivo_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_pdf_nome TEXT,
  ADD COLUMN IF NOT EXISTS campos_assinatura JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.contrato_assinaturas
  ADD COLUMN IF NOT EXISTS posicoes JSONB;

-- Storage policies for contratos-pdfs bucket
CREATE POLICY "Authenticated can upload contract pdfs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contratos-pdfs');

CREATE POLICY "Authenticated can read contract pdfs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contratos-pdfs');

CREATE POLICY "Anon can read contract pdfs for signing"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'contratos-pdfs');

CREATE POLICY "Authenticated can update contract pdfs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contratos-pdfs');

CREATE POLICY "Authenticated can delete contract pdfs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contratos-pdfs');
