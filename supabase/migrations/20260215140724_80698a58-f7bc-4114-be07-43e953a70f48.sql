
-- Add missing fields for event detail cards
ALTER TABLE public.sga_eventos ADD COLUMN IF NOT EXISTS analista_responsavel TEXT;
ALTER TABLE public.sga_eventos ADD COLUMN IF NOT EXISTS ultima_descricao_interna TEXT;
ALTER TABLE public.sga_eventos ADD COLUMN IF NOT EXISTS data_ultima_descricao_interna DATE;
ALTER TABLE public.sga_eventos ADD COLUMN IF NOT EXISTS numero_bo TEXT;
ALTER TABLE public.sga_eventos ADD COLUMN IF NOT EXISTS ultima_descricao_bo TEXT;
