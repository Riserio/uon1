-- Adicionar novos campos à tabela vistorias para perguntas adicionais
ALTER TABLE public.vistorias 
ADD COLUMN IF NOT EXISTS estava_chovendo BOOLEAN,
ADD COLUMN IF NOT EXISTS acionou_assistencia_24h BOOLEAN,
ADD COLUMN IF NOT EXISTS houve_remocao_veiculo BOOLEAN;