-- 2026-11-12 — Comercial: permissões por hierarquia de vendas + cotações,
-- comentários, notificações e auditoria.
--
-- Hierarquia (reaproveita os vínculos do cadastro de usuários):
--   admin   = papel admin/superintendente (ou subitem "comercial:todos-leads"
--             liberado explicitamente no cargo/usuário)
--   gerente = papel "administrativo"      (líderes com administrativo_id = ele)
--   lider   = papel "lider"               (diretos com lider_id = ele ou cuja
--                                          equipe ele lidera)
--   direto  = demais internos (papel "comercial" etc.)
-- Dono do registro = usuário vinculado ao vendedor (comercial_vendedores.profile_id).
--
-- Visibilidade (leads E cotações), aplicada por RLS:
--   direto  → só os próprios
--   lider   → próprios + diretos da(s) sua(s) equipe(s)
--   gerente → próprios + líderes dele + diretos desses líderes
--   admin   → tudo
--   + registro FECHADO (lead ganho/perdido, cotação emitida/cancelada) continua
--     visível para o líder/gerente gravados no registro (equipe de origem).
-- Edição: direto/líder só os próprios (líder só comenta na equipe); gerente
-- próprios + equipes (transfere, cancela com motivo, arquiva); admin tudo.
-- Ninguém exclui lead/cotação (só arquiva).
--
-- Idempotente. Aplicar no banco do Lovable Cloud sem modificações.

-- ===========================================================================
-- 1) Funções de hierarquia (SECURITY DEFINER: leem vínculos sem esbarrar em RLS)
-- ===========================================================================

-- Subitem "Leads de todos os vendedores": agora só vale quando LIBERADO
-- explicitamente (antes, sem regra = via tudo).
CREATE OR REPLACE FUNCTION public.comercial_flag_visao_geral(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT pode_visualizar FROM user_menu_permissions
      WHERE user_id = _uid AND menu_item = 'comercial:todos-leads' LIMIT 1),
    (SELECT cmp.pode_visualizar FROM cargo_menu_permissions cmp
       JOIN profiles p ON p.cargo_id = cmp.cargo_id
      WHERE p.id = _uid AND cmp.menu_item = 'comercial:todos-leads' LIMIT 1),
    (SELECT rmp.pode_visualizar FROM role_menu_permissions rmp
       JOIN user_roles ur ON ur.role = rmp.role
      WHERE ur.user_id = _uid AND rmp.menu_item = 'comercial:todos-leads' LIMIT 1),
    false)
$$;

-- Nível do usuário no Comercial: admin | gerente | lider | direto | nenhum
CREATE OR REPLACE FUNCTION public.comercial_nivel(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN 'nenhum'
    WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE id = _uid AND ativo) THEN 'nenhum'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role IN ('admin', 'superintendente')) THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role = 'parceiro') THEN 'nenhum'
    WHEN public.comercial_flag_visao_geral(_uid) THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role = 'administrativo') THEN 'gerente'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role = 'lider') THEN 'lider'
    ELSE 'direto'
  END
$$;

