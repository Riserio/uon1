-- Cron de hora em hora: os schedulers agora filtram pela hora configurada
-- (horarios_sync) por associação, então o cron só precisa "bater na porta" a
-- cada hora e cada scheduler decide se aquela hora está na lista. As checagens
-- fora do horário retornam rápido (baixo custo). Enriquecimento roda a :30.

DO $$ BEGIN PERFORM cron.unschedule('scheduler-base-hinova'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('scheduler-base-hinova','0 * * * *',$cron$
  SELECT net.http_post(url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/scheduler-base-hinova',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM'),
    body := '{}'::jsonb, timeout_milliseconds := 280000);
$cron$);
DO $$ BEGIN PERFORM cron.unschedule('scheduler-cobranca-hinova'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('scheduler-cobranca-hinova','0 * * * *',$cron$
  SELECT net.http_post(url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/scheduler-cobranca-hinova',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM'),
    body := '{}'::jsonb, timeout_milliseconds := 280000);
$cron$);
DO $$ BEGIN PERFORM cron.unschedule('scheduler-mgf-hinova'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('scheduler-mgf-hinova','0 * * * *',$cron$
  SELECT net.http_post(url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/scheduler-mgf-hinova',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM'),
    body := '{}'::jsonb, timeout_milliseconds := 280000);
$cron$);
DO $$ BEGIN PERFORM cron.unschedule('scheduler-sga-hinova'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('scheduler-sga-hinova','0 * * * *',$cron$
  SELECT net.http_post(url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/scheduler-sga-hinova',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM'),
    body := '{}'::jsonb, timeout_milliseconds := 280000);
$cron$);
DO $$ BEGIN PERFORM cron.unschedule('enriquecer-cobranca-worker'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('enriquecer-cobranca-worker','30 * * * *',$cron$ SELECT public.enriquecer_cobranca_worker(20000); $cron$);
DO $$ BEGIN PERFORM cron.unschedule('enqueue-recurrent-backfills'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('enqueue-recurrent-backfills','30 * * * *',$cron$ SELECT public.enqueue_recurrent_backfills(); $cron$);
