--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'lider',
    'comercial',
    'superintendente',
    'administrativo'
);


--
-- Name: priority_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.priority_type AS ENUM (
    'Alta',
    'Média',
    'Baixa'
);


--
-- Name: status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_type AS ENUM (
    'novo',
    'andamento',
    'aguardo',
    'concluido'
);


--
-- Name: administrativo_can_view_profile(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.administrativo_can_view_profile(target_profile_id uuid, viewer_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_admin_role boolean;
  target_admin_id uuid;
BEGIN
  -- Check if viewer is administrativo or admin
  is_admin_role := has_role(viewer_id, 'administrativo'::app_role) OR has_role(viewer_id, 'admin'::app_role);
  
  IF NOT is_admin_role THEN
    RETURN FALSE;
  END IF;
  
  -- Can view own profile
  IF target_profile_id = viewer_id THEN
    RETURN TRUE;
  END IF;
  
  -- Check if target is linked to viewer as administrativo
  SELECT administrativo_id INTO target_admin_id FROM profiles WHERE id = target_profile_id;
  IF target_admin_id = viewer_id THEN
    RETURN TRUE;
  END IF;
  
  -- Check if target is in team led by someone linked to viewer
  RETURN EXISTS (
    SELECT 1
    FROM profiles p
    JOIN equipes e ON p.equipe_id = e.id
    JOIN profiles lider ON e.lider_id = lider.id
    WHERE lider.administrativo_id = viewer_id
      AND p.id = target_profile_id
  );
END;
$$;


--
-- Name: can_send_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_send_email(provider_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_limit RECORD;
BEGIN
  SELECT * INTO current_limit
  FROM email_rate_limits
  WHERE provider = provider_name
  AND periodo_inicio > now() - interval '24 hours'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    -- Create new limit record
    INSERT INTO email_rate_limits (provider, emails_sent)
    VALUES (provider_name, 0);
    RETURN TRUE;
  END IF;
  
  RETURN current_limit.emails_sent < current_limit.limite_diario;
END;
$$;


--
-- Name: can_view_profile(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_profile(target_profile_id uuid, viewer_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    has_role(viewer_id, 'superintendente'::app_role)
    OR (viewer_id = target_profile_id)
    OR (
      has_role(viewer_id, 'lider'::app_role)
      AND EXISTS (
        SELECT 1
        FROM equipes e
        JOIN profiles p ON p.equipe_id = e.id
        WHERE e.lider_id = viewer_id
          AND p.id = target_profile_id
      )
    );
$$;


--
-- Name: get_user_lider_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_lider_id(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT lider_id
  FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;


--
-- Name: get_user_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role(_user_id uuid) RETURNS public.app_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, ativo)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'nome', new.email),
    new.email,
    true
  );
  RETURN new;
END;
$$;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: handle_workflow_progression(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_workflow_progression() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_fluxo RECORD;
  current_status_config RECORD;
  next_fluxo_id UUID;
  first_status_next_fluxo TEXT;
  new_atendimento_id UUID;
  user_nome_var TEXT;
  assunto_fluxos TEXT;
BEGIN
  -- Only trigger when status changes
  IF NEW.status != OLD.status THEN
    -- Get current status configuration to check if it's final
    SELECT sc.* INTO current_status_config
    FROM public.status_config sc
    WHERE sc.nome = NEW.status
      AND sc.fluxo_id = NEW.fluxo_id
      AND sc.ativo = true;
    
    -- Check if this is a final status that should trigger next workflow
    IF current_status_config.is_final THEN
      -- Get current workflow info
      SELECT f.* INTO current_fluxo
      FROM public.fluxos f
      WHERE f.id = NEW.fluxo_id;
      
      -- Check if should create next workflow item
      IF current_fluxo.gera_proximo_automatico AND current_fluxo.proximo_fluxo_id IS NOT NULL THEN
        -- Get the first status (backlog) of the next workflow
        SELECT sc.nome INTO first_status_next_fluxo
        FROM public.status_config sc
        WHERE sc.fluxo_id = current_fluxo.proximo_fluxo_id
          AND sc.ativo = true
        ORDER BY sc.ordem
        LIMIT 1;
        
        -- Create new atendimento in next workflow if we found a status
        IF first_status_next_fluxo IS NOT NULL THEN
          -- Buscar nome do próximo fluxo
          SELECT nome INTO assunto_fluxos
          FROM fluxos
          WHERE id = current_fluxo.proximo_fluxo_id;
          
          -- Inserir novo atendimento
          INSERT INTO public.atendimentos (
            user_id,
            corretora_id,
            contato_id,
            assunto,
            observacoes,
            prioridade,
            responsavel_id,
            status,
            tags,
            fluxo_id
          ) VALUES (
            NEW.user_id,
            NEW.corretora_id,
            NEW.contato_id,
            'Continuação: ' || NEW.assunto,
            'Gerado automaticamente do fluxo anterior. ID original: ' || NEW.id || E'\n\n' || COALESCE(NEW.observacoes, ''),
            NEW.prioridade,
            NEW.responsavel_id,
            first_status_next_fluxo,
            NEW.tags,
            current_fluxo.proximo_fluxo_id
          ) RETURNING id INTO new_atendimento_id;
          
          -- Buscar nome do usuário
          SELECT nome INTO user_nome_var 
          FROM profiles 
          WHERE id = NEW.user_id;
          
          -- Registrar histórico do novo card usando JSONB
          INSERT INTO atendimentos_historico (
            atendimento_id,
            user_id,
            user_nome,
            acao,
            campos_alterados,
            valores_anteriores,
            valores_novos
          ) VALUES (
            new_atendimento_id,
            NEW.user_id,
            COALESCE(user_nome_var, 'Sistema'),
            current_fluxo.nome || ' -> ' || assunto_fluxos,
            jsonb_build_array('fluxo_id'),
            jsonb_build_object('fluxo_id', NEW.fluxo_id),
            jsonb_build_object('fluxo_id', current_fluxo.proximo_fluxo_id)
          );
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: registrar_historico_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_historico_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  user_nome_var TEXT;
  fluxo_nome_anterior TEXT;
  fluxo_nome_novo TEXT;
  assunto_fluxo TEXT;
  current_user_id UUID;
BEGIN
  -- Buscar user_id (auth.uid() ou user_id do NEW record)
  current_user_id := COALESCE(auth.uid(), NEW.user_id);
  
  -- Buscar nome do usuário
  SELECT nome INTO user_nome_var 
  FROM profiles 
  WHERE id = current_user_id;

  -- Se o status mudou, registrar
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Se o fluxo também mudou, buscar nomes dos fluxos
    IF OLD.fluxo_id IS DISTINCT FROM NEW.fluxo_id THEN
      SELECT nome INTO fluxo_nome_anterior FROM fluxos WHERE id = OLD.fluxo_id;
      SELECT nome INTO fluxo_nome_novo FROM fluxos WHERE id = NEW.fluxo_id;
      
      assunto_fluxo := COALESCE(fluxo_nome_anterior, '') || ' -> ' || COALESCE(fluxo_nome_novo, '');
    ELSE
      assunto_fluxo := 'Alteração de Status';
    END IF;

    INSERT INTO atendimentos_historico (
      atendimento_id,
      user_id,
      user_nome,
      acao,
      campos_alterados,
      valores_anteriores,
      valores_novos
    ) VALUES (
      NEW.id,
      current_user_id,
      COALESCE(user_nome_var, 'Sistema'),
      assunto_fluxo,
      jsonb_build_array('status'),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: reset_email_rate_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_email_rate_limits() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE email_rate_limits
  SET emails_sent = 0, periodo_inicio = now()
  WHERE periodo_inicio < now() - interval '24 hours';
END;
$$;


--
-- Name: send_email_on_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_email_on_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  template_record RECORD;
  auto_config RECORD;
  email_recipient TEXT;
  atendimento_record RECORD;
BEGIN
  -- Only trigger on status change
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Check if auto emails are enabled
  SELECT * INTO auto_config
  FROM email_auto_config
  WHERE user_id = NEW.user_id
  LIMIT 1;

  IF NOT FOUND OR NOT auto_config.enabled THEN
    RETURN NEW;
  END IF;

  -- Get atendimento details with corretora email
  SELECT 
    a.*,
    c.email as corretora_email,
    c.nome as corretora_nome
  INTO atendimento_record
  FROM atendimentos a
  LEFT JOIN corretoras c ON a.corretora_id = c.id
  WHERE a.id = NEW.id;

  -- Get active template for this status
  SELECT * INTO template_record
  FROM email_templates
  WHERE user_id = NEW.user_id
    AND ativo = true
    AND tipo = 'atendimento'
    AND NEW.status = ANY(status)
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no template or no recipient, exit
  IF NOT FOUND OR atendimento_record.corretora_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Queue the email (we'll use pg_net or edge function to actually send)
  INSERT INTO email_queue (
    tipo,
    destinatario,
    assunto,
    corpo,
    atendimento_id,
    status,
    agendado_para
  ) VALUES (
    'atendimento_status',
    atendimento_record.corretora_email,
    template_record.assunto,
    template_record.corpo,
    NEW.id,
    'pendente',
    NOW()
  );

  RETURN NEW;
END;
$$;


--
-- Name: set_corretora_created_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_corretora_created_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid()::text;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_atendimento_status_changed_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_atendimento_status_changed_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_status_config_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_status_config_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: validate_fluxo_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_fluxo_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  tem_inicial BOOLEAN;
  tem_final BOOLEAN;
BEGIN
  -- Verificar se o fluxo tem status inicial (backlog)
  SELECT EXISTS (
    SELECT 1 FROM status_config 
    WHERE fluxo_id = NEW.fluxo_id 
    AND tipo_etapa = 'backlog' 
    AND ativo = true
  ) INTO tem_inicial;

  -- Verificar se o fluxo tem status final (finalizado)
  SELECT EXISTS (
    SELECT 1 FROM status_config 
    WHERE fluxo_id = NEW.fluxo_id 
    AND tipo_etapa = 'finalizado' 
    AND ativo = true
  ) INTO tem_final;

  -- Se não tem inicial ou final, permitir (para permitir criação gradual)
  -- Mas alertar no log
  IF NOT tem_inicial THEN
    RAISE NOTICE 'Fluxo % não possui status inicial ativo', NEW.fluxo_id;
  END IF;

  IF NOT tem_final THEN
    RAISE NOTICE 'Fluxo % não possui status final ativo', NEW.fluxo_id;
  END IF;

  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: andamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.andamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    atendimento_id uuid NOT NULL,
    descricao text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    logo_url text,
    colors jsonb DEFAULT '{"primary": "#3b82f6", "statusNovo": "#3b82f6", "priorityAlta": "#ef4444", "priorityBaixa": "#22c55e", "priorityMedia": "#f59e0b", "statusAguardo": "#a855f7", "statusAndamento": "#f59e0b", "statusConcluido": "#22c55e"}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    login_image_url text
);


--
-- Name: atendimento_anexos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.atendimento_anexos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    atendimento_id uuid NOT NULL,
    arquivo_nome text NOT NULL,
    arquivo_url text NOT NULL,
    arquivo_tamanho bigint,
    tipo_arquivo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL
);


--
-- Name: atendimentos_numero_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.atendimentos_numero_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: atendimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.atendimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    corretora_id uuid,
    contato_id uuid,
    assunto text NOT NULL,
    prioridade public.priority_type DEFAULT 'Média'::public.priority_type NOT NULL,
    responsavel_id uuid,
    status text DEFAULT 'novo'::public.status_type NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    observacoes text,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    data_retorno timestamp with time zone,
    data_concluido timestamp with time zone,
    arquivado boolean DEFAULT false,
    status_changed_at timestamp with time zone DEFAULT now(),
    fluxo_id uuid,
    fluxo_concluido_id uuid,
    fluxo_concluido_nome text,
    numero integer DEFAULT nextval('public.atendimentos_numero_seq'::regclass) NOT NULL
);


--
-- Name: atendimentos_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.atendimentos_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    atendimento_id uuid NOT NULL,
    user_id uuid NOT NULL,
    user_nome text NOT NULL,
    acao text NOT NULL,
    campos_alterados jsonb,
    valores_anteriores jsonb,
    valores_novos jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comunicados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comunicados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    mensagem text NOT NULL,
    link text,
    imagem_url text,
    criado_por uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: contatos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contatos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    email text,
    telefone text,
    cargo text,
    corretora_id uuid,
    observacoes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    instagram text,
    linkedin text,
    facebook text,
    whatsapp text,
    created_by uuid DEFAULT auth.uid()
);


--
-- Name: corretoras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corretoras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    cnpj text,
    telefone text,
    email text,
    endereco text,
    cidade text,
    estado text,
    responsavel text,
    observacoes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    susep text,
    cep text,
    created_by uuid DEFAULT auth.uid()
);


--
-- Name: documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    descricao text,
    arquivo_url text NOT NULL,
    arquivo_nome text NOT NULL,
    arquivo_tamanho bigint,
    tipo_arquivo text,
    criado_por uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_auto_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_auto_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    enabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    smtp_host text NOT NULL,
    smtp_port integer DEFAULT 587 NOT NULL,
    smtp_user text NOT NULL,
    smtp_password text NOT NULL,
    from_email text NOT NULL,
    from_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    atendimento_id uuid NOT NULL,
    destinatario text NOT NULL,
    assunto text NOT NULL,
    corpo text NOT NULL,
    status text DEFAULT 'enviado'::text NOT NULL,
    erro_mensagem text,
    enviado_por uuid NOT NULL,
    enviado_em timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    destinatario text NOT NULL,
    assunto text NOT NULL,
    corpo text NOT NULL,
    tipo text NOT NULL,
    atendimento_id uuid,
    status text DEFAULT 'pendente'::text NOT NULL,
    tentativas integer DEFAULT 0,
    max_tentativas integer DEFAULT 3,
    erro_mensagem text,
    prioridade integer DEFAULT 5,
    agendado_para timestamp with time zone DEFAULT now(),
    enviado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    emails_sent integer DEFAULT 0,
    periodo_inicio timestamp with time zone DEFAULT now(),
    limite_diario integer DEFAULT 300,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    assunto text NOT NULL,
    corpo text NOT NULL,
    status text[],
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tipo text DEFAULT 'atendimento'::text,
    CONSTRAINT email_templates_tipo_check CHECK ((tipo = ANY (ARRAY['atendimento'::text, 'recuperacao'::text])))
);


