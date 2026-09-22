-- Relatos de problema: somente o autor ou administração
DROP POLICY IF EXISTS "Authenticated users view all reports" ON public.bug_reports;

-- Anexos financeiros: upload apenas na própria pasta do usuário (ou administração)
DROP POLICY IF EXISTS "Auth users can upload financeiro anexos" ON storage.objects;
CREATE POLICY "Financeiro anexos scoped insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'financeiro-anexos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superintendente'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);