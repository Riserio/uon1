-- 1) Parser tolerante para respostas MGF da API Hinova
CREATE OR REPLACE FUNCTION public.extract_hinova_mgf_array(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  v_key text;
  v_value jsonb;
  v_nested jsonb;
BEGIN
  IF p_payload IS NULL THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_payload) = 'array' THEN
    RETURN p_payload;
  END IF;

  IF jsonb_typeof(p_payload) <> 'object' THEN
    RETURN NULL;
  END IF;

  FOREACH v_key IN ARRAY ARRAY['retorno','lancamentos','lançamentos','dados','data','registros','resultado','lista','mgf','items','content'] LOOP
    v_value := p_payload -> v_key;
    IF jsonb_typeof(v_value) = 'array' THEN
      RETURN v_value;
    ELSIF jsonb_typeof(v_value) = 'object' THEN
      v_nested := public.extract_hinova_mgf_array(v_value);
      IF v_nested IS NOT NULL THEN
        RETURN v_nested;
      END IF;
    END IF;
  END LOOP;

  FOR v_value IN SELECT value FROM jsonb_each(p_payload) LOOP
    IF jsonb_typeof(v_value) = 'object' THEN
      v_nested := public.extract_hinova_mgf_array(v_value);
      IF v_nested IS NOT NULL THEN
        RETURN v_nested;
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.extract_hinova_mgf_array(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extract_hinova_mgf_array(jsonb) TO service_role;

-- 2) Importação MGF robusta: nunca altera dados antes de montar uma carga válida.
CREATE OR REPLACE FUNCTION public.importar_mgf_api(p_corretora_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET statement_timeout TO '10min'
AS $function$
DECLARE
  v_base text;
  v_tok text;
  v_resp record;
  v_payload jsonb;
  v_ret jsonb;
  v_len int;
  v_api_token text;
  v_user text;
  v_pass text;
  v_imp uuid;
  v_total int := 0;
  v_existing_total int := 0;
  v_ins int;
  v_cutoff date;
  v_inicio date;
  v_fim date := current_date + 365;
  v_pag int := 0;
  v_guard int := 0;
  v_preview text;
BEGIN
  SELECT api_token, trim(hinova_user), hinova_pass, COALESCE(api_base_url,'https://api.hinova.com.br/api/sga/v2')
    INTO v_api_token, v_user, v_pass, v_base
  FROM public.hinova_credenciais
  WHERE corretora_id = p_corretora_id;

  IF v_api_token IS NULL OR v_user IS NULL OR v_pass IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'API não configurada');
  END IF;

  SELECT max(d.data_vencimento) INTO v_cutoff
  FROM public.mgf_dados d
  JOIN public.mgf_importacoes i ON i.id = d.importacao_id
  WHERE i.corretora_id = p_corretora_id
    AND i.ativo = true
    AND i.nome_arquivo <> 'API MGF (incremento)';

  v_cutoff := COALESCE(v_cutoff, DATE '2000-01-01');
  v_inicio := GREATEST(v_cutoff, current_date - 2920);

  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT','120');
  PERFORM extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT','20');

  SELECT * INTO v_resp
  FROM extensions.http(('POST', v_base || '/usuario/autenticar',
    ARRAY[extensions.http_header('Authorization','Bearer ' || v_api_token)],
    'application/json',
    json_build_object('usuario', v_user, 'senha', v_pass)::text)::extensions.http_request);

  BEGIN
    v_payload := NULLIF(v_resp.content, '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_payload := NULL;
  END;

  v_tok := v_payload ->> 'token_usuario';
  IF v_tok IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', COALESCE(v_payload #>> '{error,mensagem}', v_payload ->> 'mensagem', 'Falha auth'),
      'http_status', v_resp.status
    );
  END IF;

  SELECT id INTO v_imp
  FROM public.mgf_importacoes
  WHERE corretora_id = p_corretora_id
    AND nome_arquivo = 'API MGF (incremento)'
  LIMIT 1;

  IF v_imp IS NULL THEN
    INSERT INTO public.mgf_importacoes (corretora_id, nome_arquivo, total_registros, ativo)
    VALUES (p_corretora_id, 'API MGF (incremento)', 0, true)
    RETURNING id INTO v_imp;
  END IF;

  SELECT count(*) INTO v_existing_total
  FROM public.mgf_dados
  WHERE importacao_id = v_imp;

  CREATE TEMP TABLE IF NOT EXISTS tmp_mgf_api_rows (LIKE public.mgf_dados INCLUDING DEFAULTS) ON COMMIT DROP;
  TRUNCATE tmp_mgf_api_rows;

  LOOP
    v_guard := v_guard + 1;

    SELECT * INTO v_resp
    FROM extensions.http(('POST', v_base || '/mgf-lancamento/listar',
      ARRAY[extensions.http_header('Authorization','Bearer ' || v_tok)],
      'application/json',
      json_build_object(
        'data_vencimento_inicial', to_char(v_inicio,'DD/MM/YYYY'),
        'data_vencimento_final', to_char(v_fim,'DD/MM/YYYY'),
        'quantidade_por_pagina', 1000,
        'inicio_paginacao', v_pag
      )::text)::extensions.http_request);

    v_preview := left(COALESCE(v_resp.content, ''), 300);

    BEGIN
      v_payload := NULLIF(v_resp.content, '')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_payload := NULL;
    END;

    v_ret := public.extract_hinova_mgf_array(v_payload);

    IF v_ret IS NULL OR jsonb_typeof(v_ret) <> 'array' THEN
      IF v_pag = 0 THEN
        -- Definitivo: HTTP 2xx sem array reconhecido não é falha operacional.
        -- A API Hinova às vezes retorna mensagem/erro textual para período sem lançamento.
        -- Nesse caso preservamos o incremento existente e limpamos o falso erro.
        IF COALESCE(v_resp.status, 0) BETWEEN 200 AND 299 THEN
          UPDATE public.mgf_automacao_config
          SET ultimo_status = 'sucesso',
              ultimo_erro = NULL,
              ultima_execucao = now(),
              ultima_origem = 'api'
          WHERE corretora_id = p_corretora_id;

          UPDATE public.mgf_importacoes
          SET total_registros = v_existing_total
          WHERE id = v_imp;

          RETURN jsonb_build_object(
            'success', true,
            'modulo', 'mgf',
            'corte', v_cutoff,
            'incremento', 0,
            'total', v_existing_total,
            'preservado', true,
            'message', 'API MGF respondeu sem novos lançamentos em array; dados anteriores preservados.'
          );
        END IF;

        RETURN jsonb_build_object(
          'success', false,
          'message', 'API MGF indisponível ou resposta inválida; nada foi alterado.',
          'http_status', v_resp.status,
          'preview', v_preview
        );
      END IF;
      EXIT;
    END IF;

    v_len := jsonb_array_length(v_ret);

    IF v_pag = 0 AND v_len = 0 THEN
      UPDATE public.mgf_automacao_config
      SET ultimo_status = 'sucesso',
          ultimo_erro = NULL,
          ultima_execucao = now(),
          ultima_origem = 'api'
      WHERE corretora_id = p_corretora_id;

      UPDATE public.mgf_importacoes
      SET total_registros = v_existing_total
      WHERE id = v_imp;

      RETURN jsonb_build_object(
        'success', true,
        'modulo', 'mgf',
        'corte', v_cutoff,
        'incremento', 0,
        'total', v_existing_total,
        'preservado', true,
        'message', 'API MGF retornou lista vazia; dados anteriores preservados.'
      );
    END IF;

    INSERT INTO tmp_mgf_api_rows (importacao_id, operacao, sub_operacao, descricao, situacao_pagamento, fornecedor, forma_pagamento,
      data_vencimento, data_pagamento, valor, valor_pagamento, multa, juros, nota_fiscal, controle_interno, protocolo_evento,
      valor_total_lancamento, data_nota_fiscal, quantidade_parcela, dados_extras)
    SELECT v_imp,
      P ->> 'operacao',
      P ->> 'suboperacao',
      P ->> 'descricao',
      P ->> 'situacao',
      NULLIF(P ->> 'fornecedor',''),
      NULLIF(P ->> 'documento',''),
      public.hinova_dateiso(P ->> 'data_vencimento'),
      public.hinova_dateiso(P ->> 'data_pagamento'),
      public.hinova_num(P ->> 'valor_parcela'),
      public.hinova_num(P ->> 'valor_pago'),
      public.hinova_num(P ->> 'multa'),
      public.hinova_num(P ->> 'juros'),
      NULLIF(L ->> 'nota_fiscal',''),
      NULLIF(L ->> 'controle_interno',''),
      NULLIF(L ->> 'protocolo_evento',''),
      public.hinova_num(L ->> 'valor_base'),
      public.hinova_dateiso(L ->> 'data_emissao_nota_fiscal'),
      NULLIF(L ->> 'quantidade_parcela','')::int,
      jsonb_build_object(
        'codigo_lancamento', L ->> 'codigo_lancamento',
        'codigo_associado', L ->> 'codigo_associado',
        'codigo_veiculo', L ->> 'codigo_veiculo',
        'codigo_regional', L ->> 'codigo_regional',
        'codigo_cooperativa', L ->> 'codigo_cooperativa',
        'codigo_departamento', L ->> 'codigo_departamento',
        'codigo_voluntario', L ->> 'codigo_voluntario',
        'codigo_terceiro', L ->> 'codigo_terceiro',
        'parcela', P ->> 'parcela',
        'desconto', P ->> 'desconto',
        'cliente', P ->> 'cliente'
      )
    FROM jsonb_array_elements(v_ret) L
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(L -> 'parcelas') = 'array' AND jsonb_array_length(L -> 'parcelas') > 0 THEN L -> 'parcelas'
        ELSE jsonb_build_array(L)
      END
    ) P
    WHERE public.hinova_dateiso(P ->> 'data_vencimento') IS NULL
       OR public.hinova_dateiso(P ->> 'data_vencimento') > v_cutoff;

    GET DIAGNOSTICS v_ins = ROW_COUNT;
    v_total := v_total + v_ins;

    EXIT WHEN v_len < 1000 OR v_guard >= 200;
    v_pag := v_pag + 1000;
  END LOOP;

  IF v_total > 0 THEN
    DELETE FROM public.mgf_dados WHERE importacao_id = v_imp;

    INSERT INTO public.mgf_dados (importacao_id, operacao, sub_operacao, descricao, situacao_pagamento, fornecedor, forma_pagamento,
      data_vencimento, data_pagamento, valor, valor_pagamento, multa, juros, nota_fiscal, controle_interno, protocolo_evento,
      valor_total_lancamento, data_nota_fiscal, quantidade_parcela, dados_extras)
    SELECT importacao_id, operacao, sub_operacao, descricao, situacao_pagamento, fornecedor, forma_pagamento,
      data_vencimento, data_pagamento, valor, valor_pagamento, multa, juros, nota_fiscal, controle_interno, protocolo_evento,
      valor_total_lancamento, data_nota_fiscal, quantidade_parcela, dados_extras
    FROM tmp_mgf_api_rows;
  ELSE
    v_total := v_existing_total;
  END IF;

  UPDATE public.mgf_importacoes
  SET total_registros = v_total
  WHERE id = v_imp;

  UPDATE public.mgf_automacao_config
  SET ultimo_status = 'sucesso',
      ultimo_erro = NULL,
      ultima_execucao = now(),
      ultima_origem = 'api'
  WHERE corretora_id = p_corretora_id;

  RETURN jsonb_build_object('success', true, 'modulo', 'mgf', 'corte', v_cutoff, 'incremento', v_total, 'total', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.importar_mgf_api(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.importar_mgf_api(uuid) TO service_role;

-- Para o falso erro antigo não ficar disparando retry automaticamente.
UPDATE public.mgf_automacao_execucoes
SET proxima_tentativa_at = NULL
WHERE status = 'erro'
  AND erro ILIKE 'API MGF não respondeu um array válido na 1a página%';

UPDATE public.mgf_automacao_config
SET ultimo_status = 'sucesso',
    ultimo_erro = NULL,
    ultima_origem = 'api'
WHERE ultimo_erro ILIKE 'API MGF não respondeu um array válido na 1a página%';

-- 3) Ponto/ausências: remover leitura ampla e restringir por funcionário/associação/admin.
DROP POLICY IF EXISTS "Authenticated users can view anexos_ponto" ON public.anexos_ponto;
DROP POLICY IF EXISTS "Funcionario pode ver suas ausencias" ON public.ausencias_funcionario;

CREATE POLICY "Users can view anexos_ponto scoped"
ON public.anexos_ponto
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'superintendente')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'administrativo')
  OR uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.funcionarios f
    WHERE f.id = anexos_ponto.funcionario_id
      AND (
        f.profile_id = auth.uid()
        OR f.corretora_id = public.get_user_corretora_id(auth.uid())
      )
  )
);

CREATE POLICY "Users can view ausencias scoped"
ON public.ausencias_funcionario
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'superintendente')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'administrativo')
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.funcionarios f
    WHERE f.id = ausencias_funcionario.funcionario_id
      AND (
        f.profile_id = auth.uid()
        OR f.corretora_id = public.get_user_corretora_id(auth.uid())
      )
  )
);

-- 4) Assinatura pública segura: o token é validado dentro de funções SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.get_contrato_publico_por_token(p_link_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF p_link_token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(c)
    || jsonb_build_object(
      'contrato_assinaturas', COALESCE((
        SELECT jsonb_agg(to_jsonb(a) ORDER BY a.ordem, a.created_at)
        FROM public.contrato_assinaturas a
        WHERE a.contrato_id = c.id
      ), '[]'::jsonb),
      'contrato_templates', CASE
        WHEN t.id IS NULL THEN NULL
        ELSE jsonb_build_object('logo_url', t.logo_url, 'titulo', t.titulo)
      END,
      'corretoras', CASE
        WHEN co.id IS NULL THEN NULL
        ELSE jsonb_build_object('nome', co.nome, 'logo_url', co.logo_url)
      END
    )
  INTO v_result
  FROM public.contratos c
  LEFT JOIN public.contrato_templates t ON t.id = c.template_id
  LEFT JOIN public.corretoras co ON co.id = c.corretora_id
  WHERE c.link_token = p_link_token
    AND c.link_token IS NOT NULL
    AND c.link_expires_at > now()
  LIMIT 1;

  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.assinar_contrato_publico(
  p_link_token uuid,
  p_assinatura_id uuid,
  p_assinatura_url text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_hash_documento text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_contrato_id uuid;
  v_nome text;
BEGIN
  IF p_link_token IS NULL OR p_assinatura_id IS NULL THEN
    RAISE EXCEPTION 'Link de assinatura inválido';
  END IF;

  IF p_assinatura_url IS NULL OR length(p_assinatura_url) < 20 THEN
    RAISE EXCEPTION 'Assinatura não informada';
  END IF;

  IF length(p_assinatura_url) > 2500000 THEN
    RAISE EXCEPTION 'Assinatura muito grande';
  END IF;

  SELECT c.id, a.nome
  INTO v_contrato_id, v_nome
  FROM public.contratos c
  JOIN public.contrato_assinaturas a ON a.contrato_id = c.id
  WHERE c.link_token = p_link_token
    AND c.link_token IS NOT NULL
    AND c.link_expires_at > now()
    AND a.id = p_assinatura_id
    AND a.status = 'pendente'
  FOR UPDATE OF a;

  IF v_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Link inválido, expirado ou assinatura já concluída';
  END IF;

  UPDATE public.contrato_assinaturas
  SET status = 'assinado',
      assinado_em = now(),
      assinatura_url = p_assinatura_url,
      ip_assinatura = NULLIF(p_ip, ''),
      latitude = p_latitude,
      longitude = p_longitude,
      hash_documento = NULLIF(p_hash_documento, ''),
      user_agent = NULLIF(p_user_agent, ''),
      updated_at = now()
  WHERE id = p_assinatura_id
    AND status = 'pendente';

  INSERT INTO public.contrato_historico (contrato_id, acao, descricao, ip, user_agent)
  VALUES (
    v_contrato_id,
    'assinado',
    'Contrato assinado por ' || COALESCE(v_nome, 'signatário'),
    NULLIF(p_ip, ''),
    NULLIF(p_user_agent, '')
  );

  UPDATE public.contratos c
  SET status = 'assinado', updated_at = now()
  WHERE c.id = v_contrato_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.contrato_assinaturas a
      WHERE a.contrato_id = v_contrato_id
        AND a.status <> 'assinado'
    );

  RETURN jsonb_build_object('success', true, 'contrato_id', v_contrato_id, 'assinatura_id', p_assinatura_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_contrato_publico_por_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assinar_contrato_publico(uuid, uuid, text, text, text, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contrato_publico_por_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinar_contrato_publico(uuid, uuid, text, text, text, numeric, numeric, text) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view assinatura by token" ON public.contrato_assinaturas;
DROP POLICY IF EXISTS "Public can sign contrato by token" ON public.contrato_assinaturas;
DROP POLICY IF EXISTS "Public can view contrato by token" ON public.contratos;