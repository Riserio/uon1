-- Adicionar colunas faltantes na tabela sga_eventos
ALTER TABLE public.sga_eventos
ADD COLUMN IF NOT EXISTS categoria_veiculo TEXT,
ADD COLUMN IF NOT EXISTS protocolo TEXT,
ADD COLUMN IF NOT EXISTS evento_logradouro TEXT,
ADD COLUMN IF NOT EXISTS tipo_veiculo_terceiro TEXT;