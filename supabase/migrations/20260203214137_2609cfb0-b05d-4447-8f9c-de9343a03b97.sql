-- Adicionar coluna de permissões de módulos BI na tabela corretora_usuarios
-- Array de strings com os módulos permitidos: 'indicadores', 'eventos', 'mgf', 'cobranca'

ALTER TABLE public.corretora_usuarios 
ADD COLUMN IF NOT EXISTS modulos_bi text[] DEFAULT ARRAY['indicadores', 'eventos', 'mgf', 'cobranca']::text[];

-- Comentário explicativo
COMMENT ON COLUMN public.corretora_usuarios.modulos_bi IS 'Módulos BI que o usuário parceiro pode visualizar: indicadores, eventos, mgf, cobranca';