-- Re-agenda cron jobs de MGF e SGA (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('scheduler-mgf-hinova');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'scheduler-mgf-hinova',
  '*/30 * * * *',
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

DO $$
BEGIN
  PERFORM cron.unschedule('scheduler-sga-hinova');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'scheduler-sga-hinova',
  '*/30 * * * *',
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

-- Corrigir RLS em backfill_pid_fat_progress
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backfill_pid_fat_progress TO authenticated;
GRANT ALL ON public.backfill_pid_fat_progress TO service_role;

ALTER TABLE public.backfill_pid_fat_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Admin e superintendente gerenciam todo progresso"
  ON public.backfill_pid_fat_progress
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superintendente'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superintendente'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Usuarios veem progresso da sua corretora"
  ON public.backfill_pid_fat_progress
  FOR SELECT
  TO authenticated
  USING (corretora_id = get_user_corretora_id(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Usuarios inserem progresso da sua corretora"
  ON public.backfill_pid_fat_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (corretora_id = get_user_corretora_id(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Usuarios atualizam progresso da sua corretora"
  ON public.backfill_pid_fat_progress
  FOR UPDATE
  TO authenticated
  USING (corretora_id = get_user_corretora_id(auth.uid()))
  WITH CHECK (corretora_id = get_user_corretora_id(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Usuarios deletam progresso da sua corretora"
  ON public.backfill_pid_fat_progress
  FOR DELETE
  TO authenticated
  USING (corretora_id = get_user_corretora_id(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Corrigir politica ampla de leitura em contratos
DO $$
BEGIN
  CREATE POLICY "Usuarios veem contratos da sua corretora"
  ON public.contratos
  FOR SELECT
  TO authenticated
  USING (corretora_id = get_user_corretora_id(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Authenticated users can view contratos" ON public.contratos;