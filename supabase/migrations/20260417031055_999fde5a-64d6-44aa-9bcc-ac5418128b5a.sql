ALTER TABLE public.ausencias_funcionario
  ADD COLUMN IF NOT EXISTS arquivo_url text,
  ADD COLUMN IF NOT EXISTS arquivo_nome text;