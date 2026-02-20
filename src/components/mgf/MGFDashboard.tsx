import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadialBarChart, RadialBar, Legend,
} from "recharts";
import {
  TrendingUp, DollarSign, Calendar, Building2, MapPin, AlertTriangle,
  CheckCircle, Clock, Banknote, CreditCard, Truck, FileText, Users,
  Package, BarChart3, ChevronLeft, ChevronRight, Eye,
} from "lucide-react";

interface MGFDashboardProps {
  dados: any[];
  colunas: string[];
  loading: boolean;
  associacaoNome: string;
}

const COLORS = ["#f97316", "#fb923c", "#fdba74", "#0ea5e9", "#06b6d4", "#14b8a6", "#22c55e", "#84cc16", "#eab308", "#ef4444"];

const formatFullCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(value);

const formatCompactCurrency = (value: number) => {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
  return `R$ ${value.toFixed(0)}`;
};

const ttStyle = { borderRadius: 10, fontSize: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" };

// Horizontal bar widget for higher-cardinality rankings
function BarWidget({ data, isCurrency = false, maxItems = 10, onItemClick }: {
  data: { name: string; value: number; fill?: string; count?: number }[];
  isCurrency?: boolean;
  maxItems?: number;
  onItemClick?: (name: string) => void;
}) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>;
  const items = data.slice(0, maxItems);
  const maxVal = items[0]?.value || 1;
  return (
    <div className="space-y-2 pt-1">
      {items.map((item, i) => {
        const pct = (item.value / maxVal) * 100;
        const color = item.fill ?? COLORS[i % COLORS.length];
        return (
          <div
            key={item.name}
            className={`flex items-center gap-2 ${onItemClick ? 'cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 py-0.5' : ''}`}
            onClick={() => onItemClick?.(item.name)}
          >
            <span className="text-[11px] text-muted-foreground truncate w-40 shrink-0" title={item.name}>{item.name}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }} />
            </div>
            <span className="text-[11px] font-bold tabular-nums text-right whitespace-nowrap">
              {isCurrency ? formatCompactCurrency(item.value) : item.value.toLocaleString("pt-BR")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Donut chart for small-cardinality categories
function MiniDonut({ data, isCurrency = false }: {
  data: { name: string; value: number }[];
  isCurrency?: boolean;
}) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>;
  const total = data.reduce((s, d) => s + d.value, 0);
  const items = data.slice(0, 8);
  return (
    <div className="flex gap-3 items-center min-w-0">
      <div className="shrink-0 w-[110px] h-[110px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} cx="50%" cy="50%" innerRadius={32} outerRadius={50} dataKey="value" paddingAngle={2} strokeWidth={0}>
              {items.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={ttStyle} formatter={(v: any) => [isCurrency ? formatCompactCurrency(Number(v)) : Number(v).toLocaleString("pt-BR"), ""]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {items.map((item, i) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={item.name} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-[10px] text-muted-foreground truncate flex-1" title={item.name}>{item.name}</span>
              <span className="text-[10px] font-semibold tabular-nums shrink-0">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Radial bar for a single metric comparison (e.g. pago vs total)
function RadialProgress({ value, label, color }: { value: number; label: string; color: string }) {
  const data = [{ value, fill: color }];
  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width={80} height={80}>
        <RadialBarChart cx="50%" cy="50%" innerRadius={24} outerRadius={36} startAngle={90} endAngle={-270} data={data}>
          <RadialBar dataKey="value" cornerRadius={4} background={{ fill: "hsl(var(--muted))" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <span className="text-[11px] font-bold -mt-1">{value.toFixed(0)}%</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

export default function MGFDashboard({ dados, colunas, loading, associacaoNome }: MGFDashboardProps) {
  const [evolucaoView, setEvolucaoView] = useState<'mes' | 'dia'>('mes');
  const evolucaoScrollRef = useRef<HTMLDivElement>(null);
  const [showScroll, setShowScroll] = useState({ left: false, right: false });
  const [drilldown, setDrilldown] = useState<{ title: string; field: string; value: string } | null>(null);

  const updateScrollIndicators = () => {
    const el = evolucaoScrollRef.current;
    if (el) setShowScroll({ left: el.scrollLeft > 10, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 10 });
  };

  const handleScroll = (dir: 'left' | 'right') => {
    evolucaoScrollRef.current?.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
  };

  const stats = useMemo(() => {
    if (!dados.length) return null;

    const isPago = (d: any) => {
      const sit = d.situacao_pagamento?.toLowerCase() || '';
      return sit.includes('pago') || sit.includes('paga') || !!d.data_pagamento;
    };

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    hoje.setHours(0, 0, 0, 0);

    const totalRegistros = dados.length;
    const valorTotal = dados.reduce((acc, d) => acc + (d.valor || 0), 0);
    const pagos = dados.filter(d => isPago(d));
    const valorPago = pagos.reduce((acc, d) => acc + (d.valor_pagamento || d.valor || 0), 0);
    const qtdPagos = pagos.length;
    const aPagar = dados.filter(d => !isPago(d));
    const valorAPagar = aPagar.reduce((acc, d) => acc + (d.valor || 0), 0);
    const qtdAPagar = aPagar.length;
    const vencidos = dados.filter(d => {
      if (isPago(d)) return false;
      if (!d.data_vencimento) return false;
      return new Date(d.data_vencimento) < hoje;
    });
    const valorVencido = vencidos.reduce((acc, d) => acc + (d.valor || 0), 0);
    const qtdVencidos = vencidos.length;
    const totalMulta = dados.reduce((acc, d) => acc + (d.multa || 0), 0);
    const totalJuros = dados.reduce((acc, d) => acc + (d.juros || 0), 0);
    const ticketMedio = valorTotal / totalRegistros;
    const fornecedoresUnicos = new Set(dados.filter(d => d.fornecedor || d.nome_fantasia_fornecedor).map(d => d.fornecedor || d.nome_fantasia_fornecedor)).size;
    const taxaPagamento = valorTotal > 0 ? (valorPago / valorTotal) * 100 : 0;

    const filterAVencer = (fim: number) => {
      const f = new Date(hoje); f.setDate(f.getDate() + fim);
      return dados.filter(d => {
        if (isPago(d)) return false;
        const sit = d.situacao_pagamento?.toLowerCase() || '';
        if (sit.includes('cancel')) return false;
        if (!d.data_vencimento) return false;
        const venc = new Date(d.data_vencimento);
        return venc >= hoje && venc <= f;
      });
    };
    const aVencer7 = filterAVencer(7);
    const aVencer30 = filterAVencer(30);
    const aVencer60 = filterAVencer(60);
    const aVencer90 = filterAVencer(90);

    const buildRanking = (field: string, valueField?: string, limit = 10) => {
      const map: Record<string, { count: number; valor: number }> = {};
      dados.forEach(d => {
        const k = d[field] || "Não informado";
        if (k === "Não informado") return;
        map[k] = map[k] || { count: 0, valor: 0 };
        map[k].count += 1;
        map[k].valor += d[valueField || 'valor'] || 0;
      });
      return Object.entries(map).map(([name, v]) => ({ name, value: v.valor, count: v.count })).sort((a, b) => b.value - a.value).slice(0, limit);
    };

    const buildCountRanking = (field: string, limit = 10) => {
      const map: Record<string, number> = {};
      dados.forEach(d => {
        const k = d[field] || "Não informado";
        if (k !== "Não informado") map[k] = (map[k] || 0) + 1;
      });
      return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, limit);
    };

    const porMes = dados.reduce((acc: any, d) => {
      const dataRef = d.data_vencimento || d.data_evento || d.data_nota_fiscal;
      if (dataRef) {
        const date = new Date(dataRef);
        if (!isNaN(date.getTime())) {
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          acc[key] = acc[key] || { count: 0, valor: 0, pago: 0 };
          acc[key].count += 1;
          acc[key].valor += d.valor || 0;
          if (isPago(d)) {
            acc[key].pago += d.valor_pagamento || d.valor || 0;
          }
        }
      }
      return acc;
    }, {});
    const timelineData = Object.entries(porMes)
      .map(([mes, d]: [string, any]) => ({
        mes, mesLabel: new Date(mes + "-01").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        count: d.count, valor: d.valor, pago: d.pago,
      })).sort((a, b) => a.mes.localeCompare(b.mes));

    const porDia = dados.reduce((acc: any, d) => {
      const dataRef = d.data_vencimento || d.data_evento || d.data_nota_fiscal;
      if (dataRef) {
        const date = new Date(dataRef);
        if (!isNaN(date.getTime())) {
          const key = date.toISOString().split('T')[0];
          acc[key] = acc[key] || { count: 0, valor: 0, pago: 0 };
          acc[key].count += 1;
          acc[key].valor += d.valor || 0;
          if (isPago(d)) {
            acc[key].pago += d.valor_pagamento || d.valor || 0;
          }
        }
      }
      return acc;
    }, {});
    const timelineDiaData = Object.entries(porDia)
      .map(([dia, d]: [string, any]) => ({
        dia, diaLabel: new Date(dia + 'T12:00:00').toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' }),
        count: d.count, valor: d.valor, pago: d.pago,
      })).sort((a, b) => a.dia.localeCompare(b.dia));

    return {
      totalRegistros, valorTotal, valorPago, qtdPagos, valorAPagar, qtdAPagar,
      valorVencido, qtdVencidos, totalMulta, totalJuros, ticketMedio, fornecedoresUnicos, taxaPagamento,
      qtdAVencer7: aVencer7.length, valorAVencer7: aVencer7.reduce((acc, d) => acc + (d.valor || 0), 0),
      qtdAVencer30: aVencer30.length, valorAVencer30: aVencer30.reduce((acc, d) => acc + (d.valor || 0), 0),
      qtdAVencer60: aVencer60.length, valorAVencer60: aVencer60.reduce((acc, d) => acc + (d.valor || 0), 0),
      qtdAVencer90: aVencer90.length, valorAVencer90: aVencer90.reduce((acc, d) => acc + (d.valor || 0), 0),
      operacaoData: buildRanking("operacao"),
      subOperacaoData: buildRanking("sub_operacao"),
      situacaoData: buildRanking("situacao_pagamento"),
      fornecedorData: buildRanking("fornecedor"),
      cooperativaData: buildRanking("cooperativa"),
      formaPagamentoData: buildRanking("forma_pagamento"),
      regionalData: buildRanking("regional"),
      tipoVeiculoData: buildRanking("tipo_veiculo"),
      centroCustoData: buildRanking("centro_custo"),
      motivoEventoData: buildRanking("motivo_evento"),
      associadoData: buildRanking("associado"),
      timelineData, timelineDiaData,
    };
  }, [dados]);

  useEffect(() => {
    const el = evolucaoScrollRef.current;
    if (!el || !stats) return;
    const now = new Date();
    const currentMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentDia = now.toISOString().split('T')[0];
    if (evolucaoView === 'mes' && stats.timelineData.length > 0) {
      let idx = stats.timelineData.findIndex(d => d.mes === currentMes);
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

  if (!dados.length) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">Nenhum dado importado</p>
          <p className="text-sm text-muted-foreground text-center mt-1">Importe uma planilha MGF para visualizar o dashboard</p>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-3">
      {/* KPI Cards Row 1 */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
        {[
          { label: "Valor Total", value: formatFullCurrency(stats.valorTotal), sub: `${stats.totalRegistros.toLocaleString()} registros`, icon: Banknote, cls: "text-primary bg-primary/5 border-primary/20" },
          { label: "Pago", value: formatCurrency(stats.valorPago), sub: `${stats.qtdPagos.toLocaleString()} registros`, icon: CheckCircle, cls: "text-emerald-600 bg-emerald-500/5 border-emerald-500/20" },
          { label: "A Pagar", value: formatCurrency(stats.valorAPagar), sub: `${stats.qtdAPagar.toLocaleString()} registros`, icon: Clock, cls: "text-amber-600 bg-amber-500/5 border-amber-500/20" },
          { label: "Vencido", value: formatCurrency(stats.valorVencido), sub: `${stats.qtdVencidos.toLocaleString()} registros`, icon: AlertTriangle, cls: "text-red-600 bg-red-500/5 border-red-500/20" },
          { label: "Multa + Juros", value: formatCurrency(stats.totalMulta + stats.totalJuros), sub: `Ticket: ${formatCurrency(stats.ticketMedio)}`, icon: TrendingUp, cls: "text-violet-600 bg-violet-500/5 border-violet-500/20" },
        ].map(({ label, value, sub, icon: Icon, cls }) => (
          <Card key={label} className={`rounded-2xl border ${cls}`}>
            <CardContent className="p-4">
              <div className={`flex items-center gap-1.5 text-[11px] font-medium mb-1 ${cls.split(" ")[0]}`}>
                <Icon className="h-3 w-3" />{label}
              </div>
              <div className="text-lg font-bold tracking-tight">{value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Taxa de Pagamento + Vencimentos Row */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-5">
        {/* Taxa de pagamento card com radial */}
        <Card className="rounded-2xl border-border/40 md:col-span-1">
          <CardContent className="p-4 flex flex-col items-center justify-center gap-1 h-full">
            <RadialProgress value={stats.taxaPagamento} label="Taxa Pgto" color="#22c55e" />
            <p className="text-[10px] text-muted-foreground text-center mt-1">{stats.fornecedoresUnicos} fornecedor{stats.fornecedoresUnicos !== 1 ? "es" : ""}</p>
          </CardContent>
        </Card>

        {/* Vencimentos */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:col-span-4">
          {[
            { label: "Vence em 7 dias", value: formatCurrency(stats.valorAVencer7), qtd: stats.qtdAVencer7, cls: "border-l-yellow-500" },
            { label: "Vence em 30 dias", value: formatCurrency(stats.valorAVencer30), qtd: stats.qtdAVencer30, cls: "border-l-amber-500" },
            { label: "Vence em 60 dias", value: formatCurrency(stats.valorAVencer60), qtd: stats.qtdAVencer60, cls: "border-l-orange-500" },
            { label: "Vence em 90 dias", value: formatCurrency(stats.valorAVencer90), qtd: stats.qtdAVencer90, cls: "border-l-cyan-500" },
          ].map(({ label, value, qtd, cls }) => (
            <Card key={label} className={`rounded-2xl border-l-4 ${cls}`}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-base font-bold">{value}</p>
                <p className="text-[10px] text-muted-foreground">{qtd} registro(s)</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Evolução Temporal */}
      {stats.timelineData.length > 0 && (
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm font-semibold">Evolução Temporal</CardTitle>
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
                <button onClick={() => handleScroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-card/90 border shadow-md rounded-full p-1.5">
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              {showScroll.right && (
                <button onClick={() => handleScroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-card/90 border shadow-md rounded-full p-1.5">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              <div className="overflow-x-auto scrollbar-hide" ref={evolucaoScrollRef} onScroll={updateScrollIndicators}>
                <div style={{ minWidth: evolucaoView === 'mes' ? Math.max(700, stats.timelineData.length * 70) + 'px' : Math.max(700, stats.timelineDiaData.length * 45) + 'px' }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={evolucaoView === 'mes' ? stats.timelineData : stats.timelineDiaData} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                      <defs>
                        <linearGradient id="mgfGradTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="mgfGradPago" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey={evolucaoView === 'mes' ? 'mesLabel' : 'diaLabel'} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={formatCompactCurrency} width={52} />
                      <Tooltip contentStyle={ttStyle} formatter={(v: any, name: string) => [formatFullCurrency(Number(v)), name === 'pago' ? 'Pago' : 'Total']} />
                      <Area type="monotone" dataKey="valor" stroke="#f97316" fill="url(#mgfGradTotal)" strokeWidth={2} name="Valor Total" dot={false} />
                      <Area type="monotone" dataKey="pago" stroke="#22c55e" fill="url(#mgfGradPago)" strokeWidth={2} name="Pago" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-1">← Arraste para navegar →</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operação (Donut) + SubOperação (Barras) */}
      <div className="grid gap-3 lg:grid-cols-3">
        {stats.operacaoData.length > 0 && (
          <Card className="rounded-2xl border-border/40 lg:col-span-1">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2"><Package className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Por Operação</CardTitle></div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {stats.operacaoData.length <= 6
                ? <MiniDonut data={stats.operacaoData} isCurrency />
                : <BarWidget data={stats.operacaoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} isCurrency />
              }
            </CardContent>
          </Card>
        )}
        {stats.subOperacaoData.length > 0 && (
          <Card className="rounded-2xl border-border/40 lg:col-span-2">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Por SubOperação</CardTitle></div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <BarWidget data={stats.subOperacaoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} isCurrency maxItems={12} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Situação Pagamento (Donut) + Forma de Pagamento (Donut) */}
      <div className="grid gap-3 lg:grid-cols-2">
        {stats.situacaoData.length > 0 && (
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500" /><CardTitle className="text-sm font-semibold">Por Situação de Pagamento</CardTitle></div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <MiniDonut data={stats.situacaoData} isCurrency />
            </CardContent>
          </Card>
        )}
        {stats.formaPagamentoData.length > 0 && (
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Por Forma de Pagamento</CardTitle></div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <MiniDonut data={stats.formaPagamentoData} isCurrency />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tipo Veículo (Donut) + Regional + Fornecedor */}
      <div className="grid gap-3 lg:grid-cols-3">
        {stats.tipoVeiculoData.length > 0 && (
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Por Tipo de Veículo</CardTitle></div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <MiniDonut data={stats.tipoVeiculoData} isCurrency />
            </CardContent>
          </Card>
        )}
        {stats.regionalData.length > 0 && (
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Por Regional</CardTitle></div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <BarWidget data={stats.regionalData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} isCurrency onItemClick={(name) => setDrilldown({ title: `Regional: ${name}`, field: 'regional', value: name })} />
            </CardContent>
          </Card>
        )}
        {stats.fornecedorData.length > 0 && (
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Por Fornecedor</CardTitle></div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <BarWidget data={stats.fornecedorData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} isCurrency onItemClick={(name) => setDrilldown({ title: `Fornecedor: ${name}`, field: 'fornecedor', value: name })} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cooperativa + Motivo Evento + Centro de Custo */}
      <div className="grid gap-3 lg:grid-cols-3">
        {stats.cooperativaData.length > 0 && (
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Por Cooperativa</CardTitle></div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <BarWidget data={stats.cooperativaData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} isCurrency onItemClick={(name) => setDrilldown({ title: `Cooperativa: ${name}`, field: 'cooperativa', value: name })} />
            </CardContent>
          </Card>
        )}
        {stats.motivoEventoData.length > 0 && (
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Por Motivo Evento</CardTitle></div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <BarWidget data={stats.motivoEventoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} isCurrency onItemClick={(name) => setDrilldown({ title: `Motivo: ${name}`, field: 'motivo_evento', value: name })} />
            </CardContent>
          </Card>
        )}
        {stats.centroCustoData.length > 0 && (
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Por Centro de Custo</CardTitle></div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <BarWidget data={stats.centroCustoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} isCurrency onItemClick={(name) => setDrilldown({ title: `Centro de Custo: ${name}`, field: 'centro_custo', value: name })} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top Associados - largura total */}
      {stats.associadoData.length > 0 && (
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5">
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm font-semibold">Top Associados</CardTitle></div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <BarWidget data={stats.associadoData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))} isCurrency onItemClick={(name) => setDrilldown({ title: `Associado: ${name}`, field: 'associado', value: name })} />
          </CardContent>
        </Card>
      )}
      {/* Drilldown Dialog */}
      <DrilldownDialog
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title || ''}
        dados={drilldown ? dados.filter(d => d[drilldown.field] === drilldown.value) : []}
      />
    </div>
  );
}

function DrilldownDialog({ open, onClose, title, dados }: {
  open: boolean;
  onClose: () => void;
  title: string;
  dados: any[];
}) {
  const totalValor = dados.reduce((acc, d) => acc + (d.valor || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            {title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {dados.length} registro(s) — Total: {formatFullCurrency(totalValor)}
          </p>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Descrição</TableHead>
                <TableHead className="text-xs">Operação</TableHead>
                <TableHead className="text-xs">Fornecedor</TableHead>
                <TableHead className="text-xs text-right">Valor</TableHead>
                <TableHead className="text-xs">Vencimento</TableHead>
                <TableHead className="text-xs">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.slice(0, 200).map((d, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs max-w-[200px] truncate" title={d.descricao}>{d.descricao || '-'}</TableCell>
                  <TableCell className="text-xs">{d.operacao || '-'}</TableCell>
                  <TableCell className="text-xs max-w-[150px] truncate" title={d.fornecedor}>{d.fornecedor || '-'}</TableCell>
                  <TableCell className="text-xs text-right font-medium">
                    {d.valor != null ? formatFullCurrency(d.valor) : '-'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {d.data_vencimento ? new Date(d.data_vencimento).toLocaleDateString('pt-BR') : '-'}
                  </TableCell>
                  <TableCell className="text-xs">{d.situacao_pagamento || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {dados.length > 200 && (
            <p className="text-xs text-muted-foreground text-center py-2">Exibindo 200 de {dados.length} registros</p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
