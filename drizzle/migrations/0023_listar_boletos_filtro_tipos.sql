DROP FUNCTION IF EXISTS public.listar_cobranca_boletos_dedup(uuid[],text,text,text,text,integer,text,date,date,date,date,text,text,text,text,integer,integer);
CREATE OR REPLACE FUNCTION public.listar_cobranca_boletos_dedup(p_importacao_ids uuid[], p_mes_referencia text DEFAULT NULL::text, p_situacao text DEFAULT NULL::text, p_regional text DEFAULT NULL::text, p_cooperativa text DEFAULT NULL::text, p_dia_vencimento integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text, p_data_pagamento_de date DEFAULT NULL::date, p_data_pagamento_ate date DEFAULT NULL::date, p_data_vencimento_de date DEFAULT NULL::date, p_data_vencimento_ate date DEFAULT NULL::date, p_voluntario text DEFAULT NULL::text, p_placas text DEFAULT NULL::text, p_sort_col text DEFAULT 'data_vencimento'::text, p_sort_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_tipos text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET work_mem TO '256MB'
AS $function$
DECLARE
  v_sort_col text;
  v_sort_dir text;
  v_sql text;
  v_result jsonb;
  v_tipos text[];
BEGIN
  v_sort_col := CASE p_sort_col
    WHEN 'nome' THEN 'nome'
    WHEN 'valor' THEN 'valor'
    WHEN 'data_vencimento' THEN 'data_vencimento'
    WHEN 'data_pagamento' THEN 'data_pagamento'
    WHEN 'situacao' THEN 'situacao'
    WHEN 'dia_vencimento_veiculo' THEN 'dia_vencimento_veiculo'
    WHEN 'qtde_dias_atraso_vencimento_original' THEN 'qtde_dias_atraso_vencimento_original'
    ELSE 'data_vencimento'
  END;
  v_sort_dir := CASE WHEN lower(coalesce(p_sort_dir,'desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  v_tipos := CASE WHEN p_tipos IS NULL OR cardinality(p_tipos) = 0 THEN NULL
                  ELSE (SELECT array_agg(upper(btrim(t))) FROM unnest(p_tipos) t) END;

  v_sql := format($f$
    WITH deduped AS MATERIALIZED (
      SELECT DISTINCT ON (cb.dedup_key)
        cb.id, cb.nome, cb.placas, cb.valor, cb.situacao, cb.voluntario,
        cb.regional_boleto, cb.cooperativa, cb.dia_vencimento_veiculo,
        cb.data_vencimento, cb.data_vencimento_original, cb.data_pagamento,
        cb.qtde_dias_atraso_vencimento_original,
        COALESCE(nullif(upper(btrim(cb.dados_extras->>'tipo_boleto')),''), 'SEM TIPO') AS tipo_boleto
      FROM cobranca_boletos cb
      WHERE cb.importacao_id = ANY($1)
      ORDER BY cb.dedup_key, cb.valor DESC NULLS LAST
    ),
    filtrado AS MATERIALIZED (
      SELECT d.*
      FROM deduped d
      WHERE upper(coalesce(d.situacao,'')) <> 'CANCELADO'
        AND ($16 IS NULL OR d.tipo_boleto = ANY($16))
        AND ($2 IS NULL OR to_char(COALESCE(d.data_vencimento_original, d.data_vencimento), 'YYYY-MM') = $2)
        AND ($3 IS NULL OR upper(d.situacao) = upper($3))
        AND ($4 IS NULL OR d.regional_boleto = $4)
        AND ($5 IS NULL OR d.cooperativa = $5)
        AND ($6 IS NULL OR d.dia_vencimento_veiculo = $6)
        AND ($7 IS NULL OR d.data_pagamento >= $7)
        AND ($8 IS NULL OR d.data_pagamento <= $8)
        AND ($9 IS NULL OR d.data_vencimento >= $9)
        AND ($10 IS NULL OR d.data_vencimento <= $10)
        AND ($11 IS NULL OR d.voluntario ILIKE '%%' || $11 || '%%')
        AND ($12 IS NULL OR d.placas ILIKE '%%' || $12 || '%%')
        AND ($13 IS NULL OR (
          d.nome ILIKE '%%' || $13 || '%%' OR
          d.placas ILIKE '%%' || $13 || '%%' OR
          d.voluntario ILIKE '%%' || $13 || '%%' OR
          d.regional_boleto ILIKE '%%' || $13 || '%%' OR
          d.cooperativa ILIKE '%%' || $13 || '%%'
        ))
    ),
    total AS MATERIALIZED (
      SELECT count(*) AS total_count FROM filtrado
    ),
    paged AS MATERIALIZED (
      SELECT * FROM filtrado ORDER BY %I %s NULLS LAST LIMIT $14 OFFSET $15
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
  $f$, v_sort_col, v_sort_dir);

  EXECUTE v_sql
  INTO v_result
  USING p_importacao_ids, p_mes_referencia, p_situacao, p_regional, p_cooperativa, p_dia_vencimento,
        p_data_pagamento_de, p_data_pagamento_ate, p_data_vencimento_de, p_data_vencimento_ate,
        p_voluntario, p_placas, p_search, p_limit, p_offset, v_tipos;

  RETURN v_result;
END;
$function$;