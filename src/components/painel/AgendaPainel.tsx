import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, parseISO, startOfDay, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Calendar, Check, ChevronLeft, ChevronRight, Plus, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Cabecalho, CARTAO } from "./comum";

interface Item {
  id: string;
  origemId: string;
  tipo: "evento" | "reuniao";
  titulo: string;
  inicio: string;
  cor: string;
}

/** Calendário do mês com os eventos do usuário e as reuniões agendadas. */
export function AgendaPainel({ podeAgenda, podeReunioes }: { podeAgenda: boolean; podeReunioes: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mes, setMes] = useState(new Date());
  const [dia, setDia] = useState<Date | null>(new Date());
  const inicio = startOfWeek(startOfMonth(mes), { locale: ptBR });
  const fim = endOfWeek(endOfMonth(mes), { locale: ptBR });
  const chave = ["painel_agenda", user?.id, format(mes, "yyyy-MM"), podeAgenda, podeReunioes];

  const { data: itens = [] } = useQuery({
    queryKey: chave,
    enabled: !!user,
    refetchInterval: 120_000,
    queryFn: async () => {
      const [ev, re] = await Promise.all([
        podeAgenda
          ? supabase.from("eventos").select("id, titulo, data_inicio, cor").eq("user_id", user!.id).gte("data_inicio", inicio.toISOString()).lte("data_inicio", fim.toISOString())
          : Promise.resolve({ data: [] as { id: string; titulo: string; data_inicio: string; cor: string | null }[] }),
        podeReunioes
          ? supabase
              .from("meeting_rooms")
              .select("id, nome, agendado_para, status")
              .not("agendado_para", "is", null)
              .neq("status", "finalizada")
              .gte("agendado_para", inicio.toISOString())
              .lte("agendado_para", fim.toISOString())
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

  const hoje = startOfDay(new Date());
  const doDia = dia ? itens.filter((i) => isSameDay(parseISO(i.inicio), dia)) : [];
  const proximos = itens.filter((i) => parseISO(i.inicio) >= hoje && (!dia || !isSameDay(parseISO(i.inicio), dia))).slice(0, 4);

  const concluir = async (i: Item) => {
    const { error } = await supabase.from("eventos").delete().eq("id", i.origemId);
    if (error) return toast.error("Não foi possível concluir o evento");
    toast.success("Evento concluído");
    qc.invalidateQueries({ queryKey: ["painel_agenda"] });
  };

  const Linha = ({ i, comData }: { i: Item; comData?: boolean }) => (
    <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors group">
      <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: i.cor }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{i.titulo}</p>
        <p className="text-[11px] text-muted-foreground">
          {format(parseISO(i.inicio), comData ? "EEE, dd/MM · HH:mm" : "HH:mm", { locale: ptBR })} · {i.tipo === "reuniao" ? "Reunião" : "Evento"}
        </p>
      </div>
      {i.tipo === "reuniao" ? (
        <Link to={`/video/${i.origemId}`}>
          <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 rounded-lg text-violet-600">
            <Video className="h-3.5 w-3.5 mr-1" /> Entrar
          </Button>
        </Link>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 text-emerald-600"
          title="Concluir (remove da agenda)"
          onClick={() => concluir(i)}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  return (
    <Card className={CARTAO}>
      <CardHeader className="pb-3 pt-4 px-5">
        <Cabecalho
          icone={Calendar}
          cor="bg-primary/10 text-primary"
          titulo="Agenda e reuniões"
          direita={
            <div className="flex items-center gap-1.5">
              {podeReunioes && (
                <Link to="/video">
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 rounded-lg">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Reunião
                  </Button>
                </Link>
              )}
              {podeAgenda && (
                <Link to="/agenda" className="text-xs text-primary hover:underline">
                  Abrir agenda
                </Link>
              )}
            </div>
          }
        />
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="shrink-0 sm:w-[250px]">
            <div className="flex items-center justify-between mb-2">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMes(subMonths(mes, 1))} aria-label="Mês anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold capitalize">{format(mes, "MMMM yyyy", { locale: ptBR })}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMes(addMonths(mes, 1))} aria-label="Próximo mês">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                <div key={i} className="text-center text-[11px] font-semibold text-muted-foreground/60 py-1">
                  {d}
                </div>
              ))}
              {dias.map((d) => {
                const doMes = d.getMonth() === mes.getMonth();
                const eHoje = isSameDay(d, new Date());
                const sel = !!dia && isSameDay(d, dia);
                const tem = itens.some((i) => isSameDay(parseISO(i.inicio), d));
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    disabled={!doMes}
                    onClick={() => setDia(sel ? null : d)}
                    className={`relative flex items-center justify-center aspect-square text-[13px] ${doMes ? "cursor-pointer" : "text-muted-foreground/25"}`}
                  >
                    <span
                      className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                        sel ? "bg-primary text-primary-foreground font-bold" : eHoje ? "bg-primary/15 text-primary font-bold" : doMes ? "hover:bg-muted/60" : ""
                      }`}
                    >
                      {format(d, "d")}
                    </span>
                    {tem && doMes && !sel && <span className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            {dia && (
              <div>
                <p className="text-xs font-semibold capitalize text-muted-foreground mb-1">{format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
                {doDia.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Nada marcado neste dia.</p>
                ) : (
                  doDia.map((i) => <Linha key={i.id} i={i} />)
                )}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Próximos compromissos</p>
              {proximos.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Sem compromissos à frente neste mês.</p>
              ) : (
                proximos.map((i) => <Linha key={i.id} i={i} comData />)
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
