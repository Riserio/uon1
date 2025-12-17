-- Tabela para importações MGF
CREATE TABLE public.mgf_importacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_arquivo TEXT NOT NULL,
  total_registros INTEGER DEFAULT 0,
  colunas_detectadas JSONB,
  ativo BOOLEAN DEFAULT true,
  corretora_id UUID REFERENCES public.corretoras(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para eventos/dados MGF (estrutura flexível)
CREATE TABLE public.mgf_dados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  importacao_id UUID NOT NULL REFERENCES public.mgf_importacoes(id) ON DELETE CASCADE,
  -- Campos comuns que provavelmente existem
  data_evento DATE,
  data_cadastro DATE,
  tipo_evento TEXT,
  situacao TEXT,
  valor NUMERIC(15,2),
  custo NUMERIC(15,2),
  placa TEXT,
  modelo_veiculo TEXT,
  cooperativa TEXT,
  regional TEXT,
  classificacao TEXT,
  status TEXT,
  -- Dados extras em JSON para flexibilidade
  dados_extras JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_mgf_dados_importacao ON public.mgf_dados(importacao_id);
CREATE INDEX idx_mgf_dados_data_evento ON public.mgf_dados(data_evento);
CREATE INDEX idx_mgf_dados_cooperativa ON public.mgf_dados(cooperativa);
CREATE INDEX idx_mgf_importacoes_corretora ON public.mgf_importacoes(corretora_id);

-- Enable RLS
ALTER TABLE public.mgf_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mgf_dados ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para acesso autenticado
CREATE POLICY "Usuários autenticados podem ver importações MGF"
  ON public.mgf_importacoes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir importações MGF"
  ON public.mgf_importacoes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar importações MGF"
  ON public.mgf_importacoes FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem deletar importações MGF"
  ON public.mgf_importacoes FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem ver dados MGF"
  ON public.mgf_dados FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir dados MGF"
  ON public.mgf_dados FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem deletar dados MGF"
  ON public.mgf_dados FOR DELETE
  TO authenticated
  USING (true);