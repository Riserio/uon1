CREATE OR REPLACE FUNCTION public.calcular_dashboard_eventos(p_corretora_id uuid, p_status text DEFAULT 'em_andamento'::text, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_regional text DEFAULT NULL::text, p_cooperativa text DEFAULT NULL::text, p_tipo_veiculo text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
WITH importacao AS (
  SELECT id FROM sga_importacoes WHERE corretora_id = p_corretora_id AND ativo = true
  ORDER BY created_at DESC LIMIT 1
),
base0 AS MATERIALIZED (
  SELECT e.*, COALESCE(e.data_cadastro_evento, e.data_evento) AS data_ref
  FROM sga_eventos e
  WHERE e.importacao_id = (SELECT id FROM importacao)
    AND e.placa IS NOT NULL AND trim(e.placa) <> '' AND lower(trim(e.placa)) <> 'placa'
    AND (p_status <> 'em_andamento' OR (e.situacao_evento IS NOT NULL AND e.situacao_evento <> '' AND upper(e.situacao_evento) NOT LIKE '%FINALIZADO%'))
    AND (p_data_inicio IS NULL OR COALESCE(e.data_cadastro_evento, e.data_evento) >= p_data_inicio)
    AND (p_data_fim IS NULL OR COALESCE(e.data_cadastro_evento, e.data_evento) <= p_data_fim)
    AND (p_regional IS NULL OR e.regional = p_regional)
    AND (p_cooperativa IS NULL OR e.cooperativa = p_cooperativa)
),
base AS MATERIALIZED (
  SELECT *,
    CASE
      WHEN modelo_veiculo IS NULL OR modelo_veiculo = '' THEN 'Passeio'
      WHEN lower(modelo_veiculo) ~ 'moto|honda|yamaha|suzuki|kawasaki' THEN 'Motocicleta'
      WHEN lower(modelo_veiculo) ~ 'caminhao|caminhão|truck|scania|volvo' THEN 'Caminhão'
      WHEN lower(modelo_veiculo) ~ 'van|furgao|sprinter' THEN 'Van/Utilitário'
      ELSE 'Passeio'
    END AS tipo_veiculo_calc
  FROM base0
),
filtered AS MATERIALIZED (
  SELECT * FROM base WHERE (p_tipo_veiculo IS NULL OR tipo_veiculo_calc = p_tipo_veiculo)
),
agg AS (
  SELECT
    count(*) AS total_eventos,
    count(*) FILTER (WHERE upper(coalesce(situacao_evento,'')) LIKE '%FINALIZADO%') AS total_finalizados,
    count(*) FILTER (WHERE situacao_evento IS NOT NULL AND situacao_evento <> '' AND upper(situacao_evento) NOT LIKE '%FINALIZADO%') AS total_em_andamento,
    COALESCE(sum(custo_evento),0) AS total_custo,
    COALESCE(sum(valor_reparo),0) AS total_reparo,
    COALESCE(avg(participacao),0) AS media_participacao
  FROM filtered
),
concl_agg AS (
  SELECT
    count(*) FILTER (WHERE dias <= 60) AS ate_60,
    count(*) FILTER (WHERE dias > 60 AND dias <= 70) AS de_61_a_70,
    count(*) FILTER (WHERE dias > 70 AND dias <= 90) AS de_71_a_90,
    count(*) FILTER (WHERE dias > 90) AS acima_90,
    count(*) AS total_medidos
  FROM (
    SELECT (data_conclusao - data_ref) AS dias
    FROM filtered
    WHERE upper(coalesce(situacao_evento,'')) LIKE '%FINALIZADO%'
      AND data_conclusao IS NOT NULL
      AND data_ref IS NOT NULL
      AND data_conclusao >= data_ref
  ) t
),
estado_all AS (
  SELECT COALESCE(NULLIF(evento_estado,''), NULLIF(associado_estado,'')) AS val
  FROM filtered
  WHERE COALESCE(NULLIF(evento_estado,''), NULLIF(associado_estado,'')) IS NOT NULL
    AND COALESCE(NULLIF(evento_estado,''), NULLIF(associado_estado,'')) NOT IN ('N/I','NAO INFORMADO','NÃO INFORMADO')
),
estado_agg AS (SELECT val AS name, count(*) AS value FROM estado_all GROUP BY val ORDER BY value DESC LIMIT 10),
cidade_agg AS (
  SELECT evento_cidade AS name, count(*) AS value FROM filtered
  WHERE evento_cidade IS NOT NULL AND evento_cidade <> '' AND evento_cidade NOT IN ('N/I','NAO INFORMADO','NÃO INFORMADO')
  GROUP BY evento_cidade ORDER BY value DESC LIMIT 10
),
motivo_agg AS (
  SELECT motivo_evento AS name, count(*) AS value FROM filtered
  WHERE motivo_evento IS NOT NULL AND motivo_evento <> '' AND motivo_evento NOT IN ('N/I','NAO INFORMADO','NÃO INFORMADO')
  GROUP BY motivo_evento ORDER BY value DESC LIMIT 15
),
situacao_agg AS (
  SELECT situacao_evento AS name, count(*) AS value FROM filtered
  WHERE situacao_evento IS NOT NULL AND situacao_evento <> '' AND situacao_evento NOT IN ('N/I','NAO INFORMADO','NÃO INFORMADO')
  GROUP BY situacao_evento ORDER BY value DESC LIMIT 15
),
regional_agg AS (
  SELECT regional AS name, count(*) AS value FROM filtered
  WHERE regional IS NOT NULL AND regional <> '' AND regional NOT IN ('N/I','NAO INFORMADO','NÃO INFORMADO')
  GROUP BY regional ORDER BY value DESC LIMIT 10
),
tipo_agg AS (
  SELECT tipo_evento AS name, count(*) AS value FROM filtered
  WHERE tipo_evento IS NOT NULL AND tipo_evento <> '' AND tipo_evento NOT IN ('N/I','NAO INFORMADO','NÃO INFORMADO')
  GROUP BY tipo_evento ORDER BY value DESC LIMIT 15
),
cooperativa_agg AS (
  SELECT cooperativa AS name, count(*) AS value FROM filtered
  WHERE cooperativa IS NOT NULL AND cooperativa <> '' AND cooperativa NOT IN ('N/I','NAO INFORMADO','NÃO INFORMADO')
  GROUP BY cooperativa ORDER BY value DESC LIMIT 10
),
custos_coop_agg AS (
  SELECT cooperativa AS name, COALESCE(sum(custo_evento),0) AS value FROM filtered
  WHERE cooperativa IS NOT NULL AND cooperativa <> '' AND cooperativa <> 'N/I'
  GROUP BY cooperativa ORDER BY value DESC LIMIT 10
),
tipoveiculo_agg AS (
  SELECT tipo_veiculo_calc AS name, count(*) AS value FROM filtered GROUP BY tipo_veiculo_calc ORDER BY value DESC LIMIT 10
),
envolvimento_agg AS (
  SELECT envolvimento AS name, count(*) AS value FROM filtered
  WHERE envolvimento IS NOT NULL AND envolvimento <> '' AND envolvimento NOT IN ('N/I','NAO INFORMADO','NÃO INFORMADO')
  GROUP BY envolvimento ORDER BY value DESC LIMIT 10
),
mes_agg AS (
  SELECT to_char(data_ref,'YYYY-MM') AS mes, count(*) AS eventos, COALESCE(sum(custo_evento),0) AS custo
  FROM filtered WHERE data_ref IS NOT NULL GROUP BY 1 ORDER BY 1
),
dia_agg AS (
  SELECT to_char(data_ref,'YYYY-MM-DD') AS dia, count(*) AS eventos, COALESCE(sum(custo_evento),0) AS custo
  FROM filtered WHERE data_ref IS NOT NULL GROUP BY 1 ORDER BY 1
),
estados_distintos AS (SELECT count(DISTINCT val) AS c FROM estado_all)
SELECT jsonb_build_object(
  'totalEventos', (SELECT total_eventos FROM agg),
  'totalFinalizados', (SELECT total_finalizados FROM agg),
  'totalEmAndamento', (SELECT total_em_andamento FROM agg),
  'totalCusto', (SELECT total_custo FROM agg),
  'totalReparo', (SELECT total_reparo FROM agg),
  'mediaParticipacao', (SELECT media_participacao FROM agg),
  'totalEstadosDistintos', (SELECT c FROM estados_distintos),
  'conclusaoData', jsonb_build_object(
    'totalMedidos', COALESCE((SELECT total_medidos FROM concl_agg),0),
    'ate60', COALESCE((SELECT ate_60 FROM concl_agg),0),
    'de61a70', COALESCE((SELECT de_61_a_70 FROM concl_agg),0),
    'de71a90', COALESCE((SELECT de_71_a_90 FROM concl_agg),0),
    'acima90', COALESCE((SELECT acima_90 FROM concl_agg),0)
  ),
  'estadoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value)) FROM estado_agg),'[]'::jsonb),
  'cidadeData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value)) FROM cidade_agg),'[]'::jsonb),
  'motivoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value)) FROM motivo_agg),'[]'::jsonb),
  'situacaoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value)) FROM situacao_agg),'[]'::jsonb),
  'regionalData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value)) FROM regional_agg),'[]'::jsonb),
  'tipoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value)) FROM tipo_agg),'[]'::jsonb),
  'cooperativaData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value)) FROM cooperativa_agg),'[]'::jsonb),
  'custosCooperativaData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value)) FROM custos_coop_agg),'[]'::jsonb),
  'tipoVeiculoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value)) FROM tipoveiculo_agg),'[]'::jsonb),
  'envolvimentoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value)) FROM envolvimento_agg),'[]'::jsonb),
  'timelineData', COALESCE((SELECT jsonb_agg(jsonb_build_object('mes',mes,'eventos',eventos,'custo',custo)) FROM mes_agg),'[]'::jsonb),
  'timelineDiaData', COALESCE((SELECT jsonb_agg(jsonb_build_object('dia',dia,'eventos',eventos,'custo',custo)) FROM dia_agg),'[]'::jsonb)
);
$fn$;
TRUNCATE public.sga_dashboard_cache;