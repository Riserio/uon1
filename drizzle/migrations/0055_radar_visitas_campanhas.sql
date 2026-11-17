-- =============================================================================
-- Radar do mercado: cadastro completo do assinante, registro de visitas da
-- página pública e campanhas de e-mail para os assinantes. Idempotente.
--
-- Visitas: guardamos cidade/UF/país aproximados (pelo endereço de rede),
-- dispositivo, origem e um identificador aleatório do navegador. O endereço
-- de rede em si não é guardado, só um resumo (hash) para contar visitantes.
-- Quem chega por um link do e-mail fica identificado como assinante.
-- =============================================================================

ALTER TABLE public.radar_assinantes
  ADD COLUMN IF NOT EXISTS associacao text,
  ADD COLUMN IF NOT EXISTS telefone text;

CREATE TABLE IF NOT EXISTS public.radar_visitas (
  id bigserial PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now(),
  visitante uuid NOT NULL,
  pagina text NOT NULL DEFAULT 'radar',
  origem text,
  referencia text,
  utm_source text,
  utm_campaign text,
  cidade text,
  uf text,
  pais text,
  dispositivo text,
  navegador text,
  ip_hash text,
  assinante_id uuid REFERENCES public.radar_assinantes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS radar_visitas_data_idx ON public.radar_visitas (criado_em DESC);
CREATE INDEX IF NOT EXISTS radar_visitas_visitante_idx ON public.radar_visitas (visitante, criado_em DESC);
CREATE INDEX IF NOT EXISTS radar_visitas_assinante_idx ON public.radar_visitas (assinante_id) WHERE assinante_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.radar_campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assunto text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  noticias jsonb NOT NULL DEFAULT '[]'::jsonb,
  botao_texto text,
  botao_url text,
  status text NOT NULL DEFAULT 'enviando' CHECK (status IN ('enviando', 'enviada', 'falhou')),
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  destinatarios int NOT NULL DEFAULT 0,
  enviados int NOT NULL DEFAULT 0,
  falhas int NOT NULL DEFAULT 0,
  erro text
);

REVOKE ALL ON public.radar_visitas, public.radar_campanhas FROM PUBLIC, anon;
GRANT SELECT ON public.radar_visitas, public.radar_campanhas TO authenticated;
GRANT ALL ON public.radar_visitas, public.radar_campanhas TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.radar_visitas_id_seq TO service_role;
ALTER TABLE public.radar_visitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_campanhas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Radar visitas - admin ve" ON public.radar_visitas;
CREATE POLICY "Radar visitas - admin ve" ON public.radar_visitas
  FOR SELECT TO authenticated USING (public.painel_admin(auth.uid()));
DROP POLICY IF EXISTS "Radar campanhas - admin ve" ON public.radar_campanhas;
CREATE POLICY "Radar campanhas - admin ve" ON public.radar_campanhas
  FOR SELECT TO authenticated USING (public.painel_admin(auth.uid()));

-- Números das visitas para a tela de gestão (só administração)
CREATE OR REPLACE FUNCTION public.radar_visitas_resumo(_dias int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_de timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
                      - make_interval(days => greatest(1, least(_dias, 365)) - 1);
BEGIN
  IF NOT public.painel_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito à administração' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH v AS (SELECT * FROM radar_visitas WHERE criado_em >= v_de)
    SELECT jsonb_build_object(
      'visitas', (SELECT count(*) FROM v),
      'visitantes', (SELECT count(DISTINCT visitante) FROM v),
      'assinantes_visitaram', (SELECT count(DISTINCT assinante_id) FROM v WHERE assinante_id IS NOT NULL),
      'hoje', (SELECT count(*) FROM v WHERE criado_em >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'),
      'por_dia', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'visitas', coalesce(x.n, 0), 'visitantes', coalesce(x.u, 0)) ORDER BY d), '[]'::jsonb)
          FROM generate_series((v_de AT TIME ZONE 'America/Sao_Paulo')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date, interval '1 day') d
          LEFT JOIN (
            SELECT (criado_em AT TIME ZONE 'America/Sao_Paulo')::date dia, count(*) n, count(DISTINCT visitante) u FROM v GROUP BY 1
          ) x ON x.dia = d::date
      ),
      'cidades', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'visitas', n) ORDER BY n DESC), '[]'::jsonb) FROM (
          SELECT coalesce(cidade || coalesce(' - ' || uf, ''), 'Não identificada') nome, count(*) n FROM v GROUP BY 1 ORDER BY 2 DESC LIMIT 10
        ) c
      ),
      'origens', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'visitas', n) ORDER BY n DESC), '[]'::jsonb) FROM (
          SELECT coalesce(origem, 'Direto') nome, count(*) n FROM v GROUP BY 1 ORDER BY 2 DESC LIMIT 8
        ) o
      ),
      'dispositivos', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'visitas', n) ORDER BY n DESC), '[]'::jsonb) FROM (
          SELECT coalesce(dispositivo, 'Outro') nome, count(*) n FROM v GROUP BY 1
        ) d
      )
    )
  );
END
$f$;
REVOKE ALL ON FUNCTION public.radar_visitas_resumo(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.radar_visitas_resumo(int) TO authenticated;
