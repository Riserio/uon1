-- Adiciona coluna para horário agendado configurável (padrão 09:00)
ALTER TABLE public.cobranca_automacao_config
ADD COLUMN IF NOT EXISTS hora_agendada TIME DEFAULT '09:00:00';