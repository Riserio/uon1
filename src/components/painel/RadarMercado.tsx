import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowUpRight, ChevronLeft, ChevronRight, EyeOff, Megaphone, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Comunicado } from "@/types/comunicado";

interface Noticia {
  id: string;
  categoria: "oficial" | "setor";
  titulo: string;
  resumo: string | null;
  link: string;
  origem: string | null;
  origem_host: string | null;
  publicado_em: string;
}
interface Item {
  id: string;
  tipo: "oficial" | "setor" | "comunicado";
  titulo: string;
  resumo: string | null;
  link: string | null;
  origem: string;
  host: string | null;
  imagem: string | null;
  data: string;
  noticiaId: string | null;
}

type Filtro = "tudo" | "oficial" | "setor" | "comunicado";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "oficial", rotulo: "Oficiais" },
  { id: "setor", rotulo: "Setor" },
  { id: "comunicado", rotulo: "Comunicados" },
];
/** Campo de cor do destaque: cada origem tem a sua, para reconhecer de relance. */
const CAMPO: Record<Item["tipo"], string> = {
  oficial: "from-indigo-950 via-indigo-800 to-blue-600",
  setor: "from-violet-950 via-purple-800 to-fuchsia-600",
  comunicado: "from-amber-900 via-orange-700 to-amber-500",
};
const PONTO: Record<Item["tipo"], string> = { oficial: "bg-blue-500", setor: "bg-fuchsia-500", comunicado: "bg-amber-500" };
const TIPO: Record<Item["tipo"], string> = { oficial: "Órgão oficial", setor: "Setor", comunicado: "Comunicado interno" };
const DESTAQUES = 5;
const LISTA = 3;
const TROCA_MS = 8000;
const ha = (iso: string) => formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR });
const logo = (host: string | null) => (host ? `https://www.google.com/s2/favicons?domain=${host}&sz=128` : null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function Logo({ item, grande }: { item: Item; grande?: boolean }) {
  const [falhou, setFalhou] = useState(false);
  const lado = grande ? "h-11 w-11 rounded-xl" : "h-9 w-9 rounded-lg";
  const src = logo(item.host);
  if (item.tipo === "comunicado" || !src || falhou) {
    return (
      <span className={`${lado} shrink-0 flex items-center justify-center bg-white/95 text-slate-700 shadow-sm`}>
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
 * veicular, lidas sozinhas de órgãos oficiais e do setor (cron no banco a cada
 * 30 min), junto com os comunicados internos. Um destaque que troca sozinho e
 * a lista do que veio depois; a tela se atualiza sem recarregar.
 */
export function RadarMercado({ admin }: { admin: boolean }) {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [ativo, setAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [extras, setExtras] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["painel_radar"],
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [n, c, u] = await Promise.all([
        db.from("mercado_noticias").select("id, categoria, titulo, resumo, link, origem, origem_host, publicado_em").eq("oculto", false).order("publicado_em", { ascending: false }).limit(40),
        supabase.from("comunicados").select("*").eq("ativo", true).order("created_at", { ascending: false }).limit(6),
        db.rpc("mercado_radar_ultima_coleta"),
      ]);
      return { noticias: (n.data ?? []) as Noticia[], comunicados: (c.data ?? []) as Comunicado[], ultimaColeta: (u.data as string | null) ?? null };
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

  const itens = useMemo<Item[]>(() => {
    const com: Item[] = (data?.comunicados ?? []).map((c) => ({
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
    const not: Item[] = (data?.noticias ?? []).map((n) => ({
      id: n.id,
      tipo: n.categoria,
      titulo: n.titulo,
      resumo: n.resumo,
      link: n.link,
      origem: n.origem ?? TIPO[n.categoria],
      host: n.origem_host,
      imagem: null,
      data: n.publicado_em,
      noticiaId: n.id,
    }));
    // tudo junto, do mais novo para o mais antigo
    return [...com, ...not].filter((i) => filtro === "tudo" || i.tipo === filtro).sort((a, b) => b.data.localeCompare(a.data));
  }, [data, filtro]);

  const destaques = itens.slice(0, DESTAQUES);
  const resto = itens.slice(destaques.length);
  const lista = resto.slice(0, LISTA + extras);
  const atual = destaques[Math.min(ativo, Math.max(0, destaques.length - 1))];

  useEffect(() => {
    setAtivo(0);
    setExtras(0);
  }, [filtro]);

  // O destaque troca sozinho; para quando o mouse está em cima ou a pessoa pediu menos movimento
  useEffect(() => {
    if (pausado || destaques.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => setAtivo((a) => (a + 1) % destaques.length), TROCA_MS);
    return () => window.clearTimeout(t);
  }, [ativo, pausado, destaques.length]);

  const ocultar = async (id: string) => {
    const { error } = await db.from("mercado_noticias").update({ oculto: true }).eq("id", id);
    if (error) return toast.error("Não foi possível ocultar a notícia");
    toast.success("Notícia ocultada do painel");
    qc.invalidateQueries({ queryKey: ["painel_radar"] });
  };
  const ir = (d: number) => setAtivo((a) => (a + d + destaques.length) % destaques.length);

  return (
    <section className="rounded-3xl border border-border/40 bg-card shadow-sm overflow-hidden flex flex-col h-full" aria-label="Radar do mercado">
      <header className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Radar do mercado</h2>
          <p className="text-xs text-muted-foreground">
            Proteção patrimonial mutualista e proteção veicular{data?.ultimaColeta ? `, lido ${ha(data.ultimaColeta)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filtro === f.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.rotulo}
            </button>
          ))}
          {admin && (
            <Link to="/comunicados" title="Novo comunicado interno">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full">
                <Plus className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="px-5 pb-5 space-y-3">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : !atual ? (
        <p className="px-5 pb-8 pt-6 text-sm text-muted-foreground text-center">Nada por aqui ainda. O radar lê as fontes a cada 30 minutos.</p>
      ) : (
        <>
          {/* Destaque */}
          <div className="px-3" onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)} onFocus={() => setPausado(true)} onBlur={() => setPausado(false)}>
            <div className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${CAMPO[atual.tipo]} text-white min-h-[236px] flex flex-col`}>
              {atual.imagem && <img src={atual.imagem} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />}
              {/* anéis de radar */}
              <svg aria-hidden viewBox="0 0 200 200" className="absolute -right-14 -top-14 h-64 w-64 text-white/15">
                {[30, 55, 80, 98].map((r) => (
                  <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="1" />
                ))}
                <line x1="100" y1="100" x2="186" y2="52" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="150" cy="72" r="3.5" fill="currentColor" />
              </svg>

              <div key={atual.id} className="relative flex-1 flex flex-col p-5 animate-in fade-in duration-500">
                <div className="flex items-center gap-3">
                  <Logo item={atual} grande />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{atual.origem}</p>
                    <p className="text-xs text-white/70">
                      {TIPO[atual.tipo]}, {ha(atual.data)}
                    </p>
                  </div>
                </div>
                <h3 className="mt-4 text-xl sm:text-[22px] font-bold leading-snug tracking-tight line-clamp-3 text-balance">{atual.titulo}</h3>
                {atual.resumo && <p className="mt-2 text-sm text-white/80 line-clamp-2">{atual.resumo}</p>}
                <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                  {atual.link ? (
                    <a
                      href={atual.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-white text-slate-900 text-sm font-semibold px-4 py-2 hover:bg-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    >
                      {atual.tipo === "comunicado" ? "Abrir link" : "Ler na fonte"} <ArrowUpRight className="h-4 w-4" />
                    </a>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-1">
                    {admin && atual.noticiaId && (
                      <button type="button" title="Ocultar esta notícia do painel de todos" onClick={() => ocultar(atual.noticiaId!)} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/15">
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

              {/* marcadores: um por destaque; o ativo enche até a próxima troca */}
              {destaques.length > 1 && (
                <div className="relative flex gap-1.5 px-5 pb-4">
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
            </div>
          </div>

          {/* O que veio antes */}
          <ul className="px-3 py-2 flex-1">
            {lista.map((i) => {
              const Corpo = (
                <>
                  <Logo item={i} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">{i.titulo}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${PONTO[i.tipo]}`} />
                      <span className="truncate">{i.origem}</span>
                      <span className="shrink-0">{ha(i.data)}</span>
                    </span>
                  </span>
                  {i.link && <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary shrink-0 transition-colors" />}
                </>
              );
              const classe = "group flex items-center gap-3 rounded-xl px-2 py-2.5 [&_span.shadow-sm]:border [&_span.shadow-sm]:border-border/60";
              return (
                <li key={i.id}>
                  {i.link ? (
                    <a href={i.link} target="_blank" rel="noopener noreferrer" className={`${classe} hover:bg-muted/50 transition-colors`}>
                      {Corpo}
                    </a>
                  ) : (
                    <div className={classe}>{Corpo}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {resto.length > lista.length && (
            <div className="px-5 pb-4">
              <Button variant="outline" size="sm" className="w-full rounded-full" onClick={() => setExtras((e) => e + 4)}>
                Ver mais {Math.min(4, resto.length - lista.length)} de {resto.length - lista.length}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
