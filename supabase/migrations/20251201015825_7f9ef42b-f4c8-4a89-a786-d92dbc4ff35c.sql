-- Add new fields for additional opening questions
ALTER TABLE vistorias ADD COLUMN IF NOT EXISTS endereco_associado TEXT;
ALTER TABLE vistorias ADD COLUMN IF NOT EXISTS endereco_local_evento TEXT;
ALTER TABLE vistorias ADD COLUMN IF NOT EXISTS estava_chovendo BOOLEAN;
ALTER TABLE vistorias ADD COLUMN IF NOT EXISTS terceiro_placa TEXT;
ALTER TABLE vistorias ADD COLUMN IF NOT EXISTS terceiro_marca_modelo TEXT;
ALTER TABLE vistorias ADD COLUMN IF NOT EXISTS terceiro_nome TEXT;
ALTER TABLE vistorias ADD COLUMN IF NOT EXISTS terceiro_telefone TEXT;