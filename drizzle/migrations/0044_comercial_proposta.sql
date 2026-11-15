-- =============================================================================
-- Comercial → Uon1 Sign: proposta com tabela de preços, aceite do cliente e
-- contrato gerado a partir da cotação. Idempotente.
--
--   1) comercial_produtos_contrato: produto → modelo de contrato + valores
--      padrão dos campos comerciais do modelo (grupos "Valores" e "Vigência")
--      e quais o vendedor não pode alterar.
--   2) comercial_cotacoes: termos (valores da proposta), contato do cliente,
--      link público, aceite e contrato gerado.
--   3) comercial_proposta_codigos: códigos de confirmação do aceite.
--   4) contratos.cotacao_id + gatilho: contrato assinado → cotação emitida e
--      lead na etapa de ganho.
--   5) Mensagens: e-mail e WhatsApp da proposta.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Produto → modelo + tabela de preços
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comercial_produtos_contrato (
  produto text PRIMARY KEY,
  template_id uuid REFERENCES public.contrato_templates(id) ON DELETE SET NULL,
  valores jsonb NOT NULL DEFAULT '{}'::jsonb,
  travados text[] NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.comercial_produtos_contrato FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comercial_produtos_contrato TO authenticated;
GRANT ALL ON public.comercial_produtos_contrato TO service_role;
ALTER TABLE public.comercial_produtos_contrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comercial produtos contrato - ver" ON public.comercial_produtos_contrato;
CREATE POLICY "Comercial produtos contrato - ver" ON public.comercial_produtos_contrato
  FOR SELECT TO authenticated USING (public.comercial_nivel(auth.uid()) <> 'nenhum');
DROP POLICY IF EXISTS "Comercial produtos contrato - gerir" ON public.comercial_produtos_contrato;
CREATE POLICY "Comercial produtos contrato - gerir" ON public.comercial_produtos_contrato
  FOR ALL TO authenticated
  USING (public.comercial_nivel(auth.uid()) = 'admin')
  WITH CHECK (public.comercial_nivel(auth.uid()) = 'admin');

-- Vínculos óbvios já prontos (sem preço: o administrador preenche a tabela)
INSERT INTO public.comercial_produtos_contrato (produto, template_id)
SELECT 'PPR', id FROM public.contrato_templates WHERE slug = 'ppr-manutencao'
ON CONFLICT (produto) DO NOTHING;
INSERT INTO public.comercial_produtos_contrato (produto, template_id)
SELECT 'Assistência 24 horas', id FROM public.contrato_templates WHERE slug = 'assistencia-24h-rastreamento'
ON CONFLICT (produto) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Cotação: termos, contato, link público, aceite e contrato
-- ---------------------------------------------------------------------------
ALTER TABLE public.comercial_cotacoes
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.contrato_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS termos jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cliente_email text,
  ADD COLUMN IF NOT EXISTS cliente_telefone text,
  ADD COLUMN IF NOT EXISTS proposta_token uuid,
  ADD COLUMN IF NOT EXISTS proposta_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS proposta_canais text[],
  ADD COLUMN IF NOT EXISTS validade_ate timestamptz,
  ADD COLUMN IF NOT EXISTS proposta_vista_em timestamptz,
  ADD COLUMN IF NOT EXISTS aceite_em timestamptz,
  ADD COLUMN IF NOT EXISTS aceite_ip text,
  ADD COLUMN IF NOT EXISTS aceite_user_agent text,
  ADD COLUMN IF NOT EXISTS aceite_canal text,
  ADD COLUMN IF NOT EXISTS aceite_contato text,
  ADD COLUMN IF NOT EXISTS aceite_termos jsonb,
  ADD COLUMN IF NOT EXISTS sessao_hash text,
  ADD COLUMN IF NOT EXISTS sessao_expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES public.contratos(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_comercial_cotacoes_proposta_token
  ON public.comercial_cotacoes (proposta_token) WHERE proposta_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comercial_cotacoes_contrato ON public.comercial_cotacoes (contrato_id);

-- Campos de controle da proposta só mudam pelo servidor (edge function). O
-- vendedor não forja aceite nem troca valores depois que o cliente aceitou.
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
  ELSE
    NEW.proposta_token := OLD.proposta_token; NEW.proposta_enviada_em := OLD.proposta_enviada_em;
    NEW.proposta_canais := OLD.proposta_canais;
    NEW.validade_ate := OLD.validade_ate; NEW.proposta_vista_em := OLD.proposta_vista_em;
    NEW.aceite_em := OLD.aceite_em; NEW.aceite_ip := OLD.aceite_ip; NEW.aceite_user_agent := OLD.aceite_user_agent;
    NEW.aceite_canal := OLD.aceite_canal; NEW.aceite_contato := OLD.aceite_contato; NEW.aceite_termos := OLD.aceite_termos;
    NEW.sessao_hash := OLD.sessao_hash; NEW.sessao_expira_em := OLD.sessao_expira_em; NEW.contrato_id := OLD.contrato_id;

    IF OLD.aceite_em IS NOT NULL AND (
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
    -- valores travados: valem os da tabela (administrador é livre)
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
  RETURN NEW;
END
$f$;

DROP TRIGGER IF EXISTS trg_comercial_cotacao_proposta ON public.comercial_cotacoes;
CREATE TRIGGER trg_comercial_cotacao_proposta BEFORE INSERT OR UPDATE ON public.comercial_cotacoes
  FOR EACH ROW EXECUTE FUNCTION public.comercial_cotacao_proposta_guard();

-- ---------------------------------------------------------------------------
-- 3) Códigos de confirmação do aceite (só o servidor lê e grava)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comercial_proposta_codigos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id uuid NOT NULL REFERENCES public.comercial_cotacoes(id) ON DELETE CASCADE,
  hash_codigo text NOT NULL,
  canal text NOT NULL,
  destino text,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  tentativas int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comercial_proposta_codigos_cotacao
  ON public.comercial_proposta_codigos (cotacao_id, created_at DESC);
REVOKE ALL ON public.comercial_proposta_codigos FROM anon, authenticated;
GRANT ALL ON public.comercial_proposta_codigos TO service_role;
ALTER TABLE public.comercial_proposta_codigos ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4) Contrato ligado à cotação; assinado → cotação emitida e lead ganho
-- ---------------------------------------------------------------------------
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS cotacao_id uuid REFERENCES public.comercial_cotacoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_cotacao ON public.contratos (cotacao_id);

CREATE OR REPLACE FUNCTION public.comercial_contrato_assinado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_lead uuid;
  v_funil uuid;
  v_etapa uuid;
BEGIN
  IF NEW.cotacao_id IS NULL OR NEW.status <> 'assinado' OR OLD.status = 'assinado' THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('comercial.sistema', '1', true);
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
  PERFORM set_config('comercial.sistema', '', true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- a conclusão do contrato nunca falha por causa do Comercial
  PERFORM set_config('comercial.sistema', '', true);
  RAISE WARNING 'comercial_contrato_assinado: %', SQLERRM;
  RETURN NEW;
END
$f$;

DROP TRIGGER IF EXISTS trg_comercial_contrato_assinado ON public.contratos;
CREATE TRIGGER trg_comercial_contrato_assinado AFTER UPDATE OF status ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.comercial_contrato_assinado();

-- ---------------------------------------------------------------------------
-- 5) Mensagens da proposta
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_tipo_check;
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_tipo_check CHECK (tipo = ANY (ARRAY[
  'atendimento', 'alerta_performance', 'recuperacao', 'boas_vindas', 'relatorio', 'convite_reuniao',
  'ouvidoria', 'ouvidoria_alerta', 'ouvidoria_finalizado', 'contrato_assinatura',
  'uonisign_convite', 'uonisign_codigo', 'uonisign_lembrete', 'uonisign_concluido', 'uonisign_aviso',
  'uonisign_proposta']));

UPDATE public.uonisign_config
   SET valor = jsonb_set(valor, '{mensagens,proposta}',
     '{"template": "uonisign_proposta", "parametros": ["nome", "contrato", "numero", "empresa", "valor", "prazo"], "botao": "token"}'::jsonb)
 WHERE chave = 'whatsapp' AND NOT (valor -> 'mensagens' ? 'proposta');

INSERT INTO public.whatsapp_templates (nome, tipo, formato, mensagem, ativo)
SELECT $n$Uon1 Sign — Proposta comercial$n$, 'contrato', 'texto', $m$Olá, {nome}!

Sua proposta comercial está pronta.

📄 Proposta
- Produto: {contrato}
- Número: {numero}
- Enviada por: {empresa}

💰 Valor
- Total: {valor}

⏳ Validade
- Aceite até: {prazo}

Toque no botão abaixo para ver os valores, aceitar e seguir para a contratação.$m$, true
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE nome = $n$Uon1 Sign — Proposta comercial$n$);

