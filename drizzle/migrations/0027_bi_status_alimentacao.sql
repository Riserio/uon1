-- 2026-10-15 — Status de alimentação do BI por associação (usado pela tela
-- "Ajuda do BI"). Uma chamada leve, só leitura, sem HTTP. Parceiro só enxerga
-- a própria associação; usuários internos enxergam qualquer uma.

CREATE OR REPLACE FUNCTION public.bi_status_alimentacao(p_corretora_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '15s'
AS $f$
DECLARE
  v jsonb := '{}'::jsonb;
  v_ev_imp uuid; v_mgf_imps uuid[]; v_cob_imps uuid[]; v_base_imp uuid;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (auth.role() = 'service_role' OR auth.uid() IS NULL
          OR NOT public.has_role(auth.uid(), 'parceiro')
          OR p_corretora_id = public.get_user_corretora_id(auth.uid())
          OR EXISTS (SELECT 1 FROM corretora_usuarios cu WHERE cu.corretora_id = p_corretora_id AND cu.profile_id = auth.uid() AND cu.ativo)) THEN
    RAISE EXCEPTION 'sem acesso a esta associação';
  END IF;

  SELECT id INTO v_ev_imp FROM sga_importacoes WHERE corretora_id = p_corretora_id AND ativo ORDER BY created_at DESC LIMIT 1;
  SELECT array_agg(id) INTO v_mgf_imps FROM mgf_importacoes WHERE corretora_id = p_corretora_id AND ativo;
  SELECT array_agg(id) INTO v_cob_imps FROM cobranca_importacoes WHERE corretora_id = p_corretora_id AND ativo;
  SELECT id INTO v_base_imp FROM estudo_base_importacoes WHERE corretora_id = p_corretora_id AND ativo ORDER BY created_at DESC LIMIT 1;

  -- Integração
  v := v || jsonb_build_object('integracao', (
    SELECT jsonb_build_object(
      'usar_api', h.usar_api, 'cobranca', h.ativo_cobranca, 'eventos', h.ativo_eventos, 'mgf', h.ativo_mgf,
      'hora_agendada', to_char(h.api_hora_agendada, 'HH24:MI'))
    FROM hinova_credenciais h WHERE h.corretora_id = p_corretora_id));

  -- Fila de sincronização (último resultado por módulo)
  v := v || jsonb_build_object('fila', COALESCE((
    SELECT jsonb_object_agg(q.modulo, jsonb_build_object('status', q.status, 'tentativas', q.tentativas,
             'mensagem', q.ultimo_erro, 'atualizado_em', q.updated_at))
    FROM _sync_queue q WHERE q.corretora_id = p_corretora_id), '{}'::jsonb));

  -- Base / cadastro
  v := v || jsonb_build_object('base', jsonb_build_object(
    'importado_em', (SELECT created_at FROM estudo_base_importacoes WHERE id = v_base_imp),
    'veiculos', (SELECT total_registros FROM estudo_base_importacoes WHERE id = v_base_imp),
    'coleta_fase', (SELECT fase FROM base_api_jobs WHERE corretora_id = p_corretora_id),
    'coleta_atualizada_em', (SELECT updated_at FROM base_api_jobs WHERE corretora_id = p_corretora_id),
    'coleta_erro', (SELECT ultimo_erro FROM base_api_jobs WHERE corretora_id = p_corretora_id),
    'ultima_mensagem', (SELECT mensagem FROM integracao_sync_log WHERE corretora_id = p_corretora_id AND modulo = 'base' ORDER BY created_at DESC LIMIT 1),
    'ultima_conferencia', (SELECT created_at FROM integracao_sync_log WHERE corretora_id = p_corretora_id AND modulo = 'base' AND mensagem ILIKE 'Base importada%' ORDER BY created_at DESC LIMIT 1),
    'frota_diaria_ate', (SELECT max(data) FROM pid_placas_diario WHERE corretora_id = p_corretora_id)));

  -- Indicadores (pid_operacional)
  v := v || jsonb_build_object('indicadores', jsonb_build_object(
    'mes_atual_atualizado_em', (SELECT updated_at FROM pid_operacional WHERE corretora_id = p_corretora_id
                                  AND ano = date_part('year', v_hoje) AND mes = date_part('month', v_hoje)),
    'placas_ativas_mes_atual', (SELECT placas_ativas FROM pid_operacional WHERE corretora_id = p_corretora_id
                                  AND ano = date_part('year', v_hoje) AND mes = date_part('month', v_hoje)),
    'meses_com_dado', (SELECT count(*) FROM pid_operacional WHERE corretora_id = p_corretora_id AND make_date(ano, mes, 1) <= v_hoje),
    'primeiro_mes', (SELECT min(make_date(ano, mes, 1)) FROM pid_operacional WHERE corretora_id = p_corretora_id),
    'complementares_em', (SELECT complementar_em FROM pid_derivacao_status WHERE corretora_id = p_corretora_id)));

  -- Eventos
  v := v || jsonb_build_object('eventos', jsonb_build_object(
    'atualizado_em', (SELECT COALESCE(NULLIF(meta->>'ultima_exec','')::timestamptz, updated_at) FROM sga_importacoes WHERE id = v_ev_imp),
    'total', (SELECT total_registros FROM sga_importacoes WHERE id = v_ev_imp),
    'ultimo_cadastro', (SELECT max(data_cadastro_evento) FROM sga_eventos WHERE importacao_id = v_ev_imp),
    'mes_atual', (SELECT count(*) FROM sga_eventos WHERE importacao_id = v_ev_imp AND data_cadastro_evento >= date_trunc('month', v_hoje)::date),
    'sem_local_no_sga', (SELECT count(*) FROM sga_eventos WHERE importacao_id = v_ev_imp AND data_cadastro_evento >= v_hoje - 90 AND NULLIF(evento_cidade,'') IS NULL),
    'ultimos_90_dias', (SELECT count(*) FROM sga_eventos WHERE importacao_id = v_ev_imp AND data_cadastro_evento >= v_hoje - 90),
    'com_custo_mgf', (SELECT count(*) FROM sga_eventos WHERE importacao_id = v_ev_imp AND COALESCE(custo_evento,0) > 0)));

  -- MGF
  v := v || jsonb_build_object('mgf', jsonb_build_object(
    'atualizado_em', (SELECT max(updated_at) FROM mgf_importacoes WHERE id = ANY(v_mgf_imps)),
    'lancamentos', (SELECT sum(total_registros) FROM mgf_importacoes WHERE id = ANY(v_mgf_imps)),
    'vencimento_ate', (SELECT max(data_vencimento) FROM mgf_dados WHERE importacao_id = ANY(v_mgf_imps)),
    'ligados_a_evento', (SELECT count(*) FROM mgf_dados WHERE importacao_id = ANY(v_mgf_imps) AND NULLIF(protocolo_evento,'') IS NOT NULL),
    'com_cooperativa', (SELECT count(*) FROM mgf_dados WHERE importacao_id = ANY(v_mgf_imps) AND NULLIF(cooperativa,'') IS NOT NULL),
    'mes_atual', (SELECT count(*) FROM mgf_dados WHERE importacao_id = ANY(v_mgf_imps) AND data_vencimento >= date_trunc('month', v_hoje)::date
                    AND data_vencimento < (date_trunc('month', v_hoje) + interval '1 month')::date)));

  -- Cobrança
  v := v || jsonb_build_object('cobranca', jsonb_build_object(
    'atualizado_em', (SELECT max(updated_at) FROM cobranca_importacoes WHERE id = ANY(v_cob_imps)),
    'importacoes', (SELECT jsonb_agg(jsonb_build_object('nome', nome_arquivo, 'registros', total_registros, 'atualizado_em', updated_at,
                                                         'ciclo_completo', meta->'ciclo_completo') ORDER BY nome_arquivo)
                    FROM cobranca_importacoes WHERE id = ANY(v_cob_imps)),
    'tipos_relatorio', (SELECT to_jsonb(tipos_boleto_relatorio) FROM cobranca_automacao_config WHERE corretora_id = p_corretora_id),
    'inadimplencia_base', COALESCE((SELECT inadimplencia_base FROM cobranca_automacao_config WHERE corretora_id = p_corretora_id), 'total')));

  -- Relatório diário (WhatsApp)
  v := v || jsonb_build_object('relatorio', (
    SELECT jsonb_agg(jsonb_build_object('nome', s.name, 'horario', to_char(s.send_time, 'HH24:MI'), 'frequencia', s.frequency,
                                        'ultimo_envio', s.last_run_at, 'status', s.last_status, 'aviso', s.last_error,
                                        'proximo', s.next_run_at, 'destinatarios', COALESCE(jsonb_array_length(to_jsonb(s.recipients)), 0)))
    FROM whatsapp_template_schedules s WHERE s.corretora_id = p_corretora_id AND s.ativo));

  RETURN v || jsonb_build_object('gerado_em', now());
END $f$;

REVOKE ALL ON FUNCTION public.bi_status_alimentacao(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bi_status_alimentacao(uuid) TO authenticated, service_role;

-- listar_tipos_boleto: parceiro com mais de uma associação também enxerga
-- as demais em que está ativo (antes só a "associação principal").
DO $$
DECLARE v text; n text;
BEGIN
  v := pg_get_functiondef('public.listar_tipos_boleto(uuid,date)'::regprocedure);
  IF position('corretora_usuarios' in v) = 0 THEN
    n := replace(v, $a$     or p_corretora_id = public.get_user_corretora_id(auth.uid())$a$,
      $a$     or p_corretora_id = public.get_user_corretora_id(auth.uid())
     or exists (select 1 from corretora_usuarios cu where cu.corretora_id = p_corretora_id and cu.profile_id = auth.uid() and cu.ativo)$a$);
    IF n <> v THEN EXECUTE n; END IF;
  END IF;
END $$;

-- Sinistralidade financeira (gráfico "Evolução da Sinistralidade (Custo)"):
-- o denominador era só ENTRADA paga do MGF (entradas manuais), quando o
-- recebido da associação são os boletos pagos da Cobrança. Agora:
--   custo    = saídas do MGF com centro de custo "EVENTOS…" OU ligadas a um
--              protocolo de evento (sem canceladas/excluídas/estornadas);
--   recebido = pid_operacional.total_recebido (boletos baixados) do mês;
--              se não houver, cai para as entradas pagas do MGF.
CREATE OR REPLACE FUNCTION public.calcular_sinistralidade(p_corretora_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
WITH imp AS (
  SELECT id FROM mgf_importacoes WHERE corretora_id = p_corretora_id AND ativo = true
  ORDER BY created_at DESC LIMIT 1
),
base AS (
  SELECT d.*, COALESCE(d.data_pagamento, d.data_vencimento) AS data_ref
  FROM mgf_dados d
  WHERE d.importacao_id = (SELECT id FROM imp)
    AND NOT (upper(COALESCE(d.situacao_pagamento,'')) ~ 'CANCEL|EXCLU|ESTORN')
),
mgf_mes AS (
  SELECT to_char(data_ref,'YYYY-MM') AS mes,
    COALESCE(sum(valor) FILTER (WHERE operacao = 'SAIDA'
      AND (upper(COALESCE(centro_custo,'')) LIKE 'EVENTOS%' OR NULLIF(protocolo_evento,'') IS NOT NULL)),0) AS custo_eventos,
    COALESCE(sum(valor_pagamento) FILTER (WHERE operacao = 'ENTRADA' AND upper(COALESCE(situacao_pagamento,'')) = 'PAGA'),0) AS entradas_mgf
  FROM base WHERE data_ref IS NOT NULL AND data_ref <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  GROUP BY 1
),
pid AS (
  SELECT to_char(make_date(ano, mes, 1),'YYYY-MM') AS mes, total_recebido
  FROM pid_operacional WHERE corretora_id = p_corretora_id
),
mensal AS (
  SELECT m.mes, m.custo_eventos,
    COALESCE(NULLIF(p.total_recebido,0), m.entradas_mgf, 0) AS recebido
  FROM mgf_mes m LEFT JOIN pid p ON p.mes = m.mes
  ORDER BY m.mes
),
tot AS (SELECT COALESCE(sum(custo_eventos),0) AS custo_eventos, COALESCE(sum(recebido),0) AS recebido FROM mensal)
SELECT jsonb_build_object(
  'totalCustoEventos', (SELECT custo_eventos FROM tot),
  'totalRecebido', (SELECT recebido FROM tot),
  'sinistralidade', CASE WHEN (SELECT recebido FROM tot) > 0 THEN round(((SELECT custo_eventos FROM tot)/(SELECT recebido FROM tot))*100, 1) ELSE 0 END,
  'mensalData', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'mes', mes, 'custo', custo_eventos, 'recebido', recebido,
      'sinistralidade', CASE WHEN recebido > 0 THEN round(custo_eventos/recebido*100, 1) ELSE 0 END
    ) ORDER BY mes) FROM mensal), '[]'::jsonb)
);
$f$;
