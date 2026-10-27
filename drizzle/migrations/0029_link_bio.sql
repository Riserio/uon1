-- 2026-10-27 — Direcionador de links (estilo Linktree), menu Relacionamento.
-- Páginas públicas em /l/:slug. Leitura anônima só de páginas e links ativos;
-- edição só por usuários internos (parceiro não edita). Cliques e visitas são
-- contados por RPC SECURITY DEFINER — o anônimo não ganha UPDATE nas tabelas.

CREATE TABLE IF NOT EXISTS public.link_bio_paginas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titulo text NOT NULL,
  subtitulo text,
  avatar_url text,
  verificado boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  -- tema: cor_fundo, cor_texto, cor_botao, cor_texto_botao, cor_sombra, estilo_botao
  tema jsonb NOT NULL DEFAULT '{}'::jsonb,
  visitas bigint NOT NULL DEFAULT 0,
  corretora_id uuid REFERENCES public.corretoras(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.link_bio_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagina_id uuid NOT NULL REFERENCES public.link_bio_paginas(id) ON DELETE CASCADE,
  rotulo text NOT NULL,
  url text NOT NULL,
  tipo text NOT NULL DEFAULT 'link', -- link | whatsapp | site | google | mapa | instagram | email | telefone
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  cliques bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_bio_itens_pagina ON public.link_bio_itens (pagina_id, ordem);

GRANT SELECT ON public.link_bio_paginas, public.link_bio_itens TO anon;
GRANT ALL ON public.link_bio_paginas, public.link_bio_itens TO authenticated, service_role;

ALTER TABLE public.link_bio_paginas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_bio_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Link bio público lê páginas ativas" ON public.link_bio_paginas;
CREATE POLICY "Link bio público lê páginas ativas" ON public.link_bio_paginas
  FOR SELECT TO anon, authenticated USING (ativo);
DROP POLICY IF EXISTS "Link bio internos gerenciam páginas" ON public.link_bio_paginas;
CREATE POLICY "Link bio internos gerenciam páginas" ON public.link_bio_paginas
  FOR ALL TO authenticated
  USING (NOT public.has_role(auth.uid(), 'parceiro'))
  WITH CHECK (NOT public.has_role(auth.uid(), 'parceiro'));

DROP POLICY IF EXISTS "Link bio público lê links ativos" ON public.link_bio_itens;
CREATE POLICY "Link bio público lê links ativos" ON public.link_bio_itens
  FOR SELECT TO anon, authenticated
  USING (ativo AND EXISTS (SELECT 1 FROM public.link_bio_paginas p WHERE p.id = pagina_id AND p.ativo));
DROP POLICY IF EXISTS "Link bio internos gerenciam links" ON public.link_bio_itens;
CREATE POLICY "Link bio internos gerenciam links" ON public.link_bio_itens
  FOR ALL TO authenticated
  USING (NOT public.has_role(auth.uid(), 'parceiro'))
  WITH CHECK (NOT public.has_role(auth.uid(), 'parceiro'));

-- updated_at só reflete edições: incrementos de visitas/cliques não o alteram.
-- Contadores são um UPDATE simples por evento, sem log por clique (consumo baixo).
DROP TRIGGER IF EXISTS trg_link_bio_paginas_updated_at ON public.link_bio_paginas;
CREATE TRIGGER trg_link_bio_paginas_updated_at BEFORE UPDATE ON public.link_bio_paginas
  FOR EACH ROW WHEN (OLD.visitas IS NOT DISTINCT FROM NEW.visitas)
  EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_link_bio_itens_updated_at ON public.link_bio_itens;
CREATE TRIGGER trg_link_bio_itens_updated_at BEFORE UPDATE ON public.link_bio_itens
  FOR EACH ROW WHEN (OLD.cliques IS NOT DISTINCT FROM NEW.cliques)
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.link_bio_registrar_visita(p_slug text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  UPDATE link_bio_paginas SET visitas = visitas + 1 WHERE slug = p_slug AND ativo;
$f$;

CREATE OR REPLACE FUNCTION public.link_bio_registrar_clique(p_item_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  UPDATE link_bio_itens i SET cliques = cliques + 1
   WHERE i.id = p_item_id AND i.ativo
     AND EXISTS (SELECT 1 FROM link_bio_paginas p WHERE p.id = i.pagina_id AND p.ativo);
$f$;

REVOKE ALL ON FUNCTION public.link_bio_registrar_visita(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_bio_registrar_clique(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_bio_registrar_visita(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_bio_registrar_clique(uuid) TO anon, authenticated;
