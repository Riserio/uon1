-- =============================================================================
-- Painel: Radar do mercado (notícias automáticas sobre proteção patrimonial
-- mutualista / proteção veicular). Idempotente.
--
-- Coleta 100% no banco (pg_net + pg_cron), sem edge function:
--   mercado_radar_buscar()     dispara as leituras dos feeds (RSS)
--   mercado_radar_processar()  lê as respostas, filtra e grava as notícias
--
-- Só entra notícia de fonte da lista (mercado_fontes), de host permitido, com
-- palavra-chave no título (ou no resumo, nos feeds diretos) e recente.
-- Guardamos título, fonte, data e link: o texto fica no site de origem.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mercado_fontes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  categoria text NOT NULL CHECK (categoria IN ('oficial', 'setor')),
  url text NOT NULL,
  -- hosts aceitos (igual ou subdomínio). NULL = qualquer item do feed.
  hosts text[],
  -- true: a palavra-chave pode estar no resumo (feeds diretos); false: só no título
  usa_resumo boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  ultima_coleta_em timestamptz,
  ultimo_status text,
  ultimo_erro text,
  ultimos_itens int,
  ultimos_novos int
);

CREATE TABLE IF NOT EXISTS public.mercado_noticias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte_id uuid REFERENCES public.mercado_fontes(id) ON DELETE SET NULL,
  categoria text NOT NULL CHECK (categoria IN ('oficial', 'setor')),
  titulo text NOT NULL,
  resumo text,
  link text NOT NULL,
  origem text,
  origem_host text,
  publicado_em timestamptz NOT NULL,
  coletado_em timestamptz NOT NULL DEFAULT now(),
  oculto boolean NOT NULL DEFAULT false,
  -- título normalizado: a mesma notícia vinda de dois feeds entra uma vez só
  chave text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_mercado_noticias_data ON public.mercado_noticias (publicado_em DESC) WHERE NOT oculto;

CREATE TABLE IF NOT EXISTS public.mercado_radar_coletas (
  id bigserial PRIMARY KEY,
  fonte_id uuid NOT NULL REFERENCES public.mercado_fontes(id) ON DELETE CASCADE,
  request_id bigint NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz
);

CREATE TABLE IF NOT EXISTS public.mercado_radar_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- já normalizadas (minúsculas, sem acento)
  palavras text[] NOT NULL,
  dias int NOT NULL DEFAULT 365
);

INSERT INTO public.mercado_radar_config (id, palavras) VALUES (1, ARRAY[
  'mutualista', 'mutualismo', 'protecao veicular', 'protecao patrimonial',
  'associacao de protecao', 'associacoes de protecao',
  'lei complementar 213', 'lc 213', 'resolucao cnsp 491',
  'cooperativa de seguro', 'cooperativas de seguro'])
ON CONFLICT (id) DO NOTHING;

-- Fontes. As duas buscas do Google Notícias são restritas por site; os feeds
-- diretos complementam. A SUSEP não publica RSS no portal gov.br (verificado),
-- por isso ela entra pela busca restrita a gov.br.
INSERT INTO public.mercado_fontes (nome, categoria, url, hosts, usa_resumo) VALUES
  ('Órgãos oficiais', 'oficial',
   'https://news.google.com/rss/search?q=(%22prote%C3%A7%C3%A3o+patrimonial+mutualista%22+OR+%22prote%C3%A7%C3%A3o+veicular%22+OR+%22associa%C3%A7%C3%B5es+mutualistas%22)+(site%3Agov.br+OR+site%3Aleg.br+OR+site%3Ajus.br)&hl=pt-BR&gl=BR&ceid=BR:pt-419',
   ARRAY['www.gov.br', 'susep.gov.br', 'planalto.gov.br', 'fazenda.gov.br', 'camara.leg.br', 'senado.leg.br', 'stj.jus.br', 'stf.jus.br'], false),
  ('SUSEP', 'oficial',
   'https://news.google.com/rss/search?q=susep+(mutualista+OR+%22prote%C3%A7%C3%A3o+veicular%22+OR+%22cooperativas+de+seguros%22)+site%3Agov.br&hl=pt-BR&gl=BR&ceid=BR:pt-419',
   ARRAY['www.gov.br', 'susep.gov.br'], false),
  ('Entidades e imprensa do setor', 'setor',
   'https://news.google.com/rss/search?q=(%22prote%C3%A7%C3%A3o+patrimonial+mutualista%22+OR+%22prote%C3%A7%C3%A3o+veicular%22)+(site%3Acqcs.com.br+OR+site%3Acnseg.org.br+OR+site%3Arevistaapolice.com.br+OR+site%3Asonhoseguro.com.br)&hl=pt-BR&gl=BR&ceid=BR:pt-419',
   ARRAY['cqcs.com.br', 'cnseg.org.br', 'revistaapolice.com.br', 'sonhoseguro.com.br'], false),
  ('CQCS', 'setor', 'https://cqcs.com.br/feed/', NULL, true),
  ('Revista Apólice', 'setor', 'https://revistaapolice.com.br/feed/', NULL, true),
  ('Sonho Seguro', 'setor', 'https://www.sonhoseguro.com.br/feed/', NULL, true)
