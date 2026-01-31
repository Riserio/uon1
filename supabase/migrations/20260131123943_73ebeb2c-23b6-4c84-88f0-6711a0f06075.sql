-- Tabela de configuração da automação SGA Hinova
CREATE TABLE public.sga_automacao_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT false,
  hinova_url TEXT NOT NULL DEFAULT '',
  hinova_user TEXT NOT NULL DEFAULT '',
  hinova_pass TEXT NOT NULL DEFAULT '',
  hinova_codigo_cliente TEXT,
  hora_agendada TIME DEFAULT '09:00',
  ultima_execucao TIMESTAMP WITH TIME ZONE,
  ultimo_status TEXT,
  ultimo_erro TEXT,
  -- Filtros específicos do relatório de eventos
  filtro_data_cadastro_inicio DATE,
  filtro_data_cadastro_fim DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT sga_automacao_config_corretora_unique UNIQUE (corretora_id)
);

-- Tabela de execuções da automação SGA
CREATE TABLE public.sga_automacao_execucoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES public.sga_automacao_config(id) ON DELETE CASCADE,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'executando',
  mensagem TEXT,
  erro TEXT,
  registros_processados INTEGER,
  registros_total INTEGER,
  nome_arquivo TEXT,
  duracao_segundos INTEGER,
  iniciado_por TEXT,
  progresso_download INTEGER,
  bytes_baixados INTEGER,
  bytes_total INTEGER,
  progresso_importacao INTEGER,
  etapa_atual TEXT,
  github_run_id TEXT,
  github_run_url TEXT,
  tipo_disparo TEXT,
  filtros_aplicados JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finalizado_at TIMESTAMP WITH TIME ZONE
);

-- Índices para performance
CREATE INDEX idx_sga_automacao_config_corretora ON public.sga_automacao_config(corretora_id);
CREATE INDEX idx_sga_automacao_execucoes_config ON public.sga_automacao_execucoes(config_id);
CREATE INDEX idx_sga_automacao_execucoes_corretora ON public.sga_automacao_execucoes(corretora_id);
CREATE INDEX idx_sga_automacao_execucoes_status ON public.sga_automacao_execucoes(status);
CREATE INDEX idx_sga_automacao_execucoes_created ON public.sga_automacao_execucoes(created_at DESC);

-- Enable RLS
ALTER TABLE public.sga_automacao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sga_automacao_execucoes ENABLE ROW LEVEL SECURITY;

-- Policies para sga_automacao_config
CREATE POLICY "Authenticated users can view sga_automacao_config"
  ON public.sga_automacao_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sga_automacao_config"
  ON public.sga_automacao_config FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sga_automacao_config"
  ON public.sga_automacao_config FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete sga_automacao_config"
  ON public.sga_automacao_config FOR DELETE
  TO authenticated
  USING (true);

-- Policies para sga_automacao_execucoes
CREATE POLICY "Authenticated users can view sga_automacao_execucoes"
  ON public.sga_automacao_execucoes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sga_automacao_execucoes"
  ON public.sga_automacao_execucoes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sga_automacao_execucoes"
  ON public.sga_automacao_execucoes FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete sga_automacao_execucoes"
  ON public.sga_automacao_execucoes FOR DELETE
  TO authenticated
  USING (true);

-- Service role policies (para webhooks e edge functions)
CREATE POLICY "Service role full access sga_automacao_config"
  ON public.sga_automacao_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access sga_automacao_execucoes"
  ON public.sga_automacao_execucoes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Enable realtime para acompanhamento de progresso
ALTER PUBLICATION supabase_realtime ADD TABLE public.sga_automacao_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sga_automacao_execucoes;

-- Trigger para updated_at
CREATE TRIGGER update_sga_automacao_config_updated_at
  BEFORE UPDATE ON public.sga_automacao_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();