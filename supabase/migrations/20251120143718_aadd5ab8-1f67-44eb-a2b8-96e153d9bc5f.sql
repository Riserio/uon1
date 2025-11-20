-- Adicionar campos de aprovação manual nas fotos de vistoria
ALTER TABLE vistoria_fotos 
ADD COLUMN IF NOT EXISTS status_aprovacao text DEFAULT 'pendente' CHECK (status_aprovacao IN ('pendente', 'aprovada', 'reprovada')),
ADD COLUMN IF NOT EXISTS observacao_reprovacao text,
ADD COLUMN IF NOT EXISTS aprovada_por uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS aprovada_em timestamp with time zone;

-- Comentários
COMMENT ON COLUMN vistoria_fotos.status_aprovacao IS 'Status da aprovação manual: pendente, aprovada, reprovada';
COMMENT ON COLUMN vistoria_fotos.observacao_reprovacao IS 'Observação caso a foto seja reprovada';
COMMENT ON COLUMN vistoria_fotos.aprovada_por IS 'Usuário que aprovou/reprovou a foto';
COMMENT ON COLUMN vistoria_fotos.aprovada_em IS 'Data e hora da aprovação/reprovação';