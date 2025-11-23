-- Remove o constraint antigo de posição
ALTER TABLE vistoria_fotos DROP CONSTRAINT IF EXISTS vistoria_fotos_posicao_check;

-- Adiciona novo constraint com todas as posições necessárias, incluindo 'adicional'
ALTER TABLE vistoria_fotos ADD CONSTRAINT vistoria_fotos_posicao_check
CHECK (posicao = ANY (ARRAY[
  'frontal'::text,
  'traseira'::text,
  'lateral_esquerda'::text,
  'lateral_direita'::text,
  'cnh'::text,
  'crlv'::text,
  'adicional'::text,
  'dano'::text,
  'interior'::text,
  'chassi'::text,
  'hodometro'::text
]));