--
-- Name: equipe_lideres; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipe_lideres (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    equipe_id uuid NOT NULL,
    lider_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: equipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    descricao text,
    lider_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    titulo text NOT NULL,
    descricao text,
    data_inicio timestamp with time zone NOT NULL,
    data_fim timestamp with time zone NOT NULL,
    local text,
    tipo text DEFAULT 'reuniao'::text,
    cor text DEFAULT '#3b82f6'::text,
    google_event_id text,
    lembrete_minutos integer[] DEFAULT '{15,30}'::integer[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT data_valida CHECK ((data_fim > data_inicio))
);


--
-- Name: fluxos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fluxos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    descricao text,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    proximo_fluxo_id uuid,
    gera_proximo_automatico boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: google_calendar_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_calendar_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expires_at timestamp with time zone NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lembretes_disparados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lembretes_disparados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    evento_id uuid NOT NULL,
    user_id uuid NOT NULL,
    disparado_em timestamp with time zone DEFAULT now(),
    visualizado boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: links_uteis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.links_uteis (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    descricao text,
    url text NOT NULL,
    categoria text,
    criado_por uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mensagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensagens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    remetente_id uuid NOT NULL,
    destinatario_id uuid NOT NULL,
    assunto text NOT NULL,
    mensagem text NOT NULL,
    lida boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    em_resposta_a uuid,
    anexos jsonb DEFAULT '[]'::jsonb
);


--
-- Name: performance_alertas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_alertas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    responsavel_id uuid NOT NULL,
    tipo_alerta text NOT NULL,
    valor_atual numeric NOT NULL,
    meta_esperada numeric NOT NULL,
    periodo_analise text NOT NULL,
    enviado_para jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: performance_metas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_metas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    descricao text,
    meta_minima_atendimentos integer DEFAULT 5 NOT NULL,
    meta_taxa_conclusao integer DEFAULT 70 NOT NULL,
    meta_tempo_medio_horas integer DEFAULT 48 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    telefone text,
    cargo text,
    equipe_id uuid,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pendente'::text,
    lider_id uuid,
    administrativo_id uuid,
    whatsapp text,
    instagram text,
    facebook text,
    linkedin text,
    avatar_url text,
    cpf_cnpj text,
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'ativo'::text, 'inativo'::text])))
);


