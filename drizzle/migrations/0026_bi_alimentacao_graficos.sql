-- 2026-10-15 — Alimentação dos gráficos do BI (Eventos, MGF, Indicadores).
-- Idempotente. Diagnóstico que motivou cada bloco:
--   * Eventos: mapa por UF sempre vazio (o importador nunca gravava estado);
--     cidade vazia quando o SGA não informa o local; custo dos eventos sempre 0;
--     "tempo de conclusão" sem dado (a API não traz data de conclusão).
--   * MGF: "À PAGAR" contava como pago (ILIKE '%paga%'), zerando A pagar /
--     Vencidos / A vencer; cooperativa, regional, associado, tipo de veículo e
--     motivo do evento vazios (a API só manda códigos).
--   * Indicadores: reativações, boletos cancelados, juros, aberturas e
--     pagamentos de evento por tipo e assistência nunca eram derivados;
--     evolução diária da frota (pid_placas_diario) só era gravada pelo fluxo
--     antigo de planilha.
-- Nada aqui faz chamada nova à Hinova: tudo é derivado de dados já importados.

-- ===================================================================
-- 1. Mapas persistentes de códigos Hinova (cooperativa, regional, veículo)
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.hinova_lookups (
  corretora_id uuid NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('cooperativa','regional')),
  codigo text NOT NULL,
  descricao text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, tipo, codigo)
);
ALTER TABLE public.hinova_lookups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hinova_lookups FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.hinova_veiculos_map (
  corretora_id uuid NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  codigo_veiculo text NOT NULL,
  codigo_associado text,
  nome_associado text,
  placa text,
  modelo text,
  tipo text,
  codigo_cooperativa text,
  codigo_regional text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, codigo_veiculo)
);
CREATE INDEX IF NOT EXISTS idx_hinova_veiculos_map_assoc ON public.hinova_veiculos_map (corretora_id, codigo_associado);
ALTER TABLE public.hinova_veiculos_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hinova_veiculos_map FROM anon, authenticated;

-- Os mapas de cooperativa/regional já são montados pela coleta da base
-- (base_api_jobs.ctx), mas o ctx é zerado a cada ciclo. Copiamos para a
-- tabela persistente sempre que mudarem. Nunca derruba a coleta da base.
CREATE OR REPLACE FUNCTION public._trg_base_jobs_lookups()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  BEGIN
    INSERT INTO hinova_lookups (corretora_id, tipo, codigo, descricao, updated_at)
    SELECT NEW.corretora_id, 'cooperativa', k, btrim(v), now()
    FROM jsonb_each_text(COALESCE(NEW.ctx->'coop','{}'::jsonb)) x(k, v)
    WHERE NULLIF(btrim(v),'') IS NOT NULL
    ON CONFLICT (corretora_id, tipo, codigo) DO UPDATE SET descricao = EXCLUDED.descricao, updated_at = now()
      WHERE hinova_lookups.descricao IS DISTINCT FROM EXCLUDED.descricao;
    INSERT INTO hinova_lookups (corretora_id, tipo, codigo, descricao, updated_at)
    SELECT NEW.corretora_id, 'regional', k, btrim(v), now()
    FROM jsonb_each_text(COALESCE(NEW.ctx->'regional','{}'::jsonb)) x(k, v)
    WHERE NULLIF(btrim(v),'') IS NOT NULL
    ON CONFLICT (corretora_id, tipo, codigo) DO UPDATE SET descricao = EXCLUDED.descricao, updated_at = now()
      WHERE hinova_lookups.descricao IS DISTINCT FROM EXCLUDED.descricao;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_trg_base_jobs_lookups: %', SQLERRM;
  END;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS trg_base_jobs_lookups ON public.base_api_jobs;
CREATE TRIGGER trg_base_jobs_lookups
AFTER INSERT OR UPDATE OF ctx ON public.base_api_jobs
FOR EACH ROW
WHEN (NEW.ctx ? 'coop' OR NEW.ctx ? 'regional')
EXECUTE FUNCTION public._trg_base_jobs_lookups();

-- Veículos: a coleta da base grava cada veículo em base_api_stg (tabela de
-- passagem, limpa a cada ciclo). Guardamos o essencial para ligar os
-- lançamentos do MGF (que só trazem codigo_veiculo/codigo_associado).
CREATE OR REPLACE FUNCTION public._trg_base_stg_veiculos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  BEGIN
    INSERT INTO hinova_veiculos_map (corretora_id, codigo_veiculo, codigo_associado, nome_associado, placa, modelo, tipo,
                                     codigo_cooperativa, codigo_regional, updated_at)
    SELECT DISTINCT ON (n.corretora_id, n.veiculo->>'codigo_veiculo')
      n.corretora_id, n.veiculo->>'codigo_veiculo',
      NULLIF(n.veiculo->>'codigo_associado',''), NULLIF(btrim(n.veiculo->>'nome_associado'),''),
      NULLIF(upper(regexp_replace(COALESCE(n.veiculo->>'placa',''),'[^A-Za-z0-9]','','g')),''),
      NULLIF(btrim(n.veiculo->>'modelo'),''), NULLIF(btrim(n.veiculo->>'tipo'),''),
      NULLIF(n.veiculo->>'codigo_cooperativa',''), NULLIF(n.veiculo->>'codigo_regional',''), now()
    FROM novos n
    WHERE NULLIF(n.veiculo->>'codigo_veiculo','') IS NOT NULL
    ORDER BY n.corretora_id, n.veiculo->>'codigo_veiculo', n.seq DESC
    ON CONFLICT (corretora_id, codigo_veiculo) DO UPDATE SET
      codigo_associado = EXCLUDED.codigo_associado, nome_associado = EXCLUDED.nome_associado,
      placa = EXCLUDED.placa, modelo = EXCLUDED.modelo, tipo = EXCLUDED.tipo,
      codigo_cooperativa = EXCLUDED.codigo_cooperativa, codigo_regional = EXCLUDED.codigo_regional,
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_trg_base_stg_veiculos: %', SQLERRM;
  END;
  RETURN NULL;
