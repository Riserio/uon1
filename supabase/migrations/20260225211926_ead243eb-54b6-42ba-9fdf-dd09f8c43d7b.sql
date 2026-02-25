
-- Add frequency and category to email_templates
ALTER TABLE public.email_templates 
  ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'atendimento',
  ADD COLUMN IF NOT EXISTS frequencia text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ultima_execucao timestamptz,
  ADD COLUMN IF NOT EXISTS proxima_execucao timestamptz,
  ADD COLUMN IF NOT EXISTS destinatarios_tipo text DEFAULT 'corretora',
  ADD COLUMN IF NOT EXISTS variaveis_extras jsonb DEFAULT '{}';

-- Add critical alert types config to performance_metas  
ALTER TABLE public.performance_metas
  ADD COLUMN IF NOT EXISTS alertas_inadimplencia boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS meta_inadimplencia_percentual numeric DEFAULT 30,
  ADD COLUMN IF NOT EXISTS alertas_sinistralidade boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS meta_sinistralidade_percentual numeric DEFAULT 50,
  ADD COLUMN IF NOT EXISTS alertas_retencao boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS meta_retencao_percentual numeric DEFAULT 80,
  ADD COLUMN IF NOT EXISTS frequencia_verificacao text DEFAULT 'diario',
  ADD COLUMN IF NOT EXISTS tipos_alerta_ativos text[] DEFAULT ARRAY['volume_baixo', 'taxa_conclusao_baixa', 'tempo_medio_alto'];
