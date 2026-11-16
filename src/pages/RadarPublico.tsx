import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoFonte } from "@/components/painel/RadarMercado";
import { NoticiaDialog } from "@/components/painel/NoticiaDialog";
import { CAMPO_RADAR, paginaNoticias, POR_PAGINA, PONTO_RADAR, TIPO_RADAR, ultimaColetaRadar, type ItemRadar } from "@/components/painel/radar";

type Filtro = "tudo" | "oficial" | "setor" | "vangard";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "oficial", rotulo: "Órgãos oficiais" },
  { id: "setor", rotulo: "Setor" },
  { id: "vangard", rotulo: "Vangard e Fenaprove" },
];
const ha = (iso: string) => formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR });

/**
 * Radar do mercado aberto ao público (link do Instagram da Vangard). Só as
 * notícias coletadas; comunicados internos não aparecem aqui.
 */
export default function RadarPublico() {
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [aberta, setAberta] = useState<ItemRadar | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const categoria = filtro === "tudo" ? null : filtro;

  useEffect(() => {
    document.title = "Radar do mercado | Vangard Gestora";
  }, []);

  const q = useInfiniteQuery({
    queryKey: ["radar_publico", categoria],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => paginaNoticias(pageParam, categoria),
    getNextPageParam: (ultima, todas) => (ultima.length < POR_PAGINA ? undefined : todas.length),
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: ultimaColeta } = useQuery({ queryKey: ["radar_publico_coleta"], queryFn: ultimaColetaRadar, staleTime: 30 * 60_000 });
  const itens = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
  const [principal, ...demais] = itens;

  // carrega a próxima página ao chegar perto do fim da página
  useEffect(() => {
    const el = fim.current;
    if (!el) return;
    const obs = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
    }, { rootMargin: "400px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [q]);

  const compartilhar = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: "Radar do mercado | Vangard Gestora", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado");
      }
    } catch {
      // a pessoa cancelou o compartilhamento
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <a href="https://vangardgestora.com.br" target="_blank" rel="noopener noreferrer" className="flex items-center">
            <img src="/images/logo-vangard.png" alt="Vangard Gestora" className="h-8 object-contain" />
          </a>
          <Button variant="outline" size="sm" className="rounded-full" onClick={compartilhar}>
            <Share2 className="h-4 w-4 mr-1.5" /> Compartilhar
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Radar do mercado</h1>
          <p className="text-muted-foreground max-w-2xl">
            O que órgãos oficiais e o setor publicam sobre proteção patrimonial mutualista e proteção veicular, reunido pela Vangard Gestora.
            {ultimaColeta ? ` Atualizado ${ha(ultimaColeta)}.` : ""}
          </p>
        </div>

        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filtro === f.id ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted border border-border/60"
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-64 rounded-3xl" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
            </div>
          </div>
        ) : !principal ? (
          <p className="text-center text-muted-foreground py-16">Nenhuma notícia neste filtro por enquanto.</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAberta(principal)}
              className={`relative w-full text-left rounded-3xl overflow-hidden bg-gradient-to-br ${CAMPO_RADAR[principal.tipo]} text-white p-6 sm:p-8 min-h-[260px] flex flex-col focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40`}
            >
              <svg aria-hidden viewBox="0 0 200 200" className="absolute -right-16 -top-16 h-80 w-80 text-white/15">
                {[30, 55, 80, 98].map((r) => (
                  <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="1" />
                ))}
                <line x1="100" y1="100" x2="186" y2="52" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span className="relative flex items-center gap-3">
                <LogoFonte item={principal} grande />
                <span>
                  <span className="block font-semibold">{principal.origem}</span>
                  <span className="block text-sm text-white/75">
                    {TIPO_RADAR[principal.tipo]}, {format(parseISO(principal.data), "dd/MM/yyyy")}
                  </span>
                </span>
              </span>
              <span className="relative mt-6 text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-balance">{principal.titulo}</span>
              <span className="relative mt-auto pt-6 text-sm font-semibold text-white/90">Ler a notícia</span>
            </button>

            <div className="grid gap-3 sm:grid-cols-2">
              {demais.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setAberta(i)}
                  className="group text-left rounded-2xl bg-background border border-border/50 p-4 hover:border-primary/40 hover:shadow-sm transition-all flex flex-col gap-3"
                >
                  <span className="flex items-center gap-2.5">
                    <LogoFonte item={i} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold truncate">{i.origem}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={`h-1.5 w-1.5 rounded-full ${PONTO_RADAR[i.tipo]}`} />
                        {ha(i.data)}
                      </span>
                    </span>
                  </span>
                  <span className="text-[15px] font-semibold leading-snug line-clamp-3 group-hover:text-primary transition-colors">{i.titulo}</span>
                </button>
              ))}
            </div>
            <div ref={fim} className="flex justify-center py-4 text-sm text-muted-foreground">
              {q.isFetchingNextPage ? <Loader2 className="h-5 w-5 animate-spin" /> : !q.hasNextPage && "Você viu todas as notícias."}
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-border/50 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-xs text-muted-foreground flex flex-col sm:flex-row gap-2 justify-between">
          <span>Vangard Gestora. Notícias de fontes públicas; o conteúdo de cada matéria pertence ao veículo de origem.</span>
          <span>Atualizado uma vez por dia.</span>
        </div>
      </footer>

      <NoticiaDialog item={aberta} relacionadas={itens} onTrocar={setAberta} onFechar={() => setAberta(null)} />
    </div>
  );
}
