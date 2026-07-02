CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  user_role text,
  titulo text NOT NULL,
  descricao text NOT NULL,
  categoria text NOT NULL DEFAULT 'bug',
  severidade text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'aberto',
  url text,
  diagnostico jsonb DEFAULT '{}'::jsonb,
  anexos jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bug_reports TO authenticated;
GRANT ALL ON public.bug_reports TO service_role;

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own reports"
ON public.bug_reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own reports"
ON public.bug_reports FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all reports"
ON public.bug_reports FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND lower(coalesce(ur.role::text, '')) IN ('admin','superintendente')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND lower(coalesce(ur.role::text, '')) IN ('admin','superintendente')
  )
);

CREATE INDEX IF NOT EXISTS bug_reports_user_idx ON public.bug_reports(user_id);
CREATE INDEX IF NOT EXISTS bug_reports_status_idx ON public.bug_reports(status);

CREATE TRIGGER update_bug_reports_updated_at
BEFORE UPDATE ON public.bug_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();