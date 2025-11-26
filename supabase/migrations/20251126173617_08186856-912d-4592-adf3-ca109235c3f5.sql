-- Add FIPE value fields to relevant tables

-- Add FIPE fields to atendimentos table
ALTER TABLE public.atendimentos
ADD COLUMN IF NOT EXISTS veiculo_marca TEXT,
ADD COLUMN IF NOT EXISTS veiculo_modelo TEXT,
ADD COLUMN IF NOT EXISTS veiculo_ano TEXT,
ADD COLUMN IF NOT EXISTS veiculo_tipo TEXT, -- carro, moto, caminhao
ADD COLUMN IF NOT EXISTS veiculo_valor_fipe NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS veiculo_fipe_codigo TEXT,
ADD COLUMN IF NOT EXISTS veiculo_fipe_data_consulta TIMESTAMP WITH TIME ZONE;

-- Add FIPE fields to vistorias table
ALTER TABLE public.vistorias
ADD COLUMN IF NOT EXISTS veiculo_valor_fipe NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS veiculo_fipe_codigo TEXT,
ADD COLUMN IF NOT EXISTS veiculo_fipe_data_consulta TIMESTAMP WITH TIME ZONE;

-- Create index for FIPE queries
CREATE INDEX IF NOT EXISTS idx_atendimentos_veiculo_marca ON public.atendimentos(veiculo_marca);
CREATE INDEX IF NOT EXISTS idx_atendimentos_veiculo_modelo ON public.atendimentos(veiculo_modelo);
CREATE INDEX IF NOT EXISTS idx_vistorias_fipe_codigo ON public.vistorias(veiculo_fipe_codigo);