--
-- Name: resend_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resend_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    from_email text NOT NULL,
    from_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: status_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.status_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#3b82f6'::text NOT NULL,
    prazo_horas integer DEFAULT 24 NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fluxo_id uuid,
    tipo_etapa text DEFAULT 'em_andamento'::text,
    is_final boolean DEFAULT false,
    CONSTRAINT status_config_tipo_etapa_check CHECK ((tipo_etapa = ANY (ARRAY['backlog'::text, 'aguardando'::text, 'em_andamento'::text, 'revisao'::text, 'finalizado'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: andamentos andamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.andamentos
    ADD CONSTRAINT andamentos_pkey PRIMARY KEY (id);


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);


--
-- Name: app_config app_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_user_id_key UNIQUE (user_id);


--
-- Name: atendimento_anexos atendimento_anexos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimento_anexos
    ADD CONSTRAINT atendimento_anexos_pkey PRIMARY KEY (id);


--
-- Name: atendimentos_historico atendimentos_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos_historico
    ADD CONSTRAINT atendimentos_historico_pkey PRIMARY KEY (id);


--
-- Name: atendimentos atendimentos_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_numero_key UNIQUE (numero);


--
-- Name: atendimentos atendimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_pkey PRIMARY KEY (id);


--
-- Name: comunicados comunicados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunicados
    ADD CONSTRAINT comunicados_pkey PRIMARY KEY (id);


--
-- Name: contatos contatos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contatos
    ADD CONSTRAINT contatos_pkey PRIMARY KEY (id);


--
-- Name: corretoras corretoras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corretoras
    ADD CONSTRAINT corretoras_pkey PRIMARY KEY (id);


--
-- Name: documentos documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_pkey PRIMARY KEY (id);


--
-- Name: email_auto_config email_auto_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_auto_config
    ADD CONSTRAINT email_auto_config_pkey PRIMARY KEY (id);


--
-- Name: email_auto_config email_auto_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_auto_config
    ADD CONSTRAINT email_auto_config_user_id_key UNIQUE (user_id);


--
-- Name: email_config email_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_config
    ADD CONSTRAINT email_config_pkey PRIMARY KEY (id);


--
-- Name: email_config email_config_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_config
    ADD CONSTRAINT email_config_user_id_key UNIQUE (user_id);


--
-- Name: email_historico email_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_historico
    ADD CONSTRAINT email_historico_pkey PRIMARY KEY (id);


--
-- Name: email_queue email_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT email_queue_pkey PRIMARY KEY (id);


--
-- Name: email_rate_limits email_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_rate_limits
    ADD CONSTRAINT email_rate_limits_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: equipe_lideres equipe_lideres_equipe_id_lider_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipe_lideres
    ADD CONSTRAINT equipe_lideres_equipe_id_lider_id_key UNIQUE (equipe_id, lider_id);


--
-- Name: equipe_lideres equipe_lideres_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipe_lideres
    ADD CONSTRAINT equipe_lideres_pkey PRIMARY KEY (id);


--
-- Name: equipes equipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipes
    ADD CONSTRAINT equipes_pkey PRIMARY KEY (id);


--
-- Name: eventos eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_pkey PRIMARY KEY (id);


--
-- Name: fluxos fluxos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fluxos
    ADD CONSTRAINT fluxos_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_integrations google_calendar_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_integrations
    ADD CONSTRAINT google_calendar_integrations_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_integrations google_calendar_integrations_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_integrations
    ADD CONSTRAINT google_calendar_integrations_user_id_key UNIQUE (user_id);


--
-- Name: lembretes_disparados lembretes_disparados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lembretes_disparados
    ADD CONSTRAINT lembretes_disparados_pkey PRIMARY KEY (id);


--
-- Name: links_uteis links_uteis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links_uteis
    ADD CONSTRAINT links_uteis_pkey PRIMARY KEY (id);


--
-- Name: mensagens mensagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_pkey PRIMARY KEY (id);


--
-- Name: performance_alertas performance_alertas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_alertas
    ADD CONSTRAINT performance_alertas_pkey PRIMARY KEY (id);


--
-- Name: performance_metas performance_metas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_metas
    ADD CONSTRAINT performance_metas_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: resend_config resend_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resend_config
    ADD CONSTRAINT resend_config_pkey PRIMARY KEY (id);


--
-- Name: status_config status_config_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_config
    ADD CONSTRAINT status_config_nome_key UNIQUE (nome);


--
-- Name: status_config status_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_config
    ADD CONSTRAINT status_config_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_andamentos_atendimento_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_andamentos_atendimento_id ON public.andamentos USING btree (atendimento_id);


--
-- Name: idx_andamentos_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_andamentos_created_at ON public.andamentos USING btree (created_at DESC);


--
-- Name: idx_atendimentos_arquivado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atendimentos_arquivado ON public.atendimentos USING btree (arquivado) WHERE (arquivado = true);


--
-- Name: idx_atendimentos_numero; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atendimentos_numero ON public.atendimentos USING btree (numero);


--
-- Name: idx_email_queue_status_prioridade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_queue_status_prioridade ON public.email_queue USING btree (status, prioridade, agendado_para);


--
-- Name: idx_google_calendar_integrations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_calendar_integrations_user_id ON public.google_calendar_integrations USING btree (user_id);


--
-- Name: idx_mensagens_em_resposta_a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensagens_em_resposta_a ON public.mensagens USING btree (em_resposta_a);


--
-- Name: idx_mensagens_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensagens_thread ON public.mensagens USING btree (id, em_resposta_a);


--
-- Name: idx_profiles_lider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_lider_id ON public.profiles USING btree (lider_id);


--
-- Name: atendimentos handle_atendimentos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER handle_atendimentos_updated_at BEFORE UPDATE ON public.atendimentos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: contatos handle_contatos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER handle_contatos_updated_at BEFORE UPDATE ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: corretoras handle_corretoras_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER handle_corretoras_updated_at BEFORE UPDATE ON public.corretoras FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: equipes handle_equipes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER handle_equipes_updated_at BEFORE UPDATE ON public.equipes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: profiles handle_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER handle_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: comunicados handle_updated_at_comunicados; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER handle_updated_at_comunicados BEFORE UPDATE ON public.comunicados FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: corretoras set_corretora_created_by_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_corretora_created_by_trigger BEFORE INSERT ON public.corretoras FOR EACH ROW EXECUTE FUNCTION public.set_corretora_created_by();


--
-- Name: status_config trg_validate_fluxo_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_fluxo_status AFTER INSERT OR UPDATE ON public.status_config FOR EACH ROW EXECUTE FUNCTION public.validate_fluxo_status();


--
-- Name: atendimentos trigger_registrar_historico_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_registrar_historico_status AFTER UPDATE OF status ON public.atendimentos FOR EACH ROW EXECUTE FUNCTION public.registrar_historico_status();


--
-- Name: atendimentos trigger_send_email_on_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_send_email_on_status_change AFTER UPDATE ON public.atendimentos FOR EACH ROW EXECUTE FUNCTION public.send_email_on_status_change();


--
-- Name: atendimentos trigger_workflow_progression; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_workflow_progression AFTER UPDATE OF status ON public.atendimentos FOR EACH ROW EXECUTE FUNCTION public.handle_workflow_progression();


--
-- Name: andamentos update_andamentos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_andamentos_updated_at BEFORE UPDATE ON public.andamentos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: app_config update_app_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_app_config_updated_at BEFORE UPDATE ON public.app_config FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: atendimentos update_atendimento_status_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_atendimento_status_timestamp BEFORE UPDATE ON public.atendimentos FOR EACH ROW EXECUTE FUNCTION public.update_atendimento_status_changed_at();


--
-- Name: email_config update_email_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_config_updated_at BEFORE UPDATE ON public.email_config FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: email_templates update_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: eventos update_eventos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_eventos_updated_at BEFORE UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: google_calendar_integrations update_google_calendar_integrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_google_calendar_integrations_updated_at BEFORE UPDATE ON public.google_calendar_integrations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: mensagens update_mensagens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_mensagens_updated_at BEFORE UPDATE ON public.mensagens FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: performance_metas update_performance_metas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_performance_metas_updated_at BEFORE UPDATE ON public.performance_metas FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: resend_config update_resend_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_resend_config_updated_at BEFORE UPDATE ON public.resend_config FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: status_config update_status_config_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_status_config_timestamp BEFORE UPDATE ON public.status_config FOR EACH ROW EXECUTE FUNCTION public.update_status_config_updated_at();


--
-- Name: andamentos andamentos_atendimento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.andamentos
    ADD CONSTRAINT andamentos_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES public.atendimentos(id) ON DELETE CASCADE;


--
-- Name: andamentos andamentos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.andamentos
    ADD CONSTRAINT andamentos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: app_config app_config_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: atendimento_anexos atendimento_anexos_atendimento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimento_anexos
    ADD CONSTRAINT atendimento_anexos_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES public.atendimentos(id) ON DELETE CASCADE;


--
-- Name: atendimentos atendimentos_contato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE SET NULL;


--
-- Name: atendimentos atendimentos_corretora_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_corretora_id_fkey FOREIGN KEY (corretora_id) REFERENCES public.corretoras(id) ON DELETE CASCADE;


--
-- Name: atendimentos atendimentos_fluxo_concluido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_fluxo_concluido_id_fkey FOREIGN KEY (fluxo_concluido_id) REFERENCES public.fluxos(id);


--
-- Name: atendimentos atendimentos_fluxo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_fluxo_id_fkey FOREIGN KEY (fluxo_id) REFERENCES public.fluxos(id) ON DELETE SET NULL;


--
-- Name: atendimentos_historico atendimentos_historico_atendimento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos_historico
    ADD CONSTRAINT atendimentos_historico_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES public.atendimentos(id) ON DELETE CASCADE;


--
-- Name: atendimentos atendimentos_responsavel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES public.profiles(id);


--
-- Name: atendimentos atendimentos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: comunicados comunicados_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunicados
    ADD CONSTRAINT comunicados_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: contatos contatos_corretora_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contatos
    ADD CONSTRAINT contatos_corretora_id_fkey FOREIGN KEY (corretora_id) REFERENCES public.corretoras(id) ON DELETE CASCADE;


--
-- Name: contatos contatos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contatos
    ADD CONSTRAINT contatos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: corretoras corretoras_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corretoras
    ADD CONSTRAINT corretoras_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: documentos documentos_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);


--
-- Name: email_historico email_historico_atendimento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_historico
    ADD CONSTRAINT email_historico_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES public.atendimentos(id) ON DELETE CASCADE;


--
-- Name: equipe_lideres equipe_lideres_equipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipe_lideres
    ADD CONSTRAINT equipe_lideres_equipe_id_fkey FOREIGN KEY (equipe_id) REFERENCES public.equipes(id) ON DELETE CASCADE;


--
-- Name: equipe_lideres equipe_lideres_lider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipe_lideres
    ADD CONSTRAINT equipe_lideres_lider_id_fkey FOREIGN KEY (lider_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: equipes equipes_lider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipes
    ADD CONSTRAINT equipes_lider_id_fkey FOREIGN KEY (lider_id) REFERENCES public.profiles(id);


--
-- Name: eventos eventos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: atendimento_anexos fk_atendimento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimento_anexos
    ADD CONSTRAINT fk_atendimento FOREIGN KEY (atendimento_id) REFERENCES public.atendimentos(id) ON DELETE CASCADE;


--
-- Name: fluxos fluxos_proximo_fluxo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fluxos
    ADD CONSTRAINT fluxos_proximo_fluxo_id_fkey FOREIGN KEY (proximo_fluxo_id) REFERENCES public.fluxos(id) ON DELETE SET NULL;


--
-- Name: lembretes_disparados lembretes_disparados_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lembretes_disparados
    ADD CONSTRAINT lembretes_disparados_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.eventos(id) ON DELETE CASCADE;


--
-- Name: lembretes_disparados lembretes_disparados_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lembretes_disparados
    ADD CONSTRAINT lembretes_disparados_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: links_uteis links_uteis_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links_uteis
    ADD CONSTRAINT links_uteis_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);


--
-- Name: mensagens mensagens_destinatario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_destinatario_id_fkey FOREIGN KEY (destinatario_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mensagens mensagens_em_resposta_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_em_resposta_a_fkey FOREIGN KEY (em_resposta_a) REFERENCES public.mensagens(id) ON DELETE CASCADE;


--
-- Name: mensagens mensagens_remetente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_remetente_id_fkey FOREIGN KEY (remetente_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_administrativo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_administrativo_id_fkey FOREIGN KEY (administrativo_id) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_lider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_lider_id_fkey FOREIGN KEY (lider_id) REFERENCES public.profiles(id);


--
-- Name: status_config status_config_fluxo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_config
    ADD CONSTRAINT status_config_fluxo_id_fkey FOREIGN KEY (fluxo_id) REFERENCES public.fluxos(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles Active users can view all active profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users can view all active profiles" ON public.profiles FOR SELECT USING (((status = 'ativo'::text) AND public.can_view_profile(id, auth.uid())));


--
-- Name: andamentos Administrativo can delete team andamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Administrativo can delete team andamentos" ON public.andamentos FOR DELETE USING ((public.has_role(auth.uid(), 'administrativo'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.atendimentos
  WHERE ((atendimentos.id = andamentos.atendimento_id) AND ((atendimentos.user_id = auth.uid()) OR (atendimentos.user_id = ( SELECT profiles.lider_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))) OR (atendimentos.user_id IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.equipe_id IN ( SELECT e.id
                   FROM public.equipes e
                  WHERE (e.lider_id = ( SELECT profiles.lider_id
                           FROM public.profiles
                          WHERE (profiles.id = auth.uid())))))))))))));


