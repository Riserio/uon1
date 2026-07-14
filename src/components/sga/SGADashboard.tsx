import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, RadialBarChart, RadialBar } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, Car, MapPin, Calendar, DollarSign, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import SGAEventosDetailDialog from "./SGAEventosDetailDialog";

// NOTE (escalabilidade): este componente não recebe mais o array cru de
// eventos (a VALECAR sozinha já tem 131k+ eventos na importação ativa,
// muito acima do que fazia sentido agregar no navegador). Toda a
// agregação vem pronta em `stats`, calculada no banco pela RPC
// `get_dashboard_eventos_cached` (ver SGAInsights.tsx). O drill-down (ao
// clicar num segmento de gráfico) também não recebe mais `eventos` — o
// dialog busca os dados via `listar_eventos_por_filtro` usando os mesmos
// filtros globais recebidos aqui.
interface SGADashboardStats {
  totalEventos: number;
  totalFinalizados: number;
  totalEmAndamento: number;
  totalCusto: number;
  totalReparo: number;
  mediaParticipacao: number;
  totalEstadosDistintos: number;
  estadoData: { name: string; value: number }[];
  cidadeData: { name: string; value: number }[];
  motivoData: { name: string; value: number }[];
  situacaoData: { name: string; value: number }[];
  regionalData: { name: string; value: number }[];
  tipoData: { name: string; value: number }[];
  cooperativaData: { name: string; value: number }[];
  custosCooperativaData: { name: string; value: number }[];
  tipoVeiculoData: { name: string; value: number }[];
  envolvimentoData: { name: string; value: number }[];
  timelineData: { mes: string; eventos: number; custo: number }[];
  timelineDiaData: { dia: string; eventos: number; custo: number }[];
}

interface SGADashboardProps {
  stats: SGADashboardStats | null;
  loading: boolean;
  corretoraId: string;
  status: string;
  dataInicio: string;
  dataFim: string;
  regional: string;
  cooperativa: string;
  tipoVeiculo: string;
}

