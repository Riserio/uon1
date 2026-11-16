import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowUpRight, ChevronLeft, ChevronRight, EyeOff, Link2, Megaphone, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { urlPublica } from "@/lib/trust";
import type { Comunicado } from "@/types/comunicado";
import { ListaRolavel } from "./ListaRolavel";
import { CAMPO_RADAR, logoFonte, paginaNoticias, POR_PAGINA, PONTO_RADAR, TIPO_RADAR, ultimaColetaRadar, urlRadarPublico, type ItemRadar } from "./radar";

type Filtro = "tudo" | "oficial" | "setor" | "comunicado";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "oficial", rotulo: "Oficiais" },
  { id: "setor", rotulo: "Setor" },
  { id: "comunicado", rotulo: "Comunicados" },
];
const DESTAQUES = 5;
const TROCA_MS = 8000;
// notícias chegam uma vez por dia: não precisa buscar de novo a cada visita
const GUARDA_MS = 30 * 60_000;
const ha = (iso: string) => formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function LogoFonte({ item, grande }: { item: ItemRadar; grande?: boolean }) {
  const [falhou, setFalhou] = useState(false);
  const lado = grande ? "h-11 w-11 rounded-xl" : "h-9 w-9 rounded-lg border border-border/60";
  const src = logoFonte(item.host);
  if (item.tipo === "comunicado" || !src || falhou) {
    return (
      <span className={`${lado} shrink-0 flex items-center justify-center bg-white text-slate-700 shadow-sm`}>
        {item.tipo === "comunicado" ? <Megaphone className="h-4 w-4" /> : <span className="text-sm font-bold">{item.origem.slice(0, 1)}</span>}
      </span>
    );
  }
  return (
    <span className={`${lado} shrink-0 flex items-center justify-center bg-white shadow-sm overflow-hidden`}>
      <img src={src} alt="" loading="lazy" className="h-2/3 w-2/3 object-contain" onError={() => setFalhou(true)} />
    </span>
  );
}

/**
 * Radar do mercado: notícias sobre proteção patrimonial mutualista e proteção
 * veicular (coleta diária no banco) junto com os comunicados internos. Um
 * destaque que troca sozinho e, abaixo, a lista com rolagem própria, que só
 * busca a próxima página quando a pessoa chega ao fim. Tocar numa notícia
 * abre a matéria no site de origem, numa nova aba.
 */