--
-- Name: andamentos Administrativo can update team andamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Administrativo can update team andamentos" ON public.andamentos FOR UPDATE USING ((public.has_role(auth.uid(), 'administrativo'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.atendimentos
  WHERE ((atendimentos.id = andamentos.atendimento_id) AND ((atendimentos.user_id = auth.uid()) OR (atendimentos.user_id = ( SELECT profiles.lider_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))) OR (atendimentos.user_id IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.equipe_id IN ( SELECT e.id
                   FROM public.equipes e
                  WHERE (e.lider_id = ( SELECT profiles.lider_id
                           FROM public.profiles
                          WHERE (profiles.id = auth.uid())))))))))))));


--
-- Name: atendimentos Administrativo can update team atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Administrativo can update team atendimentos" ON public.atendimentos FOR UPDATE USING ((public.has_role(auth.uid(), 'administrativo'::public.app_role) AND ((user_id = auth.uid()) OR (user_id = ( SELECT profiles.lider_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (user_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.equipe_id IN ( SELECT e.id
           FROM public.equipes e
          WHERE (e.lider_id = ( SELECT profiles.lider_id
                   FROM public.profiles
                  WHERE (profiles.id = auth.uid()))))))))));


--
-- Name: profiles Administrativo can update team profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Administrativo can update team profiles" ON public.profiles FOR UPDATE USING (public.administrativo_can_view_profile(id, auth.uid()));


