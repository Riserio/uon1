ALTER TABLE public.mercado_noticias ADD COLUMN IF NOT EXISTS link_req_id bigint;

-- Passo 1 (banco): pede a página do Google de cada notícia ainda com link do Google.
CREATE OR REPLACE FUNCTION public.mercado_radar_links_pedir(p_limite integer DEFAULT 20)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n record;
  qtd int := 0;
BEGIN
  FOR n IN
    SELECT id, link FROM mercado_noticias
     WHERE link LIKE 'https://news.google.com/%' AND link_tentativas < 5 AND NOT oculto
     ORDER BY publicado_em DESC
     LIMIT greatest(1, least(p_limite, 50))
  LOOP
    UPDATE mercado_noticias
       SET link_tentativas = link_tentativas + 1,
           link_req_id = net.http_get(
             url := n.link,
             headers := '{"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept-Language": "pt-BR,pt;q=0.9"}'::jsonb,
             timeout_milliseconds := 20000)
     WHERE id = n.id;
    qtd := qtd + 1;
  END LOOP;
  RETURN qtd;
END
$$;

-- Passo 2 (função de servidor): devolve a assinatura de cada página já recebida.
CREATE OR REPLACE FUNCTION public.mercado_radar_links_assinaturas()
RETURNS TABLE (id uuid, gid text, sg text, ts bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id,
         substring(r.content FROM 'data-n-a-id="([^"]+)"'),
         substring(r.content FROM 'data-n-a-sg="([^"]+)"'),
         substring(r.content FROM 'data-n-a-ts="([0-9]+)"')::bigint
    FROM mercado_noticias m
    JOIN net._http_response r ON r.id = m.link_req_id
   WHERE m.link LIKE 'https://news.google.com/%'
     AND r.status_code = 200
     AND r.content LIKE '%data-n-a-sg=%'
   LIMIT 50
$$;

REVOKE EXECUTE ON FUNCTION public.mercado_radar_links_pedir(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mercado_radar_links_pedir(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.mercado_radar_links_assinaturas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mercado_radar_links_assinaturas() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'radar-links-pedir';
END $$;
SELECT cron.schedule('radar-links-pedir', '48 9,10,11 * * *', $cron$SELECT public.mercado_radar_links_pedir(20)$cron$);