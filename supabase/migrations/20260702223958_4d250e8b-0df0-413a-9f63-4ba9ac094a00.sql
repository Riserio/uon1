ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS previsao_entrega date,
  ADD COLUMN IF NOT EXISTS arquivado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolvido_em timestamptz;