-- Líderes de um usuário: líder direto + líder(es) da equipe dele.
CREATE OR REPLACE FUNCTION public.comercial_lideres_de(_uid uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.lider_id FROM profiles p WHERE p.id = _uid AND p.lider_id IS NOT NULL
  UNION
  SELECT e.lider_id FROM profiles p JOIN equipes e ON e.id = p.equipe_id
   WHERE p.id = _uid AND e.lider_id IS NOT NULL
  UNION
  SELECT el.lider_id FROM profiles p JOIN equipe_lideres el ON el.equipe_id = p.equipe_id
   WHERE p.id = _uid
$$;

-- Cadeia atual do dono (para gravar no registro): líder e gerente.
CREATE OR REPLACE FUNCTION public.comercial_cadeia(_owner uuid, OUT lider_id uuid, OUT gerente_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
BEGIN
  lider_id := NULL;
  gerente_id := NULL;
  IF _owner IS NULL THEN RETURN; END IF;
  SELECT role::text INTO v_role FROM user_roles WHERE user_id = _owner
   ORDER BY CASE role::text WHEN 'administrativo' THEN 1 WHEN 'lider' THEN 2 ELSE 3 END LIMIT 1;
  IF v_role = 'administrativo' THEN
    gerente_id := _owner;
  ELSIF v_role = 'lider' THEN
    lider_id := _owner;
    SELECT administrativo_id INTO gerente_id FROM profiles WHERE id = _owner;
  ELSE
    SELECT coalesce(
      (SELECT p.lider_id FROM profiles p WHERE p.id = _owner),
      (SELECT e.lider_id FROM profiles p JOIN equipes e ON e.id = p.equipe_id WHERE p.id = _owner),
      (SELECT el.lider_id FROM profiles p JOIN equipe_lideres el ON el.equipe_id = p.equipe_id
        WHERE p.id = _owner ORDER BY el.created_at LIMIT 1))
      INTO lider_id;
    IF lider_id IS NOT NULL THEN
      SELECT p.administrativo_id INTO gerente_id FROM profiles p WHERE p.id = comercial_cadeia.lider_id;
    END IF;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.comercial_dono(_vendedor_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT profile_id FROM comercial_vendedores WHERE id = _vendedor_id
$$;

-- Rotinas internas (troca de equipe) marcam a transação como "sistema" para
-- poder regravar a cadeia dos registros sem cair nas regras de usuário.
CREATE OR REPLACE FUNCTION public.comercial_em_rotina()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('comercial.sistema', true), '') = '1'
$$;

-- O dono está no meu alcance (eu mesmo ou minha equipe)? Pela hierarquia ATUAL.
CREATE OR REPLACE FUNCTION public.comercial_no_alcance(_viewer uuid, _owner uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nivel text := public.comercial_nivel(_viewer);
BEGIN
  IF v_nivel = 'admin' THEN RETURN true; END IF;
  IF v_nivel = 'nenhum' OR _owner IS NULL THEN RETURN false; END IF;
  IF _owner = _viewer THEN RETURN true; END IF;
  IF v_nivel IN ('lider', 'gerente')
     AND _viewer IN (SELECT public.comercial_lideres_de(_owner)) THEN
    RETURN true;
  END IF;
  IF v_nivel = 'gerente' THEN
    -- dono é líder meu
    IF EXISTS (SELECT 1 FROM profiles WHERE id = _owner AND administrativo_id = _viewer) THEN
      RETURN true;
    END IF;
    -- dono é direto de um líder meu
    IF EXISTS (SELECT 1 FROM public.comercial_lideres_de(_owner) l(id)
                 JOIN profiles lp ON lp.id = l.id
                WHERE lp.administrativo_id = _viewer) THEN
      RETURN true;
    END IF;
  END IF;
  RETURN false;
END
$$;

-- Ver um registro (lead/cotação).
CREATE OR REPLACE FUNCTION public.comercial_pode_ver(
  _viewer uuid, _vendedor_id uuid, _lider_id uuid, _gerente_id uuid, _fechado boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nivel text := public.comercial_nivel(_viewer);
BEGIN
  IF v_nivel = 'admin' THEN RETURN true; END IF;
  IF v_nivel = 'nenhum' THEN RETURN false; END IF;
  IF public.comercial_no_alcance(_viewer, public.comercial_dono(_vendedor_id)) THEN RETURN true; END IF;
  -- fechado: continua com a equipe de origem
  IF coalesce(_fechado, false) AND v_nivel IN ('lider', 'gerente')
     AND (_lider_id = _viewer OR _gerente_id = _viewer) THEN
    RETURN true;
  END IF;
  RETURN false;
END
$$;

-- Editar registros de um vendedor.
CREATE OR REPLACE FUNCTION public.comercial_pode_editar(_viewer uuid, _vendedor_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nivel text := public.comercial_nivel(_viewer);
  v_owner uuid;
BEGIN
  IF v_nivel = 'admin' THEN RETURN true; END IF;
  IF v_nivel = 'nenhum' OR _vendedor_id IS NULL THEN RETURN false; END IF;
  v_owner := public.comercial_dono(_vendedor_id);
  IF v_owner IS NULL THEN RETURN false; END IF;
  IF v_nivel IN ('direto', 'lider') THEN RETURN v_owner = _viewer; END IF;
  RETURN public.comercial_no_alcance(_viewer, v_owner); -- gerente
END
$$;

CREATE OR REPLACE FUNCTION public.comercial_lead_fechado(_etapa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT tipo IN ('ganho', 'perdido') FROM comercial_etapas WHERE id = _etapa_id), false)
$$;

-- Compatibilidade com o código anterior.
CREATE OR REPLACE FUNCTION public.comercial_ve_todos_leads(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.comercial_nivel(_uid) = 'admin'
$$;

-- O que a tela precisa saber do usuário logado.
CREATE OR REPLACE FUNCTION public.comercial_meu_acesso()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nivel text := public.comercial_nivel(v_uid);
  v_cad record;
BEGIN
  SELECT * INTO v_cad FROM public.comercial_cadeia(v_uid);
  RETURN jsonb_build_object(
    'nivel', v_nivel,
    'profile_id', v_uid,
    'vendedor_id', (SELECT id FROM comercial_vendedores WHERE profile_id = v_uid LIMIT 1),
    'equipe', (SELECT e.nome FROM profiles p JOIN equipes e ON e.id = p.equipe_id WHERE p.id = v_uid),
    'lider', (SELECT nome FROM profiles WHERE id = v_cad.lider_id),
    'gerente', (SELECT nome FROM profiles WHERE id = v_cad.gerente_id),
    -- vendedores cujos registros eu posso editar / ver (pela hierarquia atual)
    'vendedores_editaveis', coalesce((SELECT jsonb_agg(v.id) FROM comercial_vendedores v
                                       WHERE public.comercial_pode_editar(v_uid, v.id)), '[]'::jsonb),
    'vendedores_visiveis', coalesce((SELECT jsonb_agg(v.id) FROM comercial_vendedores v
                                      WHERE public.comercial_no_alcance(v_uid, v.profile_id)), '[]'::jsonb)
  );
END
$$;

-- Nomes de líder/gerente para filtros e painel (só dos ids que eu já enxergo).
CREATE OR REPLACE FUNCTION public.comercial_nomes_usuarios(_ids uuid[])
RETURNS TABLE (id uuid, nome text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nome FROM profiles p
   WHERE p.id = ANY (_ids) AND public.comercial_nivel(auth.uid()) <> 'nenhum'
$$;

REVOKE ALL ON FUNCTION public.comercial_flag_visao_geral(uuid), public.comercial_nivel(uuid),
  public.comercial_lideres_de(uuid), public.comercial_cadeia(uuid), public.comercial_dono(uuid),
  public.comercial_no_alcance(uuid, uuid), public.comercial_pode_ver(uuid, uuid, uuid, uuid, boolean),
  public.comercial_pode_editar(uuid, uuid), public.comercial_lead_fechado(uuid),
  public.comercial_meu_acesso(), public.comercial_nomes_usuarios(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comercial_flag_visao_geral(uuid), public.comercial_nivel(uuid),
  public.comercial_lideres_de(uuid), public.comercial_cadeia(uuid), public.comercial_dono(uuid),
  public.comercial_no_alcance(uuid, uuid), public.comercial_pode_ver(uuid, uuid, uuid, uuid, boolean),
  public.comercial_pode_editar(uuid, uuid), public.comercial_lead_fechado(uuid),
  public.comercial_meu_acesso(), public.comercial_nomes_usuarios(uuid[]) TO authenticated, service_role;

-- ===========================================================================
-- 2) Leads: cadeia gravada, arquivamento, regras e RLS
-- ===========================================================================
ALTER TABLE public.comercial_leads
  ADD COLUMN IF NOT EXISTS lider_id uuid,
  ADD COLUMN IF NOT EXISTS gerente_id uuid,
  ADD COLUMN IF NOT EXISTS arquivado_em timestamptz,
  ADD COLUMN IF NOT EXISTS arquivado_por uuid;
CREATE INDEX IF NOT EXISTS idx_comercial_leads_lider ON public.comercial_leads (lider_id);
CREATE INDEX IF NOT EXISTS idx_comercial_leads_gerente ON public.comercial_leads (gerente_id);

CREATE OR REPLACE FUNCTION public.comercial_lead_regras()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := CASE WHEN public.comercial_em_rotina() THEN NULL ELSE auth.uid() END;
  v_nivel text;
  v_cad record;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN
    SELECT * INTO v_cad FROM public.comercial_cadeia(public.comercial_dono(NEW.vendedor_id));
    NEW.lider_id := v_cad.lider_id;
    NEW.gerente_id := v_cad.gerente_id;
  ELSIF v_uid IS NOT NULL THEN
    -- cadeia gravada só muda por transferência ou troca de equipe (sistema)
    NEW.lider_id := OLD.lider_id;
    NEW.gerente_id := OLD.gerente_id;
  END IF;

  IF v_uid IS NULL THEN
    RETURN NEW; -- sistema (QR code, rotinas)
  END IF;
  v_nivel := public.comercial_nivel(v_uid);

  IF TG_OP = 'UPDATE' AND NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id
     AND v_nivel NOT IN ('gerente', 'admin') THEN
    RAISE EXCEPTION 'Somente o gerente ou o administrador transfere leads' USING ERRCODE = '42501';
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.arquivado_em IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.arquivado_em IS DISTINCT FROM OLD.arquivado_em) THEN
    IF v_nivel NOT IN ('gerente', 'admin') THEN
      RAISE EXCEPTION 'Somente o gerente ou o administrador arquiva leads' USING ERRCODE = '42501';
    END IF;
    NEW.arquivado_por := CASE WHEN NEW.arquivado_em IS NULL THEN NULL ELSE v_uid END;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.arquivado_por := OLD.arquivado_por;
  END IF;

  IF EXISTS (SELECT 1 FROM comercial_etapas WHERE id = NEW.etapa_id AND tipo = 'perdido')
     AND length(trim(coalesce(NEW.motivo_perda, ''))) = 0 THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento';
  END IF;
  RETURN NEW;
END
$f$;

-- nome começa com "trg_comercial_lead_r" → roda depois de trg_comercial_lead_antes_salvar
DROP TRIGGER IF EXISTS trg_comercial_lead_regras ON public.comercial_leads;
CREATE TRIGGER trg_comercial_lead_regras BEFORE INSERT OR UPDATE ON public.comercial_leads
  FOR EACH ROW EXECUTE FUNCTION public.comercial_lead_regras();

DROP POLICY IF EXISTS "Comercial internos gerenciam leads" ON public.comercial_leads;
DROP POLICY IF EXISTS "Comercial leads - ver" ON public.comercial_leads;
DROP POLICY IF EXISTS "Comercial leads - criar" ON public.comercial_leads;
DROP POLICY IF EXISTS "Comercial leads - editar" ON public.comercial_leads;
CREATE POLICY "Comercial leads - ver" ON public.comercial_leads
  FOR SELECT TO authenticated
  USING (public.comercial_pode_ver(auth.uid(), vendedor_id, lider_id, gerente_id,
                                    public.comercial_lead_fechado(etapa_id)));
CREATE POLICY "Comercial leads - criar" ON public.comercial_leads
  FOR INSERT TO authenticated
  WITH CHECK (public.comercial_pode_editar(auth.uid(), vendedor_id));
CREATE POLICY "Comercial leads - editar" ON public.comercial_leads
  FOR UPDATE TO authenticated
  USING (public.comercial_pode_editar(auth.uid(), vendedor_id))
  WITH CHECK (public.comercial_pode_editar(auth.uid(), vendedor_id));
-- Sem política de DELETE: ninguém exclui pela API (só arquiva).

-- Histórico segue a visibilidade do lead (o subselect já passa pelo RLS de leads).
DROP POLICY IF EXISTS "Comercial internos leem historico" ON public.comercial_lead_historico;
CREATE POLICY "Comercial internos leem historico" ON public.comercial_lead_historico
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comercial_leads l WHERE l.id = lead_id));

DROP FUNCTION IF EXISTS public.comercial_pode_ver_lead(uuid, uuid);

-- Preenche a cadeia dos leads existentes.
UPDATE public.comercial_leads l
   SET (lider_id, gerente_id) = (SELECT c.lider_id, c.gerente_id
                                   FROM public.comercial_cadeia(public.comercial_dono(l.vendedor_id)) c)
 WHERE l.lider_id IS NULL AND l.gerente_id IS NULL AND l.vendedor_id IS NOT NULL;

-- ===========================================================================
-- 3) Vendedores, funis e etapas: só gerente/admin alteram
-- ===========================================================================
-- (antes qualquer interno podia vincular o próprio usuário a outro vendedor e
--  passar a ver os leads dele)
DROP POLICY IF EXISTS "Comercial internos gerenciam vendedores" ON public.comercial_vendedores;
DROP POLICY IF EXISTS "Comercial vendedores - ver" ON public.comercial_vendedores;
DROP POLICY IF EXISTS "Comercial vendedores - gerir" ON public.comercial_vendedores;
CREATE POLICY "Comercial vendedores - ver" ON public.comercial_vendedores
  FOR SELECT TO authenticated
  USING (public.comercial_nivel(auth.uid()) <> 'nenhum');
CREATE POLICY "Comercial vendedores - gerir" ON public.comercial_vendedores
  FOR ALL TO authenticated
  USING (public.comercial_nivel(auth.uid()) = 'admin'
         OR (public.comercial_nivel(auth.uid()) = 'gerente'
             AND (profile_id IS NULL OR public.comercial_no_alcance(auth.uid(), profile_id))))
  WITH CHECK (public.comercial_nivel(auth.uid()) = 'admin'
         OR (public.comercial_nivel(auth.uid()) = 'gerente'
             AND (profile_id IS NULL OR public.comercial_no_alcance(auth.uid(), profile_id))));

DROP POLICY IF EXISTS "Comercial internos gerenciam funis" ON public.comercial_funis;
DROP POLICY IF EXISTS "Comercial funis - ver" ON public.comercial_funis;
DROP POLICY IF EXISTS "Comercial funis - gerir" ON public.comercial_funis;
CREATE POLICY "Comercial funis - ver" ON public.comercial_funis
  FOR SELECT TO authenticated USING (public.comercial_nivel(auth.uid()) <> 'nenhum');
CREATE POLICY "Comercial funis - gerir" ON public.comercial_funis
  FOR ALL TO authenticated
  USING (public.comercial_nivel(auth.uid()) IN ('admin', 'gerente'))
  WITH CHECK (public.comercial_nivel(auth.uid()) IN ('admin', 'gerente'));

DROP POLICY IF EXISTS "Comercial internos gerenciam etapas" ON public.comercial_etapas;
DROP POLICY IF EXISTS "Comercial etapas - ver" ON public.comercial_etapas;
DROP POLICY IF EXISTS "Comercial etapas - gerir" ON public.comercial_etapas;
CREATE POLICY "Comercial etapas - ver" ON public.comercial_etapas
  FOR SELECT TO authenticated USING (public.comercial_nivel(auth.uid()) <> 'nenhum');
CREATE POLICY "Comercial etapas - gerir" ON public.comercial_etapas
  FOR ALL TO authenticated
  USING (public.comercial_nivel(auth.uid()) IN ('admin', 'gerente'))
  WITH CHECK (public.comercial_nivel(auth.uid()) IN ('admin', 'gerente'));

-- ===========================================================================
-- 4) Cotações
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.comercial_cotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigint GENERATED BY DEFAULT AS IDENTITY UNIQUE,
  lead_id uuid NOT NULL REFERENCES public.comercial_leads(id) ON DELETE CASCADE,
  vendedor_id uuid REFERENCES public.comercial_vendedores(id) ON DELETE SET NULL,
  lider_id uuid,
  gerente_id uuid,
  produto text,
  descricao text,
  valor numeric(14, 2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  -- rascunho → enviada → aprovada → emitida ; cancelamento_solicitado → cancelada
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'enviada', 'aprovada', 'emitida', 'cancelamento_solicitado', 'cancelada')),
  status_anterior text,
  motivo_cancelamento text,
  cancelamento_solicitado_por uuid,
  cancelamento_solicitado_em timestamptz,
  cancelada_por uuid,
  cancelada_em timestamptz,
  emitida_em timestamptz,
  arquivado_em timestamptz,
  arquivado_por uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comercial_cotacoes_lead ON public.comercial_cotacoes (lead_id);
