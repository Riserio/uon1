import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LinkBioView, temaCompleto, type LinkBioItem, type LinkBioPagina } from "@/components/linkbio/LinkBioView";

export default function LinkBioPublico() {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["link_bio_publico", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("link_bio_paginas")
        .select("id,slug,titulo,subtitulo,avatar_url,verificado,ativo,tema, link_bio_itens(id,rotulo,url,tipo,ordem,ativo)")
        .eq("slug", slug!)
        .eq("ativo", true)
        .maybeSingle();
      if (error) throw error;
      return data as (LinkBioPagina & { link_bio_itens: LinkBioItem[] }) | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Uma visita por sessão do navegador — evita inflar com recarregamentos.
  useEffect(() => {
    if (!data?.slug) return;
    document.title = data.titulo;
    const chave = `linkbio_visita_${data.slug}`;
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, "1");
    } catch {
      /* storage indisponível: conta mesmo assim */
    }
    (supabase as any).rpc("link_bio_registrar_visita", { p_slug: data.slug }).then(() => {});
  }, [data?.slug, data?.titulo]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">Página indisponível</h1>
          <p className="text-sm text-muted-foreground mt-1">Este link não existe ou foi desativado.</p>
        </div>
      </div>
    );
  }

  const tema = temaCompleto(data.tema);

  return (
    <div className="min-h-screen" style={{ backgroundColor: tema.cor_fundo }}>
      <LinkBioView
        pagina={data}
        itens={data.link_bio_itens || []}
        onClickItem={(item) => {
          (supabase as any).rpc("link_bio_registrar_clique", { p_item_id: item.id }).then(() => {});
        }}
      />
    </div>
  );
}
