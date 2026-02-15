
-- Table to configure which situacao_evento values appear as kanban columns
-- and their display order in the Gestão Associação view
CREATE TABLE public.gestao_associacao_status_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE, -- maps to sga_eventos.situacao_evento
  cor TEXT NOT NULL DEFAULT '#3b82f6',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gestao_associacao_status_config ENABLE ROW LEVEL SECURITY;

-- Only admins/superintendentes can manage this config
CREATE POLICY "Authenticated users can read gestao_associacao_status_config"
  ON public.gestao_associacao_status_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage gestao_associacao_status_config"
  ON public.gestao_associacao_status_config FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'superintendente'::app_role) OR
    public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superintendente'::app_role) OR
    public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Trigger for updated_at
CREATE TRIGGER update_gestao_associacao_status_config_updated_at
  BEFORE UPDATE ON public.gestao_associacao_status_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
