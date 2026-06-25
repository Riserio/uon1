
CREATE TABLE public.contrato_signatarios_salvos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID REFERENCES public.corretoras(id) ON DELETE CASCADE,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  papel TEXT,
  tipo_pessoa TEXT NOT NULL DEFAULT 'pf' CHECK (tipo_pessoa IN ('pf','pj')),
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  documento TEXT,
  endereco TEXT,
  representante_legal TEXT,
  observacoes TEXT,
  ultimo_uso_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signatarios_salvos_corretora ON public.contrato_signatarios_salvos(corretora_id);
CREATE INDEX idx_signatarios_salvos_nome ON public.contrato_signatarios_salvos(nome);
CREATE INDEX idx_signatarios_salvos_email ON public.contrato_signatarios_salvos(email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrato_signatarios_salvos TO authenticated;
GRANT ALL ON public.contrato_signatarios_salvos TO service_role;

ALTER TABLE public.contrato_signatarios_salvos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view signatarios salvos"
  ON public.contrato_signatarios_salvos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert signatarios salvos"
  ON public.contrato_signatarios_salvos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update signatarios salvos"
  ON public.contrato_signatarios_salvos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete signatarios salvos"
  ON public.contrato_signatarios_salvos
  FOR DELETE
  TO authenticated
  USING (true);

CREATE TRIGGER update_signatarios_salvos_updated_at
  BEFORE UPDATE ON public.contrato_signatarios_salvos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
