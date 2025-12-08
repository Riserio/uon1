-- Adicionar coluna logo_url na tabela contrato_templates
ALTER TABLE public.contrato_templates ADD COLUMN IF NOT EXISTS logo_url TEXT;