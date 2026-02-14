
-- Add ultimo_acesso column to track last portal access
ALTER TABLE public.corretora_usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMP WITH TIME ZONE;
