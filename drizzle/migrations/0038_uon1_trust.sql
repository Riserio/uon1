CREATE TABLE IF NOT EXISTS public.trust_emissores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  cnpj text,
  ativo boolean NOT NULL DEFAULT true,
  selo_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.trust_emissores (slug, nome)
SELECT 'vangard', 'Vangard Gestora'
WHERE NOT EXISTS (SELECT 1 FROM public.trust_emissores WHERE slug = 'vangard');

CREATE TABLE IF NOT EXISTS public.trust_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  emissor_id uuid NOT NULL REFERENCES public.trust_emissores(id) ON DELETE RESTRICT,
  origem text NOT NULL,
  origem_id uuid,
  tipo text NOT NULL,
  titulo_publico text NOT NULL,
  status text NOT NULL DEFAULT 'valido'
    CHECK (status IN ('valido', 'cancelado', 'revogado', 'substituido')),
  motivo_status text,
  emitido_em timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trust_documentos_origem_key
  ON public.trust_documentos (origem, origem_id) WHERE origem_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.trust_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.trust_documentos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('original', 'assinado', 'selado')),
  hash_sha256 text NOT NULL CHECK (hash_sha256 ~ '^[0-9a-f]{64}$'),
  tamanho integer,
  storage_bucket text,
  storage_path text,
  selo_status text NOT NULL DEFAULT 'nao_configurado',
  selo_em timestamptz,
  carimbo_status text NOT NULL DEFAULT 'nao_configurado',
  carimbo_em timestamptz,
  carimbo_path text,
  carimbo_tentativas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, hash_sha256)
);
CREATE INDEX IF NOT EXISTS idx_trust_versoes_hash ON public.trust_versoes (hash_sha256);

