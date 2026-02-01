-- Add n8n webhook configuration to whatsapp_config
ALTER TABLE public.whatsapp_config 
ADD COLUMN IF NOT EXISTS n8n_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS n8n_ativo BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ultimo_envio_automatico TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ultimo_erro_envio TEXT;