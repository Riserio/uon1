-- 2026-11-03 — Módulo Comercial (funil de vendas / CRM), menu Relacionamento.
--
-- Estrutura genérica: cada campanha é um FUNIL com suas próprias etapas e
-- produtos. O primeiro funil é "Fenaprove / Virada Regulatória" (seed no fim).
-- Vendedores são globais; o QR code de cada vendedor aponta para
-- /c/:funil/:vendedor, uma página pública de cadastro rápido que cria o lead
-- já atribuído ao vendedor, na primeira etapa do funil.
--
-- Segurança: o anônimo NÃO ganha acesso às tabelas. A página pública lê o
-- necessário e grava o lead só por RPCs SECURITY DEFINER com validação.
-- Edição interna: qualquer usuário logado que não seja parceiro (mesma regra
-- do módulo Links); o acesso ao menu continua controlado pelas permissões.

CREATE TABLE IF NOT EXISTS public.comercial_funis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  descricao text,
  produtos text[] NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- tipo: aberta (em andamento) | ganho (fechado) | perdido (cancelado — pede motivo)
CREATE TABLE IF NOT EXISTS public.comercial_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funil_id uuid NOT NULL REFERENCES public.comercial_funis(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#64748b',
  ordem int NOT NULL DEFAULT 0,
  tipo text NOT NULL DEFAULT 'aberta' CHECK (tipo IN ('aberta', 'ganho', 'perdido')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comercial_etapas_funil ON public.comercial_etapas (funil_id, ordem);

CREATE TABLE IF NOT EXISTS public.comercial_vendedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  whatsapp text,
  email text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comercial_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funil_id uuid NOT NULL REFERENCES public.comercial_funis(id) ON DELETE CASCADE,
  etapa_id uuid NOT NULL REFERENCES public.comercial_etapas(id) ON DELETE RESTRICT,
  vendedor_id uuid REFERENCES public.comercial_vendedores(id) ON DELETE SET NULL,
  nome text NOT NULL,
  associacao text,
  cargo text,
  whatsapp text,
  indicacao_externa boolean NOT NULL DEFAULT false,
  indicador_nome text,
  produto text,
  observacoes text,
  motivo_perda text,
  origem text NOT NULL DEFAULT 'interno' CHECK (origem IN ('interno', 'qrcode')),
  etapa_alterada_em timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comercial_leads_funil ON public.comercial_leads (funil_id, etapa_id);
CREATE INDEX IF NOT EXISTS idx_comercial_leads_vendedor ON public.comercial_leads (vendedor_id);

-- Histórico de mudanças de etapa (gravado por trigger; ninguém escreve direto).
CREATE TABLE IF NOT EXISTS public.comercial_lead_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.comercial_leads(id) ON DELETE CASCADE,
  etapa_de uuid REFERENCES public.comercial_etapas(id) ON DELETE SET NULL,
  etapa_para uuid REFERENCES public.comercial_etapas(id) ON DELETE SET NULL,
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comercial_lead_historico_lead ON public.comercial_lead_historico (lead_id, created_at);

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.comercial_funis, public.comercial_etapas, public.comercial_vendedores,
  public.comercial_leads, public.comercial_lead_historico FROM anon;
GRANT ALL ON public.comercial_funis, public.comercial_etapas, public.comercial_vendedores,
  public.comercial_leads TO authenticated, service_role;
GRANT SELECT ON public.comercial_lead_historico TO authenticated;
GRANT ALL ON public.comercial_lead_historico TO service_role;

ALTER TABLE public.comercial_funis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comercial_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comercial_vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comercial_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comercial_lead_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comercial internos gerenciam funis" ON public.comercial_funis;
CREATE POLICY "Comercial internos gerenciam funis" ON public.comercial_funis
  FOR ALL TO authenticated
  USING (NOT public.has_role(auth.uid(), 'parceiro'))
  WITH CHECK (NOT public.has_role(auth.uid(), 'parceiro'));

DROP POLICY IF EXISTS "Comercial internos gerenciam etapas" ON public.comercial_etapas;
CREATE POLICY "Comercial internos gerenciam etapas" ON public.comercial_etapas
  FOR ALL TO authenticated
  USING (NOT public.has_role(auth.uid(), 'parceiro'))
  WITH CHECK (NOT public.has_role(auth.uid(), 'parceiro'));

DROP POLICY IF EXISTS "Comercial internos gerenciam vendedores" ON public.comercial_vendedores;
CREATE POLICY "Comercial internos gerenciam vendedores" ON public.comercial_vendedores
  FOR ALL TO authenticated
  USING (NOT public.has_role(auth.uid(), 'parceiro'))
  WITH CHECK (NOT public.has_role(auth.uid(), 'parceiro'));

DROP POLICY IF EXISTS "Comercial internos gerenciam leads" ON public.comercial_leads;
CREATE POLICY "Comercial internos gerenciam leads" ON public.comercial_leads
  FOR ALL TO authenticated
  USING (NOT public.has_role(auth.uid(), 'parceiro'))
  WITH CHECK (NOT public.has_role(auth.uid(), 'parceiro'));

DROP POLICY IF EXISTS "Comercial internos leem historico" ON public.comercial_lead_historico;
CREATE POLICY "Comercial internos leem historico" ON public.comercial_lead_historico
  FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(), 'parceiro'));

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_comercial_funis_updated_at ON public.comercial_funis;
CREATE TRIGGER trg_comercial_funis_updated_at BEFORE UPDATE ON public.comercial_funis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_comercial_etapas_updated_at ON public.comercial_etapas;
CREATE TRIGGER trg_comercial_etapas_updated_at BEFORE UPDATE ON public.comercial_etapas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_comercial_vendedores_updated_at ON public.comercial_vendedores;
CREATE TRIGGER trg_comercial_vendedores_updated_at BEFORE UPDATE ON public.comercial_vendedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_comercial_leads_updated_at ON public.comercial_leads;
CREATE TRIGGER trg_comercial_leads_updated_at BEFORE UPDATE ON public.comercial_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Etapa do lead tem que ser do mesmo funil; mudança de etapa atualiza
-- etapa_alterada_em e limpa o motivo de perda quando sai de "perdido".
CREATE OR REPLACE FUNCTION public.comercial_lead_antes_salvar()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $f$
DECLARE
  v_tipo text;
