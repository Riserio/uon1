ALTER TABLE public.dispositivos_ponto ADD COLUMN IF NOT EXISTS assinatura TEXT;
CREATE INDEX IF NOT EXISTS idx_dispositivos_ponto_assinatura ON public.dispositivos_ponto (funcionario_id, assinatura);
ALTER TABLE public.device_approval_requests ADD COLUMN IF NOT EXISTS assinatura TEXT;
CREATE INDEX IF NOT EXISTS idx_device_approval_assinatura ON public.device_approval_requests (profile_id, assinatura);