-- Add 'rascunho' to vistorias status check constraint
ALTER TABLE vistorias DROP CONSTRAINT IF EXISTS vistorias_status_check;

ALTER TABLE vistorias ADD CONSTRAINT vistorias_status_check 
CHECK (status = ANY (ARRAY['rascunho'::text, 'aguardando_fotos'::text, 'em_analise'::text, 'concluida'::text, 'cancelada'::text]))