BEGIN
  SELECT tipo INTO v_tipo FROM comercial_etapas WHERE id = NEW.etapa_id AND funil_id = NEW.funil_id;
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'Etapa não pertence ao funil do lead';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    NEW.etapa_alterada_em := now();
  END IF;
  IF v_tipo <> 'perdido' THEN
    NEW.motivo_perda := NULL;
  END IF;
  IF NOT NEW.indicacao_externa THEN
    NEW.indicador_nome := NULL;
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS trg_comercial_lead_antes_salvar ON public.comercial_leads;
CREATE TRIGGER trg_comercial_lead_antes_salvar BEFORE INSERT OR UPDATE ON public.comercial_leads
  FOR EACH ROW EXECUTE FUNCTION public.comercial_lead_antes_salvar();

CREATE OR REPLACE FUNCTION public.comercial_lead_registrar_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO comercial_lead_historico (lead_id, etapa_de, etapa_para, usuario_id)
    VALUES (NEW.id, NULL, NEW.etapa_id, auth.uid());
  ELSIF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    INSERT INTO comercial_lead_historico (lead_id, etapa_de, etapa_para, usuario_id)
    VALUES (NEW.id, OLD.etapa_id, NEW.etapa_id, auth.uid());
  END IF;
  RETURN NULL;
END;
$f$;

DROP TRIGGER IF EXISTS trg_comercial_lead_historico ON public.comercial_leads;
CREATE TRIGGER trg_comercial_lead_historico AFTER INSERT OR UPDATE OF etapa_id ON public.comercial_leads
  FOR EACH ROW EXECUTE FUNCTION public.comercial_lead_registrar_historico();

