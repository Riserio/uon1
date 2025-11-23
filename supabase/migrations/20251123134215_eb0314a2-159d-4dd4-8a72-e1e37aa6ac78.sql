-- Remove a constraint antiga
ALTER TABLE vistorias DROP CONSTRAINT IF EXISTS vistorias_status_check;

-- Adiciona nova constraint com todos os status necessários
ALTER TABLE vistorias ADD CONSTRAINT vistorias_status_check 
CHECK (status = ANY (ARRAY[
  'rascunho'::text,
  'aguardando_fotos'::text,
  'pendente_novas_fotos'::text,
  'em_analise'::text,
  'aprovada'::text,
  'pendente_correcao'::text,
  'concluida'::text,
  'cancelada'::text
]));