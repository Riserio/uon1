
-- Tabela para armazenar os dados importados do SGA
CREATE TABLE public.sga_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  importacao_id uuid NOT NULL,
  evento_estado text,
  data_cadastro_item date,
  data_evento date,
  motivo_evento text,
  tipo_evento text,
  situacao_evento text,
  modelo_veiculo text,
  modelo_veiculo_terceiro text,
  placa text,
  placa_terceiro text,
  data_ultima_alteracao_situacao date,
  valor_reparo numeric DEFAULT 0,
  data_conclusao date,
  custo_evento numeric DEFAULT 0,
  data_alteracao date,
  data_previsao_entrega date,
  solicitou_carro_reserva text,
  envolvimento_terceiro text,
  passivel_ressarcimento text,
  valor_mao_de_obra numeric DEFAULT 0,
  classificacao text,
  participacao numeric DEFAULT 0,
  envolvimento text,
  previsao_valor_reparo numeric DEFAULT 0,
  usuario_alteracao text,
  data_cadastro_evento date,
  cooperativa text,
  valor_protegido_veiculo numeric DEFAULT 0,
  situacao_analise_evento text,
  regional text,
  ano_fabricacao integer,
  voluntario text,
  regional_veiculo text,
  associado_estado text,
  created_at timestamp with time zone DEFAULT now()
);

-- Tabela para histórico de importações
CREATE TABLE public.sga_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_arquivo text NOT NULL,
  total_registros integer DEFAULT 0,
  corretora_id uuid REFERENCES public.corretoras(id),
  importado_por uuid,
  created_at timestamp with time zone DEFAULT now(),
  ativo boolean DEFAULT true
);

-- Índices para performance
CREATE INDEX idx_sga_eventos_importacao ON public.sga_eventos(importacao_id);
CREATE INDEX idx_sga_eventos_estado ON public.sga_eventos(evento_estado);
CREATE INDEX idx_sga_eventos_regional ON public.sga_eventos(regional);
CREATE INDEX idx_sga_eventos_motivo ON public.sga_eventos(motivo_evento);
CREATE INDEX idx_sga_eventos_situacao ON public.sga_eventos(situacao_evento);
CREATE INDEX idx_sga_eventos_data ON public.sga_eventos(data_evento);
CREATE INDEX idx_sga_importacoes_corretora ON public.sga_importacoes(corretora_id);

-- Foreign key para eventos
ALTER TABLE public.sga_eventos 
ADD CONSTRAINT sga_eventos_importacao_id_fkey 
FOREIGN KEY (importacao_id) REFERENCES public.sga_importacoes(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.sga_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sga_importacoes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - todos usuários autenticados podem ver e gerenciar
CREATE POLICY "Authenticated users can view sga_eventos"
ON public.sga_eventos FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert sga_eventos"
ON public.sga_eventos FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete sga_eventos"
ON public.sga_eventos FOR DELETE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view sga_importacoes"
ON public.sga_importacoes FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert sga_importacoes"
ON public.sga_importacoes FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update sga_importacoes"
ON public.sga_importacoes FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete sga_importacoes"
ON public.sga_importacoes FOR DELETE
USING (auth.uid() IS NOT NULL);
