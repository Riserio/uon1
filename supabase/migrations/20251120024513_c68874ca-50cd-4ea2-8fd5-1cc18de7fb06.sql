-- Adicionar campos de horário e validade nas vistorias
ALTER TABLE public.vistorias
ADD COLUMN IF NOT EXISTS horario_inicio TIME,
ADD COLUMN IF NOT EXISTS horario_fim TIME,
ADD COLUMN IF NOT EXISTS dias_validade INTEGER DEFAULT 2;

-- Adicionar campo de CNH URL
ALTER TABLE public.vistorias
ADD COLUMN IF NOT EXISTS cnh_url TEXT,
ADD COLUMN IF NOT EXISTS cnh_dados JSONB;