-- ---------------------------------------------------------------------------
-- RPCs da página pública (/c/:funil/:vendedor)
-- ---------------------------------------------------------------------------
-- Devolve só o que a página precisa: nome do funil, produtos e nome do vendedor.
CREATE OR REPLACE FUNCTION public.comercial_funil_publico(p_funil_slug text, p_vendedor_codigo text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT jsonb_build_object(
    'nome', f.nome,
    'descricao', f.descricao,
    'produtos', to_jsonb(f.produtos),
    'vendedor', (SELECT v.nome FROM comercial_vendedores v
                  WHERE v.codigo = p_vendedor_codigo AND v.ativo)
  )
  FROM comercial_funis f
  WHERE f.slug = p_funil_slug AND f.ativo;
$f$;

CREATE OR REPLACE FUNCTION public.comercial_registrar_lead_publico(
  p_funil_slug text,
  p_vendedor_codigo text,
  p_nome text,
  p_associacao text,
  p_cargo text,
  p_whatsapp text,
  p_indicacao_externa boolean,
  p_indicador_nome text,
  p_produto text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_funil comercial_funis%ROWTYPE;
  v_etapa uuid;
  v_vendedor uuid;
  v_zap text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
BEGIN
  SELECT * INTO v_funil FROM comercial_funis WHERE slug = p_funil_slug AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Formulário indisponível';
  END IF;

  IF length(trim(coalesce(p_nome, ''))) < 2 OR length(p_nome) > 150 THEN
    RAISE EXCEPTION 'Informe o nome';
  END IF;
  IF length(v_zap) < 10 OR length(v_zap) > 13 THEN
    RAISE EXCEPTION 'Informe um WhatsApp válido com DDD';
  END IF;
  IF length(coalesce(p_associacao, '')) > 200 OR length(coalesce(p_cargo, '')) > 120
     OR length(coalesce(p_indicador_nome, '')) > 150 THEN
    RAISE EXCEPTION 'Texto longo demais';
  END IF;
  IF p_produto IS NOT NULL AND p_produto <> '' AND NOT (p_produto = ANY (v_funil.produtos)) THEN
    RAISE EXCEPTION 'Produto inválido';
  END IF;

  -- Evita duplicar o mesmo lead (duplo toque no botão, reenvio) em 10 minutos.
  IF EXISTS (
    SELECT 1 FROM comercial_leads
     WHERE funil_id = v_funil.id AND whatsapp = v_zap AND created_at > now() - interval '10 minutes'
  ) THEN
    RETURN true;
  END IF;

  SELECT id INTO v_etapa FROM comercial_etapas
   WHERE funil_id = v_funil.id ORDER BY ordem, created_at LIMIT 1;
  IF v_etapa IS NULL THEN
    RAISE EXCEPTION 'Funil sem etapas configuradas';
  END IF;

  SELECT id INTO v_vendedor FROM comercial_vendedores WHERE codigo = p_vendedor_codigo AND ativo;

  INSERT INTO comercial_leads (
    funil_id, etapa_id, vendedor_id, nome, associacao, cargo, whatsapp,
    indicacao_externa, indicador_nome, produto, origem, created_by
  ) VALUES (
    v_funil.id, v_etapa, v_vendedor, trim(p_nome), nullif(trim(coalesce(p_associacao, '')), ''),
    nullif(trim(coalesce(p_cargo, '')), ''), v_zap, coalesce(p_indicacao_externa, false),
    nullif(trim(coalesce(p_indicador_nome, '')), ''), nullif(p_produto, ''), 'qrcode', NULL
  );
  RETURN true;
END;
$f$;

REVOKE ALL ON FUNCTION public.comercial_funil_publico(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.comercial_registrar_lead_publico(text, text, text, text, text, text, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comercial_funil_publico(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comercial_registrar_lead_publico(text, text, text, text, text, text, boolean, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed: Fenaprove / Virada Regulatória
-- ---------------------------------------------------------------------------
DO $seed$
DECLARE
  v_funil uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.comercial_funis WHERE slug = 'virada-regulatoria') THEN
    INSERT INTO public.comercial_funis (nome, slug, descricao, produtos, created_by)
    VALUES (
      'Fenaprove / Virada Regulatória',
      'virada-regulatoria',
      'Cadastre seus dados e nossa equipe entra em contato.',
      ARRAY['PPR', 'Assistência 24 horas', 'Gestão de Sinistros', 'Gestão completa'],
      NULL
    )
    RETURNING id INTO v_funil;

    INSERT INTO public.comercial_etapas (funil_id, nome, cor, ordem, tipo) VALUES
      (v_funil, 'Aberto',                   '#64748b', 1, 'aberta'),
      (v_funil, 'Contato feito',            '#3b82f6', 2, 'aberta'),
      (v_funil, 'Reunião agendada',         '#8b5cf6', 3, 'aberta'),
      (v_funil, 'Pendente enviar proposta', '#f59e0b', 4, 'aberta'),
      (v_funil, 'Proposta enviada',         '#f97316', 5, 'aberta'),
      (v_funil, 'Fechada',                  '#16a34a', 6, 'ganho'),
      (v_funil, 'Cancelado',                '#dc2626', 7, 'perdido');
  END IF;
END
$seed$;
