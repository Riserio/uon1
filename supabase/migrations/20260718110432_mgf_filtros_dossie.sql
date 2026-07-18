-- ============================================================================
-- MGF: alinhar os filtros do BI ao relatório do MGF/SGA (dossiê "MGF x Uoni").
--
-- 1) BASE DE DATA selecionável: o período passava SEMPRE por vencimento
--    (COALESCE(data_vencimento, data_evento, data_nota_fiscal)). O relatório do
--    MGF é tirado por DATA DE PAGAMENTO — daí os valores nunca baterem.
--    Agora: p_base_data = 'vencimento' (default, comportamento atual)
--                       | 'pagamento'  (movimentação efetivamente realizada)
--
-- 2) FILTROS MÚLTIPLOS: operação, subOperação e situação passam a aceitar
--    listas (Entrada+Saída juntas, várias subOperações no mesmo filtro).
--    Os parâmetros antigos (text) continuam funcionando — compatibilidade.
--
-- 3) valorTotal continua somando tudo (inclusive canceladas), como hoje, mas
--    agora expomos 'valorTotalAtivo' (exclui cancelada/excluída/estornada)
--    para comparação direta com o MGF sem mudar o número atual sem aviso.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calcular_dashboard_mgf(
  p_corretora_id uuid,
  p_operacao text DEFAULT NULL,
  p_sub_operacao text DEFAULT NULL,
  p_situacao text DEFAULT NULL,
  p_cooperativa text DEFAULT NULL,
  p_regional text DEFAULT NULL,
  p_forma_pagamento text DEFAULT NULL,
  p_tipo_veiculo text DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_base_data text DEFAULT 'vencimento',
  p_operacoes text[] DEFAULT NULL,
  p_sub_operacoes text[] DEFAULT NULL,
  p_situacoes text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH imps AS (
  SELECT id FROM mgf_importacoes WHERE corretora_id = p_corretora_id AND ativo = true
),
base AS MATERIALIZED (
  SELECT d.*,
    -- Base de data conforme p_base_data ('pagamento' usa data_pagamento).
    CASE WHEN lower(coalesce(p_base_data,'vencimento')) = 'pagamento'
         THEN d.data_pagamento
         ELSE COALESCE(d.data_vencimento, d.data_evento, d.data_nota_fiscal)
    END AS data_ref,
    COALESCE(NULLIF(d.tipo_veiculo,''), NULLIF(d.categoria_veiculo,'')) AS tipo_veiculo_calc,
    COALESCE(NULLIF(d.regional,''), NULLIF(d.regional_evento,'')) AS regional_calc,
    (d.situacao_pagamento ILIKE '%pago%' OR d.situacao_pagamento ILIKE '%paga%' OR d.data_pagamento IS NOT NULL) AS is_pago,
    (d.situacao_pagamento ILIKE '%cancel%' OR d.situacao_pagamento ILIKE '%exclu%' OR d.situacao_pagamento ILIKE '%estorn%') AS is_inativo
  FROM mgf_dados d
  WHERE d.importacao_id = ANY(SELECT id FROM imps)
    AND (p_operacao IS NULL OR d.operacao = p_operacao)
    AND (p_operacoes IS NULL OR d.operacao = ANY(p_operacoes))
    AND (p_sub_operacao IS NULL OR d.sub_operacao = p_sub_operacao)
    AND (p_sub_operacoes IS NULL OR d.sub_operacao = ANY(p_sub_operacoes))
    AND (p_situacao IS NULL OR d.situacao_pagamento = p_situacao)
    AND (p_situacoes IS NULL OR d.situacao_pagamento = ANY(p_situacoes))
    AND (p_cooperativa IS NULL OR d.cooperativa = p_cooperativa)
    AND (p_regional IS NULL OR COALESCE(NULLIF(d.regional,''), NULLIF(d.regional_evento,'')) = p_regional)
    AND (p_forma_pagamento IS NULL OR d.forma_pagamento = p_forma_pagamento)
    AND (p_tipo_veiculo IS NULL OR COALESCE(NULLIF(d.tipo_veiculo,''), NULLIF(d.categoria_veiculo,'')) = p_tipo_veiculo)
    AND (p_data_inicio IS NULL OR
         (CASE WHEN lower(coalesce(p_base_data,'vencimento')) = 'pagamento'
               THEN d.data_pagamento
               ELSE COALESCE(d.data_vencimento, d.data_evento, d.data_nota_fiscal) END) >= p_data_inicio)
    AND (p_data_fim IS NULL OR
         (CASE WHEN lower(coalesce(p_base_data,'vencimento')) = 'pagamento'
               THEN d.data_pagamento
               ELSE COALESCE(d.data_vencimento, d.data_evento, d.data_nota_fiscal) END) <= p_data_fim)
),
agg AS (
  SELECT
    count(*) AS total_registros,
    COALESCE(sum(valor),0) AS valor_total,
    COALESCE(sum(valor) FILTER (WHERE NOT is_inativo),0) AS valor_total_ativo,
    count(*) FILTER (WHERE NOT is_inativo) AS total_registros_ativos,
    count(*) FILTER (WHERE NOT is_inativo AND is_pago) AS qtd_pagos,
    COALESCE(sum(COALESCE(valor_pagamento,valor)) FILTER (WHERE NOT is_inativo AND is_pago),0) AS valor_pago,
    count(*) FILTER (WHERE NOT is_inativo AND NOT is_pago) AS qtd_a_pagar,
    COALESCE(sum(valor) FILTER (WHERE NOT is_inativo AND NOT is_pago),0) AS valor_a_pagar,
    count(*) FILTER (WHERE NOT is_inativo AND NOT is_pago AND data_vencimento IS NOT NULL AND data_vencimento < CURRENT_DATE) AS qtd_vencidos,
    COALESCE(sum(valor) FILTER (WHERE NOT is_inativo AND NOT is_pago AND data_vencimento IS NOT NULL AND data_vencimento < CURRENT_DATE),0) AS valor_vencido,
    COALESCE(sum(multa),0) AS total_multa,
    COALESCE(sum(juros),0) AS total_juros,
    count(DISTINCT COALESCE(NULLIF(fornecedor,''), NULLIF(nome_fantasia_fornecedor,''))) FILTER (WHERE COALESCE(NULLIF(fornecedor,''), NULLIF(nome_fantasia_fornecedor,'')) IS NOT NULL) AS fornecedores_unicos,
    count(*) FILTER (WHERE situacao_pagamento ILIKE '%cancel%') AS qtd_canceladas,
    count(*) FILTER (WHERE situacao_pagamento ILIKE '%exclu%') AS qtd_excluidas,
    count(*) FILTER (WHERE situacao_pagamento ILIKE '%estorn%') AS qtd_estornadas,
    count(*) FILTER (WHERE NOT is_pago AND NOT is_inativo AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS qtd_av7,
    COALESCE(sum(valor) FILTER (WHERE NOT is_pago AND NOT is_inativo AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 7),0) AS valor_av7,
    count(*) FILTER (WHERE NOT is_pago AND NOT is_inativo AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 15) AS qtd_av15,
    COALESCE(sum(valor) FILTER (WHERE NOT is_pago AND NOT is_inativo AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 15),0) AS valor_av15,
    count(*) FILTER (WHERE NOT is_pago AND NOT is_inativo AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30) AS qtd_av30,
    COALESCE(sum(valor) FILTER (WHERE NOT is_pago AND NOT is_inativo AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30),0) AS valor_av30,
    count(*) FILTER (WHERE NOT is_pago AND NOT is_inativo AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 60) AS qtd_av60,
    COALESCE(sum(valor) FILTER (WHERE NOT is_pago AND NOT is_inativo AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 60),0) AS valor_av60,
    count(*) FILTER (WHERE NOT is_pago AND NOT is_inativo AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 90) AS qtd_av90,
    COALESCE(sum(valor) FILTER (WHERE NOT is_pago AND NOT is_inativo AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 90),0) AS valor_av90
  FROM base
),
rk_operacao AS (SELECT operacao AS name, COALESCE(sum(valor),0) AS value, count(*) AS cnt FROM base WHERE operacao IS NOT NULL AND operacao<>'' GROUP BY 1 ORDER BY value DESC LIMIT 10),
rk_subop AS (SELECT sub_operacao AS name, COALESCE(sum(valor),0) AS value, count(*) AS cnt FROM base WHERE sub_operacao IS NOT NULL AND sub_operacao<>'' GROUP BY 1 ORDER BY value DESC LIMIT 10),
rk_situacao AS (SELECT situacao_pagamento AS name, COALESCE(sum(valor),0) AS value, count(*) AS cnt FROM base WHERE situacao_pagamento IS NOT NULL AND situacao_pagamento<>'' GROUP BY 1 ORDER BY value DESC LIMIT 10),
rk_fornecedor AS (SELECT fornecedor AS name, COALESCE(sum(valor),0) AS value, count(*) AS cnt FROM base WHERE fornecedor IS NOT NULL AND fornecedor<>'' GROUP BY 1 ORDER BY value DESC LIMIT 10),
rk_cooperativa AS (SELECT cooperativa AS name, COALESCE(sum(valor),0) AS value, count(*) AS cnt FROM base WHERE cooperativa IS NOT NULL AND cooperativa<>'' GROUP BY 1 ORDER BY value DESC LIMIT 10),
rk_forma AS (SELECT forma_pagamento AS name, COALESCE(sum(valor),0) AS value, count(*) AS cnt FROM base WHERE forma_pagamento IS NOT NULL AND forma_pagamento<>'' GROUP BY 1 ORDER BY value DESC LIMIT 10),
rk_regional AS (SELECT regional_calc AS name, COALESCE(sum(valor),0) AS value, count(*) AS cnt FROM base WHERE regional_calc IS NOT NULL GROUP BY 1 ORDER BY value DESC LIMIT 10),
rk_tipoveiculo AS (SELECT tipo_veiculo_calc AS name, COALESCE(sum(valor),0) AS value, count(*) AS cnt FROM base WHERE tipo_veiculo_calc IS NOT NULL GROUP BY 1 ORDER BY value DESC LIMIT 10),
rk_centrocusto AS (SELECT centro_custo AS name, COALESCE(sum(valor),0) AS value, count(*) AS cnt FROM base WHERE centro_custo IS NOT NULL AND centro_custo<>'' GROUP BY 1 ORDER BY value DESC LIMIT 10),
rk_motivo AS (SELECT motivo_evento AS name, COALESCE(sum(valor),0) AS value, count(*) AS cnt FROM base WHERE motivo_evento IS NOT NULL AND motivo_evento<>'' GROUP BY 1 ORDER BY value DESC LIMIT 10),
rk_associado AS (SELECT associado AS name, COALESCE(sum(valor),0) AS value, count(*) AS cnt FROM base WHERE associado IS NOT NULL AND associado<>'' GROUP BY 1 ORDER BY value DESC LIMIT 10),
mes_agg AS (
  SELECT to_char(data_ref,'YYYY-MM') AS mes, count(*) AS cnt, COALESCE(sum(valor),0) AS valor,
    COALESCE(sum(COALESCE(valor_pagamento,valor)) FILTER (WHERE is_pago),0) AS pago
  FROM base WHERE data_ref IS NOT NULL GROUP BY 1 ORDER BY 1
),
dia_agg AS (
  SELECT to_char(data_ref,'YYYY-MM-DD') AS dia, count(*) AS cnt, COALESCE(sum(valor),0) AS valor,
    COALESCE(sum(COALESCE(valor_pagamento,valor)) FILTER (WHERE is_pago),0) AS pago
  FROM base WHERE data_ref IS NOT NULL GROUP BY 1 ORDER BY 1
)
SELECT jsonb_build_object(
  'baseData', lower(coalesce(p_base_data,'vencimento')),
  'totalRegistros', (SELECT total_registros FROM agg),
  'totalRegistrosAtivos', (SELECT total_registros_ativos FROM agg),
  'valorTotal', (SELECT valor_total FROM agg),
  'valorTotalAtivo', (SELECT valor_total_ativo FROM agg),
  'qtdPagos', (SELECT qtd_pagos FROM agg), 'valorPago', (SELECT valor_pago FROM agg),
  'qtdAPagar', (SELECT qtd_a_pagar FROM agg), 'valorAPagar', (SELECT valor_a_pagar FROM agg),
  'qtdVencidos', (SELECT qtd_vencidos FROM agg), 'valorVencido', (SELECT valor_vencido FROM agg),
  'totalMulta', (SELECT total_multa FROM agg), 'totalJuros', (SELECT total_juros FROM agg),
  'ticketMedio', CASE WHEN (SELECT total_registros FROM agg) > 0 THEN (SELECT valor_total FROM agg) / (SELECT total_registros FROM agg) ELSE 0 END,
  'fornecedoresUnicos', (SELECT fornecedores_unicos FROM agg),
  'taxaPagamento', CASE WHEN (SELECT valor_total FROM agg) > 0 THEN (SELECT valor_pago FROM agg) / (SELECT valor_total FROM agg) * 100 ELSE 0 END,
  'qtdAVencer7', (SELECT qtd_av7 FROM agg), 'valorAVencer7', (SELECT valor_av7 FROM agg),
  'qtdAVencer15', (SELECT qtd_av15 FROM agg), 'valorAVencer15', (SELECT valor_av15 FROM agg),
  'qtdAVencer30', (SELECT qtd_av30 FROM agg), 'valorAVencer30', (SELECT valor_av30 FROM agg),
  'qtdAVencer60', (SELECT qtd_av60 FROM agg), 'valorAVencer60', (SELECT valor_av60 FROM agg),
  'qtdAVencer90', (SELECT qtd_av90 FROM agg), 'valorAVencer90', (SELECT valor_av90 FROM agg),
  'qtdCanceladas', (SELECT qtd_canceladas FROM agg), 'qtdExcluidas', (SELECT qtd_excluidas FROM agg), 'qtdEstornadas', (SELECT qtd_estornadas FROM agg),
  'operacaoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value,'count',cnt)) FROM rk_operacao),'[]'::jsonb),
  'subOperacaoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value,'count',cnt)) FROM rk_subop),'[]'::jsonb),
  'situacaoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value,'count',cnt)) FROM rk_situacao),'[]'::jsonb),
  'fornecedorData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value,'count',cnt)) FROM rk_fornecedor),'[]'::jsonb),
  'cooperativaData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value,'count',cnt)) FROM rk_cooperativa),'[]'::jsonb),
  'formaPagamentoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value,'count',cnt)) FROM rk_forma),'[]'::jsonb),
  'regionalData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value,'count',cnt)) FROM rk_regional),'[]'::jsonb),
  'tipoVeiculoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value,'count',cnt)) FROM rk_tipoveiculo),'[]'::jsonb),
  'centroCustoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value,'count',cnt)) FROM rk_centrocusto),'[]'::jsonb),
  'motivoEventoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value,'count',cnt)) FROM rk_motivo),'[]'::jsonb),
  'associadoData', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'value',value,'count',cnt)) FROM rk_associado),'[]'::jsonb),
  'timelineData', COALESCE((SELECT jsonb_agg(jsonb_build_object('mes',mes,'count',cnt,'valor',valor,'pago',pago)) FROM mes_agg),'[]'::jsonb),
  'timelineDiaData', COALESCE((SELECT jsonb_agg(jsonb_build_object('dia',dia,'count',cnt,'valor',valor,'pago',pago)) FROM dia_agg),'[]'::jsonb)
);
$function$;


