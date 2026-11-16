CREATE OR REPLACE FUNCTION public.pode_ver_corretora(_corretora_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR public.is_equipe_interna(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.corretora_usuarios cu
        WHERE cu.profile_id = auth.uid() AND cu.ativo = true AND cu.corretora_id = _corretora_id
      )
$$;
REVOKE EXECUTE ON FUNCTION public.pode_ver_corretora(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_corretora(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.listar_cobranca_boletos_dedup(p_importacao_ids uuid[], p_mes_referencia text DEFAULT NULL::text, p_situacao text DEFAULT NULL::text, p_regional text DEFAULT NULL::text, p_cooperativa text DEFAULT NULL::text, p_dia_vencimento integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text, p_data_pagamento_de date DEFAULT NULL::date, p_data_pagamento_ate date DEFAULT NULL::date, p_data_vencimento_de date DEFAULT NULL::date, p_data_vencimento_ate date DEFAULT NULL::date, p_voluntario text DEFAULT NULL::text, p_placas text DEFAULT NULL::text, p_sort_col text DEFAULT 'data_vencimento'::text, p_sort_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_tipos text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET work_mem TO '256MB'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_col text;
  v_asc boolean;
  v_result jsonb;
  v_tipos text[];
BEGIN
  IF EXISTS (
    SELECT 1 FROM cobranca_importacoes ci
    WHERE ci.id = ANY(p_importacao_ids) AND NOT public.pode_ver_corretora(ci.corretora_id)
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta associação' USING ERRCODE = '42501';
  END IF;

  v_col := CASE WHEN p_sort_col IN ('nome','valor','data_vencimento','data_pagamento','situacao','dia_vencimento_veiculo','qtde_dias_atraso_vencimento_original')
                THEN p_sort_col ELSE 'data_vencimento' END;
  v_asc := lower(coalesce(p_sort_dir,'desc')) = 'asc';
  v_tipos := CASE WHEN p_tipos IS NULL OR cardinality(p_tipos) = 0 THEN NULL
                  ELSE (SELECT array_agg(upper(btrim(t))) FROM unnest(p_tipos) t) END;

  WITH deduped AS MATERIALIZED (
    SELECT DISTINCT ON (cb.dedup_key)
      cb.id, cb.nome, cb.placas, cb.valor, cb.situacao, cb.voluntario,
      cb.regional_boleto, cb.cooperativa, cb.dia_vencimento_veiculo,
      cb.data_vencimento, cb.data_vencimento_original, cb.data_pagamento,
      cb.qtde_dias_atraso_vencimento_original,
      COALESCE(nullif(upper(btrim(cb.dados_extras->>'tipo_boleto')),''), 'SEM TIPO') AS tipo_boleto
    FROM cobranca_boletos cb
    WHERE cb.importacao_id = ANY(p_importacao_ids)
    ORDER BY cb.dedup_key, cb.valor DESC NULLS LAST
  ),
  filtrado AS MATERIALIZED (
    SELECT d.*
    FROM deduped d
    WHERE upper(coalesce(d.situacao,'')) <> 'CANCELADO'
      AND (v_tipos IS NULL OR d.tipo_boleto = ANY(v_tipos))
      AND (p_mes_referencia IS NULL OR to_char(COALESCE(d.data_vencimento_original, d.data_vencimento), 'YYYY-MM') = p_mes_referencia)
      AND (p_situacao IS NULL OR upper(d.situacao) = upper(p_situacao))
      AND (p_regional IS NULL OR d.regional_boleto = p_regional)
      AND (p_cooperativa IS NULL OR d.cooperativa = p_cooperativa)
      AND (p_dia_vencimento IS NULL OR d.dia_vencimento_veiculo = p_dia_vencimento)
      AND (p_data_pagamento_de IS NULL OR d.data_pagamento >= p_data_pagamento_de)
      AND (p_data_pagamento_ate IS NULL OR d.data_pagamento <= p_data_pagamento_ate)
      AND (p_data_vencimento_de IS NULL OR d.data_vencimento >= p_data_vencimento_de)
      AND (p_data_vencimento_ate IS NULL OR d.data_vencimento <= p_data_vencimento_ate)
      AND (p_voluntario IS NULL OR d.voluntario ILIKE '%' || p_voluntario || '%')
      AND (p_placas IS NULL OR d.placas ILIKE '%' || p_placas || '%')
      AND (p_search IS NULL OR (
        d.nome ILIKE '%' || p_search || '%' OR
        d.placas ILIKE '%' || p_search || '%' OR
        d.voluntario ILIKE '%' || p_search || '%' OR
        d.regional_boleto ILIKE '%' || p_search || '%' OR
        d.cooperativa ILIKE '%' || p_search || '%'
      ))
  ),
  total AS MATERIALIZED (
    SELECT count(*) AS total_count FROM filtrado
  ),
  paged AS MATERIALIZED (
    SELECT * FROM filtrado f
    ORDER BY
      CASE WHEN v_asc AND v_col = 'nome' THEN f.nome END ASC NULLS LAST,
      CASE WHEN NOT v_asc AND v_col = 'nome' THEN f.nome END DESC NULLS LAST,
      CASE WHEN v_asc AND v_col = 'valor' THEN f.valor END ASC NULLS LAST,
      CASE WHEN NOT v_asc AND v_col = 'valor' THEN f.valor END DESC NULLS LAST,
      CASE WHEN v_asc AND v_col = 'data_vencimento' THEN f.data_vencimento END ASC NULLS LAST,
      CASE WHEN NOT v_asc AND v_col = 'data_vencimento' THEN f.data_vencimento END DESC NULLS LAST,
      CASE WHEN v_asc AND v_col = 'data_pagamento' THEN f.data_pagamento END ASC NULLS LAST,
      CASE WHEN NOT v_asc AND v_col = 'data_pagamento' THEN f.data_pagamento END DESC NULLS LAST,
      CASE WHEN v_asc AND v_col = 'situacao' THEN f.situacao END ASC NULLS LAST,
      CASE WHEN NOT v_asc AND v_col = 'situacao' THEN f.situacao END DESC NULLS LAST,
      CASE WHEN v_asc AND v_col = 'dia_vencimento_veiculo' THEN f.dia_vencimento_veiculo END ASC NULLS LAST,
      CASE WHEN NOT v_asc AND v_col = 'dia_vencimento_veiculo' THEN f.dia_vencimento_veiculo END DESC NULLS LAST,
      CASE WHEN v_asc AND v_col = 'qtde_dias_atraso_vencimento_original' THEN f.qtde_dias_atraso_vencimento_original END ASC NULLS LAST,
      CASE WHEN NOT v_asc AND v_col = 'qtde_dias_atraso_vencimento_original' THEN f.qtde_dias_atraso_vencimento_original END DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'nome', nome, 'placas', placas, 'valor', valor, 'situacao', situacao,
      'voluntario', voluntario, 'regional_boleto', regional_boleto, 'cooperativa', cooperativa,
      'dia_vencimento_veiculo', dia_vencimento_veiculo, 'data_vencimento', data_vencimento,
      'data_vencimento_original', data_vencimento_original, 'data_pagamento', data_pagamento,
      'qtde_dias_atraso_vencimento_original', qtde_dias_atraso_vencimento_original,
      'tipo_boleto', tipo_boleto
    )) FROM paged), '[]'::jsonb),
    'totalCount', (SELECT total_count FROM total)
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_eventos_paginado(p_corretora_id uuid, p_status text DEFAULT 'em_andamento'::text, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date, p_regional text DEFAULT NULL::text, p_cooperativa text DEFAULT NULL::text, p_tipo_veiculo text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_filter_estado text DEFAULT NULL::text, p_filter_motivo text DEFAULT NULL::text, p_filter_situacao text DEFAULT NULL::text, p_sort_field text DEFAULT 'data_evento'::text, p_sort_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_importacao_id uuid;
  v_total int;
  v_rows jsonb;
  v_offset int;
  v_col text;
  v_asc boolean;
BEGIN
  IF NOT public.pode_ver_corretora(p_corretora_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta associação' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_importacao_id FROM sga_importacoes WHERE corretora_id = p_corretora_id AND ativo = true ORDER BY created_at DESC LIMIT 1;

  v_col := CASE WHEN p_sort_field IN ('evento_estado','data_evento','custo_evento','valor_reparo') THEN p_sort_field ELSE 'data_evento' END;
  v_asc := lower(p_sort_dir) = 'asc';
  v_offset := GREATEST(0, (p_page - 1) * p_page_size);

  CREATE TEMP TABLE _ev_filtered ON COMMIT DROP AS
  SELECT e.*,
    CASE
      WHEN e.modelo_veiculo IS NULL OR e.modelo_veiculo = '' THEN 'Passeio'
      WHEN lower(e.modelo_veiculo) ~ 'moto|honda|yamaha|suzuki|kawasaki' THEN 'Motocicleta'
      WHEN lower(e.modelo_veiculo) ~ 'caminhao|caminhão|truck|scania|volvo' THEN 'Caminhão'
      WHEN lower(e.modelo_veiculo) ~ 'van|furgao|sprinter' THEN 'Van/Utilitário'
      ELSE 'Passeio'
    END AS tipo_veiculo_calc
  FROM sga_eventos e
  WHERE e.importacao_id = v_importacao_id
    AND e.placa IS NOT NULL AND trim(e.placa) <> '' AND lower(trim(e.placa)) <> 'placa'
    AND (p_status <> 'em_andamento' OR (e.situacao_evento IS NOT NULL AND e.situacao_evento <> '' AND upper(e.situacao_evento) NOT LIKE '%FINALIZADO%'))
    AND (p_data_inicio IS NULL OR COALESCE(e.data_cadastro_evento, e.data_evento) >= p_data_inicio)
    AND (p_data_fim IS NULL OR COALESCE(e.data_cadastro_evento, e.data_evento) <= p_data_fim)
    AND (p_regional IS NULL OR e.regional = p_regional)
    AND (p_cooperativa IS NULL OR e.cooperativa = p_cooperativa)
    AND (p_filter_estado IS NULL OR e.evento_estado = p_filter_estado)
    AND (p_filter_motivo IS NULL OR e.motivo_evento = p_filter_motivo)
    AND (p_filter_situacao IS NULL OR e.situacao_evento = p_filter_situacao)
    AND (p_search IS NULL OR p_search = '' OR (
      e.placa ILIKE '%'||p_search||'%' OR e.modelo_veiculo ILIKE '%'||p_search||'%' OR
      e.regional ILIKE '%'||p_search||'%' OR e.cooperativa ILIKE '%'||p_search||'%' OR e.voluntario ILIKE '%'||p_search||'%'
    ));

  DELETE FROM _ev_filtered WHERE p_tipo_veiculo IS NOT NULL AND tipo_veiculo_calc <> p_tipo_veiculo;

  SELECT count(*) INTO v_total FROM _ev_filtered;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_rows FROM (
    SELECT * FROM _ev_filtered f
    ORDER BY
      CASE WHEN v_asc AND v_col = 'evento_estado' THEN f.evento_estado END ASC NULLS LAST,
      CASE WHEN NOT v_asc AND v_col = 'evento_estado' THEN f.evento_estado END DESC NULLS LAST,
      CASE WHEN v_asc AND v_col = 'data_evento' THEN f.data_evento END ASC NULLS LAST,
      CASE WHEN NOT v_asc AND v_col = 'data_evento' THEN f.data_evento END DESC NULLS LAST,
      CASE WHEN v_asc AND v_col = 'custo_evento' THEN f.custo_evento END ASC NULLS LAST,
      CASE WHEN NOT v_asc AND v_col = 'custo_evento' THEN f.custo_evento END DESC NULLS LAST,
      CASE WHEN v_asc AND v_col = 'valor_reparo' THEN f.valor_reparo END ASC NULLS LAST,
      CASE WHEN NOT v_asc AND v_col = 'valor_reparo' THEN f.valor_reparo END DESC NULLS LAST
    LIMIT p_page_size OFFSET v_offset
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'totalCount', v_total);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.listar_cobranca_boletos_dedup(uuid[], text, text, text, text, int4, text, date, date, date, date, text, text, text, text, int4, int4, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_cobranca_boletos_dedup(uuid[], text, text, text, text, int4, text, date, date, date, date, text, text, text, text, int4, int4, text[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.listar_eventos_paginado(uuid, text, date, date, text, text, text, text, text, text, text, text, text, int4, int4) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_eventos_paginado(uuid, text, date, date, text, text, text, text, text, text, text, text, text, int4, int4) TO authenticated, service_role;