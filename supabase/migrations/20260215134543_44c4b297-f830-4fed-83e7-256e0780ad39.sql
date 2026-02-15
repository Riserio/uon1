
-- Add corretora_id to allow per-association status config
ALTER TABLE public.gestao_associacao_status_config
  ADD COLUMN corretora_id UUID REFERENCES public.corretoras(id) ON DELETE CASCADE;

-- Drop the unique constraint on nome (now unique per corretora)
ALTER TABLE public.gestao_associacao_status_config
  DROP CONSTRAINT IF EXISTS gestao_associacao_status_config_nome_key;

-- Add unique constraint per corretora
ALTER TABLE public.gestao_associacao_status_config
  ADD CONSTRAINT gestao_associacao_status_config_corretora_nome_key UNIQUE (corretora_id, nome);

-- Create index for faster lookups
CREATE INDEX idx_gestao_assoc_status_corretora ON public.gestao_associacao_status_config(corretora_id);
