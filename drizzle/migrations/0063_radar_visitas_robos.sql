-- =============================================================================
-- Radar do mercado: visitas de robôs ficam fora dos números. Idempotente.
--
-- Logo depois de um envio de e-mail, verificadores de segurança (Microsoft
-- Defender/Outlook, Proofpoint, Mimecast, gateways de provedores brasileiros)
-- abrem os links para checar se são seguros; robôs de prévia (Meta, Google)
-- fazem o mesmo quando o link é compartilhado. Eles vêm de servidores
-- (Microsoft em Chase City/VA, Amazon em Dulles/VA, Meta em Prineville/OR,
-- Google em Groningen/NL...) e às vezes trocam o utm_source por texto aleatório.
-- Essas visitas não são apagadas: ficam marcadas (descartada + motivo) para
-- conferência e saem de todos os totais.
-- =============================================================================

ALTER TABLE public.radar_visitas
  ADD COLUMN IF NOT EXISTS descartada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_descarte text,
  ADD COLUMN IF NOT EXISTS provedor text;
CREATE INDEX IF NOT EXISTS radar_visitas_validas_idx ON public.radar_visitas (criado_em DESC) WHERE NOT descartada;

-- Retroativo (não havia o provedor de internet guardado): fora do Brasil,
-- parâmetro de origem aleatório, e o mesmo acesso (mesmo resumo de endereço)
-- nos 10 minutos em volta de uma visita de robô.
UPDATE public.radar_visitas SET descartada = true, motivo_descarte = 'Fora do Brasil'
 WHERE NOT descartada AND pais IS NOT NULL AND pais NOT IN ('Brasil', 'Brazil');
UPDATE public.radar_visitas SET descartada = true, motivo_descarte = 'Verificador de links (parâmetro aleatório)'
 WHERE NOT descartada AND utm_source IS NOT NULL
   AND lower(utm_source) NOT IN ('newsletter', 'campanha', 'instagram', 'facebook', 'whatsapp', 'linkedin', 'google', 'email')
   AND lower(utm_source) ~ '[b-df-hj-np-tv-z]{4}';
UPDATE public.radar_visitas v SET descartada = true, motivo_descarte = 'Mesmo acesso de um robô'
 WHERE NOT v.descartada AND v.ip_hash IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.radar_visitas d
    WHERE d.descartada AND d.ip_hash = v.ip_hash
      AND d.motivo_descarte <> 'Mesmo acesso de um robô'
      AND abs(extract(epoch FROM d.criado_em - v.criado_em)) < 600);

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
    WITH v AS (SELECT * FROM radar_visitas WHERE criado_em >= v_de AND NOT descartada),
         d AS (SELECT * FROM radar_visitas WHERE criado_em >= v_de AND descartada)
    SELECT jsonb_build_object(
      'visitas', (SELECT count(*) FROM v),
      'descartadas', (SELECT count(*) FROM d),
      'motivos_descarte', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'visitas', n) ORDER BY n DESC), '[]'::jsonb) FROM (
          SELECT coalesce(motivo_descarte, 'Outro') nome, count(*) n FROM d GROUP BY 1
        ) m
      ),
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
