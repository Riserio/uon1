ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS contratada_tipo_pessoa text,
  ADD COLUMN IF NOT EXISTS contratada_nome text,
  ADD COLUMN IF NOT EXISTS contratada_documento text,
  ADD COLUMN IF NOT EXISTS contratada_email text,
  ADD COLUMN IF NOT EXISTS contratada_telefone text,
  ADD COLUMN IF NOT EXISTS contratada_endereco text,
  ADD COLUMN IF NOT EXISTS contratada_representante text,
  ADD COLUMN IF NOT EXISTS contratada_assinatura_automatica boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS contratada_manual_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contratada_papel text;