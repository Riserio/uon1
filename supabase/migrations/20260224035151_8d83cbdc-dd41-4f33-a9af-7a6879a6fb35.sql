
ALTER TABLE public.whatsapp_config 
ADD COLUMN IF NOT EXISTS reset_keywords text[] DEFAULT ARRAY['reiniciar','menu','voltar','sair','0'],
ADD COLUMN IF NOT EXISTS timeout_minutos integer DEFAULT 30;
