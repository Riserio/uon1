
-- Índices compostos para reduzir carga em queries do BISyncButton e relatórios SGA
CREATE INDEX IF NOT EXISTS idx_sga_execucoes_corretora_status
  ON public.sga_automacao_execucoes (corretora_id, status);

CREATE INDEX IF NOT EXISTS idx_cobranca_execucoes_corretora_status
  ON public.cobranca_automacao_execucoes (corretora_id, status);

CREATE INDEX IF NOT EXISTS idx_mgf_execucoes_corretora_status
  ON public.mgf_automacao_execucoes (corretora_id, status);

-- Índice para checagem de limite diário (corretora_id + status + created_at)
CREATE INDEX IF NOT EXISTS idx_sga_execucoes_corretora_status_created
  ON public.sga_automacao_execucoes (corretora_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cobranca_execucoes_corretora_status_created
  ON public.cobranca_automacao_execucoes (corretora_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mgf_execucoes_corretora_status_created
  ON public.mgf_automacao_execucoes (corretora_id, status, created_at DESC);

-- Listagem principal de eventos (filtra por situacao_evento, ordena por data_cadastro_evento DESC)
CREATE INDEX IF NOT EXISTS idx_sga_eventos_situacao_data
  ON public.sga_eventos (situacao_evento, data_cadastro_evento DESC);

CREATE INDEX IF NOT EXISTS idx_sga_eventos_importacao
  ON public.sga_eventos (importacao_id);
