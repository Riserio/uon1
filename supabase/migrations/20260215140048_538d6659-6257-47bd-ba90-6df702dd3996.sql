
-- Create fluxos table for Gestão Associação (per corretora)
CREATE TABLE public.gestao_associacao_fluxos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT NOT NULL DEFAULT '#3b82f6',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add fluxo_id to status config
ALTER TABLE public.gestao_associacao_status_config
  ADD COLUMN fluxo_id UUID REFERENCES public.gestao_associacao_fluxos(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.gestao_associacao_fluxos ENABLE ROW LEVEL SECURITY;

-- RLS policies for fluxos
CREATE POLICY "Authenticated users can view gestao_associacao_fluxos"
  ON public.gestao_associacao_fluxos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert gestao_associacao_fluxos"
  ON public.gestao_associacao_fluxos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update gestao_associacao_fluxos"
  ON public.gestao_associacao_fluxos FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete gestao_associacao_fluxos"
  ON public.gestao_associacao_fluxos FOR DELETE
  TO authenticated
  USING (true);

-- Updated_at trigger
CREATE TRIGGER update_gestao_associacao_fluxos_updated_at
  BEFORE UPDATE ON public.gestao_associacao_fluxos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
