import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { ExternalLink, EyeOff, Megaphone, Plus, Radar, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Comunicado } from "@/types/comunicado";
import { Cabecalho, CARTAO } from "./comum";

interface Noticia {
  id: string;
  categoria: "oficial" | "setor";
  titulo: string;
  resumo: string | null;
  link: string;
  origem: string | null;
  publicado_em: string;
}

type Filtro = "tudo" | "oficial" | "setor" | "comunicado";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "oficial", rotulo: "Órgãos oficiais" },
  { id: "setor", rotulo: "Setor" },
  { id: "comunicado", rotulo: "Comunicados" },
];
const COR: Record<string, string> = {
  oficial: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  setor: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  comunicado: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};
const INICIAL = 8;
const ha = (iso: string) => formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Radar do mercado: notícias sobre proteção patrimonial mutualista e proteção
 * veicular, lidas sozinhas de órgãos oficiais e do setor (cron no banco a cada
 * 30 min), junto com os comunicados internos. A tela se atualiza sem recarregar.
 */
export function RadarMercado({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [tudo, setTudo] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["painel_radar"],
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [n, c, u] = await Promise.all([
        db.from("mercado_noticias").select("id, categoria, titulo, resumo, link, origem, publicado_em").eq("oculto", false).order("publicado_em", { ascending: false }).limit(40),
        supabase.from("comunicados").select("*").eq("ativo", true).order("created_at", { ascending: false }).limit(6),
        db.rpc("mercado_radar_ultima_coleta"),
      ]);
      return {
        noticias: (n.data ?? []) as Noticia[],
        comunicados: (c.data ?? []) as Comunicado[],
        ultimaColeta: (u.data as string | null) ?? null,
      };
    },
  });

  // Chegou notícia ou comunicado novo: atualiza na hora
  useEffect(() => {
    const canal = supabase
      .channel("painel_radar")
      .on("postgres_changes", { event: "*", schema: "public", table: "mercado_noticias" }, () => qc.invalidateQueries({ queryKey: ["painel_radar"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "comunicados" }, () => qc.invalidateQueries({ queryKey: ["painel_radar"] }))
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [qc]);

  const itens = useMemo(() => {
    const com = (data?.comunicados ?? []).map((c) => ({
      id: `c-${c.id}`,
      tipo: "comunicado" as const,
      titulo: c.titulo,
      resumo: c.mensagem,
      link: c.link ?? null,
      origem: "Comunicado interno",
      data: c.created_at,
      noticiaId: null as string | null,
    }));
    const not = (data?.noticias ?? []).map((n) => ({
      id: n.id,
      tipo: n.categoria,
      titulo: n.titulo,
      resumo: n.resumo,
      link: n.link as string | null,
      origem: n.origem ?? (n.categoria === "oficial" ? "Órgão oficial" : "Setor"),
      data: n.publicado_em,
      noticiaId: n.id as string | null,
    }));
    // comunicados internos primeiro; depois as notícias, da mais nova para a mais antiga
    return [...com, ...not].filter((i) => filtro === "tudo" || i.tipo === filtro);
  }, [data, filtro]);

  const ocultar = async (id: string) => {
    const { error } = await db.from("mercado_noticias").update({ oculto: true }).eq("id", id);
    if (error) return toast.error("Não foi possível ocultar a notícia");
    toast.success("Notícia ocultada do painel");
    qc.invalidateQueries({ queryKey: ["painel_radar"] });
  };

  const visiveis = tudo ? itens : itens.slice(0, INICIAL);

  return (
    <Card className={CARTAO}>
      <CardHeader className="pb-3 pt-4 px-5">
        <Cabecalho
          icone={Radar}
          cor="bg-blue-500/10 text-blue-600"
          titulo="Radar do mercado"
          subtitulo={
            <>
              Proteção patrimonial mutualista e proteção veicular
              {data?.ultimaColeta && <> · atualizado {ha(data.ultimaColeta)}</>}
            </>
          }
          direita={
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  aria-pressed={filtro === f.id}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filtro === f.id ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {f.rotulo}
                </button>
              ))}
              <RefreshCw className={`h-3.5 w-3.5 ml-1 text-muted-foreground ${isFetching ? "animate-spin" : "opacity-40"}`} aria-hidden />
              {admin && (
                <Link to="/comunicados">
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 rounded-lg">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Comunicado
                  </Button>
                </Link>
              )}
            </div>
          }
        />
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : itens.length === 0 ? (
          <div className="text-center py-10">
            <Radar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nada por aqui ainda. O radar lê as fontes a cada 30 minutos.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visiveis.map((i) => {
                const novo = Date.now() - new Date(i.data).getTime() < 48 * 3_600_000;
                const conteudo = (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold truncate ${COR[i.tipo]}`}>
                        {i.tipo === "comunicado" && <Megaphone className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{i.origem}</span>
                      </span>
                      {novo && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" title="Novo" />}
                      <span className="text-[11px] text-muted-foreground ml-auto shrink-0">{ha(i.data)}</span>
                    </div>
                    <p className="text-sm font-medium leading-snug line-clamp-3">{i.titulo}</p>
                    {i.resumo && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{i.resumo}</p>}
                    {i.link && (
                      <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary">
                        {i.tipo === "comunicado" ? "Abrir link" : "Ler na fonte"} <ExternalLink className="h-3 w-3" />
                      </span>
                    )}
                  </>
                );
                const classe = "group relative rounded-xl border border-border/50 bg-background/60 p-3.5 flex flex-col min-w-0";
                return i.link ? (
                  <div key={i.id} className={`${classe} hover:bg-muted/40 transition-colors`}>
                    <a href={i.link} target="_blank" rel="noopener noreferrer" className="flex flex-col flex-1 min-w-0">
                      {conteudo}
                    </a>
                    {admin && i.noticiaId && (
                      <button
                        type="button"
                        title="Ocultar esta notícia do painel de todos"
                        onClick={() => ocultar(i.noticiaId!)}
                        className="absolute bottom-2 right-2 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-muted transition-opacity"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div key={i.id} className={classe}>
                    {conteudo}
                  </div>
                );
              })}
            </div>
            {itens.length > INICIAL && (
              <div className="flex justify-center mt-3">
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setTudo((v) => !v)}>
                  {tudo ? "Mostrar menos" : `Ver mais ${itens.length - INICIAL}`}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
