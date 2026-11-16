-- Newsletter do Radar do mercado (página pública /radar). Idempotente.
CREATE TABLE IF NOT EXISTS public.radar_assinantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  nome text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'ativo', 'cancelado')),
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  aceite_comunicacoes boolean NOT NULL DEFAULT false,
  aceite_texto text,
  aceite_em timestamptz,
  aceite_ip text,
  aceite_user_agent text,
  origem text,
  confirmado_em timestamptz,
  cancelado_em timestamptz,
  ultimo_envio_em timestamptz,
  confirmacoes_enviadas int NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_assinantes_email_uk ON public.radar_assinantes (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS radar_assinantes_token_uk ON public.radar_assinantes (token);
CREATE INDEX IF NOT EXISTS radar_assinantes_ativos_idx ON public.radar_assinantes (status) WHERE status = 'ativo';

CREATE TABLE IF NOT EXISTS public.radar_newsletter_envios (
  id bigserial PRIMARY KEY,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  -- notícias coletadas até aqui já foram enviadas
  ate timestamptz,
  noticias int NOT NULL DEFAULT 0,
  destinatarios int NOT NULL DEFAULT 0,
  enviados int NOT NULL DEFAULT 0,
  falhas int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'executando',
  erro text
);

REVOKE ALL ON public.radar_assinantes, public.radar_newsletter_envios FROM PUBLIC, anon;
GRANT SELECT ON public.radar_assinantes, public.radar_newsletter_envios TO authenticated;
GRANT ALL ON public.radar_assinantes, public.radar_newsletter_envios TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.radar_newsletter_envios_id_seq TO service_role;

ALTER TABLE public.radar_assinantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_newsletter_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Radar newsletter - admin ve assinantes" ON public.radar_assinantes;
CREATE POLICY "Radar newsletter - admin ve assinantes" ON public.radar_assinantes
  FOR SELECT TO authenticated USING (public.painel_admin(auth.uid()));
DROP POLICY IF EXISTS "Radar newsletter - admin ve envios" ON public.radar_newsletter_envios;
CREATE POLICY "Radar newsletter - admin ve envios" ON public.radar_newsletter_envios
  FOR SELECT TO authenticated USING (public.painel_admin(auth.uid()));

-- Modelos de e-mail da newsletter
ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_tipo_check;
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_tipo_check CHECK (tipo = ANY (ARRAY[
  'atendimento', 'alerta_performance', 'recuperacao', 'boas_vindas', 'relatorio', 'convite_reuniao',
  'ouvidoria', 'ouvidoria_alerta', 'ouvidoria_finalizado', 'contrato_assinatura',
  'uonisign_convite', 'uonisign_codigo', 'uonisign_lembrete', 'uonisign_concluido', 'uonisign_aviso', 'uonisign_proposta',
  'radar_confirmacao', 'radar_novidades']));

DROP POLICY IF EXISTS "radar_admin_ve_templates_email" ON public.email_templates;
CREATE POLICY "radar_admin_ve_templates_email" ON public.email_templates
  FOR SELECT TO authenticated
  USING (tipo LIKE 'radar\_%' AND public.painel_admin(auth.uid()));
DROP POLICY IF EXISTS "radar_admin_edita_templates_email" ON public.email_templates;
CREATE POLICY "radar_admin_edita_templates_email" ON public.email_templates
  FOR UPDATE TO authenticated
  USING (tipo LIKE 'radar\_%' AND public.painel_admin(auth.uid()))
  WITH CHECK (tipo LIKE 'radar\_%' AND public.painel_admin(auth.uid()));

-- Envio diário das novidades: 07:15 de Brasília (10:15 UTC), depois da coleta (06:41) e do processamento (06:46)
DO $$ BEGIN PERFORM cron.unschedule('radar-newsletter-enviar'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'radar-newsletter-enviar',
  '15 10 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/radar-newsletter',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM'
    ),
    body := '{"acao":"enviar_novidades"}'::jsonb,
    timeout_milliseconds := 300000
  );
  $cron$
);
