-- Adicionar novas colunas à tabela mgf_dados para suportar todos os campos do Excel
ALTER TABLE public.mgf_dados
ADD COLUMN IF NOT EXISTS operacao text,
ADD COLUMN IF NOT EXISTS sub_operacao text,
ADD COLUMN IF NOT EXISTS descricao text,
ADD COLUMN IF NOT EXISTS nota_fiscal text,
ADD COLUMN IF NOT EXISTS valor_total_lancamento numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_pagamento numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS data_nota_fiscal date,
ADD COLUMN IF NOT EXISTS data_vencimento date,
ADD COLUMN IF NOT EXISTS situacao_pagamento text,
ADD COLUMN IF NOT EXISTS quantidade_parcela integer,
ADD COLUMN IF NOT EXISTS forma_pagamento text,
ADD COLUMN IF NOT EXISTS data_vencimento_original date,
ADD COLUMN IF NOT EXISTS data_pagamento date,
ADD COLUMN IF NOT EXISTS controle_interno text,
ADD COLUMN IF NOT EXISTS veiculo_lancamento text,
ADD COLUMN IF NOT EXISTS tipo_veiculo text,
ADD COLUMN IF NOT EXISTS classificacao_veiculo text,
ADD COLUMN IF NOT EXISTS associado text,
ADD COLUMN IF NOT EXISTS cnpj_fornecedor text,
ADD COLUMN IF NOT EXISTS cpf_cnpj_cliente text,
ADD COLUMN IF NOT EXISTS fornecedor text,
ADD COLUMN IF NOT EXISTS nome_fantasia_fornecedor text,
ADD COLUMN IF NOT EXISTS voluntario text,
ADD COLUMN IF NOT EXISTS centro_custo text,
ADD COLUMN IF NOT EXISTS multa numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS juros numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS mes_referente text,
ADD COLUMN IF NOT EXISTS categoria_veiculo text,
ADD COLUMN IF NOT EXISTS impostos numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS protocolo_evento text,
ADD COLUMN IF NOT EXISTS veiculo_evento text,
ADD COLUMN IF NOT EXISTS motivo_evento text,
ADD COLUMN IF NOT EXISTS terceiro_evento text,
ADD COLUMN IF NOT EXISTS regional_evento text,
ADD COLUMN IF NOT EXISTS placa_terceiro_evento text;

-- Criar índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_mgf_dados_situacao ON public.mgf_dados(situacao_pagamento);
CREATE INDEX IF NOT EXISTS idx_mgf_dados_data_vencimento ON public.mgf_dados(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_mgf_dados_data_pagamento ON public.mgf_dados(data_pagamento);
CREATE INDEX IF NOT EXISTS idx_mgf_dados_operacao ON public.mgf_dados(operacao);
CREATE INDEX IF NOT EXISTS idx_mgf_dados_fornecedor ON public.mgf_dados(fornecedor);