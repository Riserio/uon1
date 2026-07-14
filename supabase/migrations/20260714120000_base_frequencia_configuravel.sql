-- Frequência configurável do sync da BASE (Cadastro + Estudo de Base) via SGA.
-- Antes: cron fixo 1x/dia (12:10 UTC). Agora: cada corretora define de quantas
-- em quantas horas quer atualizar (api_intervalo_horas: 1, 6, 12, 24...). O cron
-- roda a cada 15 min e a função scheduler-base-hinova decide quem está "vencido".

-- 1) coluna de configuração (default 24h = 1x/dia)
ALTER TABLE public.hinova_credenciais
  ADD COLUMN IF NOT EXISTS api_intervalo_horas integer NOT NULL DEFAULT 24;

COMMENT ON COLUMN public.hinova_credenciais.api_intervalo_horas IS
  'Intervalo (horas) entre atualizações da base via API SGA/Hinova. Ex.: 1, 6, 12, 24.';

-- 2) reprograma o cron do scheduler-base-hinova para rodar a cada 15 min
DO $$
BEGIN
  PERFORM cron.unschedule('scheduler-base-hinova');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'scheduler-base-hinova',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/scheduler-base-hinova',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', current_setting('app.settings.anon_key', true),
      'Authorization', 'Bearer ' || current_setting('app.settings.anon_key', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
  $cron$
);

-- NOTA: substitua current_setting(...) pela anon key do projeto se o app.settings
-- nao estiver configurado (mesmo valor usado na migration 20260713011000).
