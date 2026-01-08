-- Tabela para importações de cobrança
CREATE TABLE public.cobranca_importacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_arquivo TEXT NOT NULL,
  total_registros INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  corretora_id UUID REFERENCES public.corretoras(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para dados de boletos de cobrança
CREATE TABLE public.cobranca_boletos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  importacao_id UUID NOT NULL REFERENCES public.cobranca_importacoes(id) ON DELETE CASCADE,
  
  -- Campos do relatório de boletos
  data_pagamento DATE,
  data_vencimento_original DATE,
  dia_vencimento_veiculo INTEGER,
  regional_boleto TEXT,
  cooperativa TEXT,
  voluntario TEXT,
  nome TEXT,
  placas TEXT,
  valor NUMERIC(15,2),
  data_vencimento DATE,
  qtde_dias_atraso_vencimento_original INTEGER,
  situacao TEXT,
  
  -- Campos extras para cálculos
  dados_extras JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_cobranca_boletos_importacao ON public.cobranca_boletos(importacao_id);
CREATE INDEX idx_cobranca_boletos_situacao ON public.cobranca_boletos(situacao);
CREATE INDEX idx_cobranca_boletos_data_vencimento ON public.cobranca_boletos(data_vencimento_original);
CREATE INDEX idx_cobranca_boletos_regional ON public.cobranca_boletos(regional_boleto);
CREATE INDEX idx_cobranca_boletos_cooperativa ON public.cobranca_boletos(cooperativa);
CREATE INDEX idx_cobranca_importacoes_corretora ON public.cobranca_importacoes(corretora_id);

-- Enable RLS
ALTER TABLE public.cobranca_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobranca_boletos ENABLE ROW LEVEL SECURITY;

-- Políticas para cobranca_importacoes
CREATE POLICY "Authenticated users can view cobranca_importacoes" 
ON public.cobranca_importacoes 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert cobranca_importacoes" 
ON public.cobranca_importacoes 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update cobranca_importacoes" 
ON public.cobranca_importacoes 
FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete cobranca_importacoes" 
ON public.cobranca_importacoes 
FOR DELETE 
USING (auth.role() = 'authenticated');

-- Políticas para cobranca_boletos
CREATE POLICY "Authenticated users can view cobranca_boletos" 
ON public.cobranca_boletos 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert cobranca_boletos" 
ON public.cobranca_boletos 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update cobranca_boletos" 
ON public.cobranca_boletos 
FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete cobranca_boletos" 
ON public.cobranca_boletos 
FOR DELETE 
USING (auth.role() = 'authenticated');

-- Trigger para updated_at
CREATE TRIGGER update_cobranca_importacoes_updated_at
BEFORE UPDATE ON public.cobranca_importacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();