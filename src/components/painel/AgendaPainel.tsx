import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, endOfMonth, endOfWeek, format, formatDistanceToNowStrict, isSameDay, parseISO, startOfDay, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Plus, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CARTAO } from "./comum";

interface Item {
  id: string;
  origemId: string;
  tipo: "evento" | "reuniao";
  titulo: string;
  inicio: string;
  cor: string;
}

const hora = (iso: string) => format(parseISO(iso), "HH:mm");

/**
 * Agenda do painel: o próximo compromisso em destaque, o mês para navegar, o
 * dia escolhido com lembrete rápido e o que vem pela frente.
 */
export function AgendaPainel({ podeAgenda, podeReunioes }: { podeAgenda: boolean; podeReunioes: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mes, setMes] = useState(new Date());
  const [dia, setDia] = useState<Date>(new Date());
  const [novo, setNovo] = useState("");
  const [novoHora, setNovoHora] = useState("09:00");
  const [salvando, setSalvando] = useState(false);
  const inicio = startOfWeek(startOfMonth(mes), { locale: ptBR });
  const fim = endOfWeek(endOfMonth(mes), { locale: ptBR });

  const { data: itens = [] } = useQuery({
    queryKey: ["painel_agenda", user?.id, format(mes, "yyyy-MM"), podeAgenda, podeReunioes],
    enabled: !!user,
    refetchInterval: 120_000,
    queryFn: async () => {
      // do começo da grade até 45 dias à frente de hoje, para o "próximo" não depender do mês aberto
      const ate = new Date(Math.max(fim.getTime(), Date.now() + 45 * 86_400_000)).toISOString();
      const de = new Date(Math.min(inicio.getTime(), startOfDay(new Date()).getTime())).toISOString();
      const [ev, re] = await Promise.all([
        podeAgenda
          ? supabase.from("eventos").select("id, titulo, data_inicio, cor").eq("user_id", user!.id).gte("data_inicio", de).lte("data_inicio", ate)
          : Promise.resolve({ data: [] as { id: string; titulo: string; data_inicio: string; cor: string | null }[] }),
        podeReunioes
          ? supabase.from("meeting_rooms").select("id, nome, agendado_para, status").not("agendado_para", "is", null).neq("status", "finalizada").gte("agendado_para", de).lte("agendado_para", ate)
          : Promise.resolve({ data: [] as { id: string; nome: string; agendado_para: string | null }[] }),
      ]);
      const lista: Item[] = [
        ...(ev.data ?? []).map((e) => ({ id: `e-${e.id}`, origemId: e.id, tipo: "evento" as const, titulo: e.titulo, inicio: e.data_inicio, cor: e.cor || "#3b82f6" })),
        ...(re.data ?? []).map((r) => ({ id: `r-${r.id}`, origemId: r.id, tipo: "reuniao" as const, titulo: r.nome, inicio: r.agendado_para!, cor: "#8b5cf6" })),
      ];
      return lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
    },
  });

  useEffect(() => {
    const canal = supabase
      .channel("painel_agenda")
      .on("postgres_changes", { event: "*", schema: "public", table: "eventos" }, () => qc.invalidateQueries({ queryKey: ["painel_agenda"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_rooms" }, () => qc.invalidateQueries({ queryKey: ["painel_agenda"] }))
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [qc]);

  const dias = useMemo(() => {
    const d: Date[] = [];
    for (let x = inicio; x <= fim; x = addDays(x, 1)) d.push(x);
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  const agora = new Date();
  const futuros = itens.filter((i) => parseISO(i.inicio) >= agora);
  const proximo = futuros[0] ?? null;
  const doDia = itens.filter((i) => isSameDay(parseISO(i.inicio), dia));
  const depois = futuros.filter((i) => i.id !== proximo?.id && !isSameDay(parseISO(i.inicio), dia)).slice(0, 4);
  const noMes = itens.filter((i) => parseISO(i.inicio).getMonth() === mes.getMonth() && parseISO(i.inicio).getFullYear() === mes.getFullYear());
  const eHoje = isSameDay(dia, agora);

  const concluir = async (i: Item) => {
    const { error } = await supabase.from("eventos").delete().eq("id", i.origemId);
    if (error) return toast.error("Não foi possível concluir o lembrete");
    toast.success("Lembrete concluído");
    qc.invalidateQueries({ queryKey: ["painel_agenda"] });
  };

  const adicionar = async () => {
    const titulo = novo.trim();
    if (titulo.length < 2) return toast.error("Escreva o lembrete");
    const [h, m] = novoHora.split(":").map(Number);
    const quando = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h || 0, m || 0);
    setSalvando(true);
    const { error } = await supabase.from("eventos").insert({
      user_id: user!.id,
      titulo,
      data_inicio: quando.toISOString(),
      data_fim: new Date(quando.getTime() + 3_600_000).toISOString(),
    });
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar o lembrete");
    setNovo("");
    toast.success(`Lembrete marcado para ${format(quando, "dd/MM 'às' HH:mm")}`);
    qc.invalidateQueries({ queryKey: ["painel_agenda"] });
  };

  const Linha = ({ i, comData }: { i: Item; comData?: boolean }) => (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/50 transition-colors">
      <span className="w-12 shrink-0 text-center">
        <span className="block text-sm font-bold tabular-nums leading-none">{hora(i.inicio)}</span>
        {comData && <span className="block text-[11px] text-muted-foreground capitalize mt-0.5">{format(parseISO(i.inicio), "EEE dd", { locale: ptBR })}</span>}
      </span>
      <span className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: i.cor }} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">{i.titulo}</span>
        <span className="block text-xs text-muted-foreground">{i.tipo === "reuniao" ? "Reunião" : "Lembrete"}</span>
      </span>
      {i.tipo === "reuniao" ? (
        <Link to={`/video/${i.origemId}`}>
          <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 rounded-full text-violet-600">
            <Video className="h-3.5 w-3.5 mr-1" /> Entrar
          </Button>
        </Link>
      ) : (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 text-emerald-600" title="Concluir (remove da agenda)" onClick={() => concluir(i)}>
          <Check className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  return (
    <section className={`${CARTAO} overflow-hidden flex flex-col h-full`} aria-label="Agenda">
      <header className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Agenda</h2>
          <p className="text-xs text-muted-foreground">
            {noMes.length
              ? `${noMes.length} ${noMes.length === 1 ? "compromisso" : "compromissos"} em ${format(mes, "MMMM", { locale: ptBR })}`
              : `Nada marcado em ${format(mes, "MMMM", { locale: ptBR })}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {podeReunioes && (
            <Link to="/video">
              <Button size="sm" variant="outline" className="h-8 text-xs px-3 rounded-full">
                <Video className="h-3.5 w-3.5 mr-1" /> Nova reunião
              </Button>
            </Link>
          )}
          {podeAgenda && (
            <Link to="/agenda">
              <Button size="sm" variant="ghost" className="h-8 text-xs px-3 rounded-full">
                Abrir agenda
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Próximo compromisso: só quando existe um */}
      {proximo && (
        <div className="px-3 pb-3">
          <div className="rounded-2xl bg-gradient-to-r from-emerald-900 via-teal-800 to-cyan-700 text-white px-4 py-2.5 flex items-center gap-3">
            <span className="shrink-0 rounded-xl bg-white/15 px-2.5 py-1 text-center leading-tight">
              <span className="block text-[10px] capitalize text-white/80">{isSameDay(parseISO(proximo.inicio), agora) ? "Hoje" : format(parseISO(proximo.inicio), "EEE dd/MM", { locale: ptBR })}</span>
              <span className="block text-base font-bold tabular-nums">{hora(proximo.inicio)}</span>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs text-white/75">Próximo compromisso, em {formatDistanceToNowStrict(parseISO(proximo.inicio), { locale: ptBR })}</span>
              <span className="block text-sm font-bold truncate">{proximo.titulo}</span>
            </span>
            {proximo.tipo === "reuniao" && (
              <Link to={`/video/${proximo.origemId}`} className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white text-slate-900 text-xs font-semibold px-3 py-1.5 hover:bg-white/90 transition-colors">
                <Video className="h-3.5 w-3.5" /> Entrar
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Mês na largura toda: cada dia é uma faixa com o que está marcado */}
      <div className="px-5 flex-1 flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="flex items-center gap-1">
            <span className="text-sm font-bold capitalize mr-1">{format(mes, "MMMM yyyy", { locale: ptBR })}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => setMes(subMonths(mes, 1))} aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs rounded-full"
              onClick={() => {
                setMes(new Date());
                setDia(new Date());
              }}
            >
              Hoje
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => setMes(addMonths(mes, 1))} aria-label="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </span>
          <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> Lembrete
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-violet-500" /> Reunião
            </span>
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1 flex-1 auto-rows-fr">
          {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
            <div key={d} className="text-[11px] font-medium text-muted-foreground/70 px-2 self-end">
              {d}
            </div>
          ))}
          {dias.map((d) => {
            const doMes = d.getMonth() === mes.getMonth();
            const hoje = isSameDay(d, agora);
            const sel = isSameDay(d, dia);
            const qtd = itens.filter((i) => isSameDay(parseISO(i.inicio), d));
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => {
                  setDia(d);
                  if (!doMes) setMes(d);
                }}
                aria-pressed={sel}
                aria-label={format(d, "d 'de' MMMM", { locale: ptBR }) + (qtd.length ? `, ${qtd.length} compromisso(s)` : "")}
                className={`min-h-[38px] rounded-lg px-2 py-1 text-left flex flex-col justify-between overflow-hidden transition-colors ${
                  sel
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : hoje
                      ? "bg-primary/10 text-primary ring-1 ring-primary/40"
                      : doMes
                        ? "bg-muted/40 hover:bg-muted"
                        : "text-muted-foreground/40 hover:bg-muted/40"
                }`}
              >
                <span className={`text-[13px] leading-none tabular-nums ${sel || hoje ? "font-bold" : "font-medium"}`}>{format(d, "d")}</span>
                {qtd.length > 0 && (
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: sel ? "currentColor" : qtd[0].cor }} />
                    <span className={`text-[10px] leading-tight truncate ${sel ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                      {qtd.length > 1 ? `${qtd.length} itens` : qtd[0].titulo}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dia escolhido, lembrete rápido e o que vem depois */}
      <div className="px-5 pt-3 pb-4 space-y-2">
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <p className="text-sm font-bold capitalize shrink-0">{eHoje ? "Hoje" : format(dia, "EEE, dd/MM", { locale: ptBR })}</p>
          {podeAgenda ? (
            <form
              className="flex-1 min-w-0 flex items-center gap-1.5 rounded-full bg-muted/60 pl-2 pr-1 py-1"
              onSubmit={(e) => {
                e.preventDefault();
                adicionar();
              }}
            >
              <Input
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                maxLength={120}
                placeholder={doDia.length ? "Adicionar outro lembrete" : "Dia livre. Escreva um lembrete"}
                aria-label="Novo lembrete"
                className="h-7 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm px-2"
              />
              <Input type="time" value={novoHora} onChange={(e) => setNovoHora(e.target.value)} aria-label="Horário" className="h-7 w-[88px] shrink-0 border-0 bg-background rounded-full text-sm px-2" />
              <Button type="submit" size="icon" className="h-7 w-7 shrink-0 rounded-full" disabled={salvando || novo.trim().length < 2} aria-label="Adicionar lembrete">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            doDia.length === 0 && <p className="text-sm text-muted-foreground">Dia livre.</p>
          )}
        </div>
        {doDia.length > 0 && (
          <div className="max-h-[104px] overflow-y-auto">
            {doDia.map((i) => (
              <Linha key={i.id} i={i} />
            ))}
          </div>
        )}
        {depois.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Vem depois</p>
            <div className="grid sm:grid-cols-2 gap-x-3">
              {depois.slice(0, 2).map((i) => (
                <Linha key={i.id} i={i} comData />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
