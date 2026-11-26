-- =============================================================================
-- Radar do mercado: fila de envio das campanhas (cota diária do Resend). Idempotente.
--
-- O plano gratuito do Resend aceita 100 e-mails por dia na conta inteira (zera à
-- meia-noite UTC = 21h em Brasília) e a mesma conta envia contratos do Uon1 Sign,
-- confirmações e a newsletter diária. Por isso a campanha vira uma fila:
--   * cada destinatário entra como 'pendente' em radar_campanha_envios;
--   * de hora em hora (9h-18h) a função radar-newsletter (acao continuar_campanhas)
--     envia o próximo lote, até o limite por dia da campanha e sem passar da cota
--     da conta menos a reserva (radar_envio_config);
--   * recusa por cota (429) devolve o lote para a fila em vez de virar falha.
-- cota_diaria = 0 significa "sem limite" (plano pago).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.radar_envio_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cota_diaria int NOT NULL DEFAULT 100 CHECK (cota_diaria >= 0),
  reserva int NOT NULL DEFAULT 20 CHECK (reserva >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);
INSERT INTO public.radar_envio_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
REVOKE ALL ON public.radar_envio_config FROM PUBLIC, anon;
GRANT SELECT ON public.radar_envio_config TO authenticated;
GRANT ALL ON public.radar_envio_config TO service_role;
ALTER TABLE public.radar_envio_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Radar envio config - admin ve" ON public.radar_envio_config;
CREATE POLICY "Radar envio config - admin ve" ON public.radar_envio_config
  FOR SELECT TO authenticated USING (public.painel_admin(auth.uid()));

ALTER TABLE public.radar_campanhas ADD COLUMN IF NOT EXISTS limite_diario int;
ALTER TABLE public.radar_campanhas ADD COLUMN IF NOT EXISTS pendentes int NOT NULL DEFAULT 0;
ALTER TABLE public.radar_campanhas ADD COLUMN IF NOT EXISTS ultimo_lote_em timestamptz;
ALTER TABLE public.radar_campanhas DROP CONSTRAINT IF EXISTS radar_campanhas_status_check;
ALTER TABLE public.radar_campanhas ADD CONSTRAINT radar_campanhas_status_check
  CHECK (status IN ('enviando', 'em_andamento', 'pausada', 'enviada', 'falhou', 'cancelada'));

ALTER TABLE public.radar_campanha_envios DROP CONSTRAINT IF EXISTS radar_campanha_envios_status_check;
ALTER TABLE public.radar_campanha_envios ADD CONSTRAINT radar_campanha_envios_status_check
  CHECK (status IN ('pendente', 'enviando', 'enviado', 'falhou', 'cancelado', 'entregue', 'atrasado', 'devolvido', 'spam'));
CREATE INDEX IF NOT EXISTS radar_campanha_envios_fila_idx ON public.radar_campanha_envios (campanha_id, criado_em) WHERE status = 'pendente';

-- métricas: pendentes/cancelados não contam como enviados
CREATE OR REPLACE FUNCTION public.radar_campanha_metricas(_campanha uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NOT public.painel_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito à administração' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH e AS (SELECT * FROM radar_campanha_envios WHERE campanha_id = _campanha),
         ev AS (SELECT * FROM radar_campanha_eventos WHERE campanha_id = _campanha)
    SELECT jsonb_build_object(
      'rastreada', EXISTS (SELECT 1 FROM e WHERE enviado_em IS NOT NULL OR status = 'pendente'),
      'destinatarios', (SELECT count(*) FROM e),
      'pendentes', (SELECT count(*) FROM e WHERE status = 'pendente'),
      'cancelados', (SELECT count(*) FROM e WHERE status = 'cancelado'),
      'enviados', (SELECT count(*) FROM e WHERE status NOT IN ('pendente', 'enviando', 'falhou', 'cancelado')),
      'enviados_hoje', (SELECT count(*) FROM e WHERE enviado_em >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
      'falharam', (SELECT count(*) FROM e WHERE status = 'falhou'),
      'entregues', (SELECT count(*) FROM e WHERE status = 'entregue' OR entregue_em IS NOT NULL),
      'devolvidos', (SELECT count(*) FROM e WHERE status = 'devolvido'),
      'spam', (SELECT count(*) FROM e WHERE status = 'spam'),
      'atrasados', (SELECT count(*) FROM e WHERE status = 'atrasado'),
      'abriram', (SELECT count(*) FROM e WHERE aberto_em IS NOT NULL),
      'aberturas', (SELECT coalesce(sum(aberturas), 0) FROM e),
      'clicaram', (SELECT count(*) FROM e WHERE clicado_em IS NOT NULL),
      'cliques', (SELECT coalesce(sum(cliques), 0) FROM e),
      'inscreveram', (SELECT count(*) FROM e WHERE inscreveu_em IS NOT NULL),
      'assinaram', (SELECT count(*) FROM e WHERE assinou_em IS NOT NULL),
      'descadastraram', (SELECT count(*) FROM e WHERE descadastrou_em IS NOT NULL),
      'por_hora', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('hora', h, 'aberturas', ab, 'cliques', cl) ORDER BY h), '[]'::jsonb) FROM (
          SELECT date_trunc('hour', criado_em) h,
                 count(*) FILTER (WHERE tipo = 'abertura') ab,
                 count(*) FILTER (WHERE tipo = 'clique') cl
            FROM ev WHERE tipo IN ('abertura', 'clique') GROUP BY 1
        ) x
      ),
      'links', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('url', url, 'cliques', n, 'pessoas', p) ORDER BY n DESC), '[]'::jsonb) FROM (
          SELECT url, count(*) n, count(DISTINCT envio_id) p FROM ev WHERE tipo = 'clique' AND url IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15
        ) l
      ),
      'dispositivos', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'eventos', n) ORDER BY n DESC), '[]'::jsonb) FROM (
          SELECT coalesce(dispositivo, 'Outro') nome, count(*) n FROM ev WHERE tipo IN ('abertura', 'clique') GROUP BY 1
        ) d
      )
    )
  );
END
$f$;
REVOKE ALL ON FUNCTION public.radar_campanha_metricas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.radar_campanha_metricas(uuid) TO authenticated;

-- Fila: de hora em hora, das 9h às 18h de Brasília (12-21 UTC; a cota zera às 21h).
-- Mesmo formato de chamada do job radar-newsletter-enviar.
DO $do$
DECLARE v_cmd text;
BEGIN
  SELECT replace(command, '"enviar_novidades"', '"continuar_campanhas"') INTO v_cmd FROM cron.job WHERE jobname = 'radar-newsletter-enviar';
  IF v_cmd IS NOT NULL AND v_cmd LIKE '%continuar_campanhas%' THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'radar-campanhas-fila';
    PERFORM cron.schedule('radar-campanhas-fila', '7 12-20 * * *', v_cmd);
  END IF;
END
$do$;
