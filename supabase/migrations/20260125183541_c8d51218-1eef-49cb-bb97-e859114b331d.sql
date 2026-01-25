-- Adicionar campos de progresso na tabela de execuções
ALTER TABLE public.cobranca_automacao_execucoes
ADD COLUMN IF NOT EXISTS progresso_download integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS bytes_baixados bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS bytes_total bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS progresso_importacao integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS registros_total integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS etapa_atual text DEFAULT NULL;

-- Comentários descritivos
COMMENT ON COLUMN public.cobranca_automacao_execucoes.progresso_download IS 'Percentual de progresso do download (0-100)';
COMMENT ON COLUMN public.cobranca_automacao_execucoes.bytes_baixados IS 'Bytes já baixados';
COMMENT ON COLUMN public.cobranca_automacao_execucoes.bytes_total IS 'Total de bytes a baixar';
COMMENT ON COLUMN public.cobranca_automacao_execucoes.progresso_importacao IS 'Percentual de progresso da importação (0-100)';
COMMENT ON COLUMN public.cobranca_automacao_execucoes.registros_total IS 'Total de registros a importar';
COMMENT ON COLUMN public.cobranca_automacao_execucoes.etapa_atual IS 'Etapa atual: login, filtros, download, processamento, importacao';