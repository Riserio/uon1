-- Adicionar campo tipo_atendimento na tabela atendimentos
ALTER TABLE atendimentos
ADD COLUMN IF NOT EXISTS tipo_atendimento TEXT CHECK (tipo_atendimento IN ('sinistro', 'geral')) DEFAULT 'geral';

-- Atualizar atendimentos com tag 'sinistro' para tipo_atendimento 'sinistro'
UPDATE atendimentos
SET tipo_atendimento = 'sinistro'
WHERE tags && ARRAY['sinistro'];