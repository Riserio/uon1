DROP POLICY IF EXISTS "Anon can view corretoras for public ouvidoria" ON public.corretoras;
DROP POLICY IF EXISTS "Anon can read own ouvidoria registros" ON public.ouvidoria_registros;
DROP POLICY IF EXISTS "Public can view vistorias by CPF or placa" ON public.vistorias;

CREATE OR REPLACE FUNCTION public.get_public_ouvidoria_corretora(p_slug_or_id text)
RETURNS TABLE(id uuid, nome text, logo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.nome, c.logo_url
  FROM public.corretoras c
  JOIN public.ouvidoria_config oc ON oc.corretora_id = c.id
  WHERE oc.ativo = true
    AND (
      c.slug = p_slug_or_id
      OR (
        p_slug_or_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND c.id = p_slug_or_id::uuid
      )
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_ouvidoria_corretora(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.criar_ouvidoria_registro_publico(
  p_corretora_id uuid,
  p_nome text,
  p_cpf text,
  p_email text,
  p_telefone text,
  p_tipo text,
  p_descricao text,
  p_placa_veiculo text,
  p_anonimo boolean,
  p_prioridade text,
  p_canal_retorno text
)
RETURNS TABLE(id uuid, protocolo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_protocolo text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ouvidoria_config
    WHERE corretora_id = p_corretora_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Ouvidoria pública indisponível para esta associação';
  END IF;

  IF COALESCE(trim(p_email), '') = '' OR COALESCE(trim(p_tipo), '') = '' OR COALESCE(trim(p_descricao), '') = '' THEN
    RAISE EXCEPTION 'Campos obrigatórios ausentes';
  END IF;

  INSERT INTO public.ouvidoria_registros (
    corretora_id,
    nome,
    cpf,
    email,
    telefone,
    tipo,
    descricao,
    placa_veiculo,
    protocolo,
    anonimo,
    prioridade,
    canal_retorno
  ) VALUES (
    p_corretora_id,
    CASE WHEN COALESCE(p_anonimo, false) THEN 'Anônimo' ELSE left(trim(COALESCE(p_nome, '')), 255) END,
    NULLIF(left(trim(COALESCE(p_cpf, '')), 32), ''),
    left(trim(p_email), 255),
    NULLIF(left(trim(COALESCE(p_telefone, '')), 32), ''),
    left(trim(p_tipo), 50),
    left(trim(p_descricao), 10000),
    NULLIF(upper(left(trim(COALESCE(p_placa_veiculo, '')), 16)), ''),
    '',
    COALESCE(p_anonimo, false),
    COALESCE(NULLIF(left(trim(COALESCE(p_prioridade, '')), 20), ''), 'media'),
    COALESCE(NULLIF(left(trim(COALESCE(p_canal_retorno, '')), 30), ''), 'email')
  ) RETURNING ouvidoria_registros.id, ouvidoria_registros.protocolo INTO v_id, v_protocolo;

  RETURN QUERY SELECT v_id, v_protocolo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_ouvidoria_registro_publico(uuid, text, text, text, text, text, text, text, boolean, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.atualizar_anexos_ouvidoria_publico(
  p_registro_id uuid,
  p_protocolo text,
  p_anexos_urls text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ouvidoria_registros
  SET anexos_urls = p_anexos_urls,
      updated_at = now()
  WHERE id = p_registro_id
    AND protocolo = p_protocolo
    AND created_at > now() - interval '30 minutes'
    AND anexos_urls IS NULL;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_anexos_ouvidoria_publico(uuid, text, text[]) TO anon, authenticated;