ON CONFLICT (nome) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.painel_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role::text IN ('admin', 'superintendente'))
$$;
REVOKE ALL ON FUNCTION public.painel_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_admin(uuid) TO authenticated, service_role;

REVOKE ALL ON public.mercado_fontes, public.mercado_noticias, public.mercado_radar_coletas, public.mercado_radar_config FROM anon;
GRANT SELECT, UPDATE ON public.mercado_noticias TO authenticated;
GRANT SELECT, UPDATE ON public.mercado_fontes TO authenticated;
GRANT SELECT, UPDATE ON public.mercado_radar_config TO authenticated;
REVOKE ALL ON public.mercado_radar_coletas FROM authenticated;
ALTER TABLE public.mercado_fontes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercado_noticias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercado_radar_coletas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercado_radar_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Radar - ler noticias" ON public.mercado_noticias;
CREATE POLICY "Radar - ler noticias" ON public.mercado_noticias
  FOR SELECT TO authenticated USING (NOT oculto OR public.painel_admin(auth.uid()));
DROP POLICY IF EXISTS "Radar - admin oculta" ON public.mercado_noticias;
CREATE POLICY "Radar - admin oculta" ON public.mercado_noticias
  FOR UPDATE TO authenticated USING (public.painel_admin(auth.uid())) WITH CHECK (public.painel_admin(auth.uid()));
DROP POLICY IF EXISTS "Radar - admin fontes" ON public.mercado_fontes;
CREATE POLICY "Radar - admin fontes" ON public.mercado_fontes
  FOR ALL TO authenticated USING (public.painel_admin(auth.uid())) WITH CHECK (public.painel_admin(auth.uid()));
