
-- 1. Extend email_historico with contract references
ALTER TABLE public.email_historico
  ADD COLUMN IF NOT EXISTS contrato_id UUID NULL REFERENCES public.contratos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contrato_assinatura_id UUID NULL REFERENCES public.contrato_assinaturas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_historico_contrato_id ON public.email_historico(contrato_id);

-- 2. Allow new template type
ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_tipo_check;
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_tipo_check
  CHECK (tipo IN (
    'atendimento', 'alerta_performance', 'recuperacao', 'boas_vindas',
    'relatorio', 'convite_reuniao', 'ouvidoria', 'ouvidoria_alerta',
    'ouvidoria_finalizado', 'contrato_assinatura'
  ));

-- 3. Auto-send flag on contracts
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS auto_envio_email_assinatura BOOLEAN NOT NULL DEFAULT TRUE;
