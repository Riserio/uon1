-- Add template type and file columns to contrato_templates
ALTER TABLE public.contrato_templates 
ADD COLUMN IF NOT EXISTS tipo_template TEXT DEFAULT 'html' CHECK (tipo_template IN ('html', 'word', 'pdf')),
ADD COLUMN IF NOT EXISTS arquivo_url TEXT,
ADD COLUMN IF NOT EXISTS arquivo_nome TEXT;