END $f$;

DROP TRIGGER IF EXISTS trg_base_stg_veiculos ON public.base_api_stg;
CREATE TRIGGER trg_base_stg_veiculos
AFTER INSERT ON public.base_api_stg
REFERENCING NEW TABLE AS novos
FOR EACH STATEMENT
EXECUTE FUNCTION public._trg_base_stg_veiculos();

-- carga inicial a partir do que já está no ctx
INSERT INTO public.hinova_lookups (corretora_id, tipo, codigo, descricao)
SELECT j.corretora_id, 'cooperativa', k, btrim(v) FROM public.base_api_jobs j, jsonb_each_text(COALESCE(j.ctx->'coop','{}'::jsonb)) x(k,v)
WHERE NULLIF(btrim(v),'') IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO public.hinova_lookups (corretora_id, tipo, codigo, descricao)
SELECT j.corretora_id, 'regional', k, btrim(v) FROM public.base_api_jobs j, jsonb_each_text(COALESCE(j.ctx->'regional','{}'::jsonb)) x(k,v)
WHERE NULLIF(btrim(v),'') IS NOT NULL
ON CONFLICT DO NOTHING;

-- ===================================================================
-- 2. Eventos: UF, cidade do associado (fallback), conclusão
-- ===================================================================
ALTER TABLE public.sga_eventos ADD COLUMN IF NOT EXISTS associado_cidade text;

