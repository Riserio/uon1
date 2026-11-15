-- =============================================================================
-- Comercial: valor mínimo na tabela de preços. O vendedor não consegue gravar
-- uma cotação com preço abaixo do mínimo definido para o campo (administrador
-- é livre, como nos campos travados). Idempotente.
-- =============================================================================
ALTER TABLE public.comercial_produtos_contrato
  ADD COLUMN IF NOT EXISTS minimos jsonb NOT NULL DEFAULT '{}'::jsonb;

-- "1.250,50" ou "1250.50" → 1250.50 (NULL se não for número)
CREATE OR REPLACE FUNCTION public.comercial_moeda(_v text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  s text := regexp_replace(coalesce(_v, ''), '[R$\s]', '', 'g');
BEGIN
  IF s = '' THEN RETURN NULL; END IF;
  IF position(',' IN s) > 0 THEN s := replace(replace(s, '.', ''), ',', '.'); END IF;
  IF s !~ '^-?\d+(\.\d+)?$' THEN RETURN NULL; END IF;
  RETURN s::numeric;
END
$f$;

CREATE OR REPLACE FUNCTION public.comercial_cotacao_proposta_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := CASE WHEN public.comercial_em_rotina() THEN NULL ELSE auth.uid() END;
  v_cfg record;
  v_k text;
  v_min numeric;
  v_val numeric;
  v_rotulo text;
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
      -- preço abaixo do mínimo da tabela não passa (só confere o que mudou)
      IF TG_OP = 'INSERT' OR NEW.termos IS DISTINCT FROM OLD.termos THEN
        FOR v_k IN SELECT jsonb_object_keys(coalesce(v_cfg.minimos, '{}'::jsonb)) LOOP
          v_min := public.comercial_moeda(v_cfg.minimos ->> v_k);
          v_val := public.comercial_moeda(NEW.termos ->> v_k);
          IF v_min IS NOT NULL AND v_val IS NOT NULL AND v_val < v_min THEN
            SELECT c ->> 'rotulo' INTO v_rotulo
              FROM contrato_templates t, jsonb_array_elements(t.campos) c
             WHERE t.id = v_cfg.template_id AND c ->> 'chave' = v_k;
            RAISE EXCEPTION '%: o valor mínimo é R$ %. Peça ao administrador se precisar de um preço menor.',
              coalesce(v_rotulo, v_k), translate(to_char(v_min, 'FM999G999G990D00'), ',.', '.,')
              USING ERRCODE = '42501';
          END IF;
        END LOOP;
      END IF;
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
