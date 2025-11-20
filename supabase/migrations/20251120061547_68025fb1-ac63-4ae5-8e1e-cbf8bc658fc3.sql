-- Adicionar coluna cof na tabela vistorias
ALTER TABLE vistorias
ADD COLUMN IF NOT EXISTS cof TEXT;

-- Adicionar colunas de análise manual na tabela vistoria_fotos
ALTER TABLE vistoria_fotos
ADD COLUMN IF NOT EXISTS status_analise TEXT CHECK (status_analise IN ('pendente', 'aprovada', 'reprovada')) DEFAULT 'pendente';

ALTER TABLE vistoria_fotos
ADD COLUMN IF NOT EXISTS analise_manual BOOLEAN DEFAULT FALSE;