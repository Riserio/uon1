-- Reprograma o cron 'scheduler-base-hinova' para rodar a cada 15 minutos, de modo
-- que a funcao respeite o api_intervalo_horas de cada corretora (1h/3h/6h/12h/24h).
-- Antes o job disparava so 1x/dia (12:10 UTC, migration 20260713011000) e as
-- frequencias menores que 24h nao tinham efeito. Rodar a cada 15 min tambem da
-- retry automatico se um slot for perdido.
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
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
  $cron$
);
