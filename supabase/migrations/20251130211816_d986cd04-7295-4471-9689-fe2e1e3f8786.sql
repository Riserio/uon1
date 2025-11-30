-- Adicionar campos para separar parecer do analista e parecer da associação
ALTER TABLE sinistro_acompanhamento 
ADD COLUMN IF NOT EXISTS parecer_analista TEXT,
ADD COLUMN IF NOT EXISTS parecer_analista_justificativa TEXT,
ADD COLUMN IF NOT EXISTS parecer_analista_data TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parecer_associacao TEXT,
ADD COLUMN IF NOT EXISTS parecer_associacao_justificativa TEXT,
ADD COLUMN IF NOT EXISTS parecer_associacao_data TIMESTAMPTZ;