-- Adicionar campos de custo e tipo de sinistro na tabela vistorias
ALTER TABLE public.vistorias ADD COLUMN IF NOT EXISTS tipo_sinistro TEXT;
ALTER TABLE public.vistorias ADD COLUMN IF NOT EXISTS custo_oficina NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.vistorias ADD COLUMN IF NOT EXISTS custo_reparo NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.vistorias ADD COLUMN IF NOT EXISTS custo_acordo NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.vistorias ADD COLUMN IF NOT EXISTS custo_terceiros NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.vistorias ADD COLUMN IF NOT EXISTS custo_perda_total NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.vistorias ADD COLUMN IF NOT EXISTS custo_perda_parcial NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.vistorias ADD COLUMN IF NOT EXISTS valor_franquia NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.vistorias ADD COLUMN IF NOT EXISTS valor_indenizacao NUMERIC(10,2) DEFAULT 0;

-- Adicionar comentários para documentação
COMMENT ON COLUMN public.vistorias.tipo_sinistro IS 'Tipo do sinistro: Colisão, Roubo/Furto, Incêndio, etc';
COMMENT ON COLUMN public.vistorias.custo_oficina IS 'Custo total com oficina mecânica';
COMMENT ON COLUMN public.vistorias.custo_reparo IS 'Custo com reparos do veículo';
COMMENT ON COLUMN public.vistorias.custo_acordo IS 'Valor do acordo firmado';
COMMENT ON COLUMN public.vistorias.custo_terceiros IS 'Pagamentos a terceiros envolvidos';
COMMENT ON COLUMN public.vistorias.custo_perda_total IS 'Custo em caso de perda total';
COMMENT ON COLUMN public.vistorias.custo_perda_parcial IS 'Custo em caso de perda parcial';
COMMENT ON COLUMN public.vistorias.valor_franquia IS 'Valor da franquia do seguro';
COMMENT ON COLUMN public.vistorias.valor_indenizacao IS 'Valor de indenização pago';