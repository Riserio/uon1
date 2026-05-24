CREATE TABLE IF NOT EXISTS public.whatsapp_template_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora_id uuid NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  name text NOT NULL,
  template_name text NOT NULL,
  template_language text NOT NULL DEFAULT 'pt_BR',
  data_source text NOT NULL CHECK (data_source IN ('resumo_eventos','resumo_cobranca','resumo_mgf')),
  variable_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipients text[] NOT NULL DEFAULT ARRAY[]::text[],
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  day_of_week smallint,
  day_of_month smallint,
  send_time time NOT NULL DEFAULT '08:00',
  ativo boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  next_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wts_corretora ON public.whatsapp_template_schedules(corretora_id);
CREATE INDEX IF NOT EXISTS idx_wts_next_run ON public.whatsapp_template_schedules(next_run_at) WHERE ativo = true;

ALTER TABLE public.whatsapp_template_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view template schedules"
  ON public.whatsapp_template_schedules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin/superintendente can manage template schedules"
  ON public.whatsapp_template_schedules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'superintendente'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'superintendente'::app_role));

CREATE POLICY "Corretora users can manage their schedules"
  ON public.whatsapp_template_schedules FOR ALL
  TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid()))
  WITH CHECK (corretora_id = public.get_user_corretora_id(auth.uid()));

CREATE TRIGGER trg_wts_updated_at
  BEFORE UPDATE ON public.whatsapp_template_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();