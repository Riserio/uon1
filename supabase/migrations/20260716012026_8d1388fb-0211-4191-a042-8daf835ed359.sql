-- Otimização de custo de nuvem: concentra os crons num horário comercial e
-- reduz a frequência. Antes: enriquecer (1/min), base (15min), enqueue (5min),
-- MGF/SGA (30min) rodavam 24h/dia. Agora: TODOS rodam a cada 2h, das 08h às
-- 18h de Brasília, ou seja 6x/dia.
--
-- ATENÇÃO: pg_cron roda em UTC. 08h–18h Brasília (UTC-3) = 11h–21h UTC.
-- Cron '0 11,13,15,17,19,21 * * *' => 08,10,12,14,16,18 Brasília.
--
-- backfill-pid-faturamento não entra: ele se auto-desliga ao concluir.

-- === enriquecer-cobranca-worker (era */1) ===
DO $$ BEGIN PERFORM cron.unschedule('enriquecer-cobranca-worker'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('enriquecer-cobranca-worker', '0 11,13,15,17,19,21 * * *', $cron$ SELECT public.enriquecer_cobranca_worker(20000); $cron$);

-- === enqueue-recurrent-backfills (era */5) ===
DO $$ BEGIN PERFORM cron.unschedule('enqueue-recurrent-backfills'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('enqueue-recurrent-backfills', '0 11,13,15,17,19,21 * * *', $cron$ SELECT public.enqueue_recurrent_backfills(); $cron$);

-- === scheduler-base-hinova / placas (era */15) ===
DO $$ BEGIN PERFORM cron.unschedule('scheduler-base-hinova'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'scheduler-base-hinova',
  '0 11,13,15,17,19,21 * * *',
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

-- === scheduler-mgf-hinova (era */30) ===
DO $$ BEGIN PERFORM cron.unschedule('scheduler-mgf-hinova'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'scheduler-mgf-hinova',
  '0 11,13,15,17,19,21 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/scheduler-mgf-hinova',
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

-- === scheduler-sga-hinova (era */30) ===
DO $$ BEGIN PERFORM cron.unschedule('scheduler-sga-hinova'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'scheduler-sga-hinova',
  '0 11,13,15,17,19,21 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/scheduler-sga-hinova',
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