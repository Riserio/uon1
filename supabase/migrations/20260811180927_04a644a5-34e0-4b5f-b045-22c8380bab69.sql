CREATE OR REPLACE FUNCTION public.hinova_jsonb(p_text text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN RETURN NULL; END IF;
  RETURN p_text::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.hinova_jsonb(text) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.importar_eventos_api(p_corretora_id uuid, p_full boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET statement_timeout TO '10min'
AS $function$
DECLARE
  v_base text; v_tok text; v_resp record; v_arr jsonb;
  v_api_token text; v_user text; v_pass text;
  v_imp uuid; v_novo boolean := false; v_novos int := 0; v_atualiz int := 0; v_ins int;
  v_fim date := current_date; v_cursor date; v_janfim date; v_guard int := 0;
  v_desde date; v_jan_ok int := 0; v_jan_erro int := 0;
  v_fin text := 'FINALIZ|CANCELAD|NEGAD|CONCLU|ENCERRAD|INDENIZ|ARQUIV|BAIXAD';
BEGIN
  SELECT api_token, trim(hinova_user), hinova_pass, COALESCE(api_base_url,'https://api.hinova.com.br/api/sga/v2')
    INTO v_api_token, v_user, v_pass, v_base FROM hinova_credenciais WHERE corretora_id=p_corretora_id;
  IF v_api_token IS NULL THEN RETURN jsonb_build_object('success',false,'message','API não configurada'); END IF;

  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT','180');
  BEGIN
    SELECT * INTO v_resp FROM extensions.http(('POST', v_base||'/usuario/autenticar',
      ARRAY[extensions.http_header('Authorization','Bearer '||v_api_token)], 'application/json',
      json_build_object('usuario',v_user,'senha',v_pass)::text)::extensions.http_request);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success',false,'message','Falha ao contatar a API Hinova (autenticação)');
  END;
  v_tok := (public.hinova_jsonb(v_resp.content))->>'token_usuario';
  IF v_tok IS NULL THEN
    RETURN jsonb_build_object('success',false,'message','Falha auth (resposta inválida da API Hinova)');
  END IF;

  SELECT id INTO v_imp FROM sga_importacoes WHERE corretora_id=p_corretora_id AND ativo=true ORDER BY created_at DESC LIMIT 1;

  IF p_full OR v_imp IS NULL THEN
    v_desde := COALESCE((SELECT min(data_cadastro_evento) FROM sga_eventos e JOIN sga_importacoes si ON si.id=e.importacao_id WHERE si.corretora_id=p_corretora_id), DATE '2010-01-01');
    v_novo := true;
    INSERT INTO sga_importacoes (corretora_id, nome_arquivo, total_registros, ativo)
    VALUES (p_corretora_id, 'API eventos (histórico) '||to_char(now(),'DD/MM/YYYY'), 0, true) RETURNING id INTO v_imp;
  ELSE
    SELECT GREATEST(COALESCE(min(data_cadastro_evento), v_fim - 90), v_fim - 365) INTO v_desde
    FROM sga_eventos WHERE importacao_id=v_imp AND NOT (upper(coalesce(situacao_evento,'')) ~ v_fin);
  END IF;

  v_cursor := v_desde;
  LOOP
    v_guard := v_guard + 1;
    v_janfim := LEAST(v_cursor + 29, v_fim);
    BEGIN
      SELECT * INTO v_resp FROM extensions.http(('POST', v_base||'/listar/evento',
        ARRAY[extensions.http_header('Authorization','Bearer '||v_tok)], 'application/json',
        json_build_object('data_cadastro',to_char(v_cursor,'DD/MM/YYYY'),'data_cadastro_final',to_char(v_janfim,'DD/MM/YYYY'))::text)::extensions.http_request);
      v_arr := public.hinova_jsonb(v_resp.content);
      IF v_arr IS NOT NULL AND jsonb_typeof(v_arr)='array' AND jsonb_array_length(v_arr)>0 THEN
        IF NOT v_novo THEN
          UPDATE sga_eventos t SET situacao_evento = ev->>'situacao_evento', valor_reparo = hinova_num(ev->>'valor_reparo')
          FROM jsonb_array_elements(v_arr) ev
          WHERE t.importacao_id=v_imp AND t.protocolo IS NOT NULL AND t.protocolo = NULLIF(ev->>'protocolo','');
          GET DIAGNOSTICS v_ins = ROW_COUNT; v_atualiz := v_atualiz + v_ins;
        END IF;
        INSERT INTO sga_eventos (importacao_id, situacao_evento, tipo_evento, motivo_evento, envolvimento, passivel_ressarcimento,
          solicitou_carro_reserva, protocolo, numero_bo, data_cadastro_item, data_cadastro_evento, data_evento,
          valor_reparo, previsao_valor_reparo, participacao, evento_cidade, evento_logradouro, regional, cooperativa, voluntario,
          placa, modelo_veiculo, ano_fabricacao, categoria_veiculo, valor_protegido_veiculo)
        SELECT v_imp, ev->>'situacao_evento', ev->>'evento_tipo', ev->>'motivo', ev->>'envolvimento', NULLIF(ev->>'passivel_ressarcimento',''),
          ev->>'solicitou_carro_reserva', NULLIF(ev->>'protocolo',''), NULLIF(ev->>'numero_bo',''),
          hinova_dateiso(ev->>'data_cadastro'), hinova_dateiso(ev->>'data_cadastro'), hinova_dateiso(ev->>'data_evento'),
          hinova_num(ev->>'valor_reparo'), hinova_num(ev->>'previsao_valor_reparo'), hinova_num(ev->>'participacao'),
          ev->>'cidade', ev->>'logradouro',
          CASE WHEN jsonb_typeof(ev->'regional')='object' THEN COALESCE(ev#>>'{regional,descricao}', ev#>>'{regional,nome}') ELSE ev->>'regional' END,
          CASE WHEN jsonb_typeof(ev->'cooperativa')='object' THEN COALESCE(ev#>>'{cooperativa,descricao}', ev#>>'{cooperativa,nome}') ELSE ev->>'cooperativa' END,
          CASE WHEN jsonb_typeof(ev->'voluntario')='object' THEN COALESCE(ev#>>'{voluntario,nome}', ev#>>'{voluntario,descricao}') ELSE ev->>'voluntario' END,
          ev#>>'{veiculo,placa}', ev#>>'{veiculo,modelo}', NULLIF(ev#>>'{veiculo,ano_fabricacao}','')::int,
          ev#>>'{veiculo,categoria}', hinova_num(ev#>>'{veiculo,valor_fipe}')
        FROM jsonb_array_elements(v_arr) ev
        WHERE NULLIF(ev->>'protocolo','') IS NULL
           OR NOT EXISTS (SELECT 1 FROM sga_eventos x WHERE x.importacao_id=v_imp AND x.protocolo = ev->>'protocolo');
        GET DIAGNOSTICS v_ins = ROW_COUNT; v_novos := v_novos + v_ins;
      END IF;
      v_jan_ok := v_jan_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_jan_erro := v_jan_erro + 1;
    END;
    EXIT WHEN v_janfim >= v_fim OR v_guard >= 260;
    v_cursor := v_janfim + 1;
  END LOOP;

  IF v_jan_ok = 0 THEN
    IF v_novo THEN DELETE FROM sga_importacoes WHERE id=v_imp; END IF;
    RETURN jsonb_build_object('success',false,'message','Todas as janelas de eventos falharam — nada foi alterado','janelas_erro',v_jan_erro);
  END IF;

  IF v_novo THEN UPDATE sga_importacoes SET ativo=false WHERE corretora_id=p_corretora_id AND id<>v_imp; END IF;
  UPDATE sga_importacoes SET total_registros=(SELECT count(*) FROM sga_eventos WHERE importacao_id=v_imp) WHERE id=v_imp;
  UPDATE sga_automacao_config SET ultimo_status='sucesso', ultimo_erro=null, ultima_execucao=now(), ultima_origem='api' WHERE corretora_id=p_corretora_id;
  RETURN jsonb_build_object('success',true,'modo',CASE WHEN v_novo THEN 'completo' ELSE 'incremental' END,
    'desde',v_desde,'novos',v_novos,'atualizados',v_atualiz,'janelas_ok',v_jan_ok,'janelas_erro',v_jan_erro,
    'total',(SELECT count(*) FROM sga_eventos WHERE importacao_id=v_imp));
END;
$function$;

CREATE OR REPLACE FUNCTION public.importar_eventos_api(p_corretora_id uuid)
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$ SELECT public.importar_eventos_api(p_corretora_id, false) $$;