-- Wrapper de cache: repassa os novos parâmetros e inclui todos na chave.
CREATE OR REPLACE FUNCTION public.get_dashboard_mgf_cached(
  p_corretora_id uuid,
  p_operacao text DEFAULT NULL,
  p_sub_operacao text DEFAULT NULL,
  p_situacao text DEFAULT NULL,
  p_cooperativa text DEFAULT NULL,
  p_regional text DEFAULT NULL,
  p_forma_pagamento text DEFAULT NULL,
  p_tipo_veiculo text DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_max_age_minutes integer DEFAULT 20,
  p_force_refresh boolean DEFAULT false,
  p_base_data text DEFAULT 'vencimento',
  p_operacoes text[] DEFAULT NULL,
  p_sub_operacoes text[] DEFAULT NULL,
  p_situacoes text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_key text; v_payload jsonb;
BEGIN
  v_key := 'dash_mgf_' || md5(
    coalesce(p_corretora_id::text,'')||'|'||coalesce(p_operacao,'')||'|'||coalesce(p_sub_operacao,'')||'|'||
    coalesce(p_situacao,'')||'|'||coalesce(p_cooperativa,'')||'|'||coalesce(p_regional,'')||'|'||
    coalesce(p_forma_pagamento,'')||'|'||coalesce(p_tipo_veiculo,'')||'|'||
    coalesce(p_data_inicio::text,'')||'|'||coalesce(p_data_fim::text,'')||'|'||
    coalesce(lower(p_base_data),'vencimento')||'|'||
    coalesce(array_to_string(p_operacoes,','),'')||'|'||
    coalesce(array_to_string(p_sub_operacoes,','),'')||'|'||
    coalesce(array_to_string(p_situacoes,','),'')
  );
  IF NOT p_force_refresh THEN
    SELECT payload INTO v_payload FROM mgf_dashboard_cache
     WHERE cache_key = v_key AND computed_at > now() - (p_max_age_minutes || ' minutes')::interval;
    IF v_payload IS NOT NULL THEN RETURN v_payload; END IF;
  END IF;
  v_payload := calcular_dashboard_mgf(
    p_corretora_id, p_operacao, p_sub_operacao, p_situacao, p_cooperativa, p_regional,
    p_forma_pagamento, p_tipo_veiculo, p_data_inicio, p_data_fim,
    p_base_data, p_operacoes, p_sub_operacoes, p_situacoes
  );
  INSERT INTO mgf_dashboard_cache (cache_key, payload, computed_at)
  VALUES (v_key, v_payload, now())
  ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at;
  RETURN v_payload;
END;
$function$;
