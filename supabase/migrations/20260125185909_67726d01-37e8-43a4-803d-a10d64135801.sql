-- Add configurable filter columns to cobranca_automacao_config
ALTER TABLE public.cobranca_automacao_config
ADD COLUMN IF NOT EXISTS filtro_periodo_tipo text DEFAULT 'mes_atual',
ADD COLUMN IF NOT EXISTS filtro_data_inicio date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS filtro_data_fim date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS filtro_situacoes jsonb DEFAULT '["ABERTO", "BAIXADO"]'::jsonb,
ADD COLUMN IF NOT EXISTS filtro_boletos_anteriores text DEFAULT 'nao_possui',
ADD COLUMN IF NOT EXISTS filtro_referencia text DEFAULT 'vencimento_original';

-- Add comment for documentation
COMMENT ON COLUMN public.cobranca_automacao_config.filtro_periodo_tipo IS 'Tipo de período: mes_atual ou customizado';
COMMENT ON COLUMN public.cobranca_automacao_config.filtro_situacoes IS 'Array JSON de situações de boleto a filtrar';
COMMENT ON COLUMN public.cobranca_automacao_config.filtro_boletos_anteriores IS 'Filtro de boletos anteriores: nao_possui, possui, todos';
COMMENT ON COLUMN public.cobranca_automacao_config.filtro_referencia IS 'Referência: vencimento_original ou data_pagamento';