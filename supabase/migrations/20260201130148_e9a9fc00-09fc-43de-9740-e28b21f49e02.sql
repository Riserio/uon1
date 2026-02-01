-- =====================================================
-- TABELAS DE AUTOMAÇÃO MGF (Módulo Gerenciador Financeiro)
-- Estrutura idêntica ao módulo de Cobrança
-- =====================================================

-- Tabela de configuração da automação MGF
CREATE TABLE IF NOT EXISTS public.mgf_automacao_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL UNIQUE REFERENCES public.corretoras(id) ON DELETE CASCADE,
  hinova_url TEXT NOT NULL DEFAULT '',
  hinova_user TEXT NOT NULL DEFAULT '',
  hinova_pass TEXT NOT NULL DEFAULT '',
  hinova_codigo_cliente TEXT DEFAULT '',
  layout_relatorio TEXT DEFAULT 'BI VANGARD FINANCEIROS EVENTOS',
  ativo BOOLEAN NOT NULL DEFAULT false,
  hora_agendada TIME DEFAULT '09:00',
  ultima_execucao TIMESTAMPTZ,
  ultimo_status TEXT,
  ultimo_erro TEXT,
  -- Campos de filtro (centros de custo com EVENTOS)
  filtro_centros_custo JSONB DEFAULT '["EVENTOS", "EVENTOS NAO PROVISIONADO", "EVENTOS RATEAVEIS"]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de histórico de execuções MGF
CREATE TABLE IF NOT EXISTS public.mgf_automacao_execucoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES public.mgf_automacao_config(id) ON DELETE CASCADE,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente',
  etapa_atual TEXT,
  mensagem TEXT,
  erro TEXT,
  registros_processados INTEGER DEFAULT 0,
  registros_total INTEGER DEFAULT 0,
  nome_arquivo TEXT,
  progresso_download INTEGER DEFAULT 0,
  progresso_importacao INTEGER DEFAULT 0,
  bytes_baixados BIGINT DEFAULT 0,
  bytes_total BIGINT DEFAULT 0,
  duracao_segundos INTEGER,
  tipo_disparo TEXT DEFAULT 'manual',
  iniciado_por UUID,
  github_run_id TEXT,
  github_run_url TEXT,
  filtros_aplicados JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_at TIMESTAMPTZ
);

-- Habilitar RLS
ALTER TABLE public.mgf_automacao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mgf_automacao_execucoes ENABLE ROW LEVEL SECURITY;

-- Policies para mgf_automacao_config
CREATE POLICY "Authenticated users can view mgf_automacao_config" 
  ON public.mgf_automacao_config 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert mgf_automacao_config" 
  ON public.mgf_automacao_config 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update mgf_automacao_config" 
  ON public.mgf_automacao_config 
  FOR UPDATE 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete mgf_automacao_config" 
  ON public.mgf_automacao_config 
  FOR DELETE 
  USING (auth.role() = 'authenticated');

-- Policies para mgf_automacao_execucoes
CREATE POLICY "Authenticated users can view mgf_automacao_execucoes" 
  ON public.mgf_automacao_execucoes 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert mgf_automacao_execucoes" 
  ON public.mgf_automacao_execucoes 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update mgf_automacao_execucoes" 
  ON public.mgf_automacao_execucoes 
  FOR UPDATE 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete mgf_automacao_execucoes" 
  ON public.mgf_automacao_execucoes 
  FOR DELETE 
  USING (auth.role() = 'authenticated');

-- Trigger para atualizar updated_at
CREATE TRIGGER update_mgf_automacao_config_updated_at
  BEFORE UPDATE ON public.mgf_automacao_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar Realtime para atualizações em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.mgf_automacao_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mgf_automacao_execucoes;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_mgf_automacao_execucoes_config_id ON public.mgf_automacao_execucoes(config_id);
CREATE INDEX IF NOT EXISTS idx_mgf_automacao_execucoes_corretora_id ON public.mgf_automacao_execucoes(corretora_id);
CREATE INDEX IF NOT EXISTS idx_mgf_automacao_execucoes_status ON public.mgf_automacao_execucoes(status);
CREATE INDEX IF NOT EXISTS idx_mgf_automacao_execucoes_created_at ON public.mgf_automacao_execucoes(created_at DESC);