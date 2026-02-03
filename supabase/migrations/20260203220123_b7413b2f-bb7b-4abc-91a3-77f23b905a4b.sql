-- Adicionar campos para controle de retry automático nas tabelas de execução
ALTER TABLE public.cobranca_automacao_execucoes 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS proxima_tentativa_at timestamp with time zone;

ALTER TABLE public.sga_automacao_execucoes 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS proxima_tentativa_at timestamp with time zone;

ALTER TABLE public.mgf_automacao_execucoes 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS proxima_tentativa_at timestamp with time zone;

-- Criar índices para busca eficiente de retries pendentes
CREATE INDEX IF NOT EXISTS idx_cobranca_execucoes_retry ON public.cobranca_automacao_execucoes (proxima_tentativa_at) WHERE status = 'erro' AND proxima_tentativa_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sga_execucoes_retry ON public.sga_automacao_execucoes (proxima_tentativa_at) WHERE status = 'erro' AND proxima_tentativa_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mgf_execucoes_retry ON public.mgf_automacao_execucoes (proxima_tentativa_at) WHERE status = 'erro' AND proxima_tentativa_at IS NOT NULL;