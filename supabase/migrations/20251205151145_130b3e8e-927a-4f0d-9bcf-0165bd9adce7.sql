-- Adiciona coluna evento_cidade na tabela sga_eventos
ALTER TABLE public.sga_eventos ADD COLUMN IF NOT EXISTS evento_cidade text;