-- Alterar campo tipo_sinistro para array de text
ALTER TABLE termos
ALTER COLUMN tipo_sinistro TYPE text[] USING CASE 
  WHEN tipo_sinistro IS NULL THEN NULL
  WHEN tipo_sinistro = '' THEN NULL
  ELSE ARRAY[tipo_sinistro]
END;

-- Atualizar índice existente
DROP INDEX IF EXISTS idx_termos_tipo_sinistro;
CREATE INDEX idx_termos_tipo_sinistro ON termos USING GIN(tipo_sinistro);