interface DetailDialogState {
  open: boolean;
  title: string;
  filterType: string;
  filterValue: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatCompactCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const ttStyle = { borderRadius: 10, fontSize: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" };

// Compact horizontal bar widget
function BarWidget({ data, total, colorFn, isCurrency, onClick }: { data: { name: string; value: number; fill?: string }[]; total: number; colorFn?: (i: number) => string; isCurrency?: boolean; onClick?: (name: string) => void }) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>;
  const maxVal = data[0]?.value || 1;
  return (
    <div className="space-y-2 pt-1">
      {data.map((item, i) => {
        const pct = isCurrency ? (item.value / maxVal) * 100 : (total > 0 ? (item.value / total) * 100 : 0);
        const color = item.fill ?? (colorFn ? colorFn(i) : COLORS[i % COLORS.length]);
        return (
          <div
            key={item.name}
            className={`flex items-center gap-1.5 min-w-0 ${onClick ? "cursor-pointer hover:opacity-70" : ""}`}
            onClick={onClick ? () => onClick(item.name) : undefined}
          >
            <span className="text-[10px] sm:text-[11px] text-muted-foreground truncate w-14 sm:w-28 shrink-0" title={item.name}>{item.name}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-0">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }} />
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold tabular-nums w-11 sm:w-16 text-right shrink-0 truncate">
              {isCurrency ? formatCompactCurrency(item.value) : item.value.toLocaleString("pt-BR")}
            </span>
            {!isCurrency && <span className="text-[9px] sm:text-[10px] text-muted-foreground tabular-nums w-7 sm:w-10 text-right shrink-0">{pct.toFixed(0)}%</span>}
          </div>
        );
      })}
    </div>
  );
}

// Mini Donut Chart for small categorical data
function MiniDonut({ data, total, onClick }: { data: { name: string; value: number }[]; total: number; onClick?: (name: string) => void }) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>;
  const top6 = data.slice(0, 6);
  return (
    <div className="flex items-center gap-4">
      <div className="shrink-0">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie
              data={top6}
              dataKey="value"
              innerRadius={32}
              outerRadius={54}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              onClick={onClick ? (entry: any) => onClick(entry.name) : undefined}
              cursor={onClick ? "pointer" : undefined}
            >
              {top6.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
            </Pie>
            <Tooltip contentStyle={ttStyle} formatter={(v: any, n: string) => [v.toLocaleString('pt-BR'), n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {top6.map((item, i) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div
              key={item.name}
              className={`flex items-center gap-1.5 min-w-0 ${onClick ? "cursor-pointer hover:opacity-70" : ""}`}
              onClick={onClick ? () => onClick(item.name) : undefined}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">{item.name}</span>
              <span className="text-[11px] font-bold tabular-nums shrink-0">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SGADashboard({
  stats,
  loading,
  corretoraId,
  status,
  dataInicio,
  dataFim,
  regional,
  cooperativa,
  tipoVeiculo,
}: SGADashboardProps) {
  const [evolucaoView, setEvolucaoView] = useState<'mes' | 'dia'>('mes');
  const evolucaoScrollRef = useRef<HTMLDivElement>(null);
  const [showScroll, setShowScroll] = useState({ left: false, right: false });
  const [detailDialog, setDetailDialog] = useState<DetailDialogState>({ open: false, title: "", filterType: "", filterValue: "" });

  const openDetailDialog = (title: string, filterType: string, filterValue: string) =>
    setDetailDialog({ open: true, title, filterType, filterValue });

  const updateScrollIndicators = () => {
    const el = evolucaoScrollRef.current;
    if (el) setShowScroll({ left: el.scrollLeft > 10, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 10 });
  };

  const handleScroll = (dir: 'left' | 'right') => {
    evolucaoScrollRef.current?.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
  };

  // A RPC já traz mes/dia prontos; mesLabel/diaLabel são só formatação de
  // exibição, calculada aqui exatamente como antes.
  const timelineData = useMemo(
    () =>
      (stats?.timelineData || []).map((d) => ({
        ...d,
        mesLabel: new Date(d.mes + "-01").toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      })),
    [stats?.timelineData],
  );

  const timelineDiaData = useMemo(
    () =>
      (stats?.timelineDiaData || []).map((d) => ({
        ...d,
        diaLabel: new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      })),
    [stats?.timelineDiaData],
  );

  useEffect(() => {
    const el = evolucaoScrollRef.current;
    if (!el || !stats) return;
    const now = new Date();
    const currentMesAno = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentDia = now.toISOString().split('T')[0];
    if (evolucaoView === 'mes' && timelineData.length > 0) {
      let idx = timelineData.findIndex(d => d.mes === currentMesAno);
      if (idx === -1) idx = timelineData.length - 1;
      el.scrollTo({ left: Math.max(0, idx * 70 - el.clientWidth / 2 + 35), behavior: 'auto' });
    } else if (evolucaoView === 'dia' && timelineDiaData.length > 0) {
      let idx = timelineDiaData.findIndex(d => d.dia === currentDia);
      if (idx === -1) idx = timelineDiaData.length - 1;
      el.scrollTo({ left: Math.max(0, idx * 45 - el.clientWidth / 2 + 22), behavior: 'auto' });
    }
    setTimeout(updateScrollIndicators, 100);
  }, [timelineData, timelineDiaData, evolucaoView, stats]);

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => <Card key={i} className="rounded-2xl"><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>)}
      </div>
    );
  }

  if (!stats || !stats.totalEventos) {
    return (
      <Card className="rounded-2xl text-center py-12">
        <CardContent>
          <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">Nenhum Dado Disponível</p>
          <p className="text-sm text-muted-foreground mt-1">Importe uma planilha do SGA para visualizar os dashboards.</p>
        </CardContent>
      </Card>
    );
  }

  const totalEventos = stats.totalEventos;

  return (
    <div className="space-y-3 max-w-full overflow-x-hidden">
      {/* KPI Cards */}
      <div className="grid gap-2.5 sm:gap-3 grid-cols-2 md:grid-cols-4">
        {[
          { label: "Custo Total", value: formatCompactCurrency(stats.totalCusto), icon: DollarSign, cls: "text-primary bg-primary/5 border-primary/20" },
          { label: "Total Reparo", value: formatCompactCurrency(stats.totalReparo), icon: Car, cls: "text-emerald-600 bg-emerald-500/5 border-emerald-500/20" },
          { label: "Média Participação", value: formatCompactCurrency(stats.mediaParticipacao), icon: TrendingUp, cls: "text-amber-600 bg-amber-500/5 border-amber-500/20" },
          { label: "Estados Distintos", value: stats.totalEstadosDistintos.toString(), icon: MapPin, cls: "text-violet-600 bg-violet-500/5 border-violet-500/20" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label} className={`rounded-2xl border min-w-0 ${cls}`}>
            <CardContent className="p-3 sm:p-4 min-w-0">
              <div className={`flex items-center gap-1.5 text-[11px] font-medium mb-1.5 truncate ${cls.split(" ")[0]}`}>
                <Icon className="h-3 w-3 shrink-0" /><span className="truncate">{label}</span>
              </div>
              <div className="text-base sm:text-xl font-bold tracking-tight truncate" title={value}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Evolução Timeline */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Evolução de Eventos</CardTitle>
            </div>
            <div className="flex gap-1">
              {(['mes', 'dia'] as const).map(v => (
                <Button key={v} variant={evolucaoView === v ? 'default' : 'outline'} size="sm" className="h-7 px-3 text-xs" onClick={() => setEvolucaoView(v)}>
                  {v === 'mes' ? 'Mês' : 'Dia'}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="relative">
            {showScroll.left && (
              <button onClick={() => handleScroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-card/90 border shadow-md rounded-full p-1.5 transition-all">
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            {showScroll.right && (
              <button onClick={() => handleScroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-card/90 border shadow-md rounded-full p-1.5 transition-all">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <div className="overflow-x-auto scrollbar-hide" ref={evolucaoScrollRef} onScroll={updateScrollIndicators}>
              <div style={{ minWidth: evolucaoView === 'mes' ? Math.max(700, timelineData.length * 70) + 'px' : Math.max(700, timelineDiaData.length * 45) + 'px' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={evolucaoView === 'mes' ? timelineData : timelineDiaData} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                    <XAxis dataKey={evolucaoView === 'mes' ? 'mesLabel' : 'diaLabel'} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={formatCompactCurrency} axisLine={false} tickLine={false} width={52} />
                    <Tooltip contentStyle={ttStyle} formatter={(v: any, name: string) => [name === 'custo' ? formatCurrency(v) : v.toLocaleString('pt-BR'), name === 'custo' ? 'Custo' : 'Eventos']} />
                    <Area yAxisId="left" type="monotone" dataKey="eventos" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} name="Eventos" />
                    <Area yAxisId="right" type="monotone" dataKey="custo" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={2} name="Custo" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1">← Arraste para navegar →</p>
          </div>
        </CardContent>
      </Card>

      {/* Situação (Donut) + Regional (Bars) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Situação dos Eventos</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <MiniDonut data={stats.situacaoData} total={totalEventos} onClick={(name) => openDetailDialog(`Situação: ${name}`, "situacao", name)} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Eventos por Regional</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <BarWidget
              data={stats.regionalData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))}
              total={totalEventos}
              onClick={(name) => openDetailDialog(`Regional: ${name}`, "regional", name)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Motivo (bars) + Tipo Evento (donut) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Motivo do Evento</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-y-auto max-h-[280px] pr-0.5">
              <BarWidget
                data={stats.motivoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))}
                total={totalEventos}
                onClick={(name) => openDetailDialog(`Motivo: ${name}`, "motivo", name)}
              />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Tipo de Evento</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <MiniDonut data={stats.tipoData} total={totalEventos} onClick={(name) => openDetailDialog(`Tipo de Evento: ${name}`, "tipoEvento", name)} />
          </CardContent>
        </Card>
      </div>

      {/* Estado (bars) + Cidade (bars) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Eventos por Estado</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <BarWidget
              data={stats.estadoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))}
              total={totalEventos}
              onClick={(name) => openDetailDialog(`Estado: ${name}`, "estado", name)}
            />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">Eventos por Cidade</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {stats.cidadeData.length > 0 ? (
              <>
                <BarWidget
                  data={stats.cidadeData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))}
                  total={totalEventos}
                  onClick={(name) => openDetailDialog(`Cidade: ${name}`, "cidade", name)}
                />
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  Cidade do evento disponível em parte dos registros importados do SGA.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Sem dados de cidade</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tipo Veículo (donut) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Tipo de Veículo</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <MiniDonut data={stats.tipoVeiculoData} total={totalEventos} onClick={(name) => openDetailDialog(`Tipo de Veículo: ${name}`, "tipoVeiculo", name)} />
          </CardContent>
        </Card>
        {/* Envolvimento (movido para cá para preencher a coluna, quando disponível) */}
        {stats.envolvimentoData.length > 0 && (
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Envolvimento</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              <MiniDonut data={stats.envolvimentoData} total={totalEventos} onClick={(name) => openDetailDialog(`Envolvimento: ${name}`, "envolvimento", name)} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cooperativa Eventos + Custos */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Eventos por Cooperativa</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-y-auto max-h-[240px]">
              <BarWidget
                data={stats.cooperativaData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))}
                total={totalEventos}
                onClick={(name) => openDetailDialog(`Cooperativa: ${name}`, "cooperativa", name)}
              />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Custo por Cooperativa</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-y-auto max-h-[240px]">
              <BarWidget
                data={stats.custosCooperativaData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))}
                total={stats.totalCusto}
                isCurrency
                onClick={(name) => openDetailDialog(`Cooperativa: ${name}`, "cooperativa", name)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <SGAEventosDetailDialog
        open={detailDialog.open}
        onOpenChange={(open) => setDetailDialog(d => ({ ...d, open }))}
        title={detailDialog.title}
        filterType={detailDialog.filterType}
        filterValue={detailDialog.filterValue}
        corretoraId={corretoraId}
        status={status}
        dataInicio={dataInicio}
        dataFim={dataFim}
        regional={regional}
        cooperativa={cooperativa}
        tipoVeiculo={tipoVeiculo}
      />
    </div>
  );
}
