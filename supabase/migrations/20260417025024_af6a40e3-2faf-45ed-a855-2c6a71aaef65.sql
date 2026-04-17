
-- Tabela de ausências/abonos por funcionário (dia abonado, folga, férias)
CREATE TABLE IF NOT EXISTS public.ausencias_funcionario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('abono','folga','ferias','feriado')),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  motivo TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_ausencias_funcionario ON public.ausencias_funcionario(funcionario_id, data_inicio, data_fim);

ALTER TABLE public.ausencias_funcionario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ausencias"
  ON public.ausencias_funcionario
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'superintendente'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'superintendente'::app_role)
  );

CREATE POLICY "Funcionario pode ver suas ausencias"
  ON public.ausencias_funcionario
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER trg_ausencias_updated_at
  BEFORE UPDATE ON public.ausencias_funcionario
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