--
-- Name: atendimentos Administrativo can view team atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Administrativo can view team atendimentos" ON public.atendimentos FOR SELECT USING ((public.has_role(auth.uid(), 'administrativo'::public.app_role) AND ((user_id = auth.uid()) OR (user_id = ( SELECT profiles.lider_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (user_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.equipe_id IN ( SELECT e.id
           FROM public.equipes e
          WHERE (e.lider_id = ( SELECT profiles.lider_id
                   FROM public.profiles
                  WHERE (profiles.id = auth.uid()))))))))));


--
-- Name: contatos Administrativo can view team contatos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Administrativo can view team contatos" ON public.contatos FOR SELECT USING ((public.has_role(auth.uid(), 'administrativo'::public.app_role) AND ((created_by = auth.uid()) OR (created_by = ( SELECT profiles.lider_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (created_by IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.equipe_id IN ( SELECT e.id
           FROM public.equipes e
          WHERE (e.lider_id = ( SELECT profiles.lider_id
                   FROM public.profiles
                  WHERE (profiles.id = auth.uid()))))))))));


--
-- Name: corretoras Administrativo can view team corretoras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Administrativo can view team corretoras" ON public.corretoras FOR SELECT USING ((public.has_role(auth.uid(), 'administrativo'::public.app_role) AND ((created_by = auth.uid()) OR (created_by = ( SELECT profiles.lider_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (created_by IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.equipe_id IN ( SELECT e.id
           FROM public.equipes e
          WHERE (e.lider_id = ( SELECT profiles.lider_id
                   FROM public.profiles
                  WHERE (profiles.id = auth.uid()))))))))));


