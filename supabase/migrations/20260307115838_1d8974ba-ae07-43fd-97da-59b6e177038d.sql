
-- Add new columns to ouvidoria_registros
ALTER TABLE public.ouvidoria_registros 
  ADD COLUMN IF NOT EXISTS anonimo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS prioridade text DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS canal_retorno text DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS anexos_urls text[] DEFAULT '{}';

-- Allow anon users to upload to vistorias bucket (reuse existing public bucket)
-- We'll store ouvidoria attachments in the existing 'documentos' bucket which is public
