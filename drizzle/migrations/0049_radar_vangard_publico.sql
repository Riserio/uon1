-- =============================================================================
-- Radar do mercado:
--   1) categoria "vangard": notícias que citam a Vangard Gestora ou a Fenaprove
--   2) palavras-chave por fonte (a fonte Vangard não usa as do mercado)
--   3) coleta uma vez por dia (06:41, horário de Brasília)
--   4) leitura pública das notícias para a página /radar (link externo, sem
--      login). Comunicados internos continuam só para usuários logados.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.mercado_fontes DROP CONSTRAINT IF EXISTS mercado_fontes_categoria_check;
ALTER TABLE public.mercado_fontes ADD CONSTRAINT mercado_fontes_categoria_check CHECK (categoria IN ('oficial', 'setor', 'vangard'));
ALTER TABLE public.mercado_noticias DROP CONSTRAINT IF EXISTS mercado_noticias_categoria_check;
ALTER TABLE public.mercado_noticias ADD CONSTRAINT mercado_noticias_categoria_check CHECK (categoria IN ('oficial', 'setor', 'vangard'));

-- NULL = usa as palavras e o prazo gerais de mercado_radar_config
ALTER TABLE public.mercado_fontes ADD COLUMN IF NOT EXISTS palavras text[];
ALTER TABLE public.mercado_fontes ADD COLUMN IF NOT EXISTS dias int;

-- Nomes exatos: "Vangard" sozinho traz empresas homônimas. Notícia da própria
-- empresa é rara, então esta fonte guarda até 3 anos.
INSERT INTO public.mercado_fontes (nome, categoria, url, hosts, usa_resumo, palavras, dias) VALUES
  ('Vangard e Fenaprove', 'vangard',
   'https://news.google.com/rss/search?q=%22Vangard+Gestora%22+OR+%22Vangard+Prote%C3%A7%C3%A3o%22+OR+Fenaprove&hl=pt-BR&gl=BR&ceid=BR:pt-419',
   NULL, false, ARRAY['vangard gestora', 'vangard protecao', 'fenaprove'], 1095)
ON CONFLICT (nome) DO UPDATE SET palavras = EXCLUDED.palavras, categoria = EXCLUDED.categoria, url = EXCLUDED.url, dias = EXCLUDED.dias;

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
    SELECT co.id, co.fonte_id, co.request_id, co.criado_em, f.categoria, f.hosts, f.usa_resumo, f.nome AS fonte_nome,
           coalesce(f.palavras, v_cfg.palavras) AS palavras, coalesce(f.dias, v_cfg.dias) AS dias
      FROM mercado_radar_coletas co JOIN mercado_fontes f ON f.id = co.fonte_id
     WHERE co.processado_em IS NULL
     ORDER BY co.id
  LOOP
    SELECT status_code, content, error_msg, timed_out INTO r FROM net._http_response WHERE id = c.request_id;
    IF NOT FOUND THEN
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
        CONTINUE WHEN v_data IS NULL OR v_data < now() - make_interval(days => c.dias) OR v_data > now() + interval '1 day';

        IF v_src IS NOT NULL AND right(v_tit, length(v_src) + 3) = ' - ' || v_src THEN
          v_tit := left(v_tit, length(v_tit) - length(v_src) - 3);
        END IF;

        v_host := lower(substring(coalesce(v_srcurl, v_link) FROM '^https?://([^/:?#]+)'));
        IF c.hosts IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM unnest(c.hosts) h WHERE v_host = h OR v_host LIKE '%.' || h) THEN
          CONTINUE;
        END IF;

        v_alvo := ' ' || mercado_norm(v_tit || ' ' || coalesce(v_desc, '')) || ' ';
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM unnest(c.palavras) p WHERE v_alvo LIKE '% ' || p || '%');

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
  DELETE FROM mercado_noticias n
   WHERE n.publicado_em < now() - make_interval(days => coalesce((SELECT f.dias FROM mercado_fontes f WHERE f.id = n.fonte_id), v_cfg.dias) + 30);
  RETURN jsonb_build_object('fontes', fontes, 'novas', total);
END
$f$;
REVOKE ALL ON FUNCTION public.mercado_radar_processar() FROM PUBLIC, anon, authenticated;

-- Uma coleta por dia: 06:41 de Brasília (09:41 UTC), processada às 06:46
DO $$ BEGIN PERFORM cron.unschedule('mercado-radar-buscar'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('mercado-radar-processar'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('mercado-radar-buscar', '41 9 * * *', $cron$SELECT public.mercado_radar_buscar()$cron$);
SELECT cron.schedule('mercado-radar-processar', '46 9 * * *', $cron$SELECT public.mercado_radar_processar()$cron$);

-- Página pública /radar: qualquer pessoa lê as notícias visíveis
GRANT SELECT ON public.mercado_noticias TO anon;
DROP POLICY IF EXISTS "Radar - leitura publica" ON public.mercado_noticias;
CREATE POLICY "Radar - leitura publica" ON public.mercado_noticias FOR SELECT TO anon USING (NOT oculto);
GRANT EXECUTE ON FUNCTION public.mercado_radar_ultima_coleta() TO anon;
