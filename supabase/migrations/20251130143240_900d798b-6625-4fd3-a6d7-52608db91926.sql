-- Adicionar coluna para armazenar respostas da entrevista do comitê
ALTER TABLE sinistro_acompanhamento 
ADD COLUMN IF NOT EXISTS entrevista_respostas JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS entrevista_data TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS entrevista_preenchida_por UUID REFERENCES profiles(id);