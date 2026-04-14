
-- Tabela de programas PPR
CREATE TABLE public.ppr_programas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID REFERENCES public.corretoras(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL DEFAULT 'Programa Preparatório para Regulamentação',
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ppr_programas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ppr_programas"
  ON public.ppr_programas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ppr_programas"
  ON public.ppr_programas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ppr_programas"
  ON public.ppr_programas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ppr_programas"
  ON public.ppr_programas FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_ppr_programas_updated_at
  BEFORE UPDATE ON public.ppr_programas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de tarefas PPR
CREATE TABLE public.ppr_tarefas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  programa_id UUID REFERENCES public.ppr_programas(id) ON DELETE CASCADE NOT NULL,
  area TEXT NOT NULL,
  sprint INT NOT NULL CHECK (sprint >= 0 AND sprint <= 5),
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  responsavel TEXT,
  observacoes TEXT,
  ordem INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ppr_tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ppr_tarefas"
  ON public.ppr_tarefas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ppr_tarefas"
  ON public.ppr_tarefas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ppr_tarefas"
  ON public.ppr_tarefas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ppr_tarefas"
  ON public.ppr_tarefas FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_ppr_tarefas_updated_at
  BEFORE UPDATE ON public.ppr_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ppr_tarefas_programa ON public.ppr_tarefas(programa_id);
CREATE INDEX idx_ppr_tarefas_area_sprint ON public.ppr_tarefas(area, sprint);
