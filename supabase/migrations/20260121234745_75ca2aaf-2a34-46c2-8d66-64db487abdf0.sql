-- Tabela para logs de execução da automação Hinova
CREATE TABLE IF NOT EXISTS public.cobranca_automacao_execucoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES public.cobranca_automacao_config(id) ON DELETE CASCADE,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'executando' CHECK (status IN ('executando', 'sucesso', 'erro')),
  mensagem TEXT,
  erro TEXT,
  registros_processados INTEGER DEFAULT 0,
  nome_arquivo TEXT,
  duracao_segundos INTEGER,
  iniciado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finalizado_at TIMESTAMP WITH TIME ZONE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_cobranca_automacao_execucoes_config ON public.cobranca_automacao_execucoes(config_id);
CREATE INDEX IF NOT EXISTS idx_cobranca_automacao_execucoes_corretora ON public.cobranca_automacao_execucoes(corretora_id);
CREATE INDEX IF NOT EXISTS idx_cobranca_automacao_execucoes_created ON public.cobranca_automacao_execucoes(created_at DESC);

-- Enable RLS
ALTER TABLE public.cobranca_automacao_execucoes ENABLE ROW LEVEL SECURITY;

-- Policies para acesso (usando user_roles ao invés de profiles)
CREATE POLICY "Admins podem ver logs de execução" ON public.cobranca_automacao_execucoes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('admin', 'superintendente')
    )
  );

CREATE POLICY "Admins podem inserir logs de execução" ON public.cobranca_automacao_execucoes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('admin', 'superintendente')
    )
  );

CREATE POLICY "Sistema pode gerenciar logs de execução" ON public.cobranca_automacao_execucoes
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.cobranca_automacao_execucoes;