export function RadarMercado({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [ativo, setAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);

  const categoria = filtro === "oficial" || filtro === "setor" ? filtro : null;
  const noticias = useInfiniteQuery({
    queryKey: ["painel_radar_noticias", categoria],
    enabled: filtro !== "comunicado",
    initialPageParam: 0,
    queryFn: ({ pageParam }) => paginaNoticias(pageParam, categoria),
    getNextPageParam: (ultima, todas) => (ultima.length < POR_PAGINA ? undefined : todas.length),
    staleTime: GUARDA_MS,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });
  const extras = useQuery({
    queryKey: ["painel_radar_extras"],
    staleTime: GUARDA_MS,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [c, u] = await Promise.all([
        supabase.from("comunicados").select("*").eq("ativo", true).order("created_at", { ascending: false }).limit(10),
        ultimaColetaRadar(),
      ]);
      return { comunicados: (c.data ?? []) as Comunicado[], ultimaColeta: u };
    },
  });

  // Chegou notícia ou comunicado novo: atualiza na hora, sem esperar a guarda
  useEffect(() => {
    const canal = supabase
      .channel("painel_radar")
      .on("postgres_changes", { event: "*", schema: "public", table: "mercado_noticias" }, () => {
        qc.invalidateQueries({ queryKey: ["painel_radar_noticias"] });
        qc.invalidateQueries({ queryKey: ["painel_radar_extras"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "comunicados" }, () => qc.invalidateQueries({ queryKey: ["painel_radar_extras"] }))
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [qc]);

  const itens = useMemo<ItemRadar[]>(() => {
    const com: ItemRadar[] = (extras.data?.comunicados ?? []).map((c) => ({
      id: `c-${c.id}`,
      tipo: "comunicado",
      titulo: c.titulo,
      resumo: c.mensagem,
      link: c.link ?? null,
      origem: "Comunicado interno",
      host: null,
      imagem: c.imagem_url ?? null,
      data: c.created_at,
      noticiaId: null,
    }));
    if (filtro === "comunicado") return com;
    const not = noticias.data?.pages.flat() ?? [];
    if (filtro !== "tudo") return not;
    // comunicados entram na ordem de data, junto com as notícias já carregadas
    const maisAntiga = not.length ? not[not.length - 1].data : "";
    return [...com.filter((c) => !noticias.hasNextPage || c.data >= maisAntiga), ...not].sort((a, b) => b.data.localeCompare(a.data));
  }, [extras.data, noticias.data, noticias.hasNextPage, filtro]);

  const destaques = itens.slice(0, DESTAQUES);
  const lista = itens.slice(destaques.length);
  const atual = destaques[Math.min(ativo, Math.max(0, destaques.length - 1))];
  const carregando = (filtro !== "comunicado" && noticias.isLoading) || extras.isLoading;

  useEffect(() => setAtivo(0), [filtro]);

  // O destaque troca sozinho; para com o mouse em cima ou com pouco movimento pedido
  useEffect(() => {
    if (pausado || destaques.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => setAtivo((a) => (a + 1) % destaques.length), TROCA_MS);
    return () => window.clearTimeout(t);
  }, [ativo, pausado, destaques.length]);

  const ocultar = async (id: string) => {
    const { error } = await db.from("mercado_noticias").update({ oculto: true }).eq("id", id);
    if (error) return toast.error("Não foi possível ocultar a notícia");
    toast.success("Notícia ocultada do painel e da página pública");
    qc.invalidateQueries({ queryKey: ["painel_radar_noticias"] });
  };
  const copiarLinkPublico = () =>
    navigator.clipboard.writeText(urlRadarPublico(urlPublica())).then(() => toast.success("Link público do Radar copiado. Pode colar no Instagram."));
  const ir = (d: number) => setAtivo((a) => (a + d + destaques.length) % destaques.length);

  return (
    <section className="rounded-3xl border border-border/40 bg-card shadow-sm overflow-hidden flex flex-col h-full min-h-[560px]" aria-label="Radar do mercado">
      <header className="px-5 pt-4 pb-3 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight">Radar do mercado</h2>
            <p className="text-xs text-muted-foreground truncate">
              Proteção patrimonial mutualista e proteção veicular{extras.data?.ultimaColeta ? `, atualizado ${ha(extras.data.ultimaColeta)}` : ""}
            </p>
          </div>
          {admin && (
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs px-3" onClick={copiarLinkPublico} title="Copiar o link público do Radar">
                <Link2 className="h-3.5 w-3.5 mr-1" /> Link público
              </Button>
              <Link to="/comunicados" title="Novo comunicado interno">
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full">
                  <Plus className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filtro === f.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      </header>

      {carregando ? (
        <div className="px-5 pb-5 space-y-3">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : !atual ? (
        <p className="px-5 pb-8 pt-6 text-sm text-muted-foreground text-center">Nada por aqui ainda. O Radar busca as notícias uma vez por dia.</p>
      ) : (
        <>
          {/* Destaque */}
          <div className="px-3 shrink-0" onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)} onFocus={() => setPausado(true)} onBlur={() => setPausado(false)}>
            <div className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${CAMPO_RADAR[atual.tipo]} text-white min-h-[210px] flex flex-col`}>
              {atual.imagem && <img src={atual.imagem} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />}
              <svg aria-hidden viewBox="0 0 200 200" className="absolute -right-14 -top-14 h-64 w-64 text-white/15">
                {[30, 55, 80, 98].map((r) => (
                  <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="1" />
                ))}
                <line x1="100" y1="100" x2="186" y2="52" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="150" cy="72" r="3.5" fill="currentColor" />
              </svg>

              <div key={atual.id} className="relative flex-1 flex flex-col p-5 animate-in fade-in duration-500">
                <div className="flex items-center gap-3">
                  <LogoFonte item={atual} grande />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{atual.origem}</p>
                    <p className="text-xs text-white/70">
                      {TIPO_RADAR[atual.tipo]}, {ha(atual.data)}
                    </p>
                  </div>
                </div>
                <h3 className="mt-4 text-xl font-bold leading-snug tracking-tight line-clamp-3 text-balance">{atual.titulo}</h3>
                {atual.resumo && <p className="mt-2 text-sm text-white/80 line-clamp-2">{atual.resumo}</p>}
                {atual.link && (
                  <a
                    href={atual.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto pt-4 self-start inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded"
                  >
                    {atual.tipo === "comunicado" ? "Abrir link" : "Ler na fonte"} <ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
              </div>

              <div className="relative flex items-center gap-3 px-5 pb-4">
                {destaques.length > 1 && (
                  <div className="flex-1 flex gap-1.5">
                    {destaques.map((d, i) => (
                      <button key={d.id} type="button" aria-label={`Ir para o destaque ${i + 1}`} aria-current={i === ativo} onClick={() => setAtivo(i)} className="h-1 flex-1 rounded-full bg-white/25 overflow-hidden">
                        <span
                          key={`${d.id}-${i === ativo}-${pausado}`}
                          className={`block h-full bg-white ${i === ativo ? (pausado ? "w-full" : "radar-enche") : i < ativo ? "w-full opacity-60" : "w-0"}`}
                          style={i === ativo && !pausado ? { animationDuration: `${TROCA_MS}ms` } : undefined}
                        />
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-0.5 shrink-0 ml-auto">
                  {admin && atual.noticiaId && (
                    <button type="button" title="Ocultar esta notícia de todos" onClick={() => ocultar(atual.noticiaId!)} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/15">
                      <EyeOff className="h-4 w-4" />
                    </button>
                  )}
                  {destaques.length > 1 && (
                    <>
                      <button type="button" aria-label="Notícia anterior" onClick={() => ir(-1)} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/15">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button type="button" aria-label="Próxima notícia" onClick={() => ir(1)} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/15">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Lista com rolagem: a próxima página só é buscada ao chegar no fim */}
          <ListaRolavel
            className="flex-1 mt-1"
            rotuloSeta="Ver mais notícias"
            carregando={noticias.isFetchingNextPage}
            onFim={() => {
              if (filtro !== "comunicado" && noticias.hasNextPage && !noticias.isFetchingNextPage) noticias.fetchNextPage();
            }}
          >
            <ul className="px-3 py-2">
              {lista.map((i) => {
                const corpo = (
                  <>
                    <LogoFonte item={i} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">{i.titulo}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PONTO_RADAR[i.tipo]}`} />
                        <span className="truncate">{i.origem}</span>
                        <span className="shrink-0">{ha(i.data)}</span>
                      </span>
                    </span>
                    {i.link && <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary shrink-0 transition-colors" />}
                  </>
                );
                const classe = "group w-full flex items-center gap-3 rounded-xl px-2 py-2.5";
                return (
                  <li key={i.id}>
                    {i.link ? (
                      <a href={i.link} target="_blank" rel="noopener noreferrer" className={`${classe} hover:bg-muted/50 transition-colors`}>
                        {corpo}
                      </a>
                    ) : (
                      <div className={classe}>{corpo}</div>
                    )}
                  </li>
                );
              })}
              {lista.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">Sem mais notícias neste filtro.</li>}
              {lista.length > 0 && !noticias.hasNextPage && filtro !== "comunicado" && (
                <li className="px-2 pt-2 pb-1 text-center text-xs text-muted-foreground">Você chegou ao fim das notícias.</li>
              )}
            </ul>
          </ListaRolavel>
        </>
      )}

    </section>
  );
}
