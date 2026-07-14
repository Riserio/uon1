ALTER TABLE public.hinova_credenciais
  ADD COLUMN IF NOT EXISTS api_intervalo_horas integer NOT NULL DEFAULT 24;

COMMENT ON COLUMN public.hinova_credenciais.api_intervalo_horas IS
  'Intervalo em horas entre atualizacoes automaticas da base via API SGA/Hinova (1, 3, 6, 12 ou 24).';