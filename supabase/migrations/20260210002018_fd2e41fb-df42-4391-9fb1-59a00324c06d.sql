
-- Tabela de importações do Estudo de Base
CREATE TABLE public.estudo_base_importacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID REFERENCES public.corretoras(id),
  nome_arquivo TEXT NOT NULL,
  total_registros INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.estudo_base_importacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view estudo_base_importacoes" ON public.estudo_base_importacoes FOR SELECT USING (true);
CREATE POLICY "Users can insert estudo_base_importacoes" ON public.estudo_base_importacoes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update estudo_base_importacoes" ON public.estudo_base_importacoes FOR UPDATE USING (true);
CREATE POLICY "Users can delete estudo_base_importacoes" ON public.estudo_base_importacoes FOR DELETE USING (true);

-- Tabela de registros do Estudo de Base
CREATE TABLE public.estudo_base_registros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  importacao_id UUID NOT NULL REFERENCES public.estudo_base_importacoes(id) ON DELETE CASCADE,
  placa TEXT,
  tipo_veiculo TEXT,
  montadora TEXT,
  ano_fabricacao INTEGER,
  cota TEXT,
  combustivel TEXT,
  valor_protegido NUMERIC DEFAULT 0,
  cooperativa TEXT,
  num_passageiros INTEGER DEFAULT 0,
  situacao_veiculo TEXT,
  logradouro TEXT,
  cidade_veiculo TEXT,
  data_contrato DATE,
  motivo_evento TEXT,
  pontos NUMERIC DEFAULT 0,
  modelo TEXT,
  ano_modelo INTEGER,
  categoria TEXT,
  cor TEXT,
  valor_fipe NUMERIC DEFAULT 0,
  voluntario TEXT,
  alienacao TEXT,
  bairro TEXT,
  estado TEXT,
  qtde_evento INTEGER DEFAULT 0,
  data_ultimo_evento DATE,
  spa TEXT,
  garagem TEXT,
  alerta_usuario TEXT,
  boleto_fisico TEXT,
  sexo TEXT,
  idade_associado INTEGER,
  profissao TEXT,
  estado_civil TEXT,
  vencimento INTEGER,
  situacao_spc TEXT,
  regional TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.estudo_base_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view estudo_base_registros" ON public.estudo_base_registros FOR SELECT USING (true);
CREATE POLICY "Users can insert estudo_base_registros" ON public.estudo_base_registros FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete estudo_base_registros" ON public.estudo_base_registros FOR DELETE USING (true);

-- Index para performance
CREATE INDEX idx_estudo_base_registros_importacao ON public.estudo_base_registros(importacao_id);
CREATE INDEX idx_estudo_base_importacoes_corretora ON public.estudo_base_importacoes(corretora_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.estudo_base_importacoes;
