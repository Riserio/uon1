-- Create table for BI/SGA audit logs
CREATE TABLE public.bi_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_nome TEXT NOT NULL,
  corretora_id UUID REFERENCES public.corretoras(id) ON DELETE CASCADE,
  modulo TEXT NOT NULL, -- 'bi_indicadores' ou 'sga_insights'
  acao TEXT NOT NULL, -- 'importacao', 'alteracao', 'exclusao', etc.
  descricao TEXT NOT NULL,
  dados_anteriores JSONB,
  dados_novos JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bi_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only superintendente and admin can view logs
CREATE POLICY "Superintendente e admin podem ver logs"
ON public.bi_audit_logs
FOR SELECT
USING (
  has_role(auth.uid(), 'superintendente'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Policy: Authenticated users can insert logs (system creates logs on actions)
CREATE POLICY "Authenticated users can insert logs"
ON public.bi_audit_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Index for faster queries
CREATE INDEX idx_bi_audit_logs_modulo ON public.bi_audit_logs(modulo);
CREATE INDEX idx_bi_audit_logs_corretora ON public.bi_audit_logs(corretora_id);
CREATE INDEX idx_bi_audit_logs_created_at ON public.bi_audit_logs(created_at DESC);