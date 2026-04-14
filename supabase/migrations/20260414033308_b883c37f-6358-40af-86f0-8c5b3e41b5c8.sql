
-- Importações de Cadastro
CREATE TABLE public.cadastro_importacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID REFERENCES public.corretoras(id),
  nome_arquivo TEXT NOT NULL,
  total_registros INT DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cadastro_importacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage cadastro_importacoes"
ON public.cadastro_importacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Registros de Cadastro
CREATE TABLE public.cadastro_registros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  importacao_id UUID NOT NULL REFERENCES public.cadastro_importacoes(id) ON DELETE CASCADE,
  nome TEXT,
  cpf TEXT,
  placa TEXT,
  modelo_veiculo TEXT,
  marca_veiculo TEXT,
  ano_veiculo TEXT,
  situacao TEXT,
  regional TEXT,
  cooperativa TEXT,
  data_cadastro TEXT,
  data_adesao TEXT,
  valor_protegido NUMERIC DEFAULT 0,
  cidade TEXT,
  estado TEXT,
  dados_extras JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cadastro_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage cadastro_registros"
ON public.cadastro_registros FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_cadastro_registros_importacao ON public.cadastro_registros(importacao_id);
CREATE INDEX idx_cadastro_importacoes_corretora ON public.cadastro_importacoes(corretora_id);
CREATE INDEX idx_cadastro_registros_situacao ON public.cadastro_registros(situacao);
CREATE INDEX idx_cadastro_registros_placa ON public.cadastro_registros(placa);
