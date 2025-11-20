-- Adicionar campos de tipo_sinistro e corretora_id na tabela termos
ALTER TABLE termos
ADD COLUMN IF NOT EXISTS tipo_sinistro text,
ADD COLUMN IF NOT EXISTS corretora_id uuid REFERENCES corretoras(id) ON DELETE SET NULL;

-- Criar índice para melhorar performance de consultas
CREATE INDEX IF NOT EXISTS idx_termos_corretora ON termos(corretora_id);
CREATE INDEX IF NOT EXISTS idx_termos_tipo_sinistro ON termos(tipo_sinistro);