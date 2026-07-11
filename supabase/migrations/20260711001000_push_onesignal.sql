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

-- Recursos adicionais: imagem, agendamento e gabaritos
ALTER TABLE public.push_envios ADD COLUMN IF NOT EXISTS imagem_url text;
ALTER TABLE public.push_envios ADD COLUMN IF NOT EXISTS send_after timestamptz;

CREATE TABLE IF NOT EXISTS public.push_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  url text,
  imagem_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_templates_admin_all ON public.push_templates;
CREATE POLICY push_templates_admin_all ON public.push_templates
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
  );

-- Envio via RPC no Postgres (extensions.http) — dispensa deploy de edge
-- function pelo Lovable. O frontend chama supabase.rpc('enviar_push_onesignal').
CREATE OR REPLACE FUNCTION public.enviar_push_onesignal(
  p_titulo text,
  p_mensagem text,
  p_url text DEFAULT NULL,
  p_imagem_url text DEFAULT NULL,
  p_send_after timestamptz DEFAULT NULL,
  p_segmento text DEFAULT 'geral',
  p_corretora_ids text[] DEFAULT NULL,
  p_estados text[] DEFAULT NULL,
  p_cidades text[] DEFAULT NULL,
  p_tipos text[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET statement_timeout TO '60s'
AS $function$
DECLARE
  cfg record;
  payload jsonb;
  filters jsonb := '[]'::jsonb;
  vals text[];
  tag_key text;
  v text; i int := 0;
  resp record;
  body jsonb;
  ok boolean;
  v_err text;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'administrativo'::app_role) OR has_role(auth.uid(),'superintendente'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para enviar push';
  END IF;
  IF coalesce(trim(p_titulo),'') = '' OR coalesce(trim(p_mensagem),'') = '' THEN
    RAISE EXCEPTION 'Título e mensagem são obrigatórios';
  END IF;

  SELECT * INTO cfg FROM push_config WHERE id = 'global';
  IF cfg IS NULL OR NOT cfg.ativo OR cfg.onesignal_app_id IS NULL OR cfg.onesignal_rest_api_key IS NULL THEN
    RAISE EXCEPTION 'OneSignal não configurado. Preencha App ID e REST API Key na aba Push.';
  END IF;

  payload := jsonb_build_object(
    'app_id', cfg.onesignal_app_id,
    'headings', jsonb_build_object('en', p_titulo, 'pt', p_titulo),
    'contents', jsonb_build_object('en', p_mensagem, 'pt', p_mensagem)
  );
  IF coalesce(trim(p_url),'') <> '' THEN payload := payload || jsonb_build_object('url', trim(p_url)); END IF;
  IF coalesce(trim(p_imagem_url),'') <> '' THEN
    payload := payload || jsonb_build_object(
      'chrome_web_image', trim(p_imagem_url),
      'big_picture', trim(p_imagem_url),
      'huawei_big_picture', trim(p_imagem_url),
      'ios_attachments', jsonb_build_object('imagem', trim(p_imagem_url))
    );
  END IF;
  IF p_send_after IS NOT NULL AND p_send_after > now() THEN
    payload := payload || jsonb_build_object('send_after', to_char(p_send_after AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  END IF;

  IF p_segmento = 'geral' THEN
    payload := payload || jsonb_build_object('included_segments', jsonb_build_array('Total Subscriptions'));
  ELSE
    CASE p_segmento
      WHEN 'associacao' THEN tag_key := 'corretora_id'; vals := p_corretora_ids;
      WHEN 'localizacao' THEN
        IF p_cidades IS NOT NULL AND array_length(p_cidades,1) > 0 THEN tag_key := 'cidade'; vals := p_cidades;
        ELSE tag_key := 'estado'; vals := p_estados; END IF;
      WHEN 'tipo' THEN tag_key := 'tipo'; vals := p_tipos;
      ELSE RAISE EXCEPTION 'Segmento inválido: %', p_segmento;
    END CASE;
    IF vals IS NULL OR array_length(vals,1) IS NULL THEN
      RAISE EXCEPTION 'Selecione ao menos um destino para o segmento %', p_segmento;
    END IF;
    FOREACH v IN ARRAY vals LOOP
      IF i > 0 THEN filters := filters || jsonb_build_array(jsonb_build_object('operator','OR')); END IF;
      filters := filters || jsonb_build_array(jsonb_build_object('field','tag','key',tag_key,'relation','=','value',v));
      i := i + 1;
    END LOOP;
    payload := payload || jsonb_build_object('filters', filters);
  END IF;

  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT','45');
  SELECT * INTO resp FROM extensions.http((
    'POST',
    'https://onesignal.com/api/v1/notifications',
    ARRAY[extensions.http_header('Authorization', 'Basic ' || cfg.onesignal_rest_api_key)],
    'application/json',
    payload::text
  )::extensions.http_request);

  body := NULLIF(resp.content,'')::jsonb;
  ok := resp.status BETWEEN 200 AND 299 AND body ? 'id' AND coalesce(body->>'id','') <> '';
  v_err := CASE WHEN ok THEN NULL ELSE coalesce((body->'errors')::text, body::text, 'HTTP ' || resp.status) END;

  INSERT INTO push_envios (titulo, mensagem, url, imagem_url, send_after, segmento, filtros, onesignal_id, destinatarios, status, erro, created_by)
  VALUES (
    p_titulo, p_mensagem, NULLIF(trim(coalesce(p_url,'')),''), NULLIF(trim(coalesce(p_imagem_url,'')),''),
    CASE WHEN p_send_after IS NOT NULL AND p_send_after > now() THEN p_send_after ELSE NULL END,
    p_segmento,
    jsonb_build_object('corretora_ids', coalesce(p_corretora_ids,'{}'), 'estados', coalesce(p_estados,'{}'), 'cidades', coalesce(p_cidades,'{}'), 'tipos', coalesce(p_tipos,'{}')),
    body->>'id',
    NULLIF(body->>'recipients','')::int,
    CASE WHEN NOT ok THEN 'erro' WHEN p_send_after IS NOT NULL AND p_send_after > now() THEN 'agendado' ELSE 'enviado' END,
    v_err,
    auth.uid()
  );

  IF NOT ok THEN
    RAISE EXCEPTION 'OneSignal recusou o envio: %', v_err;
  END IF;

  RETURN jsonb_build_object('success', true, 'onesignal_id', body->>'id', 'destinatarios', NULLIF(body->>'recipients','')::int);
END;
$function$;
