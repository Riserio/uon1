-- Adicionar colunas de hash e versão na tabela termos_aceitos
ALTER TABLE termos_aceitos 
ADD COLUMN IF NOT EXISTS termo_hash TEXT,
ADD COLUMN IF NOT EXISTS termo_version INTEGER;