CREATE INDEX IF NOT EXISTS idx_comercial_cotacoes_vendedor ON public.comercial_cotacoes (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_comercial_cotacoes_status ON public.comercial_cotacoes (status);

REVOKE ALL ON public.comercial_cotacoes FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.comercial_cotacoes TO authenticated;
GRANT ALL ON public.comercial_cotacoes TO service_role;
ALTER TABLE public.comercial_cotacoes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_comercial_cotacoes_updated_at ON public.comercial_cotacoes;
CREATE TRIGGER trg_comercial_cotacoes_updated_at BEFORE UPDATE ON public.comercial_cotacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.comercial_cotacao_regras()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := CASE WHEN public.comercial_em_rotina() THEN NULL ELSE auth.uid() END;
  v_nivel text;
  v_lead_vendedor uuid;
  v_cad record;
  v_motivo text := nullif(trim(coalesce(NEW.motivo_cancelamento, '')), '');
BEGIN
  SELECT vendedor_id INTO v_lead_vendedor FROM comercial_leads WHERE id = NEW.lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado'; END IF;

  IF TG_OP = 'INSERT' THEN
    -- a cotação é sempre do vendedor do lead
    NEW.vendedor_id := v_lead_vendedor;
  ELSE
    IF NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
      RAISE EXCEPTION 'Não é possível mudar o lead da cotação';
    END IF;
    -- só muda de vendedor acompanhando o lead (transferência é feita no lead)
    IF NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id AND NEW.vendedor_id IS DISTINCT FROM v_lead_vendedor THEN
      RAISE EXCEPTION 'Para transferir a cotação, transfira o lead' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN
    SELECT * INTO v_cad FROM public.comercial_cadeia(public.comercial_dono(NEW.vendedor_id));
    NEW.lider_id := v_cad.lider_id;
    NEW.gerente_id := v_cad.gerente_id;
  ELSIF v_uid IS NOT NULL THEN
    NEW.lider_id := OLD.lider_id;
    NEW.gerente_id := OLD.gerente_id;
  END IF;

  IF NEW.status = 'emitida' AND (TG_OP = 'INSERT' OR OLD.status <> 'emitida') THEN
    NEW.emitida_em := now();
  END IF;

  IF v_uid IS NULL THEN RETURN NEW; END IF;
  v_nivel := public.comercial_nivel(v_uid);

  -- campos de controle não vêm do cliente
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('rascunho', 'enviada') THEN
      RAISE EXCEPTION 'Cotação nova começa como rascunho ou enviada';
    END IF;
    NEW.status_anterior := NULL;
    NEW.cancelamento_solicitado_por := NULL; NEW.cancelamento_solicitado_em := NULL;
    NEW.cancelada_por := NULL; NEW.cancelada_em := NULL;
    NEW.arquivado_em := NULL; NEW.arquivado_por := NULL;
    NEW.created_by := v_uid;
    RETURN NEW;
  END IF;

  NEW.status_anterior := OLD.status_anterior;
  NEW.cancelamento_solicitado_por := OLD.cancelamento_solicitado_por;
  NEW.cancelamento_solicitado_em := OLD.cancelamento_solicitado_em;
  NEW.cancelada_por := OLD.cancelada_por;
  NEW.cancelada_em := OLD.cancelada_em;
  NEW.arquivado_por := OLD.arquivado_por;
  NEW.created_by := OLD.created_by;

  IF NEW.arquivado_em IS DISTINCT FROM OLD.arquivado_em THEN
    IF v_nivel NOT IN ('gerente', 'admin') THEN
      RAISE EXCEPTION 'Somente o gerente ou o administrador arquiva cotações' USING ERRCODE = '42501';
    END IF;
    NEW.arquivado_por := CASE WHEN NEW.arquivado_em IS NULL THEN NULL ELSE v_uid END;
  END IF;

  IF v_nivel IN ('direto', 'lider') THEN
    IF OLD.status IN ('aprovada', 'emitida', 'cancelada', 'cancelamento_solicitado') THEN
      RAISE EXCEPTION 'Cotação %: só o gerente altera a partir de agora',
        CASE OLD.status WHEN 'cancelamento_solicitado' THEN 'com cancelamento solicitado' ELSE OLD.status END
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'cancelada' THEN
      RAISE EXCEPTION 'Somente o gerente cancela — use "Solicitar cancelamento"' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelamento_solicitado' THEN
      IF v_motivo IS NULL THEN RAISE EXCEPTION 'Informe o motivo do pedido de cancelamento'; END IF;
      NEW.status_anterior := OLD.status;
      NEW.cancelamento_solicitado_por := v_uid;
      NEW.cancelamento_solicitado_em := now();
    ELSIF NEW.status = 'cancelada' THEN
      IF v_motivo IS NULL THEN RAISE EXCEPTION 'Justificativa obrigatória para cancelar'; END IF;
      NEW.cancelada_por := v_uid;
      NEW.cancelada_em := now();
    ELSIF OLD.status = 'cancelada' THEN
      NEW.cancelada_por := NULL;
      NEW.cancelada_em := NULL;
    END IF;
  END IF;
  RETURN NEW;
END
$f$;

DROP TRIGGER IF EXISTS trg_comercial_cotacao_regras ON public.comercial_cotacoes;
CREATE TRIGGER trg_comercial_cotacao_regras BEFORE INSERT OR UPDATE ON public.comercial_cotacoes
  FOR EACH ROW EXECUTE FUNCTION public.comercial_cotacao_regras();

CREATE OR REPLACE FUNCTION public.comercial_vendedor_do_lead(_lead_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT vendedor_id FROM comercial_leads WHERE id = _lead_id
$$;
REVOKE ALL ON FUNCTION public.comercial_vendedor_do_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comercial_vendedor_do_lead(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Comercial cotacoes - ver" ON public.comercial_cotacoes;
DROP POLICY IF EXISTS "Comercial cotacoes - criar" ON public.comercial_cotacoes;
DROP POLICY IF EXISTS "Comercial cotacoes - editar" ON public.comercial_cotacoes;
CREATE POLICY "Comercial cotacoes - ver" ON public.comercial_cotacoes
  FOR SELECT TO authenticated
  USING (public.comercial_pode_ver(auth.uid(), vendedor_id, lider_id, gerente_id,
                                    status IN ('emitida', 'cancelada')));
CREATE POLICY "Comercial cotacoes - criar" ON public.comercial_cotacoes
  FOR INSERT TO authenticated
  WITH CHECK (public.comercial_pode_editar(auth.uid(), public.comercial_vendedor_do_lead(lead_id)));
CREATE POLICY "Comercial cotacoes - editar" ON public.comercial_cotacoes
  FOR UPDATE TO authenticated
  USING (public.comercial_pode_editar(auth.uid(), vendedor_id))
  WITH CHECK (public.comercial_pode_editar(auth.uid(), vendedor_id));

-- Transferência do lead leva junto as cotações em aberto (emitidas/canceladas
-- continuam com a equipe de origem).
CREATE OR REPLACE FUNCTION public.comercial_lead_transferir_cotacoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN
    UPDATE comercial_cotacoes SET vendedor_id = NEW.vendedor_id
     WHERE lead_id = NEW.id AND status NOT IN ('emitida', 'cancelada');
  END IF;
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS trg_comercial_lead_transferir_cotacoes ON public.comercial_leads;
CREATE TRIGGER trg_comercial_lead_transferir_cotacoes AFTER UPDATE OF vendedor_id ON public.comercial_leads
  FOR EACH ROW EXECUTE FUNCTION public.comercial_lead_transferir_cotacoes();

-- ===========================================================================
-- 5) Comentários e notificações
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.comercial_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade text NOT NULL CHECK (entidade IN ('lead', 'cotacao')),
  entidade_id uuid NOT NULL,
  autor_id uuid NOT NULL DEFAULT auth.uid(),
  texto text NOT NULL CHECK (length(trim(texto)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comercial_comentarios_entidade
  ON public.comercial_comentarios (entidade, entidade_id, created_at);

REVOKE ALL ON public.comercial_comentarios FROM anon;
GRANT SELECT, INSERT ON public.comercial_comentarios TO authenticated;
GRANT ALL ON public.comercial_comentarios TO service_role;
ALTER TABLE public.comercial_comentarios ENABLE ROW LEVEL SECURITY;

-- Comenta quem enxerga o registro (Direto: os próprios; Líder: equipe; ...).
DROP POLICY IF EXISTS "Comercial comentarios - ver" ON public.comercial_comentarios;
DROP POLICY IF EXISTS "Comercial comentarios - criar" ON public.comercial_comentarios;
CREATE POLICY "Comercial comentarios - ver" ON public.comercial_comentarios
  FOR SELECT TO authenticated
  USING (CASE entidade
    WHEN 'lead' THEN EXISTS (SELECT 1 FROM public.comercial_leads l WHERE l.id = entidade_id)
    ELSE EXISTS (SELECT 1 FROM public.comercial_cotacoes c WHERE c.id = entidade_id) END);
CREATE POLICY "Comercial comentarios - criar" ON public.comercial_comentarios
  FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid() AND CASE entidade
    WHEN 'lead' THEN EXISTS (SELECT 1 FROM public.comercial_leads l WHERE l.id = entidade_id)
    ELSE EXISTS (SELECT 1 FROM public.comercial_cotacoes c WHERE c.id = entidade_id) END);

CREATE TABLE IF NOT EXISTS public.comercial_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  entidade text NOT NULL,
  entidade_id uuid NOT NULL,
  titulo text NOT NULL,
  texto text,
  autor_id uuid,
  lida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comercial_notificacoes_user
  ON public.comercial_notificacoes (user_id, lida_em, created_at DESC);

REVOKE ALL ON public.comercial_notificacoes FROM anon;
GRANT SELECT ON public.comercial_notificacoes TO authenticated;
GRANT UPDATE (lida_em) ON public.comercial_notificacoes TO authenticated;
GRANT ALL ON public.comercial_notificacoes TO service_role;
ALTER TABLE public.comercial_notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comercial notificacoes - minhas" ON public.comercial_notificacoes;
DROP POLICY IF EXISTS "Comercial notificacoes - marcar lida" ON public.comercial_notificacoes;
CREATE POLICY "Comercial notificacoes - minhas" ON public.comercial_notificacoes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Comercial notificacoes - marcar lida" ON public.comercial_notificacoes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.comercial_notificar(
  _para uuid, _tipo text, _entidade text, _entidade_id uuid, _titulo text, _texto text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO comercial_notificacoes (user_id, tipo, entidade, entidade_id, titulo, texto, autor_id)
  SELECT _para, _tipo, _entidade, _entidade_id, _titulo, left(_texto, 500), auth.uid()
   WHERE _para IS NOT NULL AND _para IS DISTINCT FROM auth.uid()
$$;
REVOKE ALL ON FUNCTION public.comercial_notificar(uuid, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Comentário → avisa o vendedor responsável.
CREATE OR REPLACE FUNCTION public.comercial_comentario_notificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_vendedor uuid;
  v_titulo text;
  v_autor text := (SELECT nome FROM profiles WHERE id = NEW.autor_id);
BEGIN
  IF NEW.entidade = 'lead' THEN
    SELECT vendedor_id, 'Comentário no lead ' || nome INTO v_vendedor, v_titulo
      FROM comercial_leads WHERE id = NEW.entidade_id;
  ELSE
    SELECT c.vendedor_id, 'Comentário na cotação nº ' || c.numero || ' (' || l.nome || ')'
      INTO v_vendedor, v_titulo
      FROM comercial_cotacoes c JOIN comercial_leads l ON l.id = c.lead_id WHERE c.id = NEW.entidade_id;
  END IF;
  PERFORM public.comercial_notificar(public.comercial_dono(v_vendedor), 'comentario', NEW.entidade,
    NEW.entidade_id, v_titulo, coalesce(v_autor, 'Alguém') || ': ' || NEW.texto);
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS trg_comercial_comentario_notificar ON public.comercial_comentarios;
CREATE TRIGGER trg_comercial_comentario_notificar AFTER INSERT ON public.comercial_comentarios
  FOR EACH ROW EXECUTE FUNCTION public.comercial_comentario_notificar();

-- Cotação: pedido de cancelamento → gerente (ou admins, se não houver);
-- mudança de status feita por outra pessoa → vendedor responsável.
CREATE OR REPLACE FUNCTION public.comercial_cotacao_notificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_lead text := (SELECT nome FROM comercial_leads WHERE id = NEW.lead_id);
  v_titulo text;
  v_cad record;
  v_dono uuid := public.comercial_dono(NEW.vendedor_id);
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  v_titulo := 'Cotação nº ' || NEW.numero || ' (' || coalesce(v_lead, '') || ')';
  IF NEW.status = 'cancelamento_solicitado' THEN
    SELECT * INTO v_cad FROM public.comercial_cadeia(v_dono);
    IF v_cad.gerente_id IS NOT NULL THEN
      PERFORM public.comercial_notificar(v_cad.gerente_id, 'cancelamento_solicitado', 'cotacao', NEW.id,
        v_titulo || ': cancelamento solicitado', NEW.motivo_cancelamento);
    ELSE
      PERFORM public.comercial_notificar(ur.user_id, 'cancelamento_solicitado', 'cotacao', NEW.id,
        v_titulo || ': cancelamento solicitado', NEW.motivo_cancelamento)
        FROM user_roles ur JOIN profiles p ON p.id = ur.user_id
       WHERE ur.role IN ('admin', 'superintendente') AND p.ativo;
    END IF;
  ELSIF v_dono IS DISTINCT FROM auth.uid() THEN
    PERFORM public.comercial_notificar(v_dono, 'status', 'cotacao', NEW.id,
      v_titulo || ': ' || replace(NEW.status, '_', ' '),
      CASE WHEN NEW.status = 'cancelada' THEN NEW.motivo_cancelamento END);
  END IF;
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS trg_comercial_cotacao_notificar ON public.comercial_cotacoes;
CREATE TRIGGER trg_comercial_cotacao_notificar AFTER UPDATE OF status ON public.comercial_cotacoes
  FOR EACH ROW EXECUTE FUNCTION public.comercial_cotacao_notificar();

-- ===========================================================================
-- 6) Auditoria (por trigger: pega tela, API direta e rotinas)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.comercial_auditoria (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id uuid,
  acao text NOT NULL,
  entidade text NOT NULL,
  entidade_id uuid,
  dono_id uuid,      -- usuário dono do registro (ou o usuário alterado)
  lider_id uuid,
  gerente_id uuid,
  dados_antes jsonb,
  dados_depois jsonb,
  data_hora timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comercial_auditoria_data ON public.comercial_auditoria (data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_comercial_auditoria_entidade ON public.comercial_auditoria (entidade, entidade_id);

REVOKE ALL ON public.comercial_auditoria FROM anon;
GRANT SELECT ON public.comercial_auditoria TO authenticated;
GRANT ALL ON public.comercial_auditoria TO service_role;
ALTER TABLE public.comercial_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comercial auditoria - ver" ON public.comercial_auditoria;
CREATE POLICY "Comercial auditoria - ver" ON public.comercial_auditoria
  FOR SELECT TO authenticated
  USING (public.comercial_nivel(auth.uid()) = 'admin'
         OR (public.comercial_nivel(auth.uid()) = 'gerente'
             AND (gerente_id = auth.uid() OR public.comercial_no_alcance(auth.uid(), dono_id))));

-- Só as colunas que mudaram (antes/depois), sem os carimbos automáticos.
CREATE OR REPLACE FUNCTION public.comercial_diff(_antes jsonb, _depois jsonb, OUT antes jsonb, OUT depois jsonb)
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    (SELECT jsonb_object_agg(k, _antes -> k) FROM jsonb_object_keys(_depois) k
      WHERE _antes -> k IS DISTINCT FROM _depois -> k AND k NOT IN ('updated_at', 'etapa_alterada_em')),
    (SELECT jsonb_object_agg(k, _depois -> k) FROM jsonb_object_keys(_depois) k
      WHERE _antes -> k IS DISTINCT FROM _depois -> k AND k NOT IN ('updated_at', 'etapa_alterada_em'))
$$;

CREATE OR REPLACE FUNCTION public.comercial_auditar_registro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_ent text := CASE TG_TABLE_NAME WHEN 'comercial_leads' THEN 'lead' ELSE 'cotacao' END;
  v_acao text;
  v_d record;
  v_row jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criacao';
    v_row := to_jsonb(NEW);
    INSERT INTO comercial_auditoria (user_id, acao, entidade, entidade_id, dono_id, lider_id, gerente_id, dados_depois)
    VALUES (auth.uid(), v_acao, v_ent, NEW.id, public.comercial_dono(NEW.vendedor_id), NEW.lider_id, NEW.gerente_id, v_row);
    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO comercial_auditoria (user_id, acao, entidade, entidade_id, dono_id, lider_id, gerente_id, dados_antes)
    VALUES (auth.uid(), 'exclusao', v_ent, OLD.id, public.comercial_dono(OLD.vendedor_id), OLD.lider_id, OLD.gerente_id, to_jsonb(OLD));
    RETURN NULL;
  END IF;

  SELECT * INTO v_d FROM public.comercial_diff(to_jsonb(OLD), to_jsonb(NEW));
  IF v_d.depois IS NULL THEN RETURN NULL; END IF;

  v_acao := CASE
    WHEN NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN 'transferencia'
    WHEN NEW.arquivado_em IS DISTINCT FROM OLD.arquivado_em THEN
      CASE WHEN NEW.arquivado_em IS NULL THEN 'desarquivamento' ELSE 'arquivamento' END
    WHEN v_ent = 'cotacao' AND (v_d.depois ? 'status') THEN
      CASE (v_d.depois ->> 'status')
        WHEN 'cancelada' THEN 'cancelamento'
        WHEN 'cancelamento_solicitado' THEN 'solicitacao_cancelamento'
        ELSE 'mudanca_status' END
    WHEN v_ent = 'lead' AND (v_d.depois ? 'etapa_id') THEN 'mudanca_etapa'
    ELSE 'edicao' END;

  INSERT INTO comercial_auditoria (user_id, acao, entidade, entidade_id, dono_id, lider_id, gerente_id, dados_antes, dados_depois)
  VALUES (auth.uid(), v_acao, v_ent, NEW.id, public.comercial_dono(NEW.vendedor_id), NEW.lider_id, NEW.gerente_id,
          v_d.antes, v_d.depois);
  RETURN NULL;
END
$f$;

DROP TRIGGER IF EXISTS trg_comercial_leads_auditoria ON public.comercial_leads;
CREATE TRIGGER trg_comercial_leads_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.comercial_leads
  FOR EACH ROW EXECUTE FUNCTION public.comercial_auditar_registro();
DROP TRIGGER IF EXISTS trg_comercial_cotacoes_auditoria ON public.comercial_cotacoes;
CREATE TRIGGER trg_comercial_cotacoes_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.comercial_cotacoes
  FOR EACH ROW EXECUTE FUNCTION public.comercial_auditar_registro();

CREATE OR REPLACE FUNCTION public.comercial_auditar_comentario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_vend uuid; v_lid uuid; v_ger uuid;
BEGIN
  IF NEW.entidade = 'lead' THEN
    SELECT vendedor_id, lider_id, gerente_id INTO v_vend, v_lid, v_ger FROM comercial_leads WHERE id = NEW.entidade_id;
  ELSE
    SELECT vendedor_id, lider_id, gerente_id INTO v_vend, v_lid, v_ger FROM comercial_cotacoes WHERE id = NEW.entidade_id;
  END IF;
  INSERT INTO comercial_auditoria (user_id, acao, entidade, entidade_id, dono_id, lider_id, gerente_id, dados_depois)
  VALUES (NEW.autor_id, 'comentario', NEW.entidade, NEW.entidade_id, public.comercial_dono(v_vend), v_lid, v_ger,
          jsonb_build_object('comentario_id', NEW.id, 'texto', NEW.texto));
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS trg_comercial_comentarios_auditoria ON public.comercial_comentarios;
CREATE TRIGGER trg_comercial_comentarios_auditoria AFTER INSERT ON public.comercial_comentarios
  FOR EACH ROW EXECUTE FUNCTION public.comercial_auditar_comentario();

-- ===========================================================================
-- 7) Usuários: vínculos protegidos, troca de equipe e auditoria
-- ===========================================================================
-- Ninguém (exceto admin/superintendente) muda o PRÓPRIO cargo, equipe,
-- vínculos ou status pela API. Antes, "Users can update own profile" deixava
-- trocar o próprio cargo_id e ganhar permissões.
CREATE OR REPLACE FUNCTION public.profiles_protege_vinculos_proprios()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.id
     AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = OLD.id AND role IN ('admin', 'superintendente'))
     AND (NEW.cargo_id IS DISTINCT FROM OLD.cargo_id
       OR NEW.equipe_id IS DISTINCT FROM OLD.equipe_id
       OR NEW.lider_id IS DISTINCT FROM OLD.lider_id
       OR NEW.administrativo_id IS DISTINCT FROM OLD.administrativo_id
       OR NEW.ativo IS DISTINCT FROM OLD.ativo) THEN
    RAISE EXCEPTION 'Você não pode alterar o próprio cargo, equipe, vínculos ou status' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$f$;
DROP TRIGGER IF EXISTS trg_profiles_protege_vinculos_proprios ON public.profiles;
CREATE TRIGGER trg_profiles_protege_vinculos_proprios BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protege_vinculos_proprios();

-- Recalcula a cadeia gravada dos registros EM ABERTO de um dono
-- (fechados continuam com a equipe de origem).
CREATE OR REPLACE FUNCTION public.comercial_recalcular_cadeia_aberta(_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_cad record;
  v_antes text := coalesce(current_setting('comercial.sistema', true), '');
BEGIN
  IF _owner IS NULL THEN RETURN; END IF;
  PERFORM set_config('comercial.sistema', '1', true);
  SELECT * INTO v_cad FROM public.comercial_cadeia(_owner);
  UPDATE comercial_leads l SET lider_id = v_cad.lider_id, gerente_id = v_cad.gerente_id
    FROM comercial_vendedores v
   WHERE v.id = l.vendedor_id AND v.profile_id = _owner
     AND NOT public.comercial_lead_fechado(l.etapa_id)
     AND (l.lider_id IS DISTINCT FROM v_cad.lider_id OR l.gerente_id IS DISTINCT FROM v_cad.gerente_id);
  UPDATE comercial_cotacoes c SET lider_id = v_cad.lider_id, gerente_id = v_cad.gerente_id
    FROM comercial_vendedores v
   WHERE v.id = c.vendedor_id AND v.profile_id = _owner
     AND c.status NOT IN ('emitida', 'cancelada')
     AND (c.lider_id IS DISTINCT FROM v_cad.lider_id OR c.gerente_id IS DISTINCT FROM v_cad.gerente_id);
  PERFORM set_config('comercial.sistema', v_antes, true);
END
$f$;
REVOKE ALL ON FUNCTION public.comercial_recalcular_cadeia_aberta(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.comercial_profiles_apos_alterar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_antes jsonb; v_depois jsonb;
  r record;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (
       NEW.lider_id IS DISTINCT FROM OLD.lider_id OR NEW.equipe_id IS DISTINCT FROM OLD.equipe_id
    OR NEW.administrativo_id IS DISTINCT FROM OLD.administrativo_id OR NEW.cargo_id IS DISTINCT FROM OLD.cargo_id
    OR NEW.ativo IS DISTINCT FROM OLD.ativo) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_antes := jsonb_build_object('lider_id', OLD.lider_id, 'equipe_id', OLD.equipe_id,
      'administrativo_id', OLD.administrativo_id, 'cargo_id', OLD.cargo_id, 'ativo', OLD.ativo);
  END IF;
  v_depois := jsonb_build_object('nome', NEW.nome, 'lider_id', NEW.lider_id, 'equipe_id', NEW.equipe_id,
    'administrativo_id', NEW.administrativo_id, 'cargo_id', NEW.cargo_id, 'ativo', NEW.ativo);

  INSERT INTO comercial_auditoria (user_id, acao, entidade, entidade_id, dono_id, dados_antes, dados_depois)
  VALUES (auth.uid(),
          CASE WHEN TG_OP = 'INSERT' THEN 'cadastro_usuario'
               WHEN NEW.ativo IS DISTINCT FROM OLD.ativo THEN CASE WHEN NEW.ativo THEN 'reativacao_usuario' ELSE 'inativacao_usuario' END
               ELSE 'mudanca_vinculo' END,
          'usuario', NEW.id, NEW.id, v_antes, v_depois);

  IF TG_OP = 'UPDATE' AND (NEW.lider_id IS DISTINCT FROM OLD.lider_id OR NEW.equipe_id IS DISTINCT FROM OLD.equipe_id
                           OR NEW.administrativo_id IS DISTINCT FROM OLD.administrativo_id) THEN
    PERFORM public.comercial_recalcular_cadeia_aberta(NEW.id);
    -- se for líder, os diretos dele também mudam de gerente
    FOR r IN SELECT p.id FROM profiles p WHERE p.id <> NEW.id AND NEW.id IN (SELECT public.comercial_lideres_de(p.id)) LOOP
      PERFORM public.comercial_recalcular_cadeia_aberta(r.id);
    END LOOP;
  END IF;
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS trg_comercial_profiles_apos_alterar ON public.profiles;
CREATE TRIGGER trg_comercial_profiles_apos_alterar AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.comercial_profiles_apos_alterar();

-- Líder da equipe trocado → diretos da equipe mudam de cadeia.
CREATE OR REPLACE FUNCTION public.comercial_equipes_apos_alterar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  r record;
BEGIN
  IF NEW.lider_id IS DISTINCT FROM OLD.lider_id THEN
    FOR r IN SELECT id FROM profiles WHERE equipe_id = NEW.id LOOP
      PERFORM public.comercial_recalcular_cadeia_aberta(r.id);
    END LOOP;
  END IF;
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS trg_comercial_equipes_apos_alterar ON public.equipes;
CREATE TRIGGER trg_comercial_equipes_apos_alterar AFTER UPDATE OF lider_id ON public.equipes
  FOR EACH ROW EXECUTE FUNCTION public.comercial_equipes_apos_alterar();

CREATE OR REPLACE FUNCTION public.comercial_user_roles_auditar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  INSERT INTO comercial_auditoria (user_id, acao, entidade, entidade_id, dono_id, dados_antes, dados_depois)
  VALUES (auth.uid(), 'mudanca_nivel', 'usuario',
          coalesce(NEW.user_id, OLD.user_id), coalesce(NEW.user_id, OLD.user_id),
          CASE WHEN TG_OP <> 'INSERT' THEN jsonb_build_object('role', OLD.role) END,
          CASE WHEN TG_OP <> 'DELETE' THEN jsonb_build_object('role', NEW.role) END);
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.comercial_recalcular_cadeia_aberta(NEW.user_id);
  END IF;
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS trg_comercial_user_roles_auditar ON public.user_roles;
CREATE TRIGGER trg_comercial_user_roles_auditar AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.comercial_user_roles_auditar();

-- ===========================================================================
-- 8) Subitem do cargo: novo sentido
-- ===========================================================================
-- "comercial:todos-leads" liberado = visão geral do Comercial (como admin).
-- O cargo Vendedor já está com ele oculto (migration de 11/11).
