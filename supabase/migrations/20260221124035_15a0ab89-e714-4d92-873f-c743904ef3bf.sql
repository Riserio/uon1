-- Add dias_agendados column to hinova_credenciais
-- Array of integers 0-6 (0=Domingo, 1=Segunda, ..., 6=Sábado)
-- NULL or empty means every day (backwards compatible)
ALTER TABLE public.hinova_credenciais 
ADD COLUMN IF NOT EXISTS dias_agendados integer[] DEFAULT NULL;

COMMENT ON COLUMN public.hinova_credenciais.dias_agendados IS 'Dias da semana para execução automática (0=Dom, 1=Seg, ..., 6=Sáb). NULL = todos os dias.';