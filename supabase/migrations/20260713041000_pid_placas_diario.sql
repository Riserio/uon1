-- Snapshot DIÁRIO da frota protegida (placas ativas) e inadimplentes, para o
-- gráfico "Evolução da Frota Protegida" no modo Dia. Alimentado pela agregação
-- (agregar-estudo-base), que roda na importação diária da base.
CREATE TABLE IF NOT EXISTS public.pid_placas_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora_id uuid NOT NULL,
  data date NOT NULL,
  placas_ativas int NOT NULL DEFAULT 0,
  inadimplentes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corretora_id, data)
);
CREATE INDEX IF NOT EXISTS idx_pid_placas_diario_corretora_data
  ON public.pid_placas_diario (corretora_id, data);

ALTER TABLE public.pid_placas_diario ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pid_placas_diario' AND policyname='pid_placas_diario_select') THEN
    CREATE POLICY pid_placas_diario_select ON public.pid_placas_diario FOR SELECT USING (true);
  END IF;
END $$;
