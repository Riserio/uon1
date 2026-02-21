-- Add notification number config for incoming WhatsApp messages
ALTER TABLE public.whatsapp_config 
ADD COLUMN IF NOT EXISTS notificar_numero TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS notificar_ativo BOOLEAN DEFAULT false;