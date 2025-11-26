-- Adicionar campos FIPE e tipo de veículo na tabela vistorias
ALTER TABLE vistorias 
ADD COLUMN IF NOT EXISTS veiculo_tipo TEXT,
ADD COLUMN IF NOT EXISTS veiculo_valor_fipe NUMERIC,
ADD COLUMN IF NOT EXISTS veiculo_fipe_data_consulta TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS veiculo_fipe_codigo TEXT;

COMMENT ON COLUMN vistorias.veiculo_tipo IS 'Tipo do veículo: carros, motos ou caminhoes';
COMMENT ON COLUMN vistorias.veiculo_valor_fipe IS 'Valor FIPE consultado do veículo';
COMMENT ON COLUMN vistorias.veiculo_fipe_data_consulta IS 'Data e hora da consulta FIPE';
COMMENT ON COLUMN vistorias.veiculo_fipe_codigo IS 'Código FIPE do veículo';

-- Adicionar campo tipo de veículo na tabela atendimentos também para consistência
ALTER TABLE atendimentos
ADD COLUMN IF NOT EXISTS veiculo_tipo TEXT;

COMMENT ON COLUMN atendimentos.veiculo_tipo IS 'Tipo do veículo: carros, motos ou caminhoes';