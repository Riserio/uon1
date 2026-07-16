-- Sincronização unificada: os 4 imports (base, cobrança, MGF, eventos) rodam
-- às 08h e às 14h de Brasília (11h/17h UTC). Todos respeitam agora o
-- api_intervalo_horas (unificado no código dos schedulers). enriquecer/enqueue
-- rodam logo após (08:30/14:30). VALECAR fica com intervalo de 5h para que os
-- dois horários (08h e 14h, gap 6h) de fato reimportem.

-- imports 08h/14h (0 11,17 UTC)
DO $$ BEGIN PERFORM cron.unschedule('scheduler-base-hinova'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('scheduler-base-hinova','0 11,17 * * *',$cron$
  SELECT net.http_post(
    url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/scheduler-base-hinova',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM'),
    body := '{}'::jsonb, timeout_milliseconds := 280000);
$cron$);
DO $$ BEGIN PERFORM cron.unschedule('scheduler-cobranca-hinova'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('scheduler-cobranca-hinova','0 11,17 * * *',$cron$
  SELECT net.http_post(
    url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/scheduler-cobranca-hinova',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM'),
    body := '{}'::jsonb, timeout_milliseconds := 280000);
$cron$);
DO $$ BEGIN PERFORM cron.unschedule('scheduler-mgf-hinova'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('scheduler-mgf-hinova','0 11,17 * * *',$cron$
  SELECT net.http_post(
    url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/scheduler-mgf-hinova',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM'),
    body := '{}'::jsonb, timeout_milliseconds := 280000);
$cron$);
DO $$ BEGIN PERFORM cron.unschedule('scheduler-sga-hinova'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('scheduler-sga-hinova','0 11,17 * * *',$cron$
  SELECT net.http_post(
    url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/scheduler-sga-hinova',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM'),
    body := '{}'::jsonb, timeout_milliseconds := 280000);
$cron$);
-- workers de enriquecimento logo após (08:30/14:30)
DO $$ BEGIN PERFORM cron.unschedule('enriquecer-cobranca-worker'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('enriquecer-cobranca-worker','30 11,17 * * *',$cron$ SELECT public.enriquecer_cobranca_worker(20000); $cron$);
DO $$ BEGIN PERFORM cron.unschedule('enqueue-recurrent-backfills'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('enqueue-recurrent-backfills','30 11,17 * * *',$cron$ SELECT public.enqueue_recurrent_backfills(); $cron$);
-- VALECAR: intervalo 5h (2x/dia nos horários 08h e 14h)
UPDATE public.hinova_credenciais hc
SET api_intervalo_horas = 5
FROM public.corretoras c
WHERE hc.corretora_id = c.id AND c.nome ILIKE 'valecar';
