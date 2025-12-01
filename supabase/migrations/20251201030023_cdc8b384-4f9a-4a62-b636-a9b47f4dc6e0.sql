-- Desativar perguntas antigas com tipo_sinistro 'colisao' (minúsculo)
-- Mantendo apenas as perguntas com 'Colisão' que correspondem ao tipo salvo nos sinistros
UPDATE sinistro_perguntas 
SET ativo = false 
WHERE tipo_sinistro = 'colisao';

-- Desativar categorias antigas com tipo_sinistro 'colisao' (minúsculo)
UPDATE sinistro_pergunta_categorias 
SET ativo = false 
WHERE tipo_sinistro = 'colisao';