--
-- Name: eventos Administrativo can view team eventos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Administrativo can view team eventos" ON public.eventos FOR SELECT USING ((public.has_role(auth.uid(), 'administrativo'::public.app_role) AND ((user_id = auth.uid()) OR (user_id = ( SELECT profiles.lider_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (user_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.equipe_id IN ( SELECT e.id
           FROM public.equipes e
          WHERE (e.lider_id = ( SELECT profiles.lider_id
                   FROM public.profiles
                  WHERE (profiles.id = auth.uid()))))))))));


--
-- Name: profiles Administrativo can view team profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Administrativo can view team profiles" ON public.profiles FOR SELECT USING (public.administrativo_can_view_profile(id, auth.uid()));


--
-- Name: contatos Admins and owners can delete contatos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and owners can delete contatos" ON public.contatos FOR DELETE USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'superintendente'::public.app_role])))))));


--
-- Name: corretoras Admins and owners can delete corretoras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and owners can delete corretoras" ON public.corretoras FOR DELETE USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role))))));


--
-- Name: contatos Admins can insert contatos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert contatos" ON public.contatos FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'lider'::public.app_role, 'comercial'::public.app_role, 'superintendente'::public.app_role]))))));


--
-- Name: email_queue Admins can manage email queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage email queue" ON public.email_queue USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'superintendente'::public.app_role]))))));


--
-- Name: email_rate_limits Admins can view rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view rate limits" ON public.email_rate_limits FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::public.app_role, 'superintendente'::public.app_role]))))));


--
-- Name: performance_metas All authenticated users can view metas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "All authenticated users can view metas" ON public.performance_metas FOR SELECT USING (((auth.uid() IS NOT NULL) AND (ativo = true)));


--
-- Name: fluxos Anyone can view active fluxos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active fluxos" ON public.fluxos FOR SELECT USING ((ativo = true));


--
-- Name: status_config Anyone can view active status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active status" ON public.status_config FOR SELECT USING ((ativo = true));


--
-- Name: equipe_lideres Authenticated users can delete equipe_lideres; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete equipe_lideres" ON public.equipe_lideres FOR DELETE USING ((auth.uid() IS NOT NULL));


--
-- Name: equipes Authenticated users can delete equipes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete equipes" ON public.equipes FOR DELETE USING ((auth.uid() IS NOT NULL));


--
-- Name: corretoras Authenticated users can insert corretoras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert corretoras" ON public.corretoras FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: equipe_lideres Authenticated users can insert equipe_lideres; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert equipe_lideres" ON public.equipe_lideres FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: equipes Authenticated users can insert equipes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert equipes" ON public.equipes FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: equipe_lideres Authenticated users can update equipe_lideres; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update equipe_lideres" ON public.equipe_lideres FOR UPDATE USING ((auth.uid() IS NOT NULL));


--
-- Name: equipes Authenticated users can update equipes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update equipes" ON public.equipes FOR UPDATE USING ((auth.uid() IS NOT NULL));


--
-- Name: comunicados Authenticated users can view active comunicados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view active comunicados" ON public.comunicados FOR SELECT TO authenticated USING ((ativo = true));


--
-- Name: documentos Authenticated users can view documentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view documentos" ON public.documentos FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: equipe_lideres Authenticated users can view equipe_lideres; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view equipe_lideres" ON public.equipe_lideres FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: equipes Authenticated users can view equipes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view equipes" ON public.equipes FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: links_uteis Authenticated users can view links_uteis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view links_uteis" ON public.links_uteis FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: atendimentos Comercial can update own atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Comercial can update own atendimentos" ON public.atendimentos FOR UPDATE USING ((public.has_role(auth.uid(), 'comercial'::public.app_role) AND (user_id = auth.uid())));


--
-- Name: atendimentos Comercial can view own atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Comercial can view own atendimentos" ON public.atendimentos FOR SELECT USING ((public.has_role(auth.uid(), 'comercial'::public.app_role) AND (user_id = auth.uid())));


