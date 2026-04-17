
CREATE TABLE IF NOT EXISTS public.funcionario_feedback_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  ano INT NOT NULL,
  mes INT NOT NULL,
  observacoes TEXT NOT NULL DEFAULT '',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, ano, mes)
);

ALTER TABLE public.funcionario_feedback_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores podem ver feedback notas"
ON public.funcionario_feedback_notas FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
);

CREATE POLICY "Gestores podem inserir feedback notas"
ON public.funcionario_feedback_notas FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
);

CREATE POLICY "Gestores podem atualizar feedback notas"
ON public.funcionario_feedback_notas FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
);

CREATE POLICY "Gestores podem deletar feedback notas"
ON public.funcionario_feedback_notas FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
);

CREATE TRIGGER trg_funcionario_feedback_notas_updated_at
BEFORE UPDATE ON public.funcionario_feedback_notas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
