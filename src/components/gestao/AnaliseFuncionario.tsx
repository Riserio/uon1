import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  User,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Award,
  Target,
  Calendar,
  Coffee,
  MessageSquare,
  Sparkles,
  Activity,
  Zap,
} from "lucide-react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  differenceInMinutes,
  eachDayOfInterval,
  isWeekend,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
} from "recharts";

interface Funcionario {
  id: string;
  nome: string;
  cargo: string | null;
  foto_url: string | null;
  horario_entrada: string | null;
  horario_almoco_inicio: string | null;
  horario_almoco_fim: string | null;
  horario_saida: string | null;
  carga_horaria_semanal: number | null;
  tolerancia_atraso_minutos: number | null;
}

function parseHorario(h: string | null, base: Date): Date | null {
  if (!h) return null;
  const [hh, mm] = h.split(":").map(Number);
  const d = new Date(base);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}

export default function AnaliseFuncionario() {
  const [funcionarioId, setFuncionarioId] = useState<string>("");
  const [mesOffset, setMesOffset] = useState(0); // 0 = mês atual
  const [feedback, setFeedback] = useState("");

  const periodo = useMemo(() => {
    const ref = new Date();
    ref.setMonth(ref.getMonth() - mesOffset);
    return { inicio: startOfMonth(ref), fim: endOfMonth(ref), ref };
  }, [mesOffset]);

  const { data: funcionarios } = useQuery({
    queryKey: ["analise_funcionarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select(
          "id, nome, cargo, foto_url, horario_entrada, horario_almoco_inicio, horario_almoco_fim, horario_saida, carga_horaria_semanal, tolerancia_atraso_minutos"
        )
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data || []) as Funcionario[];
    },
  });

  const funcionario = funcionarios?.find((f) => f.id === funcionarioId);

  const { data: registros } = useQuery({
    queryKey: ["analise_registros", funcionarioId, periodo.inicio.toISOString()],
    queryFn: async () => {
      if (!funcionarioId) return [];
      const { data, error } = await supabase
        .from("registros_ponto")
        .select("id, tipo, data_hora, ajustado")
        .eq("funcionario_id", funcionarioId)
        .gte("data_hora", periodo.inicio.toISOString())
        .lte("data_hora", periodo.fim.toISOString())
        .order("data_hora", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!funcionarioId,
  });

  // Agrupar por dia e calcular métricas
  const analise = useMemo(() => {
    if (!funcionario || !registros) return null;

    const dias = eachDayOfInterval({ start: periodo.inicio, end: periodo.fim });
    const tolerancia = funcionario.tolerancia_atraso_minutos ?? 10;
    const horasEsperadasDia =
      (funcionario.carga_horaria_semanal || 44) / 5;

    const porDia: Record<string, any> = {};
    registros.forEach((r) => {
      const dateKey = format(parseISO(r.data_hora), "yyyy-MM-dd");
      if (!porDia[dateKey]) porDia[dateKey] = {};
      porDia[dateKey][r.tipo] = r.data_hora;
      if (r.ajustado) porDia[dateKey].ajustado = true;
    });

    let diasTrabalhados = 0;
    let diasUteis = 0;
    let totalAtrasoMin = 0;
    let totalExtraMin = 0;
    let totalHorasMin = 0;
    let qtdAtrasos = 0;
    let qtdFaltas = 0;
    let qtdAlmocosLongos = 0;
    let qtdAjustes = 0;
    let qtdSaidasAntecipadas = 0;
    const evolucaoDiaria: { dia: string; saldo: number; horas: number }[] = [];
    const distribuicaoEntrada: Record<string, number> = {};

    dias.forEach((dia) => {
      const isWE = isWeekend(dia);
      if (!isWE) diasUteis++;
      const key = format(dia, "yyyy-MM-dd");
      const reg = porDia[key];

      if (!reg && !isWE) {
        qtdFaltas++;
        evolucaoDiaria.push({ dia: format(dia, "dd/MM"), saldo: -horasEsperadasDia * 60, horas: 0 });
        return;
      }
      if (!reg) return;

      diasTrabalhados++;
      if (reg.ajustado) qtdAjustes++;

      const entrada = reg.entrada ? parseISO(reg.entrada) : null;
      const sa = reg.saida_almoco ? parseISO(reg.saida_almoco) : null;
      const va = reg.volta_almoco ? parseISO(reg.volta_almoco) : null;
      const saida = reg.saida ? parseISO(reg.saida) : null;

      // Atraso
      if (entrada && funcionario.horario_entrada) {
        const esperado = parseHorario(funcionario.horario_entrada, dia);
        if (esperado) {
          const diff = differenceInMinutes(entrada, esperado);
          if (diff > tolerancia) {
            qtdAtrasos++;
            totalAtrasoMin += diff;
          }
          // bucket de hora
          const bucket = format(entrada, "HH:00");
          distribuicaoEntrada[bucket] = (distribuicaoEntrada[bucket] || 0) + 1;
        }
      }

      // Saída antecipada
      if (saida && funcionario.horario_saida) {
        const esperadoSaida = parseHorario(funcionario.horario_saida, dia);
        if (esperadoSaida && differenceInMinutes(esperadoSaida, saida) > tolerancia) {
          qtdSaidasAntecipadas++;
        }
      }

      // Almoço longo (>1h15)
      if (sa && va) {
        const dur = differenceInMinutes(va, sa);
        if (dur > 75) qtdAlmocosLongos++;
      }

      // Horas trabalhadas
      let horasMin = 0;
      if (entrada && saida) {
        horasMin = differenceInMinutes(saida, entrada);
        if (sa && va) horasMin -= differenceInMinutes(va, sa);
      }
      totalHorasMin += horasMin;

      const saldo = horasMin - horasEsperadasDia * 60;
      if (saldo > 0) totalExtraMin += saldo;

      evolucaoDiaria.push({
        dia: format(dia, "dd/MM"),
        saldo,
        horas: horasMin / 60,
      });
    });

    // Score de produtividade (0-100)
    const pontualidadeScore = Math.max(
      0,
      100 - qtdAtrasos * 8 - qtdFaltas * 15
    );
    const presencaScore = diasUteis
      ? Math.round((diasTrabalhados / diasUteis) * 100)
      : 0;
    const cargaHorariaScore =
      diasTrabalhados > 0
        ? Math.min(
            100,
            Math.round(
              (totalHorasMin / (diasTrabalhados * horasEsperadasDia * 60)) * 100
            )
          )
        : 0;
    const disciplinaScore = Math.max(
      0,
      100 - qtdAlmocosLongos * 5 - qtdSaidasAntecipadas * 6 - qtdAjustes * 3
    );
    const consistenciaScore = qtdFaltas === 0 && qtdAtrasos <= 2 ? 100 : Math.max(0, 100 - qtdFaltas * 20 - qtdAtrasos * 5);

    const scoreGeral = Math.round(
      (pontualidadeScore + presencaScore + cargaHorariaScore + disciplinaScore + consistenciaScore) / 5
    );

    const distribuicaoArr = Object.entries(distribuicaoEntrada)
      .sort()
      .map(([hora, qtd]) => ({ hora, qtd }));

    return {
      diasTrabalhados,
      diasUteis,
      totalAtrasoMin,
      totalExtraMin,
      totalHorasMin,
      qtdAtrasos,
      qtdFaltas,
      qtdAlmocosLongos,
      qtdAjustes,
      qtdSaidasAntecipadas,
      evolucaoDiaria,
      distribuicaoArr,
      pontualidadeScore,
      presencaScore,
      cargaHorariaScore,
      disciplinaScore,
      consistenciaScore,
      scoreGeral,
      horasEsperadasMes: diasUteis * horasEsperadasDia,
    };
  }, [registros, funcionario, periodo]);

  const initials = (nome: string) =>
    nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const fmtH = (min: number) => {
    const sign = min < 0 ? "-" : "";
    const abs = Math.abs(min);
    return `${sign}${Math.floor(abs / 60)}h${(abs % 60).toString().padStart(2, "0")}`;
  };

  const radarData = analise
    ? [
        { subject: "Pontualidade", A: analise.pontualidadeScore, fullMark: 100 },
        { subject: "Presença", A: analise.presencaScore, fullMark: 100 },
        { subject: "Carga horária", A: analise.cargaHorariaScore, fullMark: 100 },
        { subject: "Disciplina", A: analise.disciplinaScore, fullMark: 100 },
        { subject: "Consistência", A: analise.consistenciaScore, fullMark: 100 },
      ]
    : [];

  // Sugestões automáticas de feedback
  const sugestoes = useMemo(() => {
    if (!analise) return [];
    const s: { tipo: "positivo" | "atencao"; texto: string }[] = [];
    if (analise.qtdFaltas === 0)
      s.push({ tipo: "positivo", texto: "Sem faltas no período — excelente compromisso!" });
    if (analise.qtdAtrasos === 0)
      s.push({ tipo: "positivo", texto: "Pontualidade exemplar, sem atrasos registrados." });
    if (analise.totalExtraMin > 600)
      s.push({ tipo: "positivo", texto: `Acumulou ${fmtH(analise.totalExtraMin)} de horas extras — alta dedicação.` });
    if (analise.qtdAtrasos >= 3)
      s.push({ tipo: "atencao", texto: `Foram registrados ${analise.qtdAtrasos} atrasos. Vale conversar sobre rotina matinal.` });
    if (analise.qtdFaltas > 0)
      s.push({ tipo: "atencao", texto: `${analise.qtdFaltas} falta(s) sem registro de ponto. Verificar justificativas.` });
    if (analise.qtdAlmocosLongos >= 3)
      s.push({ tipo: "atencao", texto: `${analise.qtdAlmocosLongos} almoços acima de 1h15 — alinhar duração de pausa.` });
    if (analise.qtdAjustes >= 5)
      s.push({ tipo: "atencao", texto: `${analise.qtdAjustes} ajustes manuais de ponto — reforçar bater ponto no horário.` });
    if (analise.qtdSaidasAntecipadas >= 3)
      s.push({ tipo: "atencao", texto: `${analise.qtdSaidasAntecipadas} saídas antecipadas registradas.` });
    return s;
  }, [analise]);

  const copiarFeedback = () => {
    if (!analise || !funcionario) return;
    const texto = `📊 Feedback de Desempenho - ${funcionario.nome}
Período: ${format(periodo.inicio, "MMMM yyyy", { locale: ptBR })}

Score Geral: ${analise.scoreGeral}/100

✅ Pontos fortes:
${sugestoes.filter((s) => s.tipo === "positivo").map((s) => `• ${s.texto}`).join("\n") || "—"}

⚠️ Pontos de atenção:
${sugestoes.filter((s) => s.tipo === "atencao").map((s) => `• ${s.texto}`).join("\n") || "—"}

Resumo do período:
• Dias trabalhados: ${analise.diasTrabalhados}/${analise.diasUteis}
• Atrasos: ${analise.qtdAtrasos} (${fmtH(analise.totalAtrasoMin)})
• Horas extras: ${fmtH(analise.totalExtraMin)}
• Faltas: ${analise.qtdFaltas}

${feedback ? `Observações do gestor:\n${feedback}` : ""}`;
    navigator.clipboard.writeText(texto);
    toast.success("Feedback copiado para área de transferência!");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-end justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Análise de Desempenho</h2>
            <p className="text-xs text-muted-foreground">
              Ferramenta de acompanhamento e feedback individual
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={funcionarioId} onValueChange={setFuncionarioId}>
            <SelectTrigger className="w-[260px]">
              <User className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Selecione um funcionário" />
            </SelectTrigger>
            <SelectContent>
              {funcionarios?.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome} {f.cargo ? `· ${f.cargo}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(mesOffset)} onValueChange={(v) => setMesOffset(Number(v))}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                return (
                  <SelectItem key={i} value={String(i)}>
                    {format(d, "MMMM yyyy", { locale: ptBR })}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!funcionario ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-16 text-center">
            <User className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              Selecione um funcionário para iniciar a análise
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Veja métricas de pontualidade, presença e gere um feedback estruturado
            </p>
          </CardContent>
        </Card>
      ) : !analise ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Carregando análise...
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Card do funcionário com score */}
          <Card className="rounded-2xl border-border/50 overflow-hidden">
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 ring-2 ring-primary/20">
                    <AvatarImage src={funcionario.foto_url || undefined} />
                    <AvatarFallback className="text-lg">{initials(funcionario.nome)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-xl font-bold">{funcionario.nome}</h3>
                    <p className="text-sm text-muted-foreground">{funcionario.cargo || "Sem cargo"}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {funcionario.horario_entrada || "--"} → {funcionario.horario_saida || "--"}
                      </Badge>
                      <Badge variant="secondary">
                        {funcionario.carga_horaria_semanal || 44}h/semana
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="relative inline-flex">
                    <svg className="h-24 w-24 -rotate-90">
                      <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="6" fill="none" className="text-muted" />
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="currentColor"
                        strokeWidth="6"
                        fill="none"
                        strokeDasharray={`${(analise.scoreGeral / 100) * 251.2} 251.2`}
                        strokeLinecap="round"
                        className={cn(
                          analise.scoreGeral >= 80
                            ? "text-emerald-500"
                            : analise.scoreGeral >= 60
                            ? "text-amber-500"
                            : "text-rose-500"
                        )}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold">{analise.scoreGeral}</span>
                      <span className="text-[10px] text-muted-foreground">/100</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Score geral</p>
                </div>
              </div>
            </div>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={CheckCircle2} label="Dias trabalhados" value={`${analise.diasTrabalhados}/${analise.diasUteis}`} tone="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" />
            <Kpi icon={AlertTriangle} label="Atrasos" value={analise.qtdAtrasos} sub={fmtH(analise.totalAtrasoMin)} tone="bg-rose-500/10 text-rose-700 dark:text-rose-400" />
            <Kpi icon={TrendingUp} label="Horas extras" value={fmtH(analise.totalExtraMin)} tone="bg-blue-500/10 text-blue-700 dark:text-blue-400" />
            <Kpi icon={TrendingDown} label="Faltas" value={analise.qtdFaltas} tone="bg-orange-500/10 text-orange-700 dark:text-orange-400" />
            <Kpi icon={Coffee} label="Almoços longos" value={analise.qtdAlmocosLongos} tone="bg-amber-500/10 text-amber-700 dark:text-amber-400" />
            <Kpi icon={Zap} label="Ajustes manuais" value={analise.qtdAjustes} tone="bg-purple-500/10 text-purple-700 dark:text-purple-400" />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Radar */}
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Perfil de competências
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Radar dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Evolução diária */}
            <Card className="rounded-2xl border-border/50 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Saldo diário (minutos)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={analise.evolucaoDiaria}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="dia" tick={{ fontSize: 9 }} interval={2} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <ReTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 12,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--popover))",
                      }}
                    />
                    <Line type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Distribuição de entrada + scores detalhados */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="rounded-2xl border-border/50 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Horários de entrada
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analise.distribuicaoArr.length === 0 ? (
                  <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
                    Sem dados
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={analise.distribuicaoArr}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <ReTooltip
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 12,
                          border: "1px solid hsl(var(--border))",
                          background: "hsl(var(--popover))",
                        }}
                      />
                      <Bar dataKey="qtd" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  Indicadores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScoreRow label="Pontualidade" value={analise.pontualidadeScore} />
                <ScoreRow label="Presença" value={analise.presencaScore} />
                <ScoreRow label="Carga horária" value={analise.cargaHorariaScore} />
                <ScoreRow label="Disciplina" value={analise.disciplinaScore} />
                <ScoreRow label="Consistência" value={analise.consistenciaScore} />
              </CardContent>
            </Card>
          </div>

          {/* Insights e Feedback */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="rounded-2xl border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Insights automáticos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[240px] pr-3">
                  {sugestoes.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-8 text-center">
                      Sem dados suficientes para gerar insights
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {sugestoes.map((s, i) => (
                        <li
                          key={i}
                          className={cn(
                            "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                            s.tipo === "positivo"
                              ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-900 dark:text-emerald-200"
                              : "bg-amber-500/5 border-amber-500/20 text-amber-900 dark:text-amber-200"
                          )}
                        >
                          {s.tipo === "positivo" ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                          )}
                          <span>{s.texto}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Anotações para feedback
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Escreva observações pessoais para a conversa de feedback..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="min-h-[160px] text-sm"
                />
                <Button onClick={copiarFeedback} className="w-full gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Copiar resumo de feedback
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
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
            <p className="text-lg font-bold leading-tight">{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
