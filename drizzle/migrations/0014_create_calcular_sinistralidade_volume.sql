CREATE OR REPLACE FUNCTION public.calcular_sinistralidade_volume(p_corretora_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
WITH imp AS (
  SELECT id FROM sga_importacoes WHERE corretora_id = p_corretora_id AND ativo = true
  ORDER BY created_at DESC LIMIT 1
),
meses AS (
  SELECT date_trunc('month', COALESCE(data_cadastro_evento, data_evento))::date AS mes_inicio,
         to_char(date_trunc('month', COALESCE(data_cadastro_evento, data_evento)),'YYYY-MM') AS mes,
         count(*) AS sinistros
  FROM sga_eventos
  WHERE importacao_id = (SELECT id FROM imp)
    AND COALESCE(data_cadastro_evento, data_evento) IS NOT NULL
  GROUP BY 1, 2
),
snap AS (
  SELECT data, count(*) AS placas
  FROM veiculo_snapshot_diario
  WHERE corretora_id = p_corretora_id
  GROUP BY data
),
placas_mes AS (
  -- snapshot mais próximo do dia 01 de cada mês
  SELECT DISTINCT ON (date_trunc('month', data))
    date_trunc('month', data)::date AS mes_inicio,
    placas
  FROM snap
  ORDER BY date_trunc('month', data), ABS(data - date_trunc('month', data)::date)
),
serie AS (
  SELECT m.mes, m.mes_inicio, m.sinistros, p.placas,
    CASE WHEN p.placas > 0 THEN round(m.sinistros::numeric / p.placas * 100, 2) END AS sinistralidade
  FROM meses m
  LEFT JOIN placas_mes p ON p.mes_inicio = m.mes_inicio
  ORDER BY m.mes_inicio
),
media12 AS (
  SELECT round(avg(sinistralidade), 2) AS media
  FROM (
    SELECT sinistralidade FROM serie
    WHERE sinistralidade IS NOT NULL
    ORDER BY mes_inicio DESC LIMIT 12
  ) t
),
atual AS (
  SELECT placas FROM snap ORDER BY data DESC LIMIT 1
)
SELECT jsonb_build_object(
  'media12m', COALESCE((SELECT media FROM media12), 0),
  'placasAtivasAtual', COALESCE((SELECT placas FROM atual), 0),
  'mensalData', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'mes', mes,
      'sinistros', sinistros,
      'placas', placas,
      'sinistralidade', sinistralidade
    ) ORDER BY mes_inicio) FROM serie), '[]'::jsonb)
);
$fn$;
GRANT EXECUTE ON FUNCTION public.calcular_sinistralidade_volume(uuid) TO authenticated;