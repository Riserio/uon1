import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowUpRight, ChevronLeft, ChevronRight, Loader2, Mail, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoFonte } from "@/components/painel/RadarMercado";
import { NewsletterRadar } from "@/components/radar/NewsletterRadar";
import { jaAssinouNesteAparelho, registrarVisita } from "@/lib/radar/newsletter";
import { CAMPO_RADAR, comunicadosPublicosRadar, mesclarPorData, paginaNoticias, POR_PAGINA, PONTO_RADAR, TIPO_RADAR, ultimaColetaRadar, type ItemRadar } from "@/components/painel/radar";

type Filtro = "tudo" | "oficial" | "setor";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "oficial", rotulo: "Órgãos oficiais" },
  { id: "setor", rotulo: "Setor" },
];
const DESTAQUES = 5;
const TROCA_MS = 8000;
const ha = (iso: string) => formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR });

/**
 * Radar do mercado aberto ao público (link do Instagram da Vangard). Notícias
 * coletadas e os comunicados marcados como "interno e externo", na mesma fila
 * por data (os somente internos não aparecem aqui). As mais novas
 * passam em carrossel no cartão de destaque e também ficam na grade abaixo,
 * que lista tudo pela data; cada notícia abre no site de origem, numa nova aba.
 */
export default function RadarPublico() {
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [ativo, setAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const newsletter = useRef<HTMLElement>(null);
  // quem já assinou neste aparelho não vê mais o convite
  const [jaAssinou] = useState(jaAssinouNesteAparelho);
  const [acabouDeAssinar, setAcabouDeAssinar] = useState(false);
  const [newsAberta, setNewsAberta] = useState(false);
  const abrirNewsletter = () => {
    setNewsAberta(true);
    newsletter.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const convite = jaAssinou ? null : (
    <NewsletterRadar ref={newsletter} aberto={newsAberta} onAbrir={() => setNewsAberta(true)} onAssinado={() => setAcabouDeAssinar(true)} />
  );
  const categoria = filtro === "tudo" ? null : filtro;

  useEffect(() => {
    document.title = "Radar do mercado | Vangard Gestora";
    registrarVisita("radar");
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
  const { data: comunicados } = useQuery({
    queryKey: ["radar_publico_comunicados"],
    queryFn: comunicadosPublicosRadar,
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
  const itens = useMemo(() => {
    const not = q.data?.pages.flat() ?? [];
    return categoria ? not : mesclarPorData(comunicados ?? [], not, !!q.hasNextPage);
  }, [q.data, q.hasNextPage, comunicados, categoria]);
  const destaques = itens.slice(0, DESTAQUES);
  const principal: ItemRadar | undefined = destaques[Math.min(ativo, Math.max(0, destaques.length - 1))];

  useEffect(() => setAtivo(0), [filtro]);

  // O destaque troca sozinho; para com o mouse em cima ou com pouco movimento pedido
  useEffect(() => {
    if (pausado || destaques.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => setAtivo((a) => (a + 1) % destaques.length), TROCA_MS);
    return () => window.clearTimeout(t);
  }, [ativo, pausado, destaques.length]);
  const rotuloTipo = (i: ItemRadar) => (i.tipo === "comunicado" ? "Comunicado" : TIPO_RADAR[i.tipo]);
  const ir = (d: number) => setAtivo((a) => (a + d + destaques.length) % destaques.length);

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
            <img src="/images/vangard-logo.png" alt="Vangard Gestora" className="h-8 object-contain" />
          </a>
          <div className="flex items-center gap-2">
            {!jaAssinou && !acabouDeAssinar && (
              <Button
                size="sm"
                className="rounded-full bg-accent-brand text-accent-brand-foreground hover:bg-accent-brand/90"
                onClick={abrirNewsletter}
                aria-label="Assinar a newsletter"
              >
                <Mail className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Assinar newsletter</span>
              </Button>
            )}
            <Button variant="outline" size="sm" className="rounded-full" onClick={compartilhar} aria-label="Compartilhar">
              <Share2 className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Compartilhar</span>
            </Button>
          </div>
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
          <>
            <p className="text-center text-muted-foreground py-16">Nenhuma notícia neste filtro por enquanto.</p>
            {convite}
          </>
        ) : (
          <>
            <div
              className={`relative rounded-3xl overflow-hidden bg-gradient-to-br ${CAMPO_RADAR[principal.tipo]} text-white min-h-[280px] flex flex-col transition-colors`}
              onMouseEnter={() => setPausado(true)}
              onMouseLeave={() => setPausado(false)}
              onFocus={() => setPausado(true)}
              onBlur={() => setPausado(false)}
            >
              <svg aria-hidden viewBox="0 0 200 200" className="absolute -right-16 -top-16 h-80 w-80 text-white/15">
                {[30, 55, 80, 98].map((r) => (
                  <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="1" />
                ))}
                <line x1="100" y1="100" x2="186" y2="52" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              {principal.imagem && <img src={principal.imagem} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
              <a
                key={principal.id}
                href={principal.link ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="relative flex-1 flex flex-col p-6 sm:p-8 animate-in fade-in duration-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 rounded-3xl"
              >
                <span className="flex items-center gap-3">
                  <LogoFonte item={principal} grande />
                  <span>
                    <span className="block font-semibold">{principal.origem}</span>
                    <span className="block text-sm text-white/75">
                      {rotuloTipo(principal)}, {format(parseISO(principal.data), "dd/MM/yyyy")}
                    </span>
                  </span>
                </span>
                <span className="mt-6 text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-balance line-clamp-4">{principal.titulo}</span>
                {principal.tipo === "comunicado" && principal.resumo && (
                  <span className="mt-3 text-sm sm:text-base text-white/85 line-clamp-3 whitespace-pre-line">{principal.resumo}</span>
                )}
                {principal.link && (
                  <span className="mt-auto pt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-white/90">
                    {principal.tipo === "comunicado" ? "Saiba mais" : "Ler na fonte"} <ArrowUpRight className="h-4 w-4" />
                  </span>
                )}
              </a>
              {destaques.length > 1 && (
                <div className="relative flex items-center gap-3 px-6 sm:px-8 pb-5">
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
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" aria-label="Notícia anterior" onClick={() => ir(-1)} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-white/15">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button type="button" aria-label="Próxima notícia" onClick={() => ir(1)} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-white/15">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {convite}

            <div className="grid gap-3 sm:grid-cols-2">
              {itens.map((i) => (
                <a
                  key={i.id}
                  href={i.link ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group text-left rounded-2xl bg-background border border-border/50 p-4 hover:border-primary/40 hover:shadow-sm transition-all flex flex-col gap-3"
                >
                  <span className="flex items-center gap-2.5">
                    <LogoFonte item={i} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold truncate">{i.origem}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={`h-1.5 w-1.5 rounded-full ${PONTO_RADAR[i.tipo]}`} />
                        {i.tipo === "comunicado" ? `Comunicado, ${ha(i.data)}` : ha(i.data)}
                      </span>
                    </span>
                  </span>
                  <span className="text-[15px] font-semibold leading-snug line-clamp-3 group-hover:text-primary transition-colors">{i.titulo}</span>
                  {i.tipo === "comunicado" && i.resumo && <span className="text-sm text-muted-foreground line-clamp-2">{i.resumo}</span>}
                </a>
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
          <span>Atualizado uma vez por dia. Contamos as visitas desta página por cidade aproximada e dispositivo, sem guardar seu endereço de rede.</span>
        </div>
      </footer>

    </div>
  );
}
