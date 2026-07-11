-- Push notifications via OneSignal: configuração, histórico de envios e
-- RPC pública (definer) para o portal inicializar o SDK com o App ID.

CREATE TABLE IF NOT EXISTS public.push_config (
  id text PRIMARY KEY DEFAULT 'global',
  onesignal_app_id text,
  onesignal_rest_api_key text,
  ativo boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_config_admin_all ON public.push_config;
CREATE POLICY push_config_admin_all ON public.push_config
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

CREATE TABLE IF NOT EXISTS public.push_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  mensagem text NOT NULL,
  url text,
  segmento text NOT NULL DEFAULT 'geral',
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  onesignal_id text,
  destinatarios int,
  status text NOT NULL DEFAULT 'enviado',
  erro text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_envios_admin_all ON public.push_envios;
CREATE POLICY push_envios_admin_all ON public.push_envios
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

CREATE OR REPLACE FUNCTION public.get_push_app_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT onesignal_app_id FROM public.push_config WHERE id = 'global' AND ativo $$;

-- Safari Web ID (necessário para push no Safari/iOS)
ALTER TABLE public.push_config ADD COLUMN IF NOT EXISTS safari_web_id text;

CREATE OR REPLACE FUNCTION public.get_push_web_config()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object('app_id', onesignal_app_id, 'safari_web_id', safari_web_id)
  FROM public.push_config WHERE id = 'global' AND ativo AND onesignal_app_id IS NOT NULL
$$;

-- Inclui 'superintendente' (papel mais alto em uso na operação) nas
-- políticas — sem isso, salvar a configuração do Push falhava por RLS.
DROP POLICY IF EXISTS push_config_admin_all ON public.push_config;
CREATE POLICY push_config_admin_all ON public.push_config
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
  );

DROP POLICY IF EXISTS push_envios_admin_all ON public.push_envios;
CREATE POLICY push_envios_admin_all ON public.push_envios
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
  );
