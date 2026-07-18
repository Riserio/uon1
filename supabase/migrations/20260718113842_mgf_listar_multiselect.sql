-- ============================================================================
-- MGF · Dados Completos: aceitar seleção MÚLTIPLA (dossiê) e a mesma base de
-- data do dashboard, para tabela e dashboard nunca divergirem.
--
-- Novos parâmetros (todos com default = comportamento atual):
--   p_base_data     'vencimento' (default) | 'pagamento'
--   p_operacoes     text[]  -> Entrada e Saída juntas
--   p_sub_operacoes text[]  -> várias subOperações no mesmo filtro
--   p_situacoes     text[]
--
-- DROP explícito da assinatura antiga: adicionar parâmetros a uma função cria
-- SOBRECARGA (não substitui) e a chamada fica ambígua ("function is not
-- unique"), que foi o que derrubou o dashboard hoje.
-- ============================================================================

DROP FUNCTION IF EXISTS public.listar_mgf_paginado(
  uuid, text, text, text, text, text, text, text, date, date,
  text, text, text, text, text, date, date,
  boolean, boolean, boolean, boolean,
  integer, date, date, text, integer, integer
);

CREATE OR REPLACE FUNCTION public.listar_mgf_paginado(
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
  t_placa_evento text DEFAULT NULL,
  t_fornecedor text DEFAULT NULL,
  t_operacao text DEFAULT NULL,
  t_sub_operacao text DEFAULT NULL,
  t_centro_custo text DEFAULT NULL,
  t_data_pagamento_inicio date DEFAULT NULL,
  t_data_pagamento_fim date DEFAULT NULL,
  p_status_a_vencer boolean DEFAULT true,
  p_status_vencido boolean DEFAULT true,
  p_status_pago boolean DEFAULT false,
  p_status_inativo boolean DEFAULT false,
  p_periodo_dias integer DEFAULT 7,
  p_periodo_custom_inicio date DEFAULT NULL,
  p_periodo_custom_fim date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
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
  v_total int; v_rows jsonb; v_offset int;
BEGIN
  v_offset := GREATEST(0, (p_page - 1) * p_page_size);

  CREATE TEMP TABLE _mgf_f ON COMMIT DROP AS
  SELECT d.*,
    COALESCE(NULLIF(d.regional,''), NULLIF(d.regional_evento,'')) AS regional_calc,
    COALESCE(NULLIF(d.tipo_veiculo,''), NULLIF(d.categoria_veiculo,'')) AS tipo_veiculo_calc,
    (d.situacao_pagamento ILIKE '%pago%' OR d.situacao_pagamento ILIKE '%paga%' OR d.data_pagamento IS NOT NULL) AS is_pago,
    (d.situacao_pagamento ILIKE '%cancel%' OR d.situacao_pagamento ILIKE '%exclu%' OR d.situacao_pagamento ILIKE '%estorn%') AS is_inativo
  FROM mgf_dados d
  WHERE d.importacao_id = ANY(SELECT id FROM mgf_importacoes WHERE corretora_id = p_corretora_id AND ativo = true)
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
    -- Base de data igual à do dashboard (vencimento por padrão; pagamento quando pedido)
    AND (p_data_inicio IS NULL OR
         (CASE WHEN lower(coalesce(p_base_data,'vencimento')) = 'pagamento'
               THEN d.data_pagamento
               ELSE COALESCE(d.data_vencimento, d.data_evento, d.data_nota_fiscal) END) >= p_data_inicio)
    AND (p_data_fim IS NULL OR
         (CASE WHEN lower(coalesce(p_base_data,'vencimento')) = 'pagamento'
               THEN d.data_pagamento
               ELSE COALESCE(d.data_vencimento, d.data_evento, d.data_nota_fiscal) END) <= p_data_fim)
    AND (t_placa_evento IS NULL OR d.veiculo_evento ILIKE '%'||t_placa_evento||'%')
    AND (t_fornecedor IS NULL OR d.fornecedor = t_fornecedor)
    AND (t_operacao IS NULL OR d.operacao = t_operacao)
    AND (t_sub_operacao IS NULL OR d.sub_operacao = t_sub_operacao)
    AND (t_centro_custo IS NULL OR d.centro_custo = t_centro_custo)
    AND (t_data_pagamento_inicio IS NULL OR d.data_pagamento >= t_data_pagamento_inicio)
    AND (t_data_pagamento_fim IS NULL OR d.data_pagamento <= t_data_pagamento_fim)
    AND (p_search IS NULL OR p_search = '' OR (
      d.operacao ILIKE '%'||p_search||'%' OR d.sub_operacao ILIKE '%'||p_search||'%'
      OR d.descricao ILIKE '%'||p_search||'%' OR d.fornecedor ILIKE '%'||p_search||'%'
      OR d.centro_custo ILIKE '%'||p_search||'%' OR d.situacao_pagamento ILIKE '%'||p_search||'%'
      OR d.controle_interno ILIKE '%'||p_search||'%' OR d.veiculo_evento ILIKE '%'||p_search||'%'
    ))
    -- janela de período (vencimento) — comportamento original preservado
    AND (
      CASE WHEN p_periodo_custom_inicio IS NOT NULL THEN
        d.data_vencimento IS NOT NULL
        AND d.data_vencimento >= p_periodo_custom_inicio
        AND (p_periodo_custom_fim IS NULL OR d.data_vencimento <= p_periodo_custom_fim)
      ELSE
        d.data_vencimento IS NOT NULL
        AND d.data_vencimento >= CURRENT_DATE - COALESCE(p_periodo_dias,7)
        AND d.data_vencimento <= CURRENT_DATE + COALESCE(p_periodo_dias,7)
      END
    );

  -- status rápido (a_vencer / vencido / pago / inativo)
  DELETE FROM _mgf_f WHERE NOT (
    (p_status_a_vencer AND NOT is_inativo AND NOT is_pago AND data_vencimento >= CURRENT_DATE)
    OR (p_status_vencido AND NOT is_inativo AND NOT is_pago AND data_vencimento < CURRENT_DATE)
    OR (p_status_pago AND NOT is_inativo AND is_pago)
    OR (p_status_inativo AND is_inativo)
  );

  SELECT count(*) INTO v_total FROM _mgf_f;
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT * FROM _mgf_f
    ORDER BY data_vencimento ASC NULLS LAST
    LIMIT p_page_size OFFSET v_offset
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'totalCount', v_total);
END;
$function$;
