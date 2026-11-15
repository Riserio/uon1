ALTER TABLE public.contrato_templates
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fluxo_versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS campos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contratada jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS signatario_contratada jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS prazo_assinatura_dias integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS lembrete_dias integer[] NOT NULL DEFAULT ARRAY[3, 7, 12];

CREATE UNIQUE INDEX IF NOT EXISTS contrato_templates_slug_key
  ON public.contrato_templates (slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.contrato_template_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.contrato_templates(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  conteudo_html text NOT NULL,
  campos jsonb NOT NULL DEFAULT '[]'::jsonb,
  contratada jsonb NOT NULL DEFAULT '{}'::jsonb,
  signatario_contratada jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, versao)
);
ALTER TABLE public.contrato_template_versoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Autenticados veem versoes de modelos" ON public.contrato_template_versoes
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.uonisign_template_versionar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.conteudo_html IS DISTINCT FROM OLD.conteudo_html
       OR NEW.campos IS DISTINCT FROM OLD.campos
       OR NEW.contratada IS DISTINCT FROM OLD.contratada
       OR NEW.signatario_contratada IS DISTINCT FROM OLD.signatario_contratada THEN
      NEW.versao := OLD.versao + 1;
    ELSE
      NEW.versao := OLD.versao;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.uonisign_template_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.contrato_template_versoes
    (template_id, versao, conteudo_html, campos, contratada, signatario_contratada, created_by)
  VALUES (NEW.id, NEW.versao, NEW.conteudo_html, NEW.campos, NEW.contratada,
          NEW.signatario_contratada, auth.uid())
  ON CONFLICT (template_id, versao) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_uonisign_template_versionar ON public.contrato_templates;
CREATE TRIGGER trg_uonisign_template_versionar
  BEFORE UPDATE ON public.contrato_templates
  FOR EACH ROW EXECUTE FUNCTION public.uonisign_template_versionar();

DROP TRIGGER IF EXISTS trg_uonisign_template_snapshot ON public.contrato_templates;
CREATE TRIGGER trg_uonisign_template_snapshot
  AFTER INSERT OR UPDATE ON public.contrato_templates
  FOR EACH ROW EXECUTE FUNCTION public.uonisign_template_snapshot();

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS fluxo_versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS template_versao integer,
  ADD COLUMN IF NOT EXISTS contratante_cnpj text,
  ADD COLUMN IF NOT EXISTS pdf_original_path text,
  ADD COLUMN IF NOT EXISTS hash_original text,
  ADD COLUMN IF NOT EXISTS pdf_final_path text,
  ADD COLUMN IF NOT EXISTS hash_final text,
  ADD COLUMN IF NOT EXISTS lacre_status text,
  ADD COLUMN IF NOT EXISTS lacre_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lacre_erro text,
  ADD COLUMN IF NOT EXISTS lacre_em timestamptz,
  ADD COLUMN IF NOT EXISTS carimbo_tempo_em timestamptz,
  ADD COLUMN IF NOT EXISTS lacre_alertado_em timestamptz,
  ADD COLUMN IF NOT EXISTS enviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_assinatura_em timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS recusado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_recusa text,
  ADD COLUMN IF NOT EXISTS guardar_ate date;

