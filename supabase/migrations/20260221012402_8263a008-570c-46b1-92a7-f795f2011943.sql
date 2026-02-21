
-- Global notification config (not tied to any corretora)
CREATE TABLE public.whatsapp_notificacao_global (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notificar_numero TEXT,
  notificar_ativo BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.whatsapp_notificacao_global ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read global notification config"
  ON public.whatsapp_notificacao_global FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert global notification config"
  ON public.whatsapp_notificacao_global FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update global notification config"
  ON public.whatsapp_notificacao_global FOR UPDATE
  USING (auth.uid() IS NOT NULL);
