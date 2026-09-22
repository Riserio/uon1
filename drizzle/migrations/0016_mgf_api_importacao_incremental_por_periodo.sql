CREATE OR REPLACE FUNCTION public.importar_mgf_api_periodo(
  p_corretora_id uuid,
  p_inicio date,
  p_fim date,
  p_max_paginas int DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base text; v_tok text; v_resp record; v_payload jsonb; v_ret jsonb;
  v_len int; v_api_token text; v_user text; v_pass text;
  v_imp uuid; v_total int := 0; v_ins int; v_existing_total int := 0;
  v_pag int := 0; v_paginas int := 0; v_guard int := 0;
  v_map_op jsonb := '{}'::jsonb; v_map_sub jsonb := '{}'::jsonb; v_map_forn jsonb := '{}'::jsonb;
BEGIN
  SELECT api_token, trim(hinova_user), hinova_pass, COALESCE(api_base_url,'https://api.hinova.com.br/api/sga/v2')
    INTO v_api_token, v_user, v_pass, v_base
  FROM public.hinova_credenciais WHERE corretora_id = p_corretora_id;

  IF v_api_token IS NULL OR v_user IS NULL OR v_pass IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'API não configurada');
  END IF;

  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT','120');
  PERFORM extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT','20');

  SELECT * INTO v_resp FROM extensions.http(('POST', v_base || '/usuario/autenticar',
    ARRAY[extensions.http_header('Authorization','Bearer ' || v_api_token)], 'application/json',
    json_build_object('usuario', v_user, 'senha', v_pass)::text)::extensions.http_request);
  BEGIN v_payload := NULLIF(v_resp.content,'')::jsonb; EXCEPTION WHEN OTHERS THEN v_payload := NULL; END;
  v_tok := v_payload ->> 'token_usuario';
  IF v_tok IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', COALESCE(v_payload ->> 'mensagem','Falha auth'), 'http_status', v_resp.status);
  END IF;

  BEGIN
    SELECT * INTO v_resp FROM extensions.http(('GET', v_base || '/mgf-operacao/listar',
      ARRAY[extensions.http_header('Authorization','Bearer ' || v_tok)], 'application/json', NULL)::extensions.http_request);
    SELECT COALESCE(jsonb_object_agg(e->>'codigo_operacao', e->>'descricao'),'{}'::jsonb) INTO v_map_op
    FROM jsonb_array_elements(NULLIF(v_resp.content,'')::jsonb) e WHERE e ? 'codigo_operacao';
  EXCEPTION WHEN OTHERS THEN v_map_op := '{}'::jsonb; END;

  BEGIN
    SELECT * INTO v_resp FROM extensions.http(('GET', v_base || '/mgf-suboperacao/listar/ATIVO',
      ARRAY[extensions.http_header('Authorization','Bearer ' || v_tok)], 'application/json', NULL)::extensions.http_request);
    SELECT COALESCE(jsonb_object_agg(e->>'codigo_suboperacao', e->>'descricao'),'{}'::jsonb) INTO v_map_sub
    FROM jsonb_array_elements(NULLIF(v_resp.content,'')::jsonb) e WHERE e ? 'codigo_suboperacao';
  EXCEPTION WHEN OTHERS THEN v_map_sub := '{}'::jsonb; END;

  BEGIN
    SELECT * INTO v_resp FROM extensions.http(('GET', v_base || '/listar/fornecedor/todos',
      ARRAY[extensions.http_header('Authorization','Bearer ' || v_tok)], 'application/json', NULL)::extensions.http_request);
    SELECT COALESCE(jsonb_object_agg(e->>'codigo_fornecedor', COALESCE(NULLIF(e->>'nome',''), e->>'nome_fantasia', e->>'razao_social')),'{}'::jsonb) INTO v_map_forn
    FROM jsonb_array_elements(NULLIF(v_resp.content,'')::jsonb) e WHERE e ? 'codigo_fornecedor';
  EXCEPTION WHEN OTHERS THEN v_map_forn := '{}'::jsonb; END;

  SELECT id INTO v_imp FROM public.mgf_importacoes
  WHERE corretora_id = p_corretora_id AND nome_arquivo = 'API MGF (incremento)' LIMIT 1;

  IF v_imp IS NULL THEN
    INSERT INTO public.mgf_importacoes (corretora_id, nome_arquivo, total_registros, ativo)
    VALUES (p_corretora_id, 'API MGF (incremento)', 0, true) RETURNING id INTO v_imp;
  END IF;

  SELECT count(*) INTO v_existing_total FROM public.mgf_dados WHERE importacao_id = v_imp;

  CREATE TEMP TABLE IF NOT EXISTS tmp_mgf_api_rows (LIKE public.mgf_dados INCLUDING DEFAULTS) ON COMMIT DROP;
  TRUNCATE tmp_mgf_api_rows;

  LOOP
    v_guard := v_guard + 1;

    SELECT * INTO v_resp FROM extensions.http(('POST', v_base || '/mgf-lancamento/listar',
      ARRAY[extensions.http_header('Authorization','Bearer ' || v_tok)], 'application/json',
      json_build_object(
        'data_vencimento_inicial', to_char(p_inicio,'DD/MM/YYYY'),
        'data_vencimento_final', to_char(p_fim,'DD/MM/YYYY'),
        'quantidade_por_pagina', 1000,
        'inicio_paginacao', v_pag
      )::text)::extensions.http_request);

    BEGIN v_payload := NULLIF(v_resp.content,'')::jsonb; EXCEPTION WHEN OTHERS THEN v_payload := NULL; END;
    v_paginas := COALESCE(NULLIF(regexp_replace(COALESCE(v_payload ->> 'numero_paginas',''),'[^0-9]','','g'),'')::int, v_paginas);
    v_ret := public.extract_hinova_mgf_array(v_payload);

    IF v_ret IS NULL OR jsonb_typeof(v_ret) <> 'array' THEN
      IF v_pag = 0 THEN
        RETURN jsonb_build_object('success', COALESCE(v_resp.status,0) BETWEEN 200 AND 299,
          'modulo','mgf','incremento',0,'total',v_existing_total,'preservado',true,
          'message','API MGF sem lançamentos no período; dados anteriores preservados.',
          'http_status', v_resp.status);
      END IF;
      EXIT;
    END IF;

    v_len := jsonb_array_length(v_ret);

    IF v_pag = 0 AND v_len = 0 THEN
      RETURN jsonb_build_object('success', true,'modulo','mgf','incremento',0,'total',v_existing_total,
        'preservado', true,'message','API MGF retornou lista vazia; dados anteriores preservados.');
    END IF;

    INSERT INTO tmp_mgf_api_rows (importacao_id, operacao, sub_operacao, centro_custo, descricao, situacao_pagamento,
      fornecedor, forma_pagamento, data_vencimento, data_pagamento, valor, valor_pagamento,
      nota_fiscal, controle_interno, protocolo_evento, valor_total_lancamento, data_nota_fiscal,
      data_cadastro, quantidade_parcela, mes_referente, dados_extras)
    SELECT v_imp,
      CASE
        WHEN COALESCE(v_map_op ->> (L ->> 'codigo_operacao'),'') ILIKE '%RECEBER%' THEN 'ENTRADA'
        WHEN COALESCE(v_map_op ->> (L ->> 'codigo_operacao'),'') ILIKE '%PAGAR%' THEN 'SAIDA'
        WHEN (L ->> 'codigo_operacao') = '1' THEN 'ENTRADA'
        WHEN (L ->> 'codigo_operacao') = '2' THEN 'SAIDA'
        ELSE NULL END,
      NULLIF(v_map_sub ->> (L ->> 'codigo_suboperacao'),''),
      NULLIF(v_map_sub ->> (L ->> 'codigo_suboperacao'),''),
      NULLIF(L ->> 'observacao',''),
      NULLIF(L ->> 'situacao',''),
      NULLIF(v_map_forn ->> (L ->> 'codigo_fornecedor'),''),
      NULLIF(L ->> 'forma_pagamento',''),
      public.hinova_dateiso(L ->> 'data_vencimento'),
      public.hinova_dateiso(L ->> 'data_pagamento'),
      public.hinova_num(L ->> 'valor'),
      CASE WHEN upper(COALESCE(L ->> 'situacao','')) LIKE 'PAG%'
           THEN COALESCE(public.hinova_num(L ->> 'valor_pago'), public.hinova_num(L ->> 'valor'), 0) ELSE 0 END,
      NULLIF(L ->> 'nota_fiscal_numero',''),
      NULLIF(L ->> 'controle_interno',''),
      NULLIF(L ->> 'protocolo_evento',''),
      public.hinova_num(L ->> 'valor_base'),
      public.hinova_dateiso(L ->> 'data_emissao_nota_fiscal'),
      public.hinova_dateiso(L ->> 'data_cadastro'),
      NULLIF(regexp_replace(COALESCE(L ->> 'quantidade_parcela',''),'[^0-9]','','g'),'')::int,
      to_char(public.hinova_dateiso(L ->> 'data_vencimento'),'MM/YYYY'),
      jsonb_build_object(
        'codigo_lancamento', L ->> 'codigo_lancamento',
        'codigo_cooperativa', L ->> 'codigo_cooperativa',
        'codigo_regional', L ->> 'codigo_regional',
        'codigo_operacao', L ->> 'codigo_operacao',
        'codigo_suboperacao', L ->> 'codigo_suboperacao',
        'codigo_subsuboperacao', L ->> 'codigo_subsuboperacao',
        'codigo_fornecedor', L ->> 'codigo_fornecedor',
        'codigo_associado', L ->> 'codigo_associado',
        'codigo_veiculo', L ->> 'codigo_veiculo'
      )
    FROM jsonb_array_elements(v_ret) L;

    GET DIAGNOSTICS v_ins = ROW_COUNT;
    v_total := v_total + v_ins;

    EXIT WHEN v_len < 1000 OR v_guard >= p_max_paginas OR (v_paginas > 0 AND v_pag >= v_paginas - 1);
    v_pag := v_pag + 1;
  END LOOP;

  IF v_total > 0 THEN
    DELETE FROM public.mgf_dados d
    WHERE d.importacao_id = v_imp
      AND d.data_vencimento IS NOT NULL
      AND d.data_vencimento BETWEEN p_inicio AND p_fim;

    -- registros legados sem data de vencimento e sem valor nao tem utilidade
    DELETE FROM public.mgf_dados d
    WHERE d.importacao_id = v_imp AND d.valor IS NULL AND d.operacao IS NULL;

    INSERT INTO public.mgf_dados (importacao_id, operacao, sub_operacao, centro_custo, descricao, situacao_pagamento,
      fornecedor, forma_pagamento, data_vencimento, data_pagamento, valor, valor_pagamento,
      nota_fiscal, controle_interno, protocolo_evento, valor_total_lancamento, data_nota_fiscal,
      data_cadastro, quantidade_parcela, mes_referente, dados_extras)
    SELECT importacao_id, operacao, sub_operacao, centro_custo, descricao, situacao_pagamento,
      fornecedor, forma_pagamento, data_vencimento, data_pagamento, valor, valor_pagamento,
      nota_fiscal, controle_interno, protocolo_evento, valor_total_lancamento, data_nota_fiscal,
      data_cadastro, quantidade_parcela, mes_referente, dados_extras
    FROM tmp_mgf_api_rows;
  END IF;

  SELECT count(*) INTO v_existing_total FROM public.mgf_dados WHERE importacao_id = v_imp;
  UPDATE public.mgf_importacoes SET total_registros = v_existing_total, updated_at = now() WHERE id = v_imp;

  UPDATE public.mgf_automacao_config
  SET ultimo_status='sucesso', ultimo_erro=NULL, ultima_execucao=now(), ultima_origem='api'
  WHERE corretora_id = p_corretora_id;

  DELETE FROM public.mgf_dashboard_cache WHERE true;

  RETURN jsonb_build_object('success', true, 'modulo','mgf','paginas', v_guard,
    'incremento', v_total, 'total', v_existing_total,
    'periodo', to_char(p_inicio,'DD/MM/YYYY') || ' - ' || to_char(p_fim,'DD/MM/YYYY'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.importar_mgf_api(p_corretora_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- janela incremental diaria: 120 dias para tras, 365 para frente
  RETURN public.importar_mgf_api_periodo(p_corretora_id, current_date - 120, current_date + 365, 25);
END;
$function$;

REVOKE ALL ON FUNCTION public.importar_mgf_api_periodo(uuid, date, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.importar_mgf_api_periodo(uuid, date, date, int) TO service_role;