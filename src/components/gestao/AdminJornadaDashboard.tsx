import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coffee,
  LogIn,
  LogOut,
  Users,
  Timer,
  UserX,
  Sparkles,
} from "lucide-react";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type Funcionario = {
  id: string;
  nome: string;
  cargo: string | null;
  foto_url: string | null;
  horario_entrada: string | null;
  horario_almoco_inicio: string | null;
  horario_almoco_fim: string | null;
  horario_saida: string | null;
  tolerancia_atraso_minutos: number | null;
  ativo: boolean | null;
};

type Registro = {
  id: string;
  funcionario_id: string;
  tipo: string;
  data_hora: string;
};

type Status =
  | "ausente"
  | "atrasado"
  | "trabalhando"
  | "almoco"
  | "encerrado"
  | "pendente_volta";

interface FuncionarioStatus {
  funcionario: Funcionario;
  status: Status;
  ultimoRegistro?: Registro;
  entradaHora?: string;
  almocoInicio?: string;
  almocoFim?: string;
  saidaHora?: string;
  minutosAtraso?: number;
  minutosAlmoco?: number;
  minutosTrabalhados?: number;
}

const statusMeta: Record<
  Status,
  { label: string; color: string; bg: string; ring: string; icon: any }
> = {
  trabalhando: {
    label: "Trabalhando",
    color: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
    icon: CheckCircle2,
  },
  almoco: {
    label: "Em almoço",
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/30",
    icon: Coffee,
  },
  atrasado: {
    label: "Atrasado",
    color: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-500/10",
    ring: "ring-rose-500/30",
    icon: AlertTriangle,
  },
  ausente: {
    label: "Ausente",
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500/10",
    ring: "ring-slate-500/30",
    icon: UserX,
  },
  encerrado: {
    label: "Encerrado",
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-500/10",
    ring: "ring-blue-500/30",
    icon: LogOut,
  },
  pendente_volta: {
    label: "Almoço extrapolado",
    color: "text-orange-700 dark:text-orange-400",
    bg: "bg-orange-500/10",
    ring: "ring-orange-500/30",
    icon: Timer,
  },
};

const tipoIcon: Record<string, any> = {
  entrada: LogIn,
  saida_almoco: Coffee,
  volta_almoco: Coffee,
  saida: LogOut,
};

const tipoLabel: Record<string, string> = {
  entrada: "Entrada",
  saida_almoco: "Saída p/ almoço",
  volta_almoco: "Volta do almoço",
  saida: "Saída",
};

function parseHorario(horario: string | null, base: Date): Date | null {
  if (!horario) return null;
  const [h, m] = horario.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export default function AdminJornadaDashboard() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(new Date());

  // Tick a cada 30s para recalcular tempos relativos
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const todayEnd = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, []);

  const { data: funcionarios } = useQuery({
    queryKey: ["admin_dash_funcionarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select(
          "id, nome, cargo, foto_url, horario_entrada, horario_almoco_inicio, horario_almoco_fim, horario_saida, tolerancia_atraso_minutos, ativo"
        )
        .eq("ativo", true)
        .eq("bate_ponto", true)
        .order("nome");
      if (error) throw error;
      return (data || []) as Funcionario[];
    },
    refetchInterval: 60_000,
  });

  const { data: registrosHoje } = useQuery({
    queryKey: ["admin_dash_registros_hoje", todayStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registros_ponto")
        .select("id, funcionario_id, tipo, data_hora")
        .gte("data_hora", todayStart)
        .lte("data_hora", todayEnd)
        .order("data_hora", { ascending: true });
      if (error) throw error;
      return (data || []) as Registro[];
    },
    refetchInterval: 30_000,
  });

  // Realtime: ouvir inserts/updates da tabela
  useEffect(() => {
    const channel = supabase
      .channel("admin_dash_registros_ponto")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registros_ponto" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin_dash_registros_hoje"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const statuses: FuncionarioStatus[] = useMemo(() => {
    if (!funcionarios) return [];
    const baseDate = new Date();
    const tolerancia = 10;

    return funcionarios.map((f) => {
      const regs = (registrosHoje || [])
        .filter((r) => r.funcionario_id === f.id)
        .sort(
          (a, b) =>
            new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()
        );

      const entrada = regs.find((r) => r.tipo === "entrada");
      const saidaAlmoco = regs.find((r) => r.tipo === "saida_almoco");
      const voltaAlmoco = regs.find((r) => r.tipo === "volta_almoco");
      const saida = regs.find((r) => r.tipo === "saida");
      const ultimoRegistro = regs[regs.length - 1];

      const horarioEntradaEsperado = parseHorario(f.horario_entrada, baseDate);
      const horarioVoltaEsperado = parseHorario(f.horario_almoco_fim, baseDate);
      const tol = f.tolerancia_atraso_minutos ?? tolerancia;

      let status: Status = "ausente";
      let minutosAtraso: number | undefined;
      let minutosAlmoco: number | undefined;
      let minutosTrabalhados: number | undefined;

      if (saida) {
        status = "encerrado";
      } else if (saidaAlmoco && !voltaAlmoco) {
        status = "almoco";
        if (horarioVoltaEsperado) {
          const diff = differenceInMinutes(now, horarioVoltaEsperado);
          if (diff > tol) status = "pendente_volta";
        }
        minutosAlmoco = differenceInMinutes(now, parseISO(saidaAlmoco.data_hora));
      } else if (entrada) {
        status = "trabalhando";
        if (horarioEntradaEsperado) {
          const diff = differenceInMinutes(
            parseISO(entrada.data_hora),
            horarioEntradaEsperado
          );
          if (diff > tol) {
            minutosAtraso = diff;
            // mantém status "trabalhando" mas marca atraso visualmente
          }
        }
      } else {
        // sem entrada
        if (horarioEntradaEsperado) {
          const diff = differenceInMinutes(now, horarioEntradaEsperado);
          if (diff > tol) {
            status = "atrasado";
            minutosAtraso = diff;
          }
        }
      }

      // Cálculo de minutos trabalhados parcial
      if (entrada) {
        const ini = parseISO(entrada.data_hora);
        const fim = saida ? parseISO(saida.data_hora) : now;
        let total = differenceInMinutes(fim, ini);
        if (saidaAlmoco && voltaAlmoco) {
          total -= differenceInMinutes(
            parseISO(voltaAlmoco.data_hora),
            parseISO(saidaAlmoco.data_hora)
          );
        } else if (saidaAlmoco && !voltaAlmoco) {
          total -= differenceInMinutes(now, parseISO(saidaAlmoco.data_hora));
        }
        minutosTrabalhados = Math.max(0, total);
      }

      return {
        funcionario: f,
        status,
        ultimoRegistro,
        entradaHora: entrada
          ? format(parseISO(entrada.data_hora), "HH:mm")
          : undefined,
        almocoInicio: saidaAlmoco
          ? format(parseISO(saidaAlmoco.data_hora), "HH:mm")
          : undefined,
        almocoFim: voltaAlmoco
          ? format(parseISO(voltaAlmoco.data_hora), "HH:mm")
          : undefined,
        saidaHora: saida ? format(parseISO(saida.data_hora), "HH:mm") : undefined,
        minutosAtraso,
        minutosAlmoco,
        minutosTrabalhados,
      };
    });
  }, [funcionarios, registrosHoje, now]);

  const totals = useMemo(() => {
    const t = {
      total: statuses.length,
      trabalhando: 0,
      almoco: 0,
      atrasado: 0,
      ausente: 0,
      encerrado: 0,
      pendente_volta: 0,
      atrasoMinutos: 0,
    };
    statuses.forEach((s) => {
      t[s.status]++;
      if (s.minutosAtraso) t.atrasoMinutos += s.minutosAtraso;
    });
    return t;
  }, [statuses]);

  const presentes = totals.trabalhando + totals.almoco + totals.pendente_volta;
  const taxaPresenca = totals.total
    ? Math.round(((presentes + totals.encerrado) / totals.total) * 100)
    : 0;

  const pieData = [
    { name: "Trabalhando", value: totals.trabalhando, color: "hsl(142 71% 45%)" },
    { name: "Em almoço", value: totals.almoco, color: "hsl(38 92% 50%)" },
    { name: "Almoço extrapolado", value: totals.pendente_volta, color: "hsl(24 95% 53%)" },
    { name: "Atrasado", value: totals.atrasado, color: "hsl(346 87% 50%)" },
    { name: "Ausente", value: totals.ausente, color: "hsl(215 16% 47%)" },
    { name: "Encerrado", value: totals.encerrado, color: "hsl(217 91% 60%)" },
  ].filter((d) => d.value > 0);

  // Histograma: registros por hora (hoje)
  const registrosPorHora = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (let h = 6; h <= 22; h++) buckets[`${h.toString().padStart(2, "0")}h`] = 0;
    (registrosHoje || []).forEach((r) => {
      const h = format(parseISO(r.data_hora), "HH") + "h";
      if (buckets[h] !== undefined) buckets[h]++;
    });
    return Object.entries(buckets).map(([hora, total]) => ({ hora, total }));
  }, [registrosHoje]);

  const ultimosEventos = useMemo(() => {
    return (registrosHoje || [])
      .slice()
      .sort(
        (a, b) =>
          new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
      )
      .slice(0, 8)
      .map((r) => {
        const f = funcionarios?.find((x) => x.id === r.funcionario_id);
        return { ...r, funcionario: f };
      });
  }, [registrosHoje, funcionarios]);

  const atrasados = statuses.filter(
    (s) => s.status === "atrasado" || (s.minutosAtraso && s.minutosAtraso > 0)
  );
  const emAlmoco = statuses.filter(
    (s) => s.status === "almoco" || s.status === "pendente_volta"
  );

  const initials = (nome: string) =>
    nome
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              Painel em Tempo Real
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {format(now, "EEEE, dd 'de' MMMM", { locale: ptBR })} ·{" "}
              {format(now, "HH:mm")} · {totals.total} colaboradores ativos
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Atualização automática
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon={Users}
          label="Total"
          value={totals.total}
          tone="bg-slate-500/10 text-slate-700 dark:text-slate-300"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Trabalhando"
          value={totals.trabalhando}
          tone="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        />
        <KpiCard
          icon={Coffee}
          label="Em almoço"
          value={totals.almoco}
          tone="bg-amber-500/10 text-amber-700 dark:text-amber-400"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Atrasados"
          value={totals.atrasado}
          tone="bg-rose-500/10 text-rose-700 dark:text-rose-400"
        />
        <KpiCard
          icon={UserX}
          label="Ausentes"
          value={totals.ausente}
          tone="bg-slate-500/10 text-slate-700 dark:text-slate-300"
        />
        <KpiCard
          icon={LogOut}
          label="Encerrados"
          value={totals.encerrado}
          tone="bg-blue-500/10 text-blue-700 dark:text-blue-400"
        />
      </div>

      {/* Linha 2: Presença + Distribuição + Atividade */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Taxa de presença</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold">{taxaPresenca}%</span>
              <span className="text-xs text-muted-foreground">
                {presentes + totals.encerrado}/{totals.total}
              </span>
            </div>
            <Progress value={taxaPresenca} className="h-2" />
            <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
              <Mini label="Presentes" value={presentes} dot="bg-emerald-500" />
              <Mini label="Encerrados" value={totals.encerrado} dot="bg-blue-500" />
              <Mini label="Faltantes" value={totals.atrasado + totals.ausente} dot="bg-rose-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Distribuição agora</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground">
                Sem dados ainda
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={2}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Batidas por hora</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={registrosPorHora}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <ReTooltip
                  contentStyle={{
                    borderRadius: 8,
                    fontSize: 12,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))",
                  }}
                />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Linha 3: Atrasados / Em almoço / Últimos eventos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ListCard
          title="Atrasados / Sem entrada"
          icon={AlertTriangle}
          tone="text-rose-600"
          empty="Ninguém atrasado 🎉"
          items={atrasados.map((s) => ({
            id: s.funcionario.id,
            nome: s.funcionario.nome,
            cargo: s.funcionario.cargo,
            foto: s.funcionario.foto_url,
            right: s.minutosAtraso
              ? `+${s.minutosAtraso}min`
              : "Sem entrada",
            sub: s.entradaHora
              ? `Entrou ${s.entradaHora}`
              : `Esperado ${s.funcionario.horario_entrada || "--"}`,
            status: s.status,
          }))}
        />

        <ListCard
          title="Em horário de almoço"
          icon={Coffee}
          tone="text-amber-600"
          empty="Ninguém em almoço"
          items={emAlmoco.map((s) => ({
            id: s.funcionario.id,
            nome: s.funcionario.nome,
            cargo: s.funcionario.cargo,
            foto: s.funcionario.foto_url,
            right: s.minutosAlmoco ? `${s.minutosAlmoco}min` : "—",
            sub:
              s.status === "pendente_volta"
                ? "⚠ Volta atrasada"
                : `Saiu ${s.almocoInicio || "--"}`,
            status: s.status,
          }))}
        />

        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Últimas batidas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[280px] px-4 pb-4">
              {ultimosEventos.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  Nenhuma batida hoje
                </p>
              ) : (
                <ul className="space-y-2">
                  {ultimosEventos.map((ev) => {
                    const Icon = tipoIcon[ev.tipo] || Clock;
                    return (
                      <li
                        key={ev.id}
                        className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/30 px-3 py-2"
                      >
                        <div className="h-8 w-8 rounded-lg bg-background border flex items-center justify-center">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {ev.funcionario?.nome || "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {tipoLabel[ev.tipo] || ev.tipo}
                          </p>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">
                          {format(parseISO(ev.data_hora), "HH:mm")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Linha 4: Lista geral de colaboradores */}
      <Card className="rounded-2xl border-border/50">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Acompanhamento de colaboradores
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Atualizado {format(now, "HH:mm")}
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {statuses.map((s) => {
              const meta = statusMeta[s.status];
              const Icon = meta.icon;
              const atrasoFlag = !!s.minutosAtraso && s.status === "trabalhando";
              return (
                <div
                  key={s.funcionario.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-border/50 bg-card px-3 py-2.5 hover:shadow-sm transition-all",
                    "ring-1",
                    meta.ring
                  )}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={s.funcionario.foto_url || undefined} />
                    <AvatarFallback className="text-[10px]">
                      {initials(s.funcionario.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {s.funcionario.nome}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
                          meta.bg,
                          meta.color
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                      {atrasoFlag && (
                        <span className="text-rose-600">+{s.minutosAtraso}min</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Entrada</p>
                    <p className="text-xs font-mono">
                      {s.entradaHora || "--:--"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card className="rounded-2xl border-border/50">
      <CardContent className="p-3">
        <div className="flex items-center gap-2.5">
          <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", tone)}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
            <p className="text-xl font-bold leading-tight">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold">{value}</span>
    </div>
  );
}

function ListCard({
  title,
  icon: Icon,
  tone,
  items,
  empty,
}: {
  title: string;
  icon: any;
  tone: string;
  empty: string;
  items: {
    id: string;
    nome: string;
    cargo: string | null;
    foto: string | null;
    right: string;
    sub: string;
    status: string;
  }[];
}) {
  const initials = (nome: string) =>
    nome
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className={cn("h-4 w-4", tone)} />
          {title}
          <Badge variant="secondary" className="ml-auto">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px] px-4 pb-4">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">{empty}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/30 px-3 py-2"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={it.foto || undefined} />
                    <AvatarFallback className="text-[10px]">
                      {initials(it.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{it.nome}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {it.sub}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold">{it.right}</span>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
