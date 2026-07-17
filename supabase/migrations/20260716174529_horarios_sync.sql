-- Horários de sincronização por associação (horas em Brasília). Permite
-- definir na tela "Sincronizar" quando a importação roda (ex.: 8 e 14).
-- Os schedulers passam a importar apenas nessas horas (o cron roda de hora em
-- hora e cada scheduler filtra pela hora configurada). Default: 08h e 14h.
ALTER TABLE public.hinova_credenciais
  ADD COLUMN IF NOT EXISTS horarios_sync int[] NOT NULL DEFAULT '{8,14}';

-- Backfill: quem já existe recebe 08h/14h.
UPDATE public.hinova_credenciais
SET horarios_sync = '{8,14}'
WHERE horarios_sync IS NULL OR array_length(horarios_sync, 1) IS NULL;