DO $$ BEGIN
  ALTER TABLE public.contratos ADD CONSTRAINT contratos_status_check CHECK (status IN (
    'rascunho', 'aguardando_assinatura', 'parcialmente_assinado', 'assinado_processando',
    'assinado', 'recusado', 'cancelado', 'expirado')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_contratos_fluxo_status ON public.contratos (fluxo_versao, status);
CREATE INDEX IF NOT EXISTS idx_contratos_created_by ON public.contratos (created_by);

ALTER TABLE public.contrato_assinaturas
  ADD COLUMN IF NOT EXISTS canais text[] NOT NULL DEFAULT ARRAY['email'],
  ADD COLUMN IF NOT EXISTS enviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS visualizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS recusado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_recusa text,
  ADD COLUMN IF NOT EXISTS canal_validado text,
  ADD COLUMN IF NOT EXISTS contato_validado text,
  ADD COLUMN IF NOT EXISTS aceite_termos_em timestamptz,
  ADD COLUMN IF NOT EXISTS bloqueado_ate timestamptz,
  ADD COLUMN IF NOT EXISTS lembretes_enviados integer[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS contrato_assinaturas_link_token_key
  ON public.contrato_assinaturas (link_token) WHERE link_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.contrato_codigos_assinatura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id uuid NOT NULL REFERENCES public.contrato_assinaturas(id) ON DELETE RESTRICT,
  hash_codigo text NOT NULL,
  canal text NOT NULL,
  destino text,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  tentativas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_codigos_assinatura ON public.contrato_codigos_assinatura (assinatura_id, created_at DESC);
ALTER TABLE public.contrato_codigos_assinatura ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contrato_historico
  ADD COLUMN IF NOT EXISTS assinatura_id uuid,
  ADD COLUMN IF NOT EXISTS canal text;
CREATE INDEX IF NOT EXISTS idx_contrato_historico_contrato ON public.contrato_historico (contrato_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contrato_historico_assinatura ON public.contrato_historico (assinatura_id, acao, created_at);

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tc.table_name, tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name IN ('contrato_assinaturas', 'contrato_historico')
       AND tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_name = 'contratos'
       AND rc.delete_rule = 'CASCADE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE RESTRICT',
                   r.table_name, r.constraint_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.uonisign_historico_imutavel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A trilha de auditoria do contrato não pode ser alterada nem excluída';
END $$;

DROP TRIGGER IF EXISTS trg_uonisign_historico_imutavel ON public.contrato_historico;
CREATE TRIGGER trg_uonisign_historico_imutavel
  BEFORE UPDATE OR DELETE ON public.contrato_historico
  FOR EACH ROW EXECUTE FUNCTION public.uonisign_historico_imutavel();

CREATE OR REPLACE FUNCTION public.uonisign_assinatura_protegida()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'pendente' THEN
      RAISE EXCEPTION 'Signatário que já assinou ou recusou não pode ser excluído';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'assinado' AND (
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.assinado_em IS DISTINCT FROM OLD.assinado_em
    OR NEW.nome IS DISTINCT FROM OLD.nome
    OR NEW.cpf IS DISTINCT FROM OLD.cpf
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.telefone IS DISTINCT FROM OLD.telefone
    OR NEW.ip_assinatura IS DISTINCT FROM OLD.ip_assinatura
    OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
    OR NEW.hash_documento IS DISTINCT FROM OLD.hash_documento
    OR NEW.assinatura_url IS DISTINCT FROM OLD.assinatura_url
    OR NEW.canal_validado IS DISTINCT FROM OLD.canal_validado
    OR NEW.contato_validado IS DISTINCT FROM OLD.contato_validado
    OR NEW.aceite_termos_em IS DISTINCT FROM OLD.aceite_termos_em) THEN
    RAISE EXCEPTION 'Evidências de assinatura concluída não podem ser alteradas';
  END IF;
  IF OLD.status = 'recusado' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Recusa registrada não pode ser revertida';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_uonisign_assinatura_protegida ON public.contrato_assinaturas;
CREATE TRIGGER trg_uonisign_assinatura_protegida
  BEFORE UPDATE OR DELETE ON public.contrato_assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.uonisign_assinatura_protegida();

CREATE OR REPLACE FUNCTION public.uonisign_contrato_protegido()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'rascunho' OR OLD.hash_original IS NOT NULL THEN
      RAISE EXCEPTION 'Contrato enviado não pode ser excluído (arquive)';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.fluxo_versao >= 2 AND OLD.status <> 'rascunho' THEN
    IF NEW.conteudo_html IS DISTINCT FROM OLD.conteudo_html
       OR NEW.variaveis_preenchidas IS DISTINCT FROM OLD.variaveis_preenchidas
       OR NEW.pdf_original_path IS DISTINCT FROM OLD.pdf_original_path
       OR NEW.hash_original IS DISTINCT FROM OLD.hash_original
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.template_versao IS DISTINCT FROM OLD.template_versao
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Contrato enviado não pode ser editado. Cancele e gere um novo.';
    END IF;
  END IF;
  IF OLD.status IN ('assinado', 'recusado', 'cancelado', 'expirado')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Contrato com status % não pode mudar de status', OLD.status;
  END IF;
  IF OLD.lacre_status = 'concluido'
     AND (NEW.pdf_final_path IS DISTINCT FROM OLD.pdf_final_path
          OR NEW.hash_final IS DISTINCT FROM OLD.hash_final) THEN
    RAISE EXCEPTION 'PDF lacrado não pode ser substituído';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_uonisign_contrato_protegido ON public.contratos;
CREATE TRIGGER trg_uonisign_contrato_protegido
  BEFORE UPDATE OR DELETE ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.uonisign_contrato_protegido();

CREATE OR REPLACE FUNCTION public.auto_update_contrato_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  total_count int;
  signed_count int;
BEGIN
  IF EXISTS (SELECT 1 FROM contratos WHERE id = NEW.contrato_id AND fluxo_versao >= 2) THEN
    RETURN NEW;
  END IF;
  SELECT count(*), count(*) FILTER (WHERE status = 'assinado')
    INTO total_count, signed_count
    FROM contrato_assinaturas WHERE contrato_id = NEW.contrato_id;
  IF total_count > 0 AND total_count = signed_count THEN
    UPDATE contratos SET status = 'assinado'
     WHERE id = NEW.contrato_id AND status = 'aguardando_assinatura';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.uonisign_flag(_uid uuid, _subitem text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT pode_visualizar FROM user_menu_permissions
      WHERE user_id = _uid AND menu_item = 'contratos:' || _subitem LIMIT 1),
    (SELECT cmp.pode_visualizar FROM cargo_menu_permissions cmp
       JOIN profiles p ON p.cargo_id = cmp.cargo_id
      WHERE p.id = _uid AND cmp.menu_item = 'contratos:' || _subitem LIMIT 1),
    (SELECT rmp.pode_visualizar FROM role_menu_permissions rmp
       JOIN user_roles ur ON ur.role = rmp.role
      WHERE ur.user_id = _uid AND rmp.menu_item = 'contratos:' || _subitem LIMIT 1),
    false)
$$;

CREATE OR REPLACE FUNCTION public.uonisign_nivel(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN 'nenhum'
    WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE id = _uid AND ativo) THEN 'nenhum'
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role IN ('admin', 'superintendente')) THEN 'admin'
    WHEN public.uonisign_flag(_uid, 'admin') THEN 'admin'
    WHEN public.uonisign_flag(_uid, 'operador') THEN 'operador'
    ELSE 'vendedor'
  END
$$;

CREATE OR REPLACE FUNCTION public.uonisign_pode_ver(_uid uuid, _owner uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nivel text := public.uonisign_nivel(_uid);
BEGIN
  IF v_nivel IN ('admin', 'operador') THEN RETURN true; END IF;
  IF v_nivel = 'nenhum' OR _owner IS NULL THEN RETURN false; END IF;
  IF _owner = _uid THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role = 'parceiro') THEN RETURN false; END IF;
  RETURN public.comercial_no_alcance(_uid, _owner);
END $$;

CREATE OR REPLACE FUNCTION public.uonisign_pode_ver_contrato(_uid uuid, _contrato_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM contratos c
                  WHERE c.id = _contrato_id AND public.uonisign_pode_ver(_uid, c.created_by))
$$;

CREATE OR REPLACE FUNCTION public.uonisign_meu_nivel()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.uonisign_nivel(auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.uonisign_meu_nivel() TO authenticated;

DROP POLICY IF EXISTS "Usuarios veem contratos da sua corretora" ON public.contratos;
DROP POLICY IF EXISTS "Authenticated users can view contratos" ON public.contratos;
DROP POLICY IF EXISTS "uonisign_contratos_select" ON public.contratos;
CREATE POLICY "uonisign_contratos_select" ON public.contratos
  FOR SELECT TO authenticated
  USING (public.uonisign_pode_ver(auth.uid(), created_by));

DROP POLICY IF EXISTS "Authenticated users can insert contratos" ON public.contratos;
CREATE POLICY "Authenticated users can insert contratos" ON public.contratos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid() AND fluxo_versao = 1);

DROP POLICY IF EXISTS "Users view contrato_assinaturas of their corretora" ON public.contrato_assinaturas;
DROP POLICY IF EXISTS "uonisign_assinaturas_select" ON public.contrato_assinaturas;
CREATE POLICY "uonisign_assinaturas_select" ON public.contrato_assinaturas
  FOR SELECT TO authenticated
  USING (public.uonisign_pode_ver_contrato(auth.uid(), contrato_id));

DROP POLICY IF EXISTS "Authenticated users can view contrato_historico" ON public.contrato_historico;
DROP POLICY IF EXISTS "uonisign_historico_select" ON public.contrato_historico;
CREATE POLICY "uonisign_historico_select" ON public.contrato_historico
  FOR SELECT TO authenticated
  USING (public.uonisign_pode_ver_contrato(auth.uid(), contrato_id));

DROP POLICY IF EXISTS "uonisign_admin_gerencia_modelos" ON public.contrato_templates;
CREATE POLICY "uonisign_admin_gerencia_modelos" ON public.contrato_templates
  FOR UPDATE TO authenticated
  USING (public.uonisign_nivel(auth.uid()) = 'admin')
  WITH CHECK (public.uonisign_nivel(auth.uid()) = 'admin');

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
    AND c.fluxo_versao = 1
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
    AND c.fluxo_versao = 1
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

DO $$
BEGIN
  PERFORM cron.unschedule('uonisign-processar');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'uonisign-processar',
  '7 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/uonisign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ub2N6d21xZ2lnbm15bGJ2cGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODQ3NTIsImV4cCI6MjA3OTE2MDc1Mn0.VzyyyijOTQ3ti6Hp2Jq8PkPXw_I2q9lLgT1auF6zjqM'
    ),
    body := '{"acao":"processar"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);