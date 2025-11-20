-- Add 'interno' to tipo_abertura check constraint
ALTER TABLE vistorias DROP CONSTRAINT IF EXISTS vistorias_tipo_abertura_check;

ALTER TABLE vistorias ADD CONSTRAINT vistorias_tipo_abertura_check 
CHECK (tipo_abertura = ANY (ARRAY['interno'::text, 'digital'::text, 'manual'::text]));