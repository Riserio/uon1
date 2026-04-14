
-- Tabela de Centros de Custo
CREATE TABLE public.centros_custo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT '#6366f1',
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  corretora_id UUID REFERENCES public.corretoras(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage centros_custo"
ON public.centros_custo FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_centros_custo_updated_at
BEFORE UPDATE ON public.centros_custo
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar coluna na tabela de lançamentos
ALTER TABLE public.lancamentos_financeiros
ADD COLUMN centro_custo_id UUID REFERENCES public.centros_custo(id);

CREATE INDEX idx_lancamentos_centro_custo ON public.lancamentos_financeiros(centro_custo_id);
CREATE INDEX idx_centros_custo_corretora ON public.centros_custo(corretora_id);