CREATE OR REPLACE FUNCTION public._eventos_janela(p_base text, p_tok text, p_imp uuid, p_ini date, p_fim date, p_atualizar boolean)
RETURNS int[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $f$
DECLARE v_resp record; v_arr jsonb; v_upd int := 0; v_ins int := 0;
  v_fin text := 'FINALIZ|CANCELAD|NEGAD|CONCLU|ENCERRAD|INDENIZ|ARQUIV|BAIXAD';
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
    UPDATE sga_eventos t SET
      situacao_evento = ev->>'situacao_evento',
      valor_reparo = hinova_num(ev->>'valor_reparo'),
      evento_cidade = COALESCE(NULLIF(btrim(ev->>'cidade'),''), t.evento_cidade),
      evento_estado = COALESCE(NULLIF(btrim(ev->>'estado'),''), t.evento_estado),
      associado_cidade = COALESCE(NULLIF(btrim(ev#>>'{associado,cidade}'),''), t.associado_cidade),
      associado_estado = COALESCE(NULLIF(btrim(ev#>>'{associado,estado}'),''), t.associado_estado),
      data_ultima_alteracao_situacao = CASE WHEN t.situacao_evento IS DISTINCT FROM ev->>'situacao_evento'
                                            THEN current_date ELSE t.data_ultima_alteracao_situacao END,
      -- a API não traz data de conclusão: registramos o dia em que vimos o
      -- evento passar para uma situação final (precisão = frequência da sync)
      data_conclusao = CASE WHEN t.data_conclusao IS NULL
                             AND upper(COALESCE(ev->>'situacao_evento','')) ~ v_fin
                             AND NOT (upper(COALESCE(t.situacao_evento,'')) ~ v_fin)
                            THEN current_date ELSE t.data_conclusao END
    FROM jsonb_array_elements(v_arr) ev
    WHERE t.importacao_id=p_imp AND t.protocolo IS NOT NULL AND t.protocolo = NULLIF(ev->>'protocolo','')
      AND (t.situacao_evento IS DISTINCT FROM ev->>'situacao_evento'
           OR t.valor_reparo IS DISTINCT FROM hinova_num(ev->>'valor_reparo')
           OR (t.evento_estado IS NULL AND NULLIF(btrim(ev->>'estado'),'') IS NOT NULL)
           OR (t.evento_cidade IS NULL AND NULLIF(btrim(ev->>'cidade'),'') IS NOT NULL)
           OR (t.associado_cidade IS NULL AND NULLIF(btrim(ev#>>'{associado,cidade}'),'') IS NOT NULL)
           OR (t.associado_estado IS NULL AND NULLIF(btrim(ev#>>'{associado,estado}'),'') IS NOT NULL));
    GET DIAGNOSTICS v_upd = ROW_COUNT;
  END IF;
  INSERT INTO sga_eventos (importacao_id, situacao_evento, tipo_evento, motivo_evento, envolvimento, passivel_ressarcimento,
    solicitou_carro_reserva, protocolo, numero_bo, data_cadastro_item, data_cadastro_evento, data_evento,
    valor_reparo, previsao_valor_reparo, participacao, evento_cidade, evento_estado, evento_logradouro,
    associado_cidade, associado_estado, regional, cooperativa, voluntario,
    placa, modelo_veiculo, ano_fabricacao, categoria_veiculo, valor_protegido_veiculo)
  SELECT p_imp, ev->>'situacao_evento', ev->>'evento_tipo', ev->>'motivo', ev->>'envolvimento', NULLIF(ev->>'passivel_ressarcimento',''),
    ev->>'solicitou_carro_reserva', NULLIF(ev->>'protocolo',''), NULLIF(ev->>'numero_bo',''),
    hinova_dateiso(ev->>'data_cadastro'), hinova_dateiso(ev->>'data_cadastro'), hinova_dateiso(ev->>'data_evento'),
    hinova_num(ev->>'valor_reparo'), hinova_num(ev->>'previsao_valor_reparo'), hinova_num(ev->>'participacao'),
    NULLIF(btrim(ev->>'cidade'),''), NULLIF(btrim(ev->>'estado'),''), ev->>'logradouro',
    NULLIF(btrim(ev#>>'{associado,cidade}'),''), NULLIF(btrim(ev#>>'{associado,estado}'),''),
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
$f$;
REVOKE ALL ON FUNCTION public._eventos_janela(text,text,uuid,date,date,boolean) FROM public, anon, authenticated;

-- Rodízio de status: na primeira passada (meta.local_ok ausente) cobre os
-- últimos 180 dias para preencher UF/cidade dos eventos já existentes; depois
-- volta a cobrir só eventos em aberto. Ao fim, enriquece MGF/custos.
DO $$
DECLARE v text; n text;
BEGIN
  v := pg_get_functiondef('public.importar_eventos_api(uuid,boolean,date)'::regprocedure);
  IF position('local_ok' in v) = 0 THEN
    n := replace(v,
$a$      SELECT min(data_cadastro_evento) INTO v_min_aberto FROM sga_eventos
      WHERE importacao_id=v_imp AND NOT (upper(coalesce(situacao_evento,'')) ~ v_fin)
        AND data_cadastro_evento >= v_fim - 365 AND data_cadastro_evento < v_ini_novos;$a$,
$a$      IF COALESCE((v_meta->>'local_ok')::boolean, false) THEN
        SELECT min(data_cadastro_evento) INTO v_min_aberto FROM sga_eventos
        WHERE importacao_id=v_imp AND NOT (upper(coalesce(situacao_evento,'')) ~ v_fin)
          AND data_cadastro_evento >= v_fim - 365 AND data_cadastro_evento < v_ini_novos;
      ELSE
        v_min_aberto := LEAST(v_fim - 180, v_ini_novos - 1);
      END IF;$a$);
    n := replace(n,
$a$        v_meta := v_meta || jsonb_build_object('cursor_status', CASE WHEN v_cur >= v_ini_novos THEN NULL ELSE v_cur END);$a$,
$a$        v_meta := v_meta || jsonb_build_object('cursor_status', CASE WHEN v_cur >= v_ini_novos THEN NULL ELSE v_cur END);
        IF v_cur >= v_ini_novos THEN v_meta := v_meta || jsonb_build_object('local_ok', true); END IF;$a$);
    n := replace(n,
$a$  UPDATE sga_automacao_config SET ultimo_status='sucesso', ultimo_erro=null, ultima_execucao=now(), ultima_origem='api' WHERE corretora_id=p_corretora_id;
  RETURN jsonb_build_object('success',true,'completo', NOT v_parcial,$a$,
$a$  UPDATE sga_automacao_config SET ultimo_status='sucesso', ultimo_erro=null, ultima_execucao=now(), ultima_origem='api' WHERE corretora_id=p_corretora_id;
  BEGIN PERFORM public.enriquecer_mgf_eventos(p_corretora_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('success',true,'completo', NOT v_parcial,$a$);
    IF n = v OR position('local_ok' in n) = 0 OR position('enriquecer_mgf_eventos' in n) = 0 THEN
      RAISE EXCEPTION 'importar_eventos_api: trechos esperados não encontrados';
    END IF;
    EXECUTE n;
  END IF;
END $$;

-- Dashboard de eventos: cidade cai para a cidade do associado quando o SGA
-- não informa o local do evento (a UF já fazia esse fallback).
DO $$
DECLARE v text; n text;
BEGIN
  v := pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname='calcular_dashboard_eventos' AND p.pronamespace='public'::regnamespace;
  IF position('associado_cidade' in v) = 0 THEN
    n := replace(v,
$a$  SELECT evento_cidade AS name, count(*) AS value FROM filtered
  WHERE evento_cidade IS NOT NULL AND evento_cidade <> '' AND evento_cidade NOT IN ('N/I','NAO INFORMADO','NÃO INFORMADO')
  GROUP BY evento_cidade ORDER BY value DESC LIMIT 10$a$,
$a$  SELECT COALESCE(NULLIF(evento_cidade,''), NULLIF(associado_cidade,'')) AS name, count(*) AS value FROM filtered
  WHERE COALESCE(NULLIF(evento_cidade,''), NULLIF(associado_cidade,'')) IS NOT NULL
    AND COALESCE(NULLIF(evento_cidade,''), NULLIF(associado_cidade,'')) NOT IN ('N/I','NAO INFORMADO','NÃO INFORMADO')
  GROUP BY 1 ORDER BY value DESC LIMIT 10$a$);
    IF n = v THEN RAISE EXCEPTION 'calcular_dashboard_eventos: bloco cidade não encontrado'; END IF;
    EXECUTE n;
  END IF;
END $$;

-- ===================================================================
-- 3. MGF: situação "À PAGAR" não é paga
-- ===================================================================
DO $$
DECLARE r record; n text;
BEGIN
  FOR r IN SELECT p.oid, pg_get_functiondef(p.oid) d FROM pg_proc p
           WHERE p.proname='calcular_dashboard_mgf' AND p.pronamespace='public'::regnamespace LOOP
    IF position($a$d.situacao_pagamento ILIKE '%paga%'$a$ in r.d) > 0 THEN
      n := replace(r.d,
        $a$(d.situacao_pagamento ILIKE '%pago%' OR d.situacao_pagamento ILIKE '%paga%' OR d.data_pagamento IS NOT NULL)$a$,
        $a$(d.data_pagamento IS NOT NULL OR upper(btrim(COALESCE(d.situacao_pagamento,''))) ~ '^(PAGA|PAGO|QUITAD|LIQUID|BAIXAD)')$a$);
      IF n = r.d THEN RAISE EXCEPTION 'calcular_dashboard_mgf: expressão is_pago não encontrada'; END IF;
      EXECUTE n;
    END IF;
  END LOOP;
END $$;

-- ===================================================================
-- 4. Enriquecimento MGF ⇄ Eventos (só dados locais, sem HTTP)
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_mgf_dados_imp_protocolo ON public.mgf_dados (importacao_id, protocolo_evento) WHERE protocolo_evento IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enriquecer_mgf_eventos(p_corretora_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_imps uuid[]; v_ev_imp uuid; n1 int := 0; n2 int := 0; n3 int := 0; n4 int := 0; n5 int := 0; n6 int := 0;
BEGIN
  SELECT array_agg(id) INTO v_imps FROM mgf_importacoes WHERE corretora_id = p_corretora_id AND ativo;
  SELECT id INTO v_ev_imp FROM sga_importacoes WHERE corretora_id = p_corretora_id AND ativo ORDER BY created_at DESC LIMIT 1;

  IF v_imps IS NOT NULL THEN
    UPDATE mgf_dados d SET cooperativa = l.descricao
    FROM hinova_lookups l
    WHERE d.importacao_id = ANY(v_imps) AND NULLIF(btrim(d.cooperativa),'') IS NULL
      AND l.corretora_id = p_corretora_id AND l.tipo = 'cooperativa' AND l.codigo = d.dados_extras->>'codigo_cooperativa';
    GET DIAGNOSTICS n1 = ROW_COUNT;

    UPDATE mgf_dados d SET regional = l.descricao
    FROM hinova_lookups l
    WHERE d.importacao_id = ANY(v_imps) AND NULLIF(btrim(d.regional),'') IS NULL
      AND l.corretora_id = p_corretora_id AND l.tipo = 'regional' AND l.codigo = d.dados_extras->>'codigo_regional';
    GET DIAGNOSTICS n2 = ROW_COUNT;

    UPDATE mgf_dados d SET
      placa = COALESCE(NULLIF(d.placa,''), v.placa),
      modelo_veiculo = COALESCE(NULLIF(d.modelo_veiculo,''), v.modelo),
      tipo_veiculo = COALESCE(NULLIF(d.tipo_veiculo,''), v.tipo),
      associado = COALESCE(NULLIF(d.associado,''), v.nome_associado),
      cooperativa = COALESCE(NULLIF(d.cooperativa,''), (SELECT l.descricao FROM hinova_lookups l WHERE l.corretora_id=p_corretora_id AND l.tipo='cooperativa' AND l.codigo=v.codigo_cooperativa)),
      regional = COALESCE(NULLIF(d.regional,''), (SELECT l.descricao FROM hinova_lookups l WHERE l.corretora_id=p_corretora_id AND l.tipo='regional' AND l.codigo=v.codigo_regional))
    FROM hinova_veiculos_map v
    WHERE d.importacao_id = ANY(v_imps)
      AND v.corretora_id = p_corretora_id AND v.codigo_veiculo = d.dados_extras->>'codigo_veiculo'
      AND (NULLIF(d.placa,'') IS NULL OR NULLIF(d.tipo_veiculo,'') IS NULL OR NULLIF(d.associado,'') IS NULL);
    GET DIAGNOSTICS n3 = ROW_COUNT;

    UPDATE mgf_dados d SET associado = a.nome_associado
    FROM (SELECT DISTINCT ON (codigo_associado) codigo_associado, nome_associado FROM hinova_veiculos_map
          WHERE corretora_id = p_corretora_id AND codigo_associado IS NOT NULL AND nome_associado IS NOT NULL
          ORDER BY codigo_associado, updated_at DESC) a
    WHERE d.importacao_id = ANY(v_imps) AND NULLIF(d.associado,'') IS NULL
      AND a.codigo_associado = d.dados_extras->>'codigo_associado';
    GET DIAGNOSTICS n4 = ROW_COUNT;

    IF v_ev_imp IS NOT NULL THEN
      UPDATE mgf_dados d SET
        motivo_evento = COALESCE(NULLIF(d.motivo_evento,''), e.motivo_evento),
        veiculo_evento = COALESCE(NULLIF(d.veiculo_evento,''), e.placa),
        regional_evento = COALESCE(NULLIF(d.regional_evento,''), e.regional),
        placa = COALESCE(NULLIF(d.placa,''), e.placa),
        cooperativa = COALESCE(NULLIF(d.cooperativa,''), e.cooperativa),
        regional = COALESCE(NULLIF(d.regional,''), e.regional)
      FROM sga_eventos e
      WHERE d.importacao_id = ANY(v_imps) AND NULLIF(d.protocolo_evento,'') IS NOT NULL
        AND e.importacao_id = v_ev_imp AND e.protocolo = d.protocolo_evento
        AND NULLIF(d.motivo_evento,'') IS NULL;
      GET DIAGNOSTICS n5 = ROW_COUNT;

      -- custo do evento = lançamentos de SAÍDA do MGF ligados ao protocolo
      WITH c AS (
        SELECT d.protocolo_evento AS prot, round(sum(COALESCE(NULLIF(d.valor_pagamento,0), d.valor, 0))::numeric, 2) AS v
        FROM mgf_dados d
        WHERE d.importacao_id = ANY(v_imps) AND d.operacao = 'SAIDA' AND NULLIF(d.protocolo_evento,'') IS NOT NULL
          AND NOT (upper(COALESCE(d.situacao_pagamento,'')) ~ 'CANCEL|EXCLU|ESTORN')
        GROUP BY 1)
      UPDATE sga_eventos e SET custo_evento = c.v
      FROM c WHERE e.importacao_id = v_ev_imp AND e.protocolo = c.prot AND e.custo_evento IS DISTINCT FROM c.v;
      GET DIAGNOSTICS n6 = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object('cooperativa', n1, 'regional', n2, 'veiculo', n3, 'associado', n4, 'evento', n5, 'custo_eventos', n6);
END $f$;
REVOKE ALL ON FUNCTION public.enriquecer_mgf_eventos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enriquecer_mgf_eventos(uuid) TO authenticated, service_role;

-- chamado ao fim de cada importação do MGF
DO $$
DECLARE v text; n text;
BEGIN
  v := pg_get_functiondef('public.importar_mgf_api_periodo(uuid,date,date,integer)'::regprocedure);
  IF position('enriquecer_mgf_eventos' in v) = 0 THEN
    n := replace(v, $a$  DELETE FROM public.mgf_dashboard_cache WHERE true;$a$,
      $a$  BEGIN PERFORM public.enriquecer_mgf_eventos(p_corretora_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  DELETE FROM public.mgf_dashboard_cache WHERE true;$a$);
    IF n = v THEN RAISE EXCEPTION 'importar_mgf_api_periodo: trecho do cache não encontrado'; END IF;
    EXECUTE n;
  END IF;
END $$;

-- ===================================================================
-- 5. Indicadores complementares (pid_operacional)
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.pid_derivacao_status (
  corretora_id uuid PRIMARY KEY REFERENCES public.corretoras(id) ON DELETE CASCADE,
  complementar_em timestamptz,
  resultado jsonb
);
ALTER TABLE public.pid_derivacao_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pid_derivacao_status FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.derivar_indicadores_complementares(p_corretora_id uuid, p_meses int DEFAULT 18)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_ini date := (date_trunc('month', now()) - make_interval(months => p_meses))::date;
        v_fim date := (date_trunc('month', now()) + interval '1 month')::date;
        v_linhas int := 0;
BEGIN
  WITH bol AS (
    SELECT DISTINCT ON (COALESCE(cb.dados_extras->>'nosso_numero', cb.dedup_key, cb.id::text))
      upper(COALESCE(cb.situacao,'')) AS sit, cb.valor,
      COALESCE(NULLIF(cb.dados_extras->>'valor_pagamento','')::numeric, cb.valor) AS vpago,
      upper(btrim(COALESCE(cb.dados_extras->>'tipo_boleto',''))) AS tipo,
      COALESCE(cb.data_vencimento_original, cb.data_vencimento) AS dvo
    FROM cobranca_boletos cb JOIN cobranca_importacoes ci ON ci.id = cb.importacao_id AND ci.ativo AND ci.corretora_id = p_corretora_id
    WHERE COALESCE(cb.data_vencimento_original, cb.data_vencimento) >= v_ini
      AND COALESCE(cb.data_vencimento_original, cb.data_vencimento) < v_fim
    ORDER BY COALESCE(cb.dados_extras->>'nosso_numero', cb.dedup_key, cb.id::text), cb.valor DESC NULLS LAST
  ),
  b AS (
    SELECT date_part('year',dvo)::int ano, date_part('month',dvo)::int mes,
      count(*) FILTER (WHERE sit = 'CANCELADO') AS canc,
      round(COALESCE(sum(valor) FILTER (WHERE sit = 'CANCELADO'),0)) AS vcanc,
      count(*) FILTER (WHERE sit NOT IN ('CANCELADO','EXCLUIDO','EXCLUÍDO')) AS emit,
      count(*) FILTER (WHERE tipo ~ '^REATIVA' AND sit NOT IN ('CANCELADO','EXCLUIDO','EXCLUÍDO')) AS reat,
      round(COALESCE(sum(GREATEST(vpago - valor, 0)) FILTER (WHERE sit = 'BAIXADO'),0)) AS juros,
      COALESCE(sum(valor) FILTER (WHERE sit = 'BAIXADO'),0) AS recebido
    FROM bol GROUP BY 1,2
  ),
  evs AS (
    SELECT e.*,
      CASE WHEN upper(COALESCE(e.motivo_evento,'')) ~ 'REBOQUE|ASSIST' THEN 'assist'
           WHEN upper(COALESCE(e.motivo_evento,'')) ~ 'CARRO RESERVA' THEN 'reserva'
           WHEN upper(COALESCE(e.motivo_evento,'')) ~ 'VIDRO|PARA-?BRISA|LANTERNA|FAROL|RETROVISOR|FLR' THEN 'vidros'
           WHEN upper(COALESCE(e.motivo_evento,'')) ~ 'FURTO|ROUBO|INC[EÊ]NDIO|PERDA TOTAL|INTEGRAL' THEN 'integral'
           ELSE 'parcial' END AS classe,
      upper(COALESCE(e.tipo_evento,'')) = 'TERCEIRO' AS terceiro
    FROM sga_eventos e JOIN sga_importacoes si ON si.id = e.importacao_id AND si.ativo AND si.corretora_id = p_corretora_id
  ),
  ab AS (
    SELECT date_part('year',data_cadastro_evento)::int ano, date_part('month',data_cadastro_evento)::int mes,
      count(*) FILTER (WHERE classe='parcial' AND NOT terceiro) a_pa, count(*) FILTER (WHERE classe='parcial' AND terceiro) a_pt,
      count(*) FILTER (WHERE classe='integral' AND NOT terceiro) a_ia, count(*) FILTER (WHERE classe='integral' AND terceiro) a_it,
      count(*) FILTER (WHERE classe='vidros') a_v,
      count(*) FILTER (WHERE classe='reserva' OR upper(COALESCE(solicitou_carro_reserva,''))='SIM') a_cr,
      count(*) FILTER (WHERE classe='assist') a_as
    FROM evs WHERE data_cadastro_evento >= v_ini AND data_cadastro_evento < v_fim GROUP BY 1,2
  ),
  pg AS (
    SELECT date_part('year',d.data_pagamento)::int ano, date_part('month',d.data_pagamento)::int mes,
      e.classe, e.terceiro, count(DISTINCT e.protocolo) qtd,
      sum(COALESCE(NULLIF(d.valor_pagamento,0), d.valor, 0)) valor
    FROM mgf_dados d
    JOIN mgf_importacoes mi ON mi.id = d.importacao_id AND mi.ativo AND mi.corretora_id = p_corretora_id
    JOIN evs e ON e.protocolo = d.protocolo_evento
    WHERE d.operacao = 'SAIDA' AND d.data_pagamento >= v_ini AND d.data_pagamento < v_fim
      AND NOT (upper(COALESCE(d.situacao_pagamento,'')) ~ 'CANCEL|EXCLU|ESTORN')
    GROUP BY 1,2,3,4
  ),
  pgm AS (
    SELECT ano AS pano, mes AS pmes,
      sum(qtd) FILTER (WHERE classe='parcial' AND NOT terceiro) q_pa, sum(valor) FILTER (WHERE classe='parcial' AND NOT terceiro) v_pa,
      sum(qtd) FILTER (WHERE classe='parcial' AND terceiro) q_pt, sum(valor) FILTER (WHERE classe='parcial' AND terceiro) v_pt,
      sum(qtd) FILTER (WHERE classe='integral' AND NOT terceiro) q_ia, sum(valor) FILTER (WHERE classe='integral' AND NOT terceiro) v_ia,
      sum(qtd) FILTER (WHERE classe='integral' AND terceiro) q_it, sum(valor) FILTER (WHERE classe='integral' AND terceiro) v_it,
      sum(qtd) FILTER (WHERE classe='vidros') q_v, sum(valor) FILTER (WHERE classe='vidros') v_v,
      sum(qtd) FILTER (WHERE classe='reserva') q_cr, sum(valor) FILTER (WHERE classe='reserva') v_cr,
      sum(valor) FILTER (WHERE classe='assist') v_as
    FROM pg GROUP BY 1,2
  ),
  cus AS (
    SELECT date_part('year', COALESCE(d.data_pagamento, d.data_vencimento))::int cano,
      date_part('month', COALESCE(d.data_pagamento, d.data_vencimento))::int cmes,
      sum(d.valor) custo_mgf
    FROM mgf_dados d JOIN mgf_importacoes mi ON mi.id = d.importacao_id AND mi.ativo AND mi.corretora_id = p_corretora_id
    WHERE d.operacao = 'SAIDA' AND (upper(COALESCE(d.centro_custo,'')) LIKE 'EVENTOS%' OR NULLIF(d.protocolo_evento,'') IS NOT NULL)
      AND NOT (upper(COALESCE(d.situacao_pagamento,'')) ~ 'CANCEL|EXCLU|ESTORN')
      AND COALESCE(d.data_pagamento, d.data_vencimento) >= v_ini AND COALESCE(d.data_pagamento, d.data_vencimento) < v_fim
    GROUP BY 1,2
  ),
  m AS (
    SELECT p.id, cus.custo_mgf, b.canc, b.vcanc, b.emit, b.reat, b.juros, b.recebido,
      ab.a_pa, ab.a_pt, ab.a_ia, ab.a_it, ab.a_v, ab.a_cr, ab.a_as,
      pgm.q_pa, pgm.v_pa, pgm.q_pt, pgm.v_pt, pgm.q_ia, pgm.v_ia, pgm.q_it, pgm.v_it,
      pgm.q_v, pgm.v_v, pgm.q_cr, pgm.v_cr, pgm.v_as
    FROM pid_operacional p
    LEFT JOIN b ON b.ano = p.ano AND b.mes = p.mes
    LEFT JOIN ab ON ab.ano = p.ano AND ab.mes = p.mes
    LEFT JOIN pgm ON pgm.pano = p.ano AND pgm.pmes = p.mes
    LEFT JOIN cus ON cus.cano = p.ano AND cus.cmes = p.mes
    WHERE p.corretora_id = p_corretora_id AND make_date(p.ano, p.mes, 1) >= v_ini AND make_date(p.ano, p.mes, 1) < v_fim
  )
  UPDATE pid_operacional p SET
    reativacao = COALESCE(m.reat, 0),
    boletos_cancelados = COALESCE(m.canc, 0),
    valor_boletos_cancelados = COALESCE(m.vcanc, 0),
    percentual_cancelamento_boletos = round(COALESCE(m.canc,0)::numeric / NULLIF(COALESCE(m.canc,0) + COALESCE(m.emit,0), 0), 4),
    arrecadamento_juros = COALESCE(m.juros, 0),
    percentual_arrecadacao_juros = round(COALESCE(m.juros,0) / NULLIF(m.recebido, 0), 4),
    abertura_indenizacao_parcial_associado = COALESCE(m.a_pa, 0),
    abertura_indenizacao_parcial_terceiro = COALESCE(m.a_pt, 0),
    abertura_indenizacao_integral_associado = COALESCE(m.a_ia, 0),
    abertura_indenizacao_integral_terceiro = COALESCE(m.a_it, 0),
    abertura_vidros = COALESCE(m.a_v, 0),
    abertura_carro_reserva = COALESCE(m.a_cr, 0),
    acionamentos_assistencia = COALESCE(m.a_as, 0),
    custo_assistencia = round(COALESCE(m.v_as, 0)),
    pagamento_qtd_parcial_associado = COALESCE(m.q_pa, 0), pagamento_valor_parcial_associado = round(COALESCE(m.v_pa, 0)),
    pagamento_qtd_parcial_terceiro = COALESCE(m.q_pt, 0), pagamento_valor_parcial_terceiro = round(COALESCE(m.v_pt, 0)),
    pagamento_qtd_integral_associado = COALESCE(m.q_ia, 0), pagamento_valor_integral_associado = round(COALESCE(m.v_ia, 0)),
    pagamento_qtd_integral_terceiro = COALESCE(m.q_it, 0), pagamento_valor_integral_terceiro = round(COALESCE(m.v_it, 0)),
    pagamento_qtd_vidros = COALESCE(m.q_v, 0), pagamento_valor_vidros = round(COALESCE(m.v_v, 0)),
    pagamento_qtd_carro_reserva = COALESCE(m.q_cr, 0), pagamento_valor_carro_reserva = round(COALESCE(m.v_cr, 0)),
    ticket_medio_parcial = round((COALESCE(m.v_pa,0) + COALESCE(m.v_pt,0)) / NULLIF(COALESCE(m.q_pa,0) + COALESCE(m.q_pt,0), 0)),
    ticket_medio_integral = round((COALESCE(m.v_ia,0) + COALESCE(m.v_it,0)) / NULLIF(COALESCE(m.q_ia,0) + COALESCE(m.q_it,0), 0)),
    ticket_medio_vidros = round(COALESCE(m.v_v,0) / NULLIF(m.q_v, 0)),
    ticket_medio_carro_reserva = round(COALESCE(m.v_cr,0) / NULLIF(m.q_cr, 0)),
    indice_dano_parcial = round((COALESCE(m.a_pa,0) + COALESCE(m.a_pt,0))::numeric / NULLIF(p.placas_ativas, 0), 4),
    indice_dano_integral = round((COALESCE(m.a_ia,0) + COALESCE(m.a_it,0))::numeric / NULLIF(p.placas_ativas, 0), 4),
    -- custo dos eventos: se a derivação principal não achou custo por evento,
    -- usa as saídas do MGF de eventos (mesma regra do gráfico de sinistralidade)
    custo_total_eventos = CASE WHEN COALESCE(p.custo_total_eventos,0) > 0 THEN p.custo_total_eventos ELSE round(COALESCE(m.custo_mgf,0)) END,
    sinistralidade_financeira = CASE WHEN COALESCE(p.sinistralidade_financeira,0) > 0 THEN p.sinistralidade_financeira
                                     ELSE round(COALESCE(m.custo_mgf,0) / NULLIF(p.total_recebido,0), 4) END,
    comprometimento_assistencia = round(COALESCE(m.v_as,0) / NULLIF(p.total_recebido, 0), 4),
    updated_at = now()
  FROM m WHERE p.id = m.id;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  INSERT INTO pid_derivacao_status (corretora_id, complementar_em, resultado)
  VALUES (p_corretora_id, now(), jsonb_build_object('meses', v_linhas))
  ON CONFLICT (corretora_id) DO UPDATE SET complementar_em = now(), resultado = EXCLUDED.resultado;
  RETURN jsonb_build_object('success', true, 'meses', v_linhas);
END $f$;
REVOKE ALL ON FUNCTION public.derivar_indicadores_complementares(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.derivar_indicadores_complementares(uuid, int) TO authenticated, service_role;

-- Worker: processa as associações com derivação mais antiga primeiro, dentro
-- de um orçamento de tempo. Só SQL local — nenhuma chamada à Hinova.
CREATE OR REPLACE FUNCTION public.derivar_complementares_worker()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r record; v_t0 timestamptz := clock_timestamp(); v_n int := 0; v_err int := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('derivar_complementares')::bigint) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;
  FOR r IN
    SELECT c.id FROM corretoras c
    WHERE EXISTS (SELECT 1 FROM pid_operacional p WHERE p.corretora_id = c.id)
    ORDER BY (SELECT s.complementar_em FROM pid_derivacao_status s WHERE s.corretora_id = c.id) ASC NULLS FIRST
  LOOP
    EXIT WHEN clock_timestamp() - v_t0 > interval '200 seconds';
    BEGIN
      PERFORM public.enriquecer_mgf_eventos(r.id);
      PERFORM public.derivar_indicadores_complementares(r.id, 18);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1;
      INSERT INTO pid_derivacao_status (corretora_id, complementar_em, resultado)
      VALUES (r.id, now(), jsonb_build_object('erro', left(SQLERRM, 300)))
      ON CONFLICT (corretora_id) DO UPDATE SET complementar_em = now(), resultado = EXCLUDED.resultado;
    END;
  END LOOP;
  RETURN jsonb_build_object('processadas', v_n, 'erros', v_err);
END $f$;
REVOKE ALL ON FUNCTION public.derivar_complementares_worker() FROM public, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='derivar-indicadores-complementares') THEN
      PERFORM cron.schedule('derivar-indicadores-complementares', '40 10,22 * * *',
        $cmd$SET statement_timeout = '280s'; SELECT public.derivar_complementares_worker();$cmd$);
    END IF;
  END IF;
END $$;

-- ===================================================================
-- 6. Evolução diária da frota (pid_placas_diario) a partir do snapshot
-- ===================================================================
DO $$
DECLARE v text; n text;
BEGIN
  v := pg_get_functiondef('public.capturar_snapshot_veiculos(date)'::regprocedure);
  IF position('pid_placas_diario' in v) = 0 THEN
    n := replace(v,
$a$  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'data', v_data, 'veiculos', v_linhas);$a$,
$a$  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  -- série diária usada no gráfico "Evolução da frota" (modo Dia)
  INSERT INTO pid_placas_diario (corretora_id, data, placas_ativas, inadimplentes, updated_at)
  SELECT s.corretora_id, v_data, count(DISTINCT s.placa)::int,
         (SELECT p.inadimplentes FROM pid_operacional p WHERE p.corretora_id = s.corretora_id
            AND p.ano = date_part('year', v_data)::int AND p.mes = date_part('month', v_data)::int),
         now()
  FROM veiculo_snapshot_diario s WHERE s.data = v_data GROUP BY s.corretora_id
  ON CONFLICT (corretora_id, data) DO UPDATE SET placas_ativas = EXCLUDED.placas_ativas,
    inadimplentes = COALESCE(EXCLUDED.inadimplentes, pid_placas_diario.inadimplentes), updated_at = now();
  RETURN jsonb_build_object('success', true, 'data', v_data, 'veiculos', v_linhas);$a$);
    IF n = v THEN RAISE EXCEPTION 'capturar_snapshot_veiculos: trecho final não encontrado'; END IF;
    EXECUTE n;
  END IF;
END $$;

-- backfill dos últimos 60 dias a partir dos snapshots já existentes
INSERT INTO public.pid_placas_diario (corretora_id, data, placas_ativas, updated_at)
SELECT s.corretora_id, s.data, count(DISTINCT s.placa)::int, now()
FROM public.veiculo_snapshot_diario s
WHERE s.data >= current_date - 60
GROUP BY s.corretora_id, s.data
ON CONFLICT (corretora_id, data) DO NOTHING;
