
-- Add delivery status tracking to whatsapp_historico
ALTER TABLE public.whatsapp_historico
ADD COLUMN IF NOT EXISTS meta_message_id TEXT,
ADD COLUMN IF NOT EXISTS status_entrega TEXT DEFAULT 'enviado',
ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS lido_em TIMESTAMP WITH TIME ZONE;

-- Index for fast webhook lookups by message_id
CREATE INDEX IF NOT EXISTS idx_whatsapp_historico_meta_message_id 
ON public.whatsapp_historico (meta_message_id) WHERE meta_message_id IS NOT NULL;