CREATE TABLE IF NOT EXISTS public.trust_eventos (
  id bigserial PRIMARY KEY,
  documento_id uuid NOT NULL REFERENCES public.trust_documentos(id) ON DELETE RESTRICT,
  versao_id uuid REFERENCES public.trust_versoes(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  descricao text NOT NULL,
  publico boolean NOT NULL DEFAULT false,
  dados jsonb,
  ator_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  hash_anterior text NOT NULL DEFAULT '',
  hash text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_trust_eventos_documento ON public.trust_eventos (documento_id, id);

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS trust_codigo text,
  ADD COLUMN IF NOT EXISTS trust_documento_id uuid REFERENCES public.trust_documentos(id);
CREATE UNIQUE INDEX IF NOT EXISTS contratos_trust_codigo_key ON public.contratos (trust_codigo) WHERE trust_codigo IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trust_hash_evento(
  _anterior text, _documento uuid, _versao uuid, _tipo text, _descricao text,
  _dados jsonb, _ator uuid, _quando timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    _anterior, _documento::text, coalesce(_versao::text, ''), _tipo, _descricao,
    coalesce(_dados::text, ''), coalesce(_ator::text, ''),
    to_char(_quando AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')), 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.trust_encadear_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_anterior text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('uon1_trust_eventos'));
  SELECT hash INTO v_anterior FROM public.trust_eventos ORDER BY id DESC LIMIT 1;
  NEW.hash_anterior := coalesce(v_anterior, repeat('0', 64));
  NEW.created_at := date_trunc('milliseconds', clock_timestamp());
  NEW.hash := public.trust_hash_evento(NEW.hash_anterior, NEW.documento_id, NEW.versao_id,
    NEW.tipo, NEW.descricao, NEW.dados, NEW.ator_id, NEW.created_at);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_trust_encadear_evento ON public.trust_eventos;
CREATE TRIGGER trg_trust_encadear_evento
  BEFORE INSERT ON public.trust_eventos
  FOR EACH ROW EXECUTE FUNCTION public.trust_encadear_evento();

CREATE OR REPLACE FUNCTION public.trust_bloquear_alteracao()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Uon1 Trust: registro imutável (%).', TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS trg_trust_eventos_imutavel ON public.trust_eventos;
CREATE TRIGGER trg_trust_eventos_imutavel
  BEFORE UPDATE OR DELETE ON public.trust_eventos
  FOR EACH ROW EXECUTE FUNCTION public.trust_bloquear_alteracao();

CREATE OR REPLACE FUNCTION public.trust_versao_protegida()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Uon1 Trust: versão de documento não pode ser excluída.';
  END IF;
  IF NEW.hash_sha256 IS DISTINCT FROM OLD.hash_sha256
     OR NEW.documento_id IS DISTINCT FROM OLD.documento_id
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.tamanho IS DISTINCT FROM OLD.tamanho
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Uon1 Trust: o arquivo de uma versão não pode ser alterado.';
  END IF;
  IF OLD.carimbo_status = 'concluido' AND (NEW.carimbo_status IS DISTINCT FROM OLD.carimbo_status
       OR NEW.carimbo_path IS DISTINCT FROM OLD.carimbo_path OR NEW.carimbo_em IS DISTINCT FROM OLD.carimbo_em) THEN
    RAISE EXCEPTION 'Uon1 Trust: carimbo do tempo concluído não pode ser alterado.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_trust_versao_protegida ON public.trust_versoes;
CREATE TRIGGER trg_trust_versao_protegida
  BEFORE UPDATE OR DELETE ON public.trust_versoes
  FOR EACH ROW EXECUTE FUNCTION public.trust_versao_protegida();

CREATE OR REPLACE FUNCTION public.trust_documento_protegido()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Uon1 Trust: documento não pode ser excluído (revogue).';
  END IF;
  IF NEW.codigo IS DISTINCT FROM OLD.codigo
     OR NEW.emissor_id IS DISTINCT FROM OLD.emissor_id
     OR NEW.origem IS DISTINCT FROM OLD.origem
     OR NEW.origem_id IS DISTINCT FROM OLD.origem_id
     OR NEW.emitido_em IS DISTINCT FROM OLD.emitido_em THEN
    RAISE EXCEPTION 'Uon1 Trust: identificação do documento não pode ser alterada.';
  END IF;
  IF OLD.status <> 'valido' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Uon1 Trust: documento % não volta a ser válido.', OLD.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_trust_documento_protegido ON public.trust_documentos;
CREATE TRIGGER trg_trust_documento_protegido
  BEFORE UPDATE OR DELETE ON public.trust_documentos
  FOR EACH ROW EXECUTE FUNCTION public.trust_documento_protegido();

CREATE OR REPLACE FUNCTION public.trust_verificar_cadeia()
RETURNS TABLE (ok boolean, total bigint, primeiro_erro bigint, ultimo_hash text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_esperado_anterior text := repeat('0', 64);
  v_n bigint := 0;
BEGIN
  FOR r IN SELECT * FROM public.trust_eventos ORDER BY id LOOP
    v_n := v_n + 1;
    IF r.hash_anterior <> v_esperado_anterior
       OR r.hash <> public.trust_hash_evento(r.hash_anterior, r.documento_id, r.versao_id,
            r.tipo, r.descricao, r.dados, r.ator_id, r.created_at) THEN
      RETURN QUERY SELECT false, v_n, r.id, r.hash;
      RETURN;
    END IF;
    v_esperado_anterior := r.hash;
  END LOOP;
  RETURN QUERY SELECT true, v_n, NULL::bigint, v_esperado_anterior;
END $$;
REVOKE ALL ON FUNCTION public.trust_verificar_cadeia() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.trust_verificar_cadeia() TO service_role;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.trust_verificar_documento(_documento_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_anterior text;
BEGIN
  FOR r IN SELECT * FROM public.trust_eventos WHERE documento_id = _documento_id ORDER BY id LOOP
    SELECT hash INTO v_anterior FROM public.trust_eventos WHERE id < r.id ORDER BY id DESC LIMIT 1;
    IF r.hash_anterior <> coalesce(v_anterior, repeat('0', 64))
       OR r.hash <> public.trust_hash_evento(r.hash_anterior, r.documento_id, r.versao_id,
            r.tipo, r.descricao, r.dados, r.ator_id, r.created_at) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.trust_verificar_documento(uuid) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.trust_verificar_documento(uuid) TO service_role;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.trust_pode_ver(_uid uuid, _documento_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.uonisign_nivel(_uid) IN ('admin', 'operador')
    OR EXISTS (SELECT 1 FROM public.trust_documentos d
                WHERE d.id = _documento_id
                  AND d.origem = 'uonisign'
                  AND public.uonisign_pode_ver_contrato(_uid, d.origem_id))
$$;

ALTER TABLE public.trust_emissores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trust_emissores_select" ON public.trust_emissores;
CREATE POLICY "trust_emissores_select" ON public.trust_emissores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "trust_documentos_select" ON public.trust_documentos;
CREATE POLICY "trust_documentos_select" ON public.trust_documentos FOR SELECT TO authenticated
  USING (public.trust_pode_ver(auth.uid(), id));
DROP POLICY IF EXISTS "trust_versoes_select" ON public.trust_versoes;
CREATE POLICY "trust_versoes_select" ON public.trust_versoes FOR SELECT TO authenticated
  USING (public.trust_pode_ver(auth.uid(), documento_id));
DROP POLICY IF EXISTS "trust_eventos_select" ON public.trust_eventos;
CREATE POLICY "trust_eventos_select" ON public.trust_eventos FOR SELECT TO authenticated
  USING (public.trust_pode_ver(auth.uid(), documento_id));

DO $$
BEGIN
  PERFORM cron.unschedule('uon1-trust-processar');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'uon1-trust-processar',
  '37 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/uon1-trust',
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