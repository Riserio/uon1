-- =============================================================================
-- Radar do mercado: métricas das campanhas. Idempotente.
--
-- radar_campanha_envios: uma linha por destinatário de cada campanha, com o
--   estado da entrega (Resend) e a primeira/última atividade da pessoa
--   (abertura, clique, inscrição, assinatura confirmada, descadastro).
-- radar_campanha_eventos: cada abertura/clique/entrega etc., para a linha do
--   tempo e os links mais clicados.
-- O id do envio vai nos links do e-mail (pixel de abertura e redirecionamento
-- de clique pela função radar-newsletter). Nada disso é visível ao público:
-- só a administração lê (painel_admin), a função grava com service_role.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.radar_campanha_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.radar_campanhas(id) ON DELETE CASCADE,
  email text NOT NULL,
  nome text,
  associacao text,
  tipo text NOT NULL CHECK (tipo IN ('assinante', 'prospect')),
  assinante_id uuid REFERENCES public.radar_assinantes(id) ON DELETE SET NULL,
  prospect_id uuid REFERENCES public.radar_prospects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'enviando'
    CHECK (status IN ('enviando', 'enviado', 'falhou', 'entregue', 'atrasado', 'devolvido', 'spam')),
  resend_id text,
  erro text,
  enviado_em timestamptz,
  entregue_em timestamptz,
  aberto_em timestamptz,
  aberturas int NOT NULL DEFAULT 0,
  clicado_em timestamptz,
  cliques int NOT NULL DEFAULT 0,
  inscreveu_em timestamptz,
  assinou_em timestamptz,
  descadastrou_em timestamptz,
  ultima_atividade_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS radar_campanha_envios_campanha_idx ON public.radar_campanha_envios (campanha_id);
CREATE INDEX IF NOT EXISTS radar_campanha_envios_resend_idx ON public.radar_campanha_envios (resend_id) WHERE resend_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS radar_campanha_envios_email_idx ON public.radar_campanha_envios (lower(email), criado_em DESC);

CREATE TABLE IF NOT EXISTS public.radar_campanha_eventos (
  id bigserial PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now(),
  campanha_id uuid NOT NULL REFERENCES public.radar_campanhas(id) ON DELETE CASCADE,
  envio_id uuid REFERENCES public.radar_campanha_envios(id) ON DELETE CASCADE,
  tipo text NOT NULL
    CHECK (tipo IN ('abertura', 'clique', 'inscricao', 'assinatura', 'descadastro', 'entrega', 'atraso', 'devolucao', 'spam')),
  url text,
  dispositivo text,
  navegador text
);
CREATE INDEX IF NOT EXISTS radar_campanha_eventos_campanha_idx ON public.radar_campanha_eventos (campanha_id, criado_em);
CREATE INDEX IF NOT EXISTS radar_campanha_eventos_envio_idx ON public.radar_campanha_eventos (envio_id);

-- assinatura feita a partir de um e-mail de campanha (link com ?ce=<envio>)
ALTER TABLE public.radar_assinantes
  ADD COLUMN IF NOT EXISTS campanha_envio_id uuid REFERENCES public.radar_campanha_envios(id) ON DELETE SET NULL;

REVOKE ALL ON public.radar_campanha_envios, public.radar_campanha_eventos FROM PUBLIC, anon;
GRANT SELECT ON public.radar_campanha_envios, public.radar_campanha_eventos TO authenticated;
GRANT ALL ON public.radar_campanha_envios, public.radar_campanha_eventos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.radar_campanha_eventos_id_seq TO service_role;
ALTER TABLE public.radar_campanha_envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_campanha_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Radar campanha envios - admin ve" ON public.radar_campanha_envios;
CREATE POLICY "Radar campanha envios - admin ve" ON public.radar_campanha_envios
  FOR SELECT TO authenticated USING (public.painel_admin(auth.uid()));
DROP POLICY IF EXISTS "Radar campanha eventos - admin ve" ON public.radar_campanha_eventos;
CREATE POLICY "Radar campanha eventos - admin ve" ON public.radar_campanha_eventos
  FOR SELECT TO authenticated USING (public.painel_admin(auth.uid()));

-- Números de uma campanha para o painel de métricas (só administração)
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
      'rastreada', EXISTS (SELECT 1 FROM e),
      'destinatarios', (SELECT count(*) FROM e),
      'enviados', (SELECT count(*) FROM e WHERE status NOT IN ('enviando', 'falhou')),
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
