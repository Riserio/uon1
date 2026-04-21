-- Ampliar constraint de status da vistoria
ALTER TABLE public.vistorias DROP CONSTRAINT IF EXISTS vistorias_status_check;
ALTER TABLE public.vistorias ADD CONSTRAINT vistorias_status_check 
CHECK (status = ANY (ARRAY[
  'rascunho'::text,
  'aguardando_fotos'::text,
  'aguardando_assinatura'::text,
  'pendente_novas_fotos'::text,
  'em_analise'::text,
  'aprovada'::text,
  'pendente_correcao'::text,
  'concluida'::text,
  'cancelada'::text,
  'pendente'::text,
  'em_andamento'::text,
  'reprovada'::text
]));

-- Coluna de anexos em lançamentos
ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS anexos jsonb DEFAULT '[]'::jsonb;

-- Bucket privado para anexos financeiros
INSERT INTO storage.buckets (id, name, public)
VALUES ('financeiro-anexos', 'financeiro-anexos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Auth users can view financeiro anexos" ON storage.objects;
CREATE POLICY "Auth users can view financeiro anexos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'financeiro-anexos');

DROP POLICY IF EXISTS "Auth users can upload financeiro anexos" ON storage.objects;
CREATE POLICY "Auth users can upload financeiro anexos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'financeiro-anexos');

DROP POLICY IF EXISTS "Auth users can delete financeiro anexos" ON storage.objects;
CREATE POLICY "Auth users can delete financeiro anexos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'financeiro-anexos');