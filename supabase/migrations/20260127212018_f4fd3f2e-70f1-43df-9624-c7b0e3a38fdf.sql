-- Adicionar coluna de filtros aplicados para registrar os filtros usados em cada execução
ALTER TABLE public.cobranca_automacao_execucoes 
ADD COLUMN IF NOT EXISTS filtros_aplicados JSONB;

-- Adicionar coluna para armazenar o tipo de disparo (manual_ui, github_actions, agendado)
ALTER TABLE public.cobranca_automacao_execucoes 
ADD COLUMN IF NOT EXISTS tipo_disparo TEXT DEFAULT 'manual_ui';

-- Adicionar coluna para ID do workflow run do GitHub
ALTER TABLE public.cobranca_automacao_execucoes 
ADD COLUMN IF NOT EXISTS github_run_id TEXT;

-- Adicionar coluna para URL do workflow run do GitHub
ALTER TABLE public.cobranca_automacao_execucoes 
ADD COLUMN IF NOT EXISTS github_run_url TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.cobranca_automacao_execucoes.filtros_aplicados IS 'JSON com todos os filtros aplicados no relatório (período, situações, referência, etc)';
COMMENT ON COLUMN public.cobranca_automacao_execucoes.tipo_disparo IS 'Origem do disparo: manual_ui, github_actions, agendado';
COMMENT ON COLUMN public.cobranca_automacao_execucoes.github_run_id IS 'ID do workflow run no GitHub Actions';
COMMENT ON COLUMN public.cobranca_automacao_execucoes.github_run_url IS 'URL para visualizar o workflow run no GitHub';