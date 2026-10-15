-- 0021: registra no repositório objetos já aplicados direto no banco (idempotente)
CREATE INDEX IF NOT EXISTS idx_cobranca_boletos_imp_nosso ON public.cobranca_boletos USING btree (importacao_id, ((dados_extras ->> 'nosso_numero'::text)));
CREATE INDEX IF NOT EXISTS idx_sga_eventos_imp_protocolo ON public.sga_eventos USING btree (importacao_id, protocolo);
ALTER TABLE public.sga_importacoes ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.cobranca_automacao_config ADD COLUMN IF NOT EXISTS tipos_boleto_relatorio text[] DEFAULT ARRAY['FECHAMENTO'::text];

CREATE TABLE IF NOT EXISTS public.bi_filtros_padrao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  corretora_id uuid REFERENCES public.corretoras(id) ON DELETE CASCADE,
  tela text NOT NULL,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bi_filtros_padrao_uk UNIQUE NULLS NOT DISTINCT (user_id, tela, corretora_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_filtros_padrao TO authenticated;
GRANT ALL ON public.bi_filtros_padrao TO service_role;
ALTER TABLE public.bi_filtros_padrao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bi_filtros_padrao_proprio ON public.bi_filtros_padrao;
CREATE POLICY bi_filtros_padrao_proprio ON public.bi_filtros_padrao TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.cobranca_tipos_boleto (
  tipo text PRIMARY KEY,
  descricao text,
  grupo text NOT NULL DEFAULT 'outros' CHECK (grupo = ANY (ARRAY['mensalidade','cobranca','taxa','evento','outros'])),
  ordem integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranca_tipos_boleto TO authenticated;
GRANT ALL ON public.cobranca_tipos_boleto TO service_role;
ALTER TABLE public.cobranca_tipos_boleto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cobranca_tipos_boleto_ler ON public.cobranca_tipos_boleto;
CREATE POLICY cobranca_tipos_boleto_ler ON public.cobranca_tipos_boleto FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cobranca_tipos_boleto_admin ON public.cobranca_tipos_boleto;
CREATE POLICY cobranca_tipos_boleto_admin ON public.cobranca_tipos_boleto TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.cobranca_tipos_boleto (tipo, descricao, grupo, ordem) VALUES
('FECHAMENTO','Mensalidade do mês (rateio/fechamento mensal do associado)','mensalidade',1),
('ADESÃO','Taxa de adesão na entrada do associado','taxa',10),
('REATIVAÇÃO','Taxa de reativação de associado/veículo','taxa',11),
('VISTORIA','Taxa de vistoria','taxa',12),
('VISTORIA - CONSULTOR','Taxa de vistoria realizada por consultor','taxa',13),
('VISTORIA - LOJA','Taxa de vistoria realizada na loja','taxa',14),
('INSTALAÇÃO DE EQUIPAMENTO','Taxa de instalação de rastreador/equipamento','taxa',15),
('PARTICIPAÇÃO','Cota de participação do associado em evento (sinistro)','evento',20),
('COBRANÇA 1','Boleto emitido pelo setor de cobrança (1ª cobrança)','cobranca',30),
('COBRANÇA 2','Boleto emitido pelo setor de cobrança (2ª cobrança)','cobranca',31),
('COBRANÇA - SAC','Boleto de cobrança emitido pelo SAC','cobranca',32),
('INADIMPLÊNCIA','Boleto de regularização de inadimplência','cobranca',33),
('ACORDO FINANCEIRO','Parcela de acordo/renegociação de débito','cobranca',34),
('COMPLEMENTO','Boleto complementar de valor','outros',90)
 ON CONFLICT (tipo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public._backup_funcoes (
  salvo_em timestamptz DEFAULT now(), assinatura text, definicao text, motivo text
);
REVOKE ALL ON public._backup_funcoes FROM anon, authenticated;
GRANT ALL ON public._backup_funcoes TO service_role;
ALTER TABLE public._backup_funcoes ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.calcular_resumo_cobranca(uuid[], text, boolean);
CREATE OR REPLACE PROCEDURE public.importar_api_agendado()
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $procedure$
DECLARE agora_brt timestamp := (now() AT TIME ZONE 'America/Sao_Paulo');
BEGIN
  -- Só enfileira na _sync_queue; o worker _processar_fila_sync processa.
  -- Apenas os módulos que o worker consome. Não reabre item concluído há menos
  -- de 6h (o ciclo diário das 6h/13h já cobre), para não repetir requisições.
  INSERT INTO public._sync_queue (corretora_id, modulo, status, tentativas, ultimo_erro, updated_at)
  SELECT hc.corretora_id, m.modulo, 'pendente', 0, NULL, now()
  FROM hinova_credenciais hc
  CROSS JOIN (VALUES ('cobranca_recente'),('eventos'),('mgf')) AS m(modulo)
  WHERE hc.usar_api = true AND hc.api_token IS NOT NULL AND length(hc.api_token) > 10
    AND to_char(hc.api_hora_agendada, 'HH24:MI') = to_char(agora_brt, 'HH24:MI')
    AND (hc.dias_agendados IS NULL OR cardinality(hc.dias_agendados) = 0
         OR EXTRACT(dow FROM agora_brt)::int = ANY(hc.dias_agendados))
    AND ((m.modulo = 'cobranca_recente' AND hc.ativo_cobranca) OR
         (m.modulo = 'eventos' AND hc.ativo_eventos) OR
         (m.modulo = 'mgf' AND hc.ativo_mgf))
  ON CONFLICT (corretora_id, modulo) DO UPDATE
    SET status='pendente', tentativas=0, ultimo_erro=NULL, updated_at=now()
  WHERE public._sync_queue.status <> 'pendente'
    AND (public._sync_queue.status = 'erro' OR public._sync_queue.updated_at < now() - interval '6 hours');
END;
$procedure$
;

CREATE OR REPLACE FUNCTION public._processar_fila_sync()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record; v_result jsonb; v_started timestamptz := clock_timestamp();
  v_done int := 0; v_ids bigint[] := '{}'; v_mods text[] := '{}';
  v_ok boolean; v_completo boolean; v_msg text; v_timeout boolean := false;
  c_max_tentativas constant int := 6;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('fila_sync')::bigint) THEN
    RETURN jsonb_build_object('skipped', true, 'message', 'ciclo ja em execucao');
  END IF;

  LOOP
    EXIT WHEN v_done >= 5 OR v_timeout;
    -- só começa item novo com folga: um item pode levar alguns minutos
    EXIT WHEN clock_timestamp() > v_started + interval '45 seconds';

    SELECT * INTO v_row FROM public._sync_queue
    WHERE status = 'pendente' AND modulo IN ('cobranca_recente','eventos','mgf')
      AND NOT (id = ANY(v_ids)) AND NOT (modulo = ANY(v_mods))
    ORDER BY tentativas ASC, updated_at ASC NULLS FIRST, id ASC LIMIT 1;
    IF NOT FOUND THEN
      SELECT * INTO v_row FROM public._sync_queue
      WHERE status = 'pendente' AND modulo IN ('cobranca_recente','eventos','mgf')
        AND NOT (id = ANY(v_ids))
      ORDER BY tentativas ASC, updated_at ASC NULLS FIRST, id ASC LIMIT 1;
    END IF;
    EXIT WHEN NOT FOUND;

    v_ids := v_ids || v_row.id::bigint;
    IF NOT (v_row.modulo = ANY(v_mods)) THEN v_mods := v_mods || v_row.modulo; END IF;
    v_result := NULL;

    BEGIN
      IF v_row.modulo = 'cobranca_recente' THEN
        v_result := public.importar_cobranca_recente_api(v_row.corretora_id);
      ELSIF v_row.modulo = 'eventos' THEN
        v_result := public.importar_eventos_api(v_row.corretora_id, false);
      ELSIF v_row.modulo = 'mgf' THEN
        v_result := public.importar_mgf_api(v_row.corretora_id);
      END IF;

      v_ok := COALESCE((v_result->>'success')::boolean, false);
      v_completo := COALESCE((v_result->>'completo')::boolean, true) OR COALESCE((v_result->>'skipped')::boolean, false);
      v_msg := left(COALESCE(v_result->>'message', 'falhou sem mensagem'), 500);

      IF v_ok AND v_completo THEN
        UPDATE public._sync_queue SET status='concluido', tentativas=0, ultimo_erro=NULL, updated_at=now() WHERE id=v_row.id;
      ELSIF v_ok THEN
        UPDATE public._sync_queue SET updated_at=now(), ultimo_erro='em progresso' WHERE id=v_row.id;
      ELSE
        UPDATE public._sync_queue SET tentativas=tentativas+1, updated_at=now(), ultimo_erro=v_msg,
          status = CASE WHEN tentativas+1 >= c_max_tentativas THEN 'erro' ELSE status END
        WHERE id=v_row.id;
      END IF;
    EXCEPTION
      WHEN query_canceled THEN
        v_timeout := true;
        UPDATE public._sync_queue SET tentativas=tentativas+1, updated_at=now(), ultimo_erro='timeout na importação',
          status = CASE WHEN tentativas+1 >= c_max_tentativas THEN 'erro' ELSE status END
        WHERE id=v_row.id;
      WHEN OTHERS THEN
        UPDATE public._sync_queue SET tentativas=tentativas+1, updated_at=now(), ultimo_erro=left(SQLERRM,500),
          status = CASE WHEN tentativas+1 >= c_max_tentativas THEN 'erro' ELSE status END
        WHERE id=v_row.id;
    END;
    v_done := v_done + 1;
  END LOOP;

  RETURN jsonb_build_object('processados', v_done, 'modulos', v_mods, 'timeout', v_timeout);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.importar_cobranca_recente_api(p_corretora_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET statement_timeout TO '9min'
AS $function$
DECLARE
  v_base text; v_tok text; v_resp record; v_boletos jsonb; v_json jsonb; v_pag int := 0; v_pag_ini int := 0;
  v_ini timestamptz := clock_timestamp(); v_parcial boolean := false;
  v_api_token text; v_user text; v_pass text;
  v_imp uuid; v_meta jsonb; v_upd timestamptz;
  v_novos int := 0; v_atualizados int := 0;
  v_janela_ini date := current_date - 60; v_janela_fim date := current_date + 60;
  v_cursor date; v_janfim date; v_guard int := 0;
  v_erros int := 0; v_janelas_ok int := 0; v_erro_msg text;
  v_completo boolean := false;
  v_max_janelas constant int := 1;    -- poucas janelas por chamada
  v_dias_por_janela constant int := 5; -- janelas curtas: a API da Hinova é
                                        -- muito lenta pra essa corretora
                                        -- (~18s só pra 1 dia de dados) —
                                        -- janelas de 30 dias sempre davam
                                        -- timeout. _processar_fila_sync
                                        -- roda a cada minuto e chama nós de
                                        -- novo até cobrir a janela toda.
BEGIN
  SELECT api_token, trim(hinova_user), hinova_pass, COALESCE(api_base_url,'https://api.hinova.com.br/api/sga/v2')
    INTO v_api_token, v_user, v_pass, v_base
  FROM hinova_credenciais WHERE corretora_id=p_corretora_id;
  IF v_api_token IS NULL THEN RETURN jsonb_build_object('success',false,'message','API não configurada'); END IF;

  SELECT id, meta, updated_at INTO v_imp, v_meta, v_upd FROM cobranca_importacoes
  WHERE corretora_id=p_corretora_id AND nome_arquivo='API cobrança (recente)' LIMIT 1;

  -- Se o último ciclo completo terminou há menos de 6h, pula (dado ainda fresco).
  IF v_imp IS NOT NULL AND COALESCE((v_meta->>'ciclo_completo')::boolean, false)
     AND v_upd IS NOT NULL AND v_upd > now() - interval '6 hours' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Recente já atualizado há pouco — pulado', 'skipped', true);
  END IF;

  IF v_imp IS NOT NULL AND v_meta ? 'cursor_recente' AND NOT COALESCE((v_meta->>'ciclo_completo')::boolean, false) THEN
    v_cursor := (v_meta->>'cursor_recente')::date;
    -- Retoma na pagina onde parou: uma janela da PROTEV tem 5 paginas de 3.000
    -- e nao cabe toda numa execucao.
    v_pag_ini := COALESCE(NULLIF(v_meta->>'pagina_recente','')::int, 0);
  ELSE
    v_cursor := v_janela_ini;
    v_pag_ini := 0;
  END IF;

  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT','100');
  SELECT * INTO v_resp FROM extensions.http(('POST', v_base||'/usuario/autenticar',
    ARRAY[extensions.http_header('Authorization','Bearer '||v_api_token)], 'application/json',
    json_build_object('usuario',v_user,'senha',v_pass)::text)::extensions.http_request);
  v_tok := (v_resp.content::jsonb)->>'token_usuario';
  IF v_tok IS NULL THEN RETURN jsonb_build_object('success',false,'message','Falha auth'); END IF;

  CREATE TEMP TABLE IF NOT EXISTS _stg_cobranca_recente (
    nome text, valor numeric, data_vencimento date, data_vencimento_original date,
    data_pagamento date, situacao text, placas text, dados_extras jsonb
  ) ON COMMIT DROP;
  DELETE FROM _stg_cobranca_recente;

  LOOP
    v_janfim := LEAST(v_cursor + (v_dias_por_janela - 1), v_janela_fim);
    IF v_cursor > v_janela_fim THEN v_completo := true; EXIT; END IF;
    v_guard := v_guard + 1;
    IF v_guard > v_max_janelas THEN EXIT; END IF;
    BEGIN
      -- ATENCAO: neste endpoint inicio_paginacao e o indice da PAGINA comecando
      -- em zero (0=1a, 1=2a...), e nao o deslocamento de registros como em
      -- /listar/veiculo. Mandar 3000 aqui devolve 406 "nao foram encontradas
      -- vendas". Sem paginar, so vinham os 3.000 primeiros de cada janela:
      -- a PROTEV tinha 18.294 boletos em julho e gravavamos 5.849.
      v_pag := v_pag_ini;
      LOOP
      SELECT * INTO v_resp FROM extensions.http(('POST', v_base||'/listar/boleto-associado/periodo',
        ARRAY[extensions.http_header('Authorization','Bearer '||v_tok)], 'application/json',
        json_build_object('data_vencimento_inicial',to_char(v_cursor,'DD/MM/YYYY'),'data_vencimento_final',to_char(v_janfim,'DD/MM/YYYY'),'inicio_paginacao', v_pag::text)::text)::extensions.http_request);
      v_json := v_resp.content::jsonb;
      v_boletos := v_json -> 'boletos';
      IF v_boletos IS NOT NULL AND jsonb_typeof(v_boletos)='array' AND jsonb_array_length(v_boletos) > 0 THEN
        INSERT INTO _stg_cobranca_recente (nome, valor, data_vencimento, data_vencimento_original, data_pagamento, situacao, placas, dados_extras)
        SELECT b->>'nome_associado', hinova_num(b->>'valor_boleto'),
          hinova_dateiso(b->>'data_vencimento'), hinova_dateiso(b->>'data_vencimento_original'), hinova_dateiso(b->>'data_pagamento'),
          b->>'situacao_boleto',
          (SELECT string_agg(NULLIF(vv->>'placa',''), ', ') FROM jsonb_array_elements(COALESCE(b->'veiculos','[]'::jsonb)) vv),
          jsonb_build_object('nosso_numero',b->>'nosso_numero','cpf',b->>'cpf','valor_pagamento',b->>'valor_pagamento',
            'tipo_boleto',b->>'tipo_boleto','codigo_banco',b->>'codigo_banco','mes_referente',b->>'mes_referente',
            'data_emissao',b->>'data_emissao','codigo_forma_pagamento',b->>'codigo_forma_pagamento')
        FROM jsonb_array_elements(v_boletos) b;
      ELSE
        EXIT;
      END IF;
      v_pag := v_pag + 1;
      -- Sem tempo para a proxima pagina: guarda onde parou e volta no proximo
      -- minuto, em vez de estourar o limite e perder a janela inteira.
      IF v_pag < COALESCE(NULLIF(v_json->>'numero_paginas','')::int, 1)
         AND extract(epoch FROM clock_timestamp() - v_ini) > 55 THEN
        v_parcial := true;
        EXIT;
      END IF;
      EXIT WHEN v_pag >= COALESCE(NULLIF(v_json->>'numero_paginas','')::int, 1) OR v_pag > 40;
      END LOOP;
      v_janelas_ok := v_janelas_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros + 1;
      v_erro_msg := SQLERRM;
    END;
    IF v_parcial THEN EXIT; END IF;
    v_cursor := v_janfim + 1;
    v_pag_ini := 0;
  END LOOP;

  IF v_janelas_ok = 0 AND v_erros > 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Janela(s) recentes falharam: '||COALESCE(v_erro_msg,'?'), 'janelas_erro', v_erros);
  END IF;

  IF v_imp IS NULL THEN
    INSERT INTO cobranca_importacoes (corretora_id, nome_arquivo, total_registros, ativo, meta)
    VALUES (p_corretora_id, 'API cobrança (recente)', 0, true, '{}'::jsonb) RETURNING id INTO v_imp;
  END IF;
  UPDATE cobranca_importacoes SET ativo=true WHERE id=v_imp;

  -- merge por chave natural (nosso_numero) só dentro dos boletos buscados agora.
  WITH del AS (
    DELETE FROM cobranca_boletos cb
    USING _stg_cobranca_recente s
    WHERE cb.importacao_id = v_imp
      AND cb.dados_extras->>'nosso_numero' IS NOT NULL
      AND cb.dados_extras->>'nosso_numero' = s.dados_extras->>'nosso_numero'
    RETURNING cb.id
  )
  SELECT count(*) INTO v_atualizados FROM del;

  INSERT INTO cobranca_boletos (importacao_id, nome, valor, data_vencimento, data_vencimento_original, data_pagamento, situacao, placas, dados_extras)
  SELECT v_imp, nome, valor, data_vencimento, data_vencimento_original, data_pagamento, situacao, placas, dados_extras
  FROM _stg_cobranca_recente;
  GET DIAGNOSTICS v_novos = ROW_COUNT;

  UPDATE cobranca_importacoes
  SET total_registros = GREATEST(0, COALESCE(total_registros,0) + v_novos - v_atualizados),
      meta = jsonb_build_object('cursor_recente', v_cursor, 'ciclo_completo', v_completo,
                                'pagina_recente', CASE WHEN v_parcial THEN v_pag ELSE 0 END),
      updated_at = now()
  WHERE id=v_imp;

  UPDATE cobranca_automacao_config SET ultimo_status='sucesso', ultimo_erro=null, ultima_execucao=now(), ultima_origem='api' WHERE corretora_id=p_corretora_id;
  RETURN jsonb_build_object('success',true,'modulo','cobranca_recente','completo',v_completo,
    'janelas_ok',v_janelas_ok,'janelas_erro',v_erros,'inseridos_ou_atualizados',v_novos,'substituidos',v_atualizados,'proximo_cursor',v_cursor);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.importar_eventos_api(p_corretora_id uuid, p_full boolean DEFAULT false, p_desde date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_base text; v_tok text; v_resp record;
  v_api_token text; v_user text; v_pass text;
  v_imp uuid; v_meta jsonb; v_novo boolean := false; v_novos int := 0; v_atualiz int := 0; v_res int[];
  v_fim date := current_date; v_cursor date; v_janfim date; v_guard int := 0;
  v_desde date; v_jan_ok int := 0; v_jan_erro int := 0; v_erros_novos int := 0; v_erro_msg text;
  v_max date; v_ini_novos date; v_min_aberto date; v_cur date; v_parcial boolean := false;
  v_t0 timestamptz := clock_timestamp();
  v_fin text := 'FINALIZ|CANCELAD|NEGAD|CONCLU|ENCERRAD|INDENIZ|ARQUIV|BAIXAD';
BEGIN
  SELECT api_token, trim(hinova_user), hinova_pass, COALESCE(api_base_url,'https://api.hinova.com.br/api/sga/v2')
    INTO v_api_token, v_user, v_pass, v_base FROM hinova_credenciais WHERE corretora_id=p_corretora_id;
  IF v_api_token IS NULL THEN RETURN jsonb_build_object('success',false,'message','API não configurada'); END IF;

  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT','100');
  BEGIN
    SELECT * INTO v_resp FROM extensions.http(('POST', v_base||'/usuario/autenticar',
      ARRAY[extensions.http_header('Authorization','Bearer '||v_api_token)], 'application/json',
      json_build_object('usuario',v_user,'senha',v_pass)::text)::extensions.http_request);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success',false,'message','Falha ao contatar a API Hinova (autenticação)');
  END;
  v_tok := (public.hinova_jsonb(v_resp.content))->>'token_usuario';
  IF v_tok IS NULL THEN
    UPDATE sga_automacao_config SET ultimo_status='erro', ultimo_erro='Falha auth', ultima_execucao=now() WHERE corretora_id=p_corretora_id;
    RETURN jsonb_build_object('success',false,'message','Falha auth (resposta inválida da API Hinova)');
  END IF;

  SELECT id, COALESCE(meta,'{}'::jsonb) INTO v_imp, v_meta FROM sga_importacoes WHERE corretora_id=p_corretora_id AND ativo=true ORDER BY created_at DESC LIMIT 1;

  IF p_full OR v_imp IS NULL THEN
    -- modo completo (sem histórico): últimos 18 meses em janelas de 30 dias
    v_desde := GREATEST(
      COALESCE(p_desde,
               (SELECT min(data_cadastro_evento) FROM sga_eventos e JOIN sga_importacoes si ON si.id=e.importacao_id WHERE si.corretora_id=p_corretora_id),
               v_fim - 540),
      COALESCE(p_desde, v_fim - 540));
    v_novo := true; v_meta := '{}'::jsonb;
    INSERT INTO sga_importacoes (corretora_id, nome_arquivo, total_registros, ativo)
    VALUES (p_corretora_id, 'API eventos (histórico) '||to_char(now(),'DD/MM/YYYY'), 0, true) RETURNING id INTO v_imp;
    v_cursor := v_desde;
    LOOP
      v_guard := v_guard + 1;
      v_janfim := LEAST(v_cursor + 29, v_fim);
      BEGIN
        v_res := public._eventos_janela(v_base, v_tok, v_imp, v_cursor, v_janfim, false);
        v_novos := v_novos + v_res[1]; v_jan_ok := v_jan_ok + 1;
      EXCEPTION WHEN OTHERS THEN v_jan_erro := v_jan_erro + 1; v_erro_msg := SQLERRM;
      END;
      EXIT WHEN v_janfim >= v_fim OR v_guard >= 260;
      v_cursor := v_janfim + 1;
    END LOOP;
  ELSE
    -- (a) eventos NOVOS: do último cadastro conhecido (-7 dias de folga) até hoje, janelas de 7 dias.
    SELECT max(data_cadastro_evento) INTO v_max FROM sga_eventos WHERE importacao_id=v_imp;
    v_ini_novos := GREATEST(COALESCE(v_max, v_fim - 30) - 7, v_fim - 120);
    v_cursor := v_ini_novos;
    LOOP
      v_janfim := LEAST(v_cursor + 6, v_fim);
      BEGIN
        v_res := public._eventos_janela(v_base, v_tok, v_imp, v_cursor, v_janfim, true);
        v_novos := v_novos + v_res[1]; v_atualiz := v_atualiz + v_res[2]; v_jan_ok := v_jan_ok + 1;
      EXCEPTION WHEN OTHERS THEN
        v_jan_erro := v_jan_erro + 1; v_erros_novos := v_erros_novos + 1; v_erro_msg := SQLERRM;
        EXIT; -- não avança além de uma janela com falha: a próxima execução retoma daqui
      END;
      EXIT WHEN v_janfim >= v_fim;
      v_cursor := v_janfim + 1;
      -- folga para não estourar o limite da função: retoma na próxima rodada da fila
      IF clock_timestamp() - v_t0 > interval '120 seconds' THEN v_parcial := true; EXIT; END IF;
    END LOOP;

    -- (b) STATUS dos eventos em aberto mais antigos: até 2 janelas de 30 dias por execução, em rodízio.
    IF v_erros_novos = 0 AND NOT v_parcial THEN
      SELECT min(data_cadastro_evento) INTO v_min_aberto FROM sga_eventos
      WHERE importacao_id=v_imp AND NOT (upper(coalesce(situacao_evento,'')) ~ v_fin)
        AND data_cadastro_evento >= v_fim - 365 AND data_cadastro_evento < v_ini_novos;
      IF v_min_aberto IS NOT NULL THEN
        v_cur := NULLIF(v_meta->>'cursor_status','')::date;
        IF v_cur IS NULL OR v_cur < v_min_aberto OR v_cur >= v_ini_novos THEN v_cur := v_min_aberto; END IF;
        FOR i IN 1..2 LOOP
          EXIT WHEN v_cur >= v_ini_novos OR clock_timestamp() - v_t0 > interval '60 seconds';
          v_janfim := LEAST(v_cur + 29, v_ini_novos - 1);
          BEGIN
            v_res := public._eventos_janela(v_base, v_tok, v_imp, v_cur, v_janfim, true);
            v_novos := v_novos + v_res[1]; v_atualiz := v_atualiz + v_res[2];
          EXCEPTION WHEN OTHERS THEN v_jan_erro := v_jan_erro + 1;
          END;
          v_cur := v_janfim + 1;
        END LOOP;
        v_meta := v_meta || jsonb_build_object('cursor_status', CASE WHEN v_cur >= v_ini_novos THEN NULL ELSE v_cur END);
      END IF;
    END IF;
  END IF;

  IF v_jan_ok = 0 THEN
    IF v_novo THEN DELETE FROM sga_importacoes WHERE id=v_imp; END IF;
    UPDATE sga_automacao_config SET ultimo_status='erro', ultimo_erro=left(COALESCE(v_erro_msg,'janelas falharam'),500), ultima_execucao=now() WHERE corretora_id=p_corretora_id;
    RETURN jsonb_build_object('success',false,'message','Janelas de eventos falharam — nada foi alterado: '||COALESCE(v_erro_msg,'?'),'janelas_erro',v_jan_erro);
  END IF;

  IF v_novo THEN UPDATE sga_importacoes SET ativo=false WHERE corretora_id=p_corretora_id AND id<>v_imp; END IF;
  UPDATE sga_importacoes
     SET total_registros=(SELECT count(*) FROM sga_eventos WHERE importacao_id=v_imp),
         meta = v_meta || jsonb_build_object('ultima_exec', now(), 'novos', v_novos, 'atualizados', v_atualiz, 'janelas_erro', v_jan_erro)
   WHERE id=v_imp;

  IF v_erros_novos > 0 THEN
    UPDATE sga_automacao_config SET ultimo_status='erro', ultimo_erro=left(v_erro_msg,500), ultima_execucao=now(), ultima_origem='api' WHERE corretora_id=p_corretora_id;
    RETURN jsonb_build_object('success',false,'message','Falha ao buscar eventos novos: '||COALESCE(v_erro_msg,'?'),
      'novos',v_novos,'atualizados',v_atualiz,'janelas_ok',v_jan_ok,'janelas_erro',v_jan_erro);
  END IF;

  UPDATE sga_automacao_config SET ultimo_status='sucesso', ultimo_erro=null, ultima_execucao=now(), ultima_origem='api' WHERE corretora_id=p_corretora_id;
  RETURN jsonb_build_object('success',true,'completo', NOT v_parcial,'modo',CASE WHEN v_novo THEN 'completo' ELSE 'incremental' END,
    'desde',COALESCE(v_desde, v_ini_novos),'novos',v_novos,'atualizados',v_atualiz,'janelas_ok',v_jan_ok,'janelas_erro',v_jan_erro,
    'total',(SELECT count(*) FROM sga_eventos WHERE importacao_id=v_imp));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calcular_resumo_cobranca(p_importacao_ids uuid[], p_mes_referencia text, p_somente_vencidos boolean DEFAULT false, p_tipos text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET statement_timeout TO '90s'
AS $function$
WITH mes_range AS (
  SELECT
    CASE WHEN p_mes_referencia IS NULL THEN NULL::date ELSE to_date(p_mes_referencia||'-01','YYYY-MM-DD') END AS ini,
    CASE WHEN p_mes_referencia IS NULL THEN NULL::date ELSE (to_date(p_mes_referencia||'-01','YYYY-MM-DD') + interval '1 month')::date END AS fim
),
tipos AS (
  SELECT CASE WHEN p_tipos IS NULL OR cardinality(p_tipos) = 0 THEN NULL
              ELSE (SELECT array_agg(upper(btrim(t))) FROM unnest(p_tipos) t) END AS arr
),
corretora_alvo AS (
  SELECT ci.corretora_id FROM public.cobranca_importacoes ci WHERE ci.id = ANY(p_importacao_ids) LIMIT 1
),
base_importacao AS (
  SELECT ebi.id FROM public.estudo_base_importacoes ebi
  JOIN corretora_alvo ca ON ca.corretora_id = ebi.corretora_id
  WHERE ebi.ativo = true ORDER BY ebi.created_at DESC LIMIT 1
),
base_por_placa AS (
  SELECT DISTINCT ON (upper(regexp_replace(ebr.placa, '[^A-Za-z0-9]', '', 'g')))
    upper(regexp_replace(ebr.placa, '[^A-Za-z0-9]', '', 'g')) AS placa,
    nullif(btrim(ebr.cooperativa), '') AS cooperativa
  FROM public.estudo_base_registros ebr
  JOIN base_importacao bi ON bi.id = ebr.importacao_id
  WHERE nullif(btrim(ebr.placa), '') IS NOT NULL AND nullif(btrim(ebr.cooperativa), '') IS NOT NULL
  ORDER BY upper(regexp_replace(ebr.placa, '[^A-Za-z0-9]', '', 'g')), ebr.id DESC
),
placas_com_debito AS (
  SELECT DISTINCT upper(regexp_replace(split_part(cb.placas, ',', 1), '[^A-Za-z0-9]', '', 'g')) AS placa
  FROM public.cobranca_boletos cb, mes_range mr
  WHERE mr.ini IS NOT NULL
    AND cb.importacao_id = ANY(p_importacao_ids)
    AND upper(coalesce(cb.situacao,'')) = 'ABERTO'
    AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) < mr.ini
    AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= (mr.ini - interval '6 months')
    AND upper(regexp_replace(split_part(cb.placas, ',', 1), '[^A-Za-z0-9]', '', 'g')) <> ''
),
deduped_all AS (
  SELECT DISTINCT ON (COALESCE(cb.dados_extras->>'nosso_numero', cb.dedup_key, cb.id::text))
    upper(coalesce(cb.situacao,'')) AS sit,
    cb.valor,
    cb.cooperativa AS cooperativa_original,
    cb.dia_vencimento_veiculo,
    upper(regexp_replace(split_part(cb.placas, ',', 1), '[^A-Za-z0-9]', '', 'g')) AS placa,
    COALESCE(nullif(upper(btrim(cb.dados_extras->>'tipo_boleto')),''), 'SEM TIPO') AS tipo
  FROM public.cobranca_boletos cb, mes_range mr
  WHERE cb.importacao_id = ANY(p_importacao_ids)
    AND (mr.ini IS NULL OR (COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= mr.ini
                            AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) < mr.fim))
    AND (NOT p_somente_vencidos OR COALESCE(cb.data_vencimento_original, cb.data_vencimento) < current_date)
  ORDER BY COALESCE(cb.dados_extras->>'nosso_numero', cb.dedup_key, cb.id::text), cb.valor DESC NULLS LAST
),
validos AS (
  SELECT * FROM deduped_all WHERE sit NOT IN ('CANCELADO','EXCLUIDO','EXCLUÍDO')
),
deduped AS (
  SELECT v.* FROM validos v, tipos t WHERE t.arr IS NULL OR v.tipo = ANY(t.arr)
),
outros AS (
  SELECT v.tipo, count(*) AS qtd,
         count(*) FILTER (WHERE v.sit='BAIXADO') AS baixados,
         round(coalesce(sum(v.valor),0)::numeric, 2) AS valor,
         round(coalesce(sum(v.valor) FILTER (WHERE v.sit='BAIXADO'),0)::numeric, 2) AS valor_pago
  FROM validos v, tipos t
  WHERE t.arr IS NOT NULL AND NOT (v.tipo = ANY(t.arr))
  GROUP BY v.tipo
),
resolvidos AS (
  SELECT d.sit, d.valor, d.dia_vencimento_veiculo, d.placa,
    COALESCE(
      CASE
        WHEN nullif(btrim(d.cooperativa_original), '') IS NULL THEN NULL
        WHEN btrim(d.cooperativa_original) ~ '^[0-9]+$' THEN NULL
        WHEN lower(btrim(d.cooperativa_original)) = 'sem cooperativa' THEN NULL
        WHEN left(btrim(d.cooperativa_original), 1) IN ('{', '[') THEN
          COALESCE(public.hinova_jsonb(d.cooperativa_original)->>'descricao',
                   public.hinova_jsonb(d.cooperativa_original)->>'nome',
                   public.hinova_jsonb(d.cooperativa_original)->>'name')
        ELSE btrim(d.cooperativa_original)
      END,
      bp.cooperativa,
      'Sem cooperativa'
    ) AS cooperativa
  FROM deduped d
  LEFT JOIN base_por_placa bp ON bp.placa = d.placa
),
sga AS (
  SELECT * FROM resolvidos d
  WHERE NOT EXISTS (SELECT 1 FROM placas_com_debito pcd WHERE pcd.placa = d.placa)
),
agg AS (
  SELECT
    count(*) FILTER (WHERE sit='ABERTO') AS abertos,
    count(*) FILTER (WHERE sit='BAIXADO') AS baixados,
    count(*) AS emitidos,
    coalesce(sum(valor),0) AS valor_total,
    coalesce(sum(valor) FILTER (WHERE sit='BAIXADO'),0) AS valor_pago,
    coalesce(sum(valor) FILTER (WHERE sit='ABERTO'),0) AS valor_aberto
  FROM sga
),
por_dia_calc AS (
  SELECT jsonb_object_agg(d.dia, jsonb_build_object('gerados', gerados, 'abertos', abertos)) AS j
  FROM (
    SELECT d.dia,
      count(r.*) AS gerados,
      count(r.*) FILTER (WHERE r.sit='ABERTO') AS abertos
    FROM (VALUES (5),(10),(15),(20)) AS d(dia)
    LEFT JOIN sga r ON r.dia_vencimento_veiculo = d.dia
    GROUP BY d.dia
  ) d
),
maior_calc AS (
  SELECT jsonb_build_object('nome', nome, 'percentual', percentual) AS j FROM (
    SELECT cooperativa AS nome, round(count(*) FILTER (WHERE sit='ABERTO')::numeric / count(*) * 100, 1) AS percentual
    FROM sga GROUP BY cooperativa HAVING count(*) >= 5 ORDER BY percentual DESC LIMIT 1) x
),
menor_calc AS (
  SELECT jsonb_build_object('nome', nome, 'percentual', percentual) AS j FROM (
    SELECT cooperativa AS nome, round(count(*) FILTER (WHERE sit='ABERTO')::numeric / count(*) * 100, 1) AS percentual
    FROM sga GROUP BY cooperativa HAVING count(*) >= 5 ORDER BY percentual ASC LIMIT 1) x
)
SELECT jsonb_build_object(
  'total_gerados', a.emitidos,
  'total_abertos', a.abertos,
  'total_baixados', a.baixados,
  'faturamento_esperado', a.valor_total,
  'faturamento_recebido', a.valor_pago,
  'valor_aberto', a.valor_aberto,
  'por_dia', COALESCE((SELECT j FROM por_dia_calc), '{}'::jsonb),
  'maior_inadimplencia', COALESCE((SELECT j FROM maior_calc), jsonb_build_object('nome','N/A','percentual',0)),
  'menor_inadimplencia', COALESCE((SELECT j FROM menor_calc), jsonb_build_object('nome','N/A','percentual',100)),
  'tipos_aplicados', (SELECT to_jsonb(arr) FROM tipos),
  'outros_tipos', COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'qtd', qtd, 'baixados', baixados, 'valor', valor, 'valor_pago', valor_pago) ORDER BY valor DESC) FROM outros), '[]'::jsonb),
  'outros_total_qtd', COALESCE((SELECT sum(qtd) FROM outros), 0),
  'outros_total_valor', COALESCE((SELECT sum(valor) FROM outros), 0)
) FROM agg a;
$function$
;