-- E-mail da proposta: mesmo layout do convite (quando ele já está no padrão
-- visual), trocando os textos. Editável em Central de Atendimento → Templates.
INSERT INTO public.email_templates (user_id, tipo, categoria, nome, assunto, corpo, ativo)
SELECT c.user_id, 'uonisign_proposta', c.categoria, 'Uon1 Sign — Proposta comercial',
       'Proposta comercial {{numero}} — {{contrato}}',
       CASE WHEN c.corpo LIKE '%PENDENTE DE ASSINATURA%' THEN
         regexp_replace(regexp_replace(
         replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(c.corpo,
           'Assinatura de contrato - {{empresa}}', 'Proposta comercial - {{empresa}}'),
           '✍️ Assinatura de contrato', '💼 Proposta comercial'),
           'PENDENTE DE ASSINATURA', 'AGUARDANDO SEU ACEITE'),
           '📝 Contrato disponível para assinatura', '📝 Sua proposta comercial está pronta'),
           '📄 Dados do contrato', '📄 Dados da proposta'),
           '>Contrato</div>', '>Produto</div>'),
           '⏳ Prazo para assinatura', '⏳ Validade da proposta'),
           'Depois dessa data o link expira e será preciso um novo envio.', 'Depois dessa data a proposta expira e será preciso um novo envio.'),
           '🔒 Assinatura eletrônica segura', '✅ Como contratar'),
           '✍️ Revisar e assinar', '📄 Ver proposta'),
         'O contrato abaixo foi enviado pela.*?enviaremos a você\.',
         'A <strong>{{empresa}}</strong> preparou a proposta abaixo, no valor de <strong>{{valor}}</strong>. Abra o link para ver os valores e as condições item a item.'),
         'Sua identidade é confirmada por um código de uso único\..*?rodapé\.',
         'Confira os valores, confirme o aceite com um código de 6 dígitos e preencha os dados da sua empresa. Em seguida o contrato é gerado na hora para a sua assinatura eletrônica.')
       ELSE
         '<p>Olá, {{nome}}.</p>
<p>A <strong>{{empresa}}</strong> preparou a proposta <strong>{{contrato}}</strong> (nº {{numero}}), no valor de <strong>{{valor}}</strong>.</p>
<p>Abra o link para ver os valores, dar o aceite e preencher os dados do contrato. A proposta vale até <strong>{{prazo}}</strong>.</p>
<p><a href="{{link}}">Ver proposta</a></p>'
       END,
       true
FROM (SELECT user_id, categoria, corpo FROM public.email_templates WHERE tipo = 'uonisign_convite' ORDER BY updated_at DESC NULLS LAST LIMIT 1) c
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE tipo = 'uonisign_proposta');