--
-- Name: atendimentos Lider can update team atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lider can update team atendimentos" ON public.atendimentos FOR UPDATE USING ((public.has_role(auth.uid(), 'lider'::public.app_role) AND ((user_id = auth.uid()) OR (user_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.equipe_id IN ( SELECT e.id
           FROM public.equipes e
          WHERE (e.lider_id = auth.uid()))))))));


--
-- Name: atendimentos Lider can view team atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lider can view team atendimentos" ON public.atendimentos FOR SELECT USING ((public.has_role(auth.uid(), 'lider'::public.app_role) AND ((user_id = auth.uid()) OR (user_id IN ( SELECT p.id
   FROM public.profiles p
  WHERE (p.equipe_id IN ( SELECT e.id
           FROM public.equipes e
          WHERE (e.lider_id = auth.uid()))))))));


--
-- Name: contatos Lideres can view team contatos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lideres can view team contatos" ON public.contatos FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'lider'::public.app_role)))) AND (created_by IN ( SELECT p.id
   FROM (public.profiles p
     JOIN public.equipes e ON ((p.equipe_id = e.id)))
  WHERE (e.lider_id = auth.uid())))));


--
-- Name: corretoras Lideres can view team corretoras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lideres can view team corretoras" ON public.corretoras FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'lider'::public.app_role)))) AND (created_by IN ( SELECT p.id
   FROM (public.profiles p
     JOIN public.equipes e ON ((p.equipe_id = e.id)))
  WHERE (e.lider_id = auth.uid())))));


--
-- Name: user_roles Privileged can manage all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Privileged can manage all roles" ON public.user_roles USING ((public.has_role(auth.uid(), 'superintendente'::public.app_role) OR public.has_role(auth.uid(), 'administrativo'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: profiles Privileged can view pending profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Privileged can view pending profiles" ON public.profiles FOR SELECT USING (((status = 'pendente'::text) AND (public.has_role(auth.uid(), 'superintendente'::public.app_role) OR public.has_role(auth.uid(), 'administrativo'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: fluxos Superintendente and admin can manage fluxos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente and admin can manage fluxos" ON public.fluxos USING ((public.has_role(auth.uid(), 'superintendente'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: status_config Superintendente and admin can manage status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente and admin can manage status" ON public.status_config USING ((public.has_role(auth.uid(), 'superintendente'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: atendimentos_historico Superintendente and admin can view all history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente and admin can view all history" ON public.atendimentos_historico FOR SELECT USING ((public.has_role(auth.uid(), 'superintendente'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: andamentos Superintendente can delete all andamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can delete all andamentos" ON public.andamentos FOR DELETE USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: atendimentos Superintendente can delete all atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can delete all atendimentos" ON public.atendimentos FOR DELETE USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: comunicados Superintendente can manage comunicados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can manage comunicados" ON public.comunicados USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: documentos Superintendente can manage documentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can manage documentos" ON public.documentos USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: links_uteis Superintendente can manage links_uteis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can manage links_uteis" ON public.links_uteis USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: performance_metas Superintendente can manage metas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can manage metas" ON public.performance_metas USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: andamentos Superintendente can update all andamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can update all andamentos" ON public.andamentos FOR UPDATE USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: atendimentos Superintendente can update all atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can update all atendimentos" ON public.atendimentos FOR UPDATE USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: profiles Superintendente can update profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can update profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: performance_alertas Superintendente can view all alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can view all alerts" ON public.performance_alertas FOR SELECT USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: atendimentos Superintendente can view all atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can view all atendimentos" ON public.atendimentos FOR SELECT USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: contatos Superintendente can view all contatos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can view all contatos" ON public.contatos FOR SELECT USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: corretoras Superintendente can view all corretoras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can view all corretoras" ON public.corretoras FOR SELECT USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: eventos Superintendente can view all eventos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superintendente can view all eventos" ON public.eventos FOR SELECT USING (public.has_role(auth.uid(), 'superintendente'::public.app_role));


--
-- Name: performance_alertas System can insert alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert alerts" ON public.performance_alertas FOR INSERT WITH CHECK (true);


--
-- Name: resend_config Users can create their own resend config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own resend config" ON public.resend_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: atendimento_anexos Users can delete own anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own anexos" ON public.atendimento_anexos FOR DELETE USING (((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: atendimentos Users can delete own atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own atendimentos" ON public.atendimentos FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: email_config Users can delete own email config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own email config" ON public.email_config FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: eventos Users can delete own eventos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own eventos" ON public.eventos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: google_calendar_integrations Users can delete own integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own integrations" ON public.google_calendar_integrations FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: email_templates Users can delete own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own templates" ON public.email_templates FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: andamentos Users can insert andamentos in accessible atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert andamentos in accessible atendimentos" ON public.andamentos FOR INSERT WITH CHECK (((auth.uid() = created_by) AND (EXISTS ( SELECT 1
   FROM public.atendimentos
  WHERE ((atendimentos.id = andamentos.atendimento_id) AND ((atendimentos.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'lider'::public.app_role) AND (atendimentos.user_id IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.equipe_id IN ( SELECT e.id
                   FROM public.equipes e
                  WHERE (e.lider_id = auth.uid()))))))))))));


--
-- Name: atendimento_anexos Users can insert anexos in accessible atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert anexos in accessible atendimentos" ON public.atendimento_anexos FOR INSERT WITH CHECK (((auth.uid() = created_by) AND (EXISTS ( SELECT 1
   FROM public.atendimentos
  WHERE ((atendimentos.id = atendimento_anexos.atendimento_id) AND ((atendimentos.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'lider'::public.app_role) AND (atendimentos.user_id IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.equipe_id IN ( SELECT e.id
                   FROM public.equipes e
                  WHERE (e.lider_id = auth.uid()))))))))))));


--
-- Name: email_historico Users can insert emails for accessible atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert emails for accessible atendimentos" ON public.email_historico FOR INSERT WITH CHECK (((auth.uid() = enviado_por) AND (EXISTS ( SELECT 1
   FROM public.atendimentos
  WHERE ((atendimentos.id = email_historico.atendimento_id) AND ((atendimentos.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'lider'::public.app_role) AND (atendimentos.user_id IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.equipe_id IN ( SELECT e.id
                   FROM public.equipes e
                  WHERE (e.lider_id = auth.uid()))))))))))));


--
-- Name: atendimentos_historico Users can insert history for accessible atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert history for accessible atendimentos" ON public.atendimentos_historico FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.atendimentos
  WHERE ((atendimentos.id = atendimentos_historico.atendimento_id) AND ((atendimentos.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superintendente'::public.app_role) OR (public.has_role(auth.uid(), 'lider'::public.app_role) AND (atendimentos.user_id IN ( SELECT p.id
           FROM (public.profiles p
             JOIN public.equipes e ON ((p.equipe_id = e.id)))
          WHERE (e.lider_id = auth.uid()))))))))));


--
-- Name: mensagens Users can insert messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert messages" ON public.mensagens FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (auth.uid() = remetente_id)));


--
-- Name: atendimentos Users can insert own atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own atendimentos" ON public.atendimentos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: app_config Users can insert own config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own config" ON public.app_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_auto_config Users can insert own email auto config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own email auto config" ON public.email_auto_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_config Users can insert own email config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own email config" ON public.email_config FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: eventos Users can insert own eventos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own eventos" ON public.eventos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: google_calendar_integrations Users can insert own integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own integrations" ON public.google_calendar_integrations FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: lembretes_disparados Users can insert own lembretes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own lembretes" ON public.lembretes_disparados FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: email_templates Users can insert own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own templates" ON public.email_templates FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: app_config Users can update own config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own config" ON public.app_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: contatos Users can update own contatos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own contatos" ON public.contatos FOR UPDATE USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role))))));


--
-- Name: corretoras Users can update own corretoras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own corretoras" ON public.corretoras FOR UPDATE USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role))))));


--
-- Name: email_auto_config Users can update own email auto config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own email auto config" ON public.email_auto_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: email_config Users can update own email config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own email config" ON public.email_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: eventos Users can update own eventos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own eventos" ON public.eventos FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: google_calendar_integrations Users can update own integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own integrations" ON public.google_calendar_integrations FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: lembretes_disparados Users can update own lembretes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own lembretes" ON public.lembretes_disparados FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: email_templates Users can update own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own templates" ON public.email_templates FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: mensagens Users can update received messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update received messages" ON public.mensagens FOR UPDATE USING ((auth.uid() = destinatario_id));


--
-- Name: resend_config Users can update their own resend config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own resend config" ON public.resend_config FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: andamentos Users can view andamentos of accessible atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view andamentos of accessible atendimentos" ON public.andamentos FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.atendimentos
  WHERE ((atendimentos.id = andamentos.atendimento_id) AND ((atendimentos.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'lider'::public.app_role) AND (atendimentos.user_id IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.equipe_id IN ( SELECT e.id
                   FROM public.equipes e
                  WHERE (e.lider_id = auth.uid())))))))))));


--
-- Name: atendimento_anexos Users can view anexos of accessible atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view anexos of accessible atendimentos" ON public.atendimento_anexos FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.atendimentos
  WHERE ((atendimentos.id = atendimento_anexos.atendimento_id) AND ((atendimentos.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'lider'::public.app_role) AND (atendimentos.user_id IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.equipe_id IN ( SELECT e.id
                   FROM public.equipes e
                  WHERE (e.lider_id = auth.uid())))))))))));


--
-- Name: email_historico Users can view emails of accessible atendimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view emails of accessible atendimentos" ON public.email_historico FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.atendimentos
  WHERE ((atendimentos.id = email_historico.atendimento_id) AND ((atendimentos.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.has_role(auth.uid(), 'lider'::public.app_role) AND (atendimentos.user_id IN ( SELECT p.id
           FROM public.profiles p
          WHERE (p.equipe_id IN ( SELECT e.id
                   FROM public.equipes e
                  WHERE (e.lider_id = auth.uid())))))))))));


--
-- Name: performance_alertas Users can view own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own alerts" ON public.performance_alertas FOR SELECT USING ((auth.uid() = responsavel_id));


--
-- Name: app_config Users can view own config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own config" ON public.app_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: contatos Users can view own contatos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own contatos" ON public.contatos FOR SELECT USING ((created_by = auth.uid()));


--
-- Name: corretoras Users can view own corretoras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own corretoras" ON public.corretoras FOR SELECT USING ((created_by = auth.uid()));


--
-- Name: email_auto_config Users can view own email auto config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own email auto config" ON public.email_auto_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: email_config Users can view own email config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own email config" ON public.email_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: eventos Users can view own eventos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own eventos" ON public.eventos FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: google_calendar_integrations Users can view own integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own integrations" ON public.google_calendar_integrations FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: lembretes_disparados Users can view own lembretes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own lembretes" ON public.lembretes_disparados FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: mensagens Users can view own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own messages" ON public.mensagens FOR SELECT USING (((auth.uid() = remetente_id) OR (auth.uid() = destinatario_id)));


--
-- Name: email_templates Users can view own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own templates" ON public.email_templates FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: resend_config Users can view their own resend config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own resend config" ON public.resend_config FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_roles Users can view their own role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own role" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: andamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.andamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: app_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

--
-- Name: atendimento_anexos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.atendimento_anexos ENABLE ROW LEVEL SECURITY;

--
-- Name: atendimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: atendimentos_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.atendimentos_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: comunicados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comunicados ENABLE ROW LEVEL SECURITY;

--
-- Name: contatos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

--
-- Name: corretoras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.corretoras ENABLE ROW LEVEL SECURITY;

--
-- Name: documentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

--
-- Name: email_auto_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_auto_config ENABLE ROW LEVEL SECURITY;

--
-- Name: email_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_config ENABLE ROW LEVEL SECURITY;

--
-- Name: email_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: email_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: email_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: equipe_lideres; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipe_lideres ENABLE ROW LEVEL SECURITY;

--
-- Name: equipes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipes ENABLE ROW LEVEL SECURITY;

--
-- Name: eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: fluxos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fluxos ENABLE ROW LEVEL SECURITY;

--
-- Name: google_calendar_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_calendar_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: lembretes_disparados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lembretes_disparados ENABLE ROW LEVEL SECURITY;

--
-- Name: links_uteis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.links_uteis ENABLE ROW LEVEL SECURITY;

--
-- Name: mensagens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

--
-- Name: performance_alertas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.performance_alertas ENABLE ROW LEVEL SECURITY;

--
-- Name: performance_metas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.performance_metas ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: resend_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resend_config ENABLE ROW LEVEL SECURITY;

--
-- Name: status_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.status_config ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


