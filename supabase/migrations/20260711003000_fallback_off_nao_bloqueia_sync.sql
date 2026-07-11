-- O marcador diário "Robô GitHub desativado (somente API)" era gravado com
-- status 'sucesso' nas tabelas de execuções, fazendo o botão Sincronizar
-- responder "Já importado hoje" mesmo sem nenhuma importação real no dia
-- (a última podia ser de ontem). Agora o marcador usa status 'parado'
-- (informativo, não bloqueia) e os registros antigos foram corrigidos.

CREATE OR REPLACE FUNCTION public.marcar_git_fallback_desativado()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; v_cfg uuid;
BEGIN
  FOR r IN
    SELECT corretora_id, ativo_cobranca, ativo_eventos, ativo_mgf
    FROM hinova_credenciais WHERE git_fallback_ativo = false
  LOOP
    IF r.ativo_cobranca THEN
      SELECT id INTO v_cfg FROM cobranca_automacao_config WHERE corretora_id = r.corretora_id LIMIT 1;
      IF v_cfg IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM cobranca_automacao_execucoes
        WHERE corretora_id = r.corretora_id AND created_at >= date_trunc('day', now())
          AND (status IN ('sucesso','executando') OR tipo_disparo = 'fallback_off')
      ) THEN
        INSERT INTO cobranca_automacao_execucoes (config_id, corretora_id, status, etapa_atual, mensagem, tipo_disparo, finalizado_at)
        VALUES (v_cfg, r.corretora_id, 'parado', 'concluido', 'Robô GitHub desativado nas configurações (somente API)', 'fallback_off', now());
      END IF;
    END IF;
    IF r.ativo_eventos THEN
      SELECT id INTO v_cfg FROM sga_automacao_config WHERE corretora_id = r.corretora_id LIMIT 1;
      IF v_cfg IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM sga_automacao_execucoes
        WHERE corretora_id = r.corretora_id AND created_at >= date_trunc('day', now())
          AND (status IN ('sucesso','executando') OR tipo_disparo = 'fallback_off')
      ) THEN
        INSERT INTO sga_automacao_execucoes (config_id, corretora_id, status, etapa_atual, mensagem, tipo_disparo, finalizado_at)
        VALUES (v_cfg, r.corretora_id, 'parado', 'concluido', 'Robô GitHub desativado nas configurações (somente API)', 'fallback_off', now());
      END IF;
    END IF;
    IF r.ativo_mgf THEN
      SELECT id INTO v_cfg FROM mgf_automacao_config WHERE corretora_id = r.corretora_id LIMIT 1;
      IF v_cfg IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM mgf_automacao_execucoes
        WHERE corretora_id = r.corretora_id AND created_at >= date_trunc('day', now())
          AND (status IN ('sucesso','executando') OR tipo_disparo = 'fallback_off')
      ) THEN
        INSERT INTO mgf_automacao_execucoes (config_id, corretora_id, status, etapa_atual, mensagem, tipo_disparo, finalizado_at)
        VALUES (v_cfg, r.corretora_id, 'parado', 'concluido', 'Robô GitHub desativado nas configurações (somente API)', 'fallback_off', now());
      END IF;
    END IF;
  END LOOP;
END;
$function$;

UPDATE sga_automacao_execucoes SET status='parado' WHERE tipo_disparo='fallback_off' AND status='sucesso';
UPDATE mgf_automacao_execucoes SET status='parado' WHERE tipo_disparo='fallback_off' AND status='sucesso';
UPDATE cobranca_automacao_execucoes SET status='parado' WHERE tipo_disparo='fallback_off' AND status='sucesso';
