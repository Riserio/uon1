-- =============================================================================
-- Comercial: status da cotação automático quando o produto tem contrato.
--
--   rascunho   criada, ainda não enviada
--   enviada    proposta enviada ao cliente           (ação "Enviar proposta")
--   aprovada   cliente aceitou os valores            (página da proposta)
--   recusada   cliente recusou a proposta ou o contrato
--   emitida    contrato assinado por todas as partes (Uon1 Sign)
--
-- Com modelo de contrato vinculado, ninguém muda o status na mão: só o fluxo
-- de cancelamento continua manual. Sem modelo, o status segue manual.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.comercial_cotacoes DROP CONSTRAINT IF EXISTS comercial_cotacoes_status_check;
ALTER TABLE public.comercial_cotacoes ADD CONSTRAINT comercial_cotacoes_status_check
  CHECK (status IN ('rascunho', 'enviada', 'aprovada', 'recusada', 'emitida', 'cancelamento_solicitado', 'cancelada'));
ALTER TABLE public.comercial_cotacoes
  ADD COLUMN IF NOT EXISTS recusada_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_recusa text;

CREATE OR REPLACE FUNCTION public.comercial_cotacao_proposta_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := CASE WHEN public.comercial_em_rotina() THEN NULL ELSE auth.uid() END;
  v_cfg record;
  v_k text;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.proposta_token := NULL; NEW.proposta_enviada_em := NULL; NEW.proposta_canais := NULL;
    NEW.validade_ate := NULL; NEW.proposta_vista_em := NULL;
    NEW.aceite_em := NULL; NEW.aceite_ip := NULL; NEW.aceite_user_agent := NULL;
    NEW.aceite_canal := NULL; NEW.aceite_contato := NULL; NEW.aceite_termos := NULL;
    NEW.sessao_hash := NULL; NEW.sessao_expira_em := NULL; NEW.contrato_id := NULL;
    NEW.recusada_em := NULL; NEW.motivo_recusa := NULL;
  ELSE
    NEW.proposta_token := OLD.proposta_token; NEW.proposta_enviada_em := OLD.proposta_enviada_em;
    NEW.proposta_canais := OLD.proposta_canais;
    NEW.validade_ate := OLD.validade_ate; NEW.proposta_vista_em := OLD.proposta_vista_em;
    NEW.aceite_em := OLD.aceite_em; NEW.aceite_ip := OLD.aceite_ip; NEW.aceite_user_agent := OLD.aceite_user_agent;
    NEW.aceite_canal := OLD.aceite_canal; NEW.aceite_contato := OLD.aceite_contato; NEW.aceite_termos := OLD.aceite_termos;
    NEW.sessao_hash := OLD.sessao_hash; NEW.sessao_expira_em := OLD.sessao_expira_em; NEW.contrato_id := OLD.contrato_id;
    NEW.recusada_em := OLD.recusada_em; NEW.motivo_recusa := OLD.motivo_recusa;

    IF OLD.aceite_em IS NOT NULL AND OLD.status <> 'recusada' AND (
         NEW.termos IS DISTINCT FROM OLD.termos OR NEW.valor IS DISTINCT FROM OLD.valor
         OR NEW.produto IS DISTINCT FROM OLD.produto) THEN
      RAISE EXCEPTION 'O cliente já aceitou esta proposta: produto e valores não podem mais ser alterados'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- o modelo vem sempre da configuração do produto
  SELECT * INTO v_cfg FROM comercial_produtos_contrato WHERE produto = NEW.produto AND ativo;
  IF FOUND AND v_cfg.template_id IS NOT NULL THEN
    NEW.template_id := v_cfg.template_id;
    IF public.comercial_nivel(v_uid) <> 'admin' THEN
      FOREACH v_k IN ARRAY v_cfg.travados LOOP
        IF v_cfg.valores ? v_k THEN
          NEW.termos := coalesce(NEW.termos, '{}'::jsonb) || jsonb_build_object(v_k, v_cfg.valores -> v_k);
        END IF;
      END LOOP;
    END IF;
  ELSE
    NEW.template_id := NULL;
  END IF;

  -- Com contrato vinculado o status é do sistema. Só o cancelamento (pedir,
  -- cancelar, desfazer) continua nas mãos de quem tem permissão.
  IF NEW.template_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'rascunho';
    ELSIF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('cancelamento_solicitado', 'cancelada')
       AND OLD.status NOT IN ('cancelamento_solicitado', 'cancelada') THEN
      NEW.status := OLD.status;
    END IF;
  ELSIF NEW.status = 'recusada' AND (TG_OP = 'INSERT' OR OLD.status <> 'recusada') THEN
    NEW.recusada_em := now();
  END IF;
  RETURN NEW;
END
$f$;

-- Contrato assinado → cotação emitida e lead ganho; contrato recusado → cotação recusada.
CREATE OR REPLACE FUNCTION public.comercial_contrato_assinado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_lead uuid;
  v_funil uuid;
  v_etapa uuid;
BEGIN
  IF NEW.cotacao_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('assinado', 'recusado') THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('comercial.sistema', '1', true);
  IF NEW.status = 'recusado' THEN
    UPDATE comercial_cotacoes
       SET status = 'recusada', recusada_em = now(),
           motivo_recusa = coalesce('Contrato recusado na assinatura: ' || NEW.motivo_recusa, 'Contrato recusado na assinatura')
     WHERE id = NEW.cotacao_id AND status NOT IN ('emitida', 'cancelada');
  ELSE
    UPDATE comercial_cotacoes
       SET status = 'emitida'
     WHERE id = NEW.cotacao_id AND status NOT IN ('emitida', 'cancelada')
     RETURNING lead_id INTO v_lead;
    IF v_lead IS NOT NULL THEN
      SELECT funil_id INTO v_funil FROM comercial_leads WHERE id = v_lead;
      SELECT id INTO v_etapa FROM comercial_etapas
       WHERE funil_id = v_funil AND tipo = 'ganho' ORDER BY ordem LIMIT 1;
      IF v_etapa IS NOT NULL THEN
        UPDATE comercial_leads
           SET etapa_id = v_etapa, etapa_alterada_em = now()
         WHERE id = v_lead
           AND NOT EXISTS (SELECT 1 FROM comercial_etapas e
                            WHERE e.id = comercial_leads.etapa_id AND e.tipo IN ('ganho', 'perdido'));
      END IF;
    END IF;
  END IF;
  PERFORM set_config('comercial.sistema', '', true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('comercial.sistema', '', true);
  RAISE WARNING 'comercial_contrato_assinado: %', SQLERRM;
  RETURN NEW;
END
$f$;
