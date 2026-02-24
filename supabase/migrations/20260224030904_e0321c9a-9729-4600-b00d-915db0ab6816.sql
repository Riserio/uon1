ALTER TABLE public.whatsapp_config 
ADD COLUMN IF NOT EXISTS fluxo_cobranca_id UUID REFERENCES public.whatsapp_flows(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS fluxo_eventos_id UUID REFERENCES public.whatsapp_flows(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS fluxo_mgf_id UUID REFERENCES public.whatsapp_flows(id) ON DELETE SET NULL;