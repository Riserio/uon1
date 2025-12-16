-- Create financial history/audit log table
CREATE TABLE public.lancamentos_financeiros_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lancamento_id UUID REFERENCES public.lancamentos_financeiros(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_nome TEXT NOT NULL,
  acao TEXT NOT NULL, -- 'criacao', 'edicao', 'aprovacao', 'rejeicao', 'pagamento', 'conciliacao', 'exclusao'
  campo_alterado TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  dados_completos JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lancamentos_financeiros_historico ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view lancamentos_financeiros_historico"
ON public.lancamentos_financeiros_historico
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert lancamentos_financeiros_historico"
ON public.lancamentos_financeiros_historico
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for better performance
CREATE INDEX idx_lancamentos_historico_lancamento_id ON public.lancamentos_financeiros_historico(lancamento_id);
CREATE INDEX idx_lancamentos_historico_created_at ON public.lancamentos_financeiros_historico(created_at DESC);