DROP POLICY IF EXISTS "Radar - admin config" ON public.mercado_radar_config;
CREATE POLICY "Radar - admin config" ON public.mercado_radar_config
  FOR ALL TO authenticated USING (public.painel_admin(auth.uid())) WITH CHECK (public.painel_admin(auth.uid()));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mercado_noticias;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Texto
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mercado_norm(_t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(
    translate(lower(coalesce(_t, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- Texto de um nó XML: tira CDATA, tags e entidades HTML.
CREATE OR REPLACE FUNCTION public.mercado_txt(_t text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v text := coalesce(_t, '');
  m text[];
  i int;
BEGIN
  v := replace(replace(v, '<![CDATA[', ''), ']]>', '');
  -- o conteúdo pode vir escapado duas vezes (&amp;lt;p&amp;gt;)
  FOR i IN 1..2 LOOP
    v := replace(replace(replace(replace(replace(replace(v,
      '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&apos;', ''''), '&nbsp;', ' '), '&amp;', '&');
  END LOOP;
  v := regexp_replace(v, '<[^>]*>', ' ', 'g');
  FOR m IN SELECT DISTINCT regexp_matches(v, '&#(\d{2,6});', 'g') LOOP
    BEGIN
      v := replace(v, '&#' || m[1] || ';', chr(m[1]::int));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  FOR m IN SELECT DISTINCT regexp_matches(v, '&#x([0-9a-fA-F]{2,5});', 'g') LOOP
    BEGIN
      v := replace(v, '&#x' || m[1] || ';', chr(('x' || lpad(m[1], 8, '0'))::bit(32)::int));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN nullif(trim(regexp_replace(v, '\s+', ' ', 'g')), '');
END
$$;

-- ---------------------------------------------------------------------------
-- Coleta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mercado_radar_buscar()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  f record;
  n int := 0;
BEGIN
  FOR f IN SELECT id, url FROM mercado_fontes WHERE ativo LOOP
    INSERT INTO mercado_radar_coletas (fonte_id, request_id)
    VALUES (f.id, net.http_get(
      url := f.url,
      headers := '{"User-Agent": "Mozilla/5.0 (compatible; Uon1Radar/1.0)", "Accept": "application/rss+xml, application/xml, text/xml, */*"}'::jsonb,
      timeout_milliseconds := 20000));
    n := n + 1;
  END LOOP;
  RETURN n;
END
$f$;

CREATE OR REPLACE FUNCTION public.mercado_radar_processar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  c record;
  r record;
  v_cfg record;
  doc xml;
  it xml;
  v_tit text; v_link text; v_desc text; v_src text; v_srcurl text; v_host text; v_dt text;
  v_data timestamptz;
  v_alvo text;
  n_itens int; n_novos int; n_lin int;
  total int := 0;
  fontes int := 0;
BEGIN
  SELECT * INTO v_cfg FROM mercado_radar_config WHERE id = 1;

  FOR c IN
    SELECT co.id, co.fonte_id, co.request_id, co.criado_em, f.categoria, f.hosts, f.usa_resumo, f.nome AS fonte_nome
      FROM mercado_radar_coletas co JOIN mercado_fontes f ON f.id = co.fonte_id
     WHERE co.processado_em IS NULL
     ORDER BY co.id
  LOOP
    SELECT status_code, content, error_msg, timed_out INTO r FROM net._http_response WHERE id = c.request_id;
    IF NOT FOUND THEN
      -- resposta ainda não chegou: espera até 10 minutos
      IF c.criado_em < now() - interval '10 minutes' THEN
        UPDATE mercado_fontes SET ultima_coleta_em = now(), ultimo_status = 'erro', ultimo_erro = 'sem resposta do site'
         WHERE id = c.fonte_id;
        UPDATE mercado_radar_coletas SET processado_em = now() WHERE id = c.id;
      END IF;
      CONTINUE;
    END IF;

    n_itens := 0; n_novos := 0;
    BEGIN
      IF r.status_code IS DISTINCT FROM 200 THEN
        RAISE EXCEPTION '%', coalesce('HTTP ' || r.status_code, r.error_msg, 'sem resposta do site');
      END IF;
      doc := xmlparse(document r.content);
      FOR it IN SELECT unnest(xpath('/rss/channel/item', doc)) LOOP
        n_itens := n_itens + 1;
        v_tit := mercado_txt((xpath('/item/title/text()', it))[1]::text);
        v_link := mercado_txt((xpath('/item/link/text()', it))[1]::text);
        v_src := mercado_txt((xpath('/item/source/text()', it))[1]::text);
        v_srcurl := (xpath('/item/source/@url', it))[1]::text;
        v_dt := mercado_txt((xpath('/item/pubDate/text()', it))[1]::text);
        v_desc := CASE WHEN c.usa_resumo THEN mercado_txt((xpath('/item/description/text()', it))[1]::text) END;
        CONTINUE WHEN v_tit IS NULL OR v_link IS NULL OR v_link !~* '^https?://';

        BEGIN
          v_data := v_dt::timestamptz;
        EXCEPTION WHEN OTHERS THEN
          v_data := NULL;
        END;
        CONTINUE WHEN v_data IS NULL OR v_data < now() - make_interval(days => v_cfg.dias) OR v_data > now() + interval '1 day';

        -- Google Notícias: "Título - Fonte"
        IF v_src IS NOT NULL AND right(v_tit, length(v_src) + 3) = ' - ' || v_src THEN
          v_tit := left(v_tit, length(v_tit) - length(v_src) - 3);
        END IF;

        v_host := lower(substring(coalesce(v_srcurl, v_link) FROM '^https?://([^/:?#]+)'));
        IF c.hosts IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM unnest(c.hosts) h WHERE v_host = h OR v_host LIKE '%.' || h) THEN
          CONTINUE;
        END IF;

        v_alvo := ' ' || mercado_norm(v_tit || ' ' || coalesce(v_desc, '')) || ' ';
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM unnest(v_cfg.palavras) p WHERE v_alvo LIKE '% ' || p || '%');

        INSERT INTO mercado_noticias (fonte_id, categoria, titulo, resumo, link, origem, origem_host, publicado_em, chave)
        VALUES (c.fonte_id, c.categoria, left(v_tit, 300),
                CASE WHEN length(v_desc) > 220 THEN left(v_desc, 217) || '…' ELSE v_desc END,
                v_link, coalesce(v_src, c.fonte_nome), regexp_replace(v_host, '^www\d*\.', ''), v_data,
                md5(mercado_norm(v_tit)))
        ON CONFLICT (chave) DO NOTHING;
        GET DIAGNOSTICS n_lin = ROW_COUNT;
        n_novos := n_novos + n_lin;
      END LOOP;

      UPDATE mercado_fontes
         SET ultima_coleta_em = now(), ultimo_status = 'ok', ultimo_erro = NULL, ultimos_itens = n_itens, ultimos_novos = n_novos
       WHERE id = c.fonte_id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE mercado_fontes
         SET ultima_coleta_em = now(), ultimo_status = 'erro', ultimo_erro = left(SQLERRM, 300)
       WHERE id = c.fonte_id;
    END;
    UPDATE mercado_radar_coletas SET processado_em = now() WHERE id = c.id;
    total := total + n_novos;
    fontes := fontes + 1;
  END LOOP;

  DELETE FROM mercado_radar_coletas WHERE criado_em < now() - interval '2 days';
  DELETE FROM mercado_noticias WHERE publicado_em < now() - make_interval(days => v_cfg.dias + 30);
  RETURN jsonb_build_object('fontes', fontes, 'novas', total);
END
$f$;

REVOKE ALL ON FUNCTION public.mercado_radar_buscar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mercado_radar_processar() FROM PUBLIC, anon, authenticated;

-- A cada 30 minutos: dispara as leituras e, 2 minutos depois, processa.
DO $$
BEGIN
  PERFORM cron.unschedule('mercado-radar-buscar');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('mercado-radar-processar');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('mercado-radar-buscar', '11,41 * * * *', $cron$SELECT public.mercado_radar_buscar()$cron$);
SELECT cron.schedule('mercado-radar-processar', '13,43 * * * *', $cron$SELECT public.mercado_radar_processar()$cron$);

-- Acabamento na entrada: descarta títulos de página (curtos demais para serem
-- notícia) e dá nome legível às fontes do governo.
CREATE OR REPLACE FUNCTION public.mercado_noticia_antes_inserir()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF array_length(regexp_split_to_array(trim(NEW.titulo), '\s+'), 1) < 6 THEN
    RETURN NULL;
  END IF;
  IF NEW.origem_host LIKE '%susep.gov.br' THEN
    NEW.origem := 'SUSEP';
  ELSIF NEW.origem_host = 'gov.br' THEN
    NEW.origem := CASE WHEN public.mercado_norm(NEW.titulo) LIKE '%susep%' THEN 'SUSEP' ELSE 'Gov.br' END;
  END IF;
  -- títulos que o agregador entrega sem a inicial maiúscula
  NEW.titulo := upper(left(NEW.titulo, 1)) || substr(NEW.titulo, 2);
  RETURN NEW;
END
$f$;
DROP TRIGGER IF EXISTS trg_mercado_noticia_antes_inserir ON public.mercado_noticias;
CREATE TRIGGER trg_mercado_noticia_antes_inserir BEFORE INSERT ON public.mercado_noticias
  FOR EACH ROW EXECUTE FUNCTION public.mercado_noticia_antes_inserir();

-- Quando foi a última leitura que deu certo (para "atualizado há X" no painel)
CREATE OR REPLACE FUNCTION public.mercado_radar_ultima_coleta()
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT max(ultima_coleta_em) FROM mercado_fontes WHERE ativo AND ultimo_status = 'ok'
$$;
REVOKE ALL ON FUNCTION public.mercado_radar_ultima_coleta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mercado_radar_ultima_coleta() TO authenticated, service_role;
