-- Adicionar campo para marcar cards que regrediram no fluxo/status
ALTER TABLE public.atendimentos 
ADD COLUMN IF NOT EXISTS regressou BOOLEAN DEFAULT FALSE;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.atendimentos.regressou IS 'Indica se o card voltou para trás no fluxo ou status, necessitando atenção especial';