CREATE OR REPLACE FUNCTION public._eventos_janela(p_base text, p_tok text, p_imp uuid, p_ini date, p_fim date, p_atualizar boolean)
 RETURNS integer[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_resp record; v_arr jsonb; v_upd int := 0; v_ins int := 0;
BEGIN
  SELECT * INTO v_resp FROM extensions.http(('POST', p_base||'/listar/evento',
    ARRAY[extensions.http_header('Authorization','Bearer '||p_tok)], 'application/json',
    json_build_object('data_cadastro',to_char(p_ini,'DD/MM/YYYY'),'data_cadastro_final',to_char(p_fim,'DD/MM/YYYY'))::text)::extensions.http_request);
  IF v_resp.status IS NULL OR v_resp.status >= 500 OR v_resp.status IN (401,403) THEN
    RAISE EXCEPTION 'HTTP % em /listar/evento (% a %)', v_resp.status, p_ini, p_fim;
  END IF;
  v_arr := public.hinova_jsonb(v_resp.content);
  IF v_arr IS NULL OR jsonb_typeof(v_arr) <> 'array' OR jsonb_array_length(v_arr) = 0 THEN
    RETURN ARRAY[0,0];
  END IF;
  IF p_atualizar THEN
    UPDATE sga_eventos t SET situacao_evento = ev->>'situacao_evento', valor_reparo = hinova_num(ev->>'valor_reparo')
    FROM jsonb_array_elements(v_arr) ev
    WHERE t.importacao_id=p_imp AND t.protocolo IS NOT NULL AND t.protocolo = NULLIF(ev->>'protocolo','')
      AND (t.situacao_evento IS DISTINCT FROM ev->>'situacao_evento' OR t.valor_reparo IS DISTINCT FROM hinova_num(ev->>'valor_reparo'));
    GET DIAGNOSTICS v_upd = ROW_COUNT;
  END IF;
  INSERT INTO sga_eventos (importacao_id, situacao_evento, tipo_evento, motivo_evento, envolvimento, passivel_ressarcimento,
    solicitou_carro_reserva, protocolo, numero_bo, data_cadastro_item, data_cadastro_evento, data_evento,
    valor_reparo, previsao_valor_reparo, participacao, evento_cidade, evento_logradouro, regional, cooperativa, voluntario,
    placa, modelo_veiculo, ano_fabricacao, categoria_veiculo, valor_protegido_veiculo)
  SELECT p_imp, ev->>'situacao_evento', ev->>'evento_tipo', ev->>'motivo', ev->>'envolvimento', NULLIF(ev->>'passivel_ressarcimento',''),
    ev->>'solicitou_carro_reserva', NULLIF(ev->>'protocolo',''), NULLIF(ev->>'numero_bo',''),
    hinova_dateiso(ev->>'data_cadastro'), hinova_dateiso(ev->>'data_cadastro'), hinova_dateiso(ev->>'data_evento'),
    hinova_num(ev->>'valor_reparo'), hinova_num(ev->>'previsao_valor_reparo'), hinova_num(ev->>'participacao'),
    ev->>'cidade', ev->>'logradouro',
    CASE WHEN jsonb_typeof(ev->'regional')='object' THEN COALESCE(ev#>>'{regional,descricao}', ev#>>'{regional,nome}') ELSE ev->>'regional' END,
    CASE WHEN jsonb_typeof(ev->'cooperativa')='object' THEN COALESCE(ev#>>'{cooperativa,descricao}', ev#>>'{cooperativa,nome}') ELSE ev->>'cooperativa' END,
    CASE WHEN jsonb_typeof(ev->'voluntario')='object' THEN COALESCE(ev#>>'{voluntario,nome}', ev#>>'{voluntario,descricao}') ELSE ev->>'voluntario' END,
    ev#>>'{veiculo,placa}', ev#>>'{veiculo,modelo}', NULLIF(regexp_replace(COALESCE(ev#>>'{veiculo,ano_fabricacao}',''),'[^0-9]','','g'),'')::int,
    ev#>>'{veiculo,categoria}', hinova_num(ev#>>'{veiculo,valor_fipe}')
  FROM jsonb_array_elements(v_arr) ev
  WHERE NULLIF(ev->>'protocolo','') IS NULL
     OR NOT EXISTS (SELECT 1 FROM sga_eventos x WHERE x.importacao_id=p_imp AND x.protocolo = ev->>'protocolo');
  GET DIAGNOSTICS v_ins = ROW_COUNT;
  RETURN ARRAY[v_ins, v_upd];
END;
$function$
;

CREATE OR REPLACE FUNCTION public.listar_tipos_boleto(p_corretora_id uuid, p_desde date DEFAULT (CURRENT_DATE - 90))
 RETURNS TABLE(tipo text, descricao text, grupo text, ordem integer, qtd bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
  with imps as (select id from cobranca_importacoes where corretora_id = p_corretora_id and ativo),
  t as (
    select coalesce(nullif(upper(btrim(cb.dados_extras->>'tipo_boleto')),''),'SEM TIPO') tipo, count(*) qtd
    from cobranca_boletos cb
    where cb.importacao_id in (select id from imps)
      and coalesce(cb.data_vencimento_original, cb.data_vencimento) >= p_desde
    group by 1)
  select t.tipo, ct.descricao, coalesce(ct.grupo,'outros'), coalesce(ct.ordem,100), t.qtd
  from t left join cobranca_tipos_boleto ct on upper(ct.tipo) = t.tipo
  where auth.role() = 'service_role' or auth.uid() is null
     or not public.has_role(auth.uid(),'parceiro')
     or p_corretora_id = public.get_user_corretora_id(auth.uid())
  order by 4, 5 desc
$function$
;


-- Rotinas de importação/fila não podem ser disparadas com a chave pública (anon).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig, p.prokind FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND (p.proname LIKE 'importar\_%' OR p.proname LIKE 'processar\_%'
             OR p.proname IN ('_processar_fila_sync','enfileirar_sync_diario','reabrir_sync_atrasado'))
  LOOP
    IF r.prokind = 'p' THEN
      EXECUTE format('REVOKE EXECUTE ON PROCEDURE %s FROM PUBLIC, anon', r.sig);
      EXECUTE format('GRANT EXECUTE ON PROCEDURE %s TO authenticated, service_role', r.sig);
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    END IF;
  END LOOP;
END $$;
