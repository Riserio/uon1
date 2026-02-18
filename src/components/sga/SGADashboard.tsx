import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, LabelList, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, Car, MapPin, Calendar, DollarSign, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import SGAEventosDetailDialog from "./SGAEventosDetailDialog";

interface SGADashboardProps {
  eventos: any[];
  loading: boolean;
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

const formatCompactCurrency = (value: number) => {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
  return `R$ ${value.toFixed(0)}`;
};

const ttStyle = { borderRadius: 10, fontSize: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" };

const getTipoVeiculo = (modelo: string): string => {
  if (!modelo) return "Não Informado";
  const m = modelo.toLowerCase();
  if (m.includes("moto") || m.includes("honda") || m.includes("yamaha") || m.includes("suzuki") || m.includes("kawasaki")) return "Motocicleta";
  if (m.includes("caminhao") || m.includes("caminhão") || m.includes("truck") || m.includes("scania") || m.includes("volvo")) return "Caminhão";
  if (m.includes("van") || m.includes("furgao") || m.includes("sprinter")) return "Van/Utilitário";
  return "Passeio";
};

// Compact horizontal bar widget
function BarWidget({ data, total, colorFn }: { data: { name: string; value: number; fill?: string }[]; total: number; colorFn?: (i: number) => string }) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>;
  return (
    <div className="space-y-2 pt-1">
      {data.map((item, i) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0;
        const color = item.fill ?? (colorFn ? colorFn(i) : COLORS[i % COLORS.length]);
        return (
          <div key={item.name} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground truncate w-28 shrink-0" title={item.name}>{item.name}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }} />
            </div>
            <span className="text-[11px] font-bold tabular-nums w-12 text-right">{item.value.toLocaleString("pt-BR")}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

export default function SGADashboard({ eventos, loading }: SGADashboardProps) {
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

  const stats = useMemo(() => {
    if (!eventos.length) return null;

    const reduce = (field: string, filterFn?: (e: any) => boolean) => eventos.reduce((acc: any, e) => {
      const val = e[field] || "";
      if (val && val !== "N/I" && val !== "NAO INFORMADO" && val !== "NÃO INFORMADO") {
        if (!filterFn || filterFn(e)) acc[val] = (acc[val] || 0) + 1;
      }
      return acc;
    }, {});

    const toArr = (obj: any, limit = 10) =>
      Object.entries(obj).map(([name, value]) => ({ name, value: value as number })).sort((a, b) => b.value - a.value).slice(0, limit);

    const porEstado = reduce("evento_estado");
    const porMotivo = reduce("motivo_evento");
    const porSituacao = reduce("situacao_evento");
    const porRegional = reduce("regional");
    const porTipo = reduce("tipo_evento");
    const porCooperativa = reduce("cooperativa");
    const porEnvolvimento = reduce("envolvimento");

    const custosPorCooperativa = eventos.reduce((acc: any, e) => {
      const c = e.cooperativa;
      if (c && c !== "N/I") acc[c] = (acc[c] || 0) + (e.custo_evento || 0);
      return acc;
    }, {});

    const porTipoVeiculo = eventos.reduce((acc: any, e) => {
      const tipo = getTipoVeiculo(e.modelo_veiculo);
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {});

    const porMes = eventos.reduce((acc: any, e) => {
      if (e.data_evento) {
        const date = new Date(e.data_evento);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        acc[key] = acc[key] || { eventos: 0, custo: 0 };
        acc[key].eventos += 1;
        acc[key].custo += e.custo_evento || 0;
      }
      return acc;
    }, {});
    const timelineData = Object.entries(porMes)
      .map(([mes, d]: [string, any]) => ({
        mes, mesLabel: new Date(mes + "-01").toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        eventos: d.eventos, custo: d.custo
      })).sort((a, b) => a.mes.localeCompare(b.mes));

    const porDia = eventos.reduce((acc: any, e) => {
      if (e.data_evento) {
        const key = new Date(e.data_evento).toISOString().split('T')[0];
        acc[key] = acc[key] || { eventos: 0, custo: 0 };
        acc[key].eventos += 1;
        acc[key].custo += e.custo_evento || 0;
      }
      return acc;
    }, {});
    const timelineDiaData = Object.entries(porDia)
      .map(([dia, d]: [string, any]) => ({
        dia, diaLabel: new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        eventos: d.eventos, custo: d.custo
      })).sort((a, b) => a.dia.localeCompare(b.dia));

    return {
      estadoData: toArr(porEstado),
      motivoData: toArr(porMotivo, 15),
      situacaoData: toArr(porSituacao, 15),
      regionalData: toArr(porRegional),
      tipoData: toArr(porTipo, 15),
      cooperativaData: toArr(porCooperativa),
      custosCooperativaData: Object.entries(custosPorCooperativa).map(([name, value]) => ({ name, value: value as number })).sort((a, b) => b.value - a.value).slice(0, 10),
      tipoVeiculoData: toArr(porTipoVeiculo, 10),
      envolvimentoData: toArr(porEnvolvimento, 10),
      timelineData,
      timelineDiaData,
      totalCusto: eventos.reduce((acc, e) => acc + (e.custo_evento || 0), 0),
      totalReparo: eventos.reduce((acc, e) => acc + (e.valor_reparo || 0), 0),
      mediaParticipacao: eventos.reduce((acc, e) => acc + (e.participacao || 0), 0) / eventos.length,
      totalEstadosDistintos: Object.keys(porEstado).length,
    };
  }, [eventos]);

  useEffect(() => {
    const el = evolucaoScrollRef.current;
    if (!el || !stats) return;
    const now = new Date();
    const currentMesAno = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentDia = now.toISOString().split('T')[0];
    if (evolucaoView === 'mes' && stats.timelineData.length > 0) {
      let idx = stats.timelineData.findIndex(d => d.mes === currentMesAno);
      if (idx === -1) idx = stats.timelineData.length - 1;
      el.scrollTo({ left: Math.max(0, idx * 70 - el.clientWidth / 2 + 35), behavior: 'auto' });
    } else if (evolucaoView === 'dia' && stats.timelineDiaData.length > 0) {
      let idx = stats.timelineDiaData.findIndex(d => d.dia === currentDia);
      if (idx === -1) idx = stats.timelineDiaData.length - 1;
      el.scrollTo({ left: Math.max(0, idx * 45 - el.clientWidth / 2 + 22), behavior: 'auto' });
    }
    setTimeout(updateScrollIndicators, 100);
  }, [stats?.timelineData, stats?.timelineDiaData, evolucaoView]);

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => <Card key={i} className="rounded-2xl"><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>)}
      </div>
    );
  }

  if (!eventos.length || !stats) {
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

  const totalEventos = eventos.length;

  return (
    <div className="space-y-3">
      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[
          { label: "Custo Total", value: formatCompactCurrency(stats.totalCusto), icon: DollarSign, cls: "text-primary bg-primary/5 border-primary/20" },
          { label: "Total Reparo", value: formatCompactCurrency(stats.totalReparo), icon: Car, cls: "text-emerald-600 bg-emerald-500/5 border-emerald-500/20" },
          { label: "Média Participação", value: formatCompactCurrency(stats.mediaParticipacao), icon: TrendingUp, cls: "text-amber-600 bg-amber-500/5 border-amber-500/20" },
          { label: "Estados Distintos", value: stats.totalEstadosDistintos.toString(), icon: MapPin, cls: "text-violet-600 bg-violet-500/5 border-violet-500/20" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label} className={`rounded-2xl border ${cls}`}>
            <CardContent className="p-4">
              <div className={`flex items-center gap-1.5 text-[11px] font-medium mb-1.5 ${cls.split(" ")[0]}`}>
                <Icon className="h-3 w-3" />{label}
              </div>
              <div className="text-xl font-bold tracking-tight">{value}</div>
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
              <div style={{ minWidth: evolucaoView === 'mes' ? Math.max(700, stats.timelineData.length * 70) + 'px' : Math.max(700, stats.timelineDiaData.length * 45) + 'px' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={evolucaoView === 'mes' ? stats.timelineData : stats.timelineDiaData} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                    <XAxis dataKey={evolucaoView === 'mes' ? 'mesLabel' : 'diaLabel'} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={formatCompactCurrency} axisLine={false} tickLine={false} width={52} />
                    <Tooltip contentStyle={ttStyle} formatter={(v: any, name: string) => [name === 'custo' ? formatCurrency(v) : v.toLocaleString('pt-BR'), name === 'custo' ? 'Custo' : 'Eventos']} />
                    <Area yAxisId="left" type="monotone" dataKey="eventos" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} name="Eventos" />
                    <Area yAxisId="right" type="monotone" dataKey="custo" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={2} name="Custo" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1">← Arraste para navegar →</p>
          </div>
        </CardContent>
      </Card>

      {/* Situação + Regional */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Situação dos Eventos</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <BarWidget data={stats.situacaoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} total={totalEventos} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Eventos por Regional (Top 10)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <BarWidget data={stats.regionalData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} total={totalEventos} />
          </CardContent>
        </Card>
      </div>

      {/* Motivo + Estado */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Motivo do Evento</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-y-auto max-h-[280px] pr-0.5">
              <BarWidget data={stats.motivoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} total={totalEventos} />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Eventos por Estado (Top 10)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <BarWidget data={stats.estadoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} total={totalEventos} />
          </CardContent>
        </Card>
      </div>

      {/* Cooperativa Eventos + Custos */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Eventos por Cooperativa (Top 10)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <BarWidget data={stats.cooperativaData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} total={totalEventos} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Custo por Cooperativa (Top 10)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            {stats.custosCooperativaData.length > 0 ? (
              <div className="space-y-2 pt-1">
                {stats.custosCooperativaData.map((item: any, i) => {
                  const maxVal = stats.custosCooperativaData[0]?.value || 1;
                  const pct = (item.value / maxVal) * 100;
                  return (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground truncate w-28 shrink-0" title={item.name}>{item.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                      <span className="text-[11px] font-bold tabular-nums text-right whitespace-nowrap">{formatCompactCurrency(item.value)}</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
          </CardContent>
        </Card>
      </div>

      {/* Tipo Veículo + Tipo Evento + Envolvimento */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Tipo de Veículo</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <BarWidget data={stats.tipoVeiculoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} total={totalEventos} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Tipo de Evento</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <BarWidget data={stats.tipoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} total={totalEventos} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Envolvimento</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <BarWidget data={stats.envolvimentoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} total={totalEventos} />
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <SGAEventosDetailDialog
        open={detailDialog.open}
        onOpenChange={(open) => setDetailDialog((prev) => ({ ...prev, open }))}
        title={detailDialog.title}
        filterType={detailDialog.filterType}
        filterValue={detailDialog.filterValue}
        eventos={eventos}
      />
    </div>
  );
}
