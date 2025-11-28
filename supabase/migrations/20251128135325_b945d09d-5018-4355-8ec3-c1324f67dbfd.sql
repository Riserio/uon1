-- Adicionar campos para integração CILIA na tabela vistorias
ALTER TABLE public.vistorias 
ADD COLUMN IF NOT EXISTS quilometragem INTEGER,
ADD COLUMN IF NOT EXISTS tipo_pintura TEXT DEFAULT 'solida',
ADD COLUMN IF NOT EXISTS veiculo_uf TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.vistorias.quilometragem IS 'Quilometragem do veículo no momento da vistoria';
COMMENT ON COLUMN public.vistorias.tipo_pintura IS 'Tipo de pintura: solida, metalica, perolizada';
COMMENT ON COLUMN public.vistorias.veiculo_uf IS 'UF de registro do veículo';