-- Create notas_fiscais table for manual invoice management
CREATE TABLE public.notas_fiscais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero TEXT NOT NULL,
  serie TEXT DEFAULT '1',
  tipo TEXT NOT NULL DEFAULT 'servico', -- servico, produto
  natureza_operacao TEXT DEFAULT 'Prestação de Serviços',
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_competencia DATE,
  
  -- Prestador (sua empresa)
  prestador_cnpj TEXT,
  prestador_razao_social TEXT,
  prestador_nome_fantasia TEXT,
  prestador_endereco TEXT,
  prestador_cidade TEXT DEFAULT 'Belo Horizonte',
  prestador_uf TEXT DEFAULT 'MG',
  prestador_cep TEXT,
  prestador_inscricao_municipal TEXT,
  
  -- Tomador (cliente)
  tomador_cpf_cnpj TEXT,
  tomador_razao_social TEXT,
  tomador_nome_fantasia TEXT,
  tomador_email TEXT,
  tomador_telefone TEXT,
  tomador_endereco TEXT,
  tomador_cidade TEXT,
  tomador_uf TEXT,
  tomador_cep TEXT,
  
  -- Valores
  valor_servicos NUMERIC NOT NULL DEFAULT 0,
  valor_deducoes NUMERIC DEFAULT 0,
  valor_pis NUMERIC DEFAULT 0,
  valor_cofins NUMERIC DEFAULT 0,
  valor_inss NUMERIC DEFAULT 0,
  valor_ir NUMERIC DEFAULT 0,
  valor_csll NUMERIC DEFAULT 0,
  valor_iss NUMERIC DEFAULT 0,
  aliquota_iss NUMERIC DEFAULT 5,
  valor_liquido NUMERIC NOT NULL DEFAULT 0,
  
  -- Serviço
  codigo_servico TEXT,
  discriminacao TEXT,
  
  -- Status e controle
  status TEXT NOT NULL DEFAULT 'emitida', -- rascunho, emitida, cancelada, enviada_prefeitura
  codigo_verificacao TEXT,
  link_xml TEXT,
  link_pdf TEXT,
  arquivo_url TEXT,
  
  -- Integração futura
  protocolo_prefeitura TEXT,
  numero_rps TEXT,
  lote_rps TEXT,
  
  -- Associação
  corretora_id UUID REFERENCES public.corretoras(id),
  lancamento_id UUID REFERENCES public.lancamentos_financeiros(id),
  
  -- Auditoria
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cancelada_em TIMESTAMP WITH TIME ZONE,
  cancelada_por UUID,
  motivo_cancelamento TEXT
);

-- Enable RLS
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view notas_fiscais"
  ON public.notas_fiscais FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert notas_fiscais"
  ON public.notas_fiscais FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own notas_fiscais"
  ON public.notas_fiscais FOR UPDATE
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Superintendente can delete notas_fiscais"
  ON public.notas_fiscais FOR DELETE
  USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Index for performance
CREATE INDEX idx_notas_fiscais_corretora ON public.notas_fiscais(corretora_id);
CREATE INDEX idx_notas_fiscais_data_emissao ON public.notas_fiscais(data_emissao);
CREATE INDEX idx_notas_fiscais_status ON public.notas_fiscais(status);

-- Trigger for updated_at
CREATE TRIGGER update_notas_fiscais_updated_at
  BEFORE UPDATE ON public.notas_fiscais
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();