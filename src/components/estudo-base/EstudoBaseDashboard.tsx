import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Filter, Car, DollarSign, ShieldCheck, AlertTriangle, Loader2, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLORS = [
  "#2563eb", "#16a34a", "#eab308", "#dc2626", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  "#a855f7", "#f43f5e", "#0ea5e9", "#10b981", "#fb923c",
];

export interface EstudoBaseFilters {
  situacao: string[];
  regional: string;
  cooperativa: string;
  dataContratoInicio: string;
  dataContratoFim: string;
  montadora: string;
  faixaValorProtegido: string;
}

interface Props {
  registros: any[];
  loading: boolean;
  filters: EstudoBaseFilters;
  onFiltersChange: (filters: EstudoBaseFilters) => void;
}

const FAIXAS_VALOR = [
  { label: "Todas", value: "todos" },
  { label: "Até R$ 10.000", value: "0-10000" },
  { label: "R$ 10.001 - R$ 20.000", value: "10000-20000" },
  { label: "R$ 20.001 - R$ 30.000", value: "20000-30000" },
  { label: "R$ 30.001 - R$ 40.000", value: "30000-40000" },
  { label: "R$ 40.001 - R$ 50.000", value: "40000-50000" },
  { label: "R$ 50.001 - R$ 60.000", value: "50000-60000" },
  { label: "R$ 60.001 - R$ 70.000", value: "60000-70000" },
  { label: "R$ 70.001 - R$ 80.000", value: "70000-80000" },
  { label: "R$ 80.001 - R$ 90.000", value: "80000-90000" },
  { label: "R$ 90.001 - R$ 100.000", value: "90000-100000" },
  { label: "Acima de R$ 100.000", value: "100000-999999999" },
];

// ---------- helpers ----------

function formatPct(n: number) {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
}

/** Build dynamic faixas from actual max value in data */
function buildFaixasValorDinamicas(maxValue: number) {
  const step = 10000;
  const maxFaixa = Math.ceil(maxValue / step) * step;
  const faixas: { label: string; min: number; max: number }[] = [];
  for (let min = 0; min < maxFaixa; min += step) {
    const max = min + step;
    const label = min === 0
      ? `Até ${(max / 1000).toFixed(0)}k`
      : max > maxFaixa
        ? `+${(min / 1000).toFixed(0)}k`
        : `${(min / 1000).toFixed(0)}-${(max / 1000).toFixed(0)}k`;
    faixas.push({ label, min, max });
  }
  faixas.push({ label: `+${(maxFaixa / 1000).toFixed(0)}k`, min: maxFaixa, max: Infinity });
  return faixas;
}

function NumbersList({
  items, valueKey = "value", nameKey = "name", max = 10,
}: {
  items: any[]; valueKey?: string; nameKey?: string; max?: number;
}) {
  if (!items?.length) return null;
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.slice(0, max).map((it, idx) => (
        <div key={`${it[nameKey]}-${idx}`} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs">
          <span className="truncate max-w-[70%]">{String(it[nameKey])}</span>
          <span className="font-semibold tabular-nums">{Number(it[valueKey] ?? 0).toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
}

type MonthItem = { mes: string; total: number; raw: string; variacao?: number | null };

function MonthsCounterList({ items, maxHeightClass = "max-h-[260px]" }: { items: MonthItem[]; maxHeightClass?: string }) {
  if (!items?.length) return null;
  const total = items.reduce((s, i) => s + (i.total || 0), 0);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span>Mês</span>
        <span className="flex items-center gap-6"><span>Qtd</span><span>%</span><span>Variação</span></span>
      </div>
      <div className={`overflow-y-auto pr-1 ${maxHeightClass}`}>
        <div className="space-y-2">
          {items.map((it, idx) => {
            const v = it.variacao;
            const hasVar = typeof v === "number" && Number.isFinite(v);
            const pct = total > 0 ? (it.total / total) * 100 : 0;
            return (
              <div key={`${it.raw}-${idx}`} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-2">
                <span className="text-xs font-medium">{it.mes}</span>
                <div className="flex items-center gap-6">
                  <span className="text-sm font-bold tabular-nums min-w-[56px] text-right">{Number(it.total).toLocaleString("pt-BR")}</span>
                  <span className="text-xs font-semibold tabular-nums min-w-[64px] text-right text-muted-foreground">{formatPct(pct)}</span>
                  <span className={["text-xs font-semibold tabular-nums min-w-[86px] text-right", hasVar ? "" : "text-muted-foreground", hasVar && v! > 0 ? "text-green-600" : "", hasVar && v! < 0 ? "text-destructive" : ""].join(" ")}>
                    {hasVar ? `${v! > 0 ? "+" : ""}${formatPct(v!)}` : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Variação calculada vs mês anterior.</p>
    </div>
  );
}

function ScrollCounterList({
  titleLeft = "Item", titleRight = "Qtd", titlePct = "%",
  items, maxHeightClass = "max-h-[240px]", totalBase,
}: {
  titleLeft?: string; titleRight?: string; titlePct?: string;
  items: { name: string; value: number }[]; maxHeightClass?: string; totalBase?: number;
}) {
  if (!items?.length) return null;
  const total = typeof totalBase === "number" ? totalBase : items.reduce((s, i) => s + (i.value || 0), 0);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span>{titleLeft}</span>
        <span className="flex items-center gap-6"><span>{titleRight}</span><span>{titlePct}</span></span>
      </div>
      <div className={`overflow-y-auto pr-1 ${maxHeightClass}`}>
        <div className="space-y-2">
          {items.map((it, idx) => {
            const pct = total > 0 ? (it.value / total) * 100 : 0;
            return (
              <div key={`${it.name}-${idx}`} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-2">
                <span className="text-xs font-medium truncate max-w-[55%]">{it.name}</span>
                <div className="flex items-center gap-6">
                  <span className="text-sm font-bold tabular-nums min-w-[56px] text-right">{Number(it.value).toLocaleString("pt-BR")}</span>
                  <span className="text-xs font-semibold tabular-nums min-w-[72px] text-right text-muted-foreground">{formatPct(pct)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ---------- Component ----------

export default function EstudoBaseDashboard({ registros, loading, filters, onFiltersChange }: Props) {
  const filterOptions = useMemo(() => {
    const situacoes = [...new Set(registros.map((r) => r.situacao_veiculo).filter(Boolean))].sort();
    const regionais = [...new Set(registros.map((r) => r.cooperativa || r.regional).filter(Boolean))].sort();
    const cooperativas = [...new Set(registros.map((r) => r.cooperativa).filter(Boolean))].sort();
    const montadoras = [...new Set(registros.map((r) => r.montadora).filter(Boolean))].sort();
    return { situacoes, regionais, cooperativas, montadoras };
  }, [registros]);

  const filtered = useMemo(() => {
    let result = [...registros];
    if (filters.situacao.length > 0) {
      result = result.filter((r) => filters.situacao.includes(r.situacao_veiculo));
    }
    if (filters.regional !== "todos") {
      result = result.filter((r) => (r.cooperativa || r.regional) === filters.regional);
    }
    if (filters.cooperativa !== "todos") {
      result = result.filter((r) => r.cooperativa === filters.cooperativa);
    }
    if (filters.dataContratoInicio) {
      result = result.filter((r) => r.data_contrato && r.data_contrato >= filters.dataContratoInicio);
    }
    if (filters.dataContratoFim) {
      result = result.filter((r) => r.data_contrato && r.data_contrato <= filters.dataContratoFim);
    }
    if (filters.montadora !== "todos") {
      result = result.filter((r) => r.montadora === filters.montadora);
    }
    if (filters.faixaValorProtegido !== "todos") {
      const [min, max] = filters.faixaValorProtegido.split("-").map(Number);
      result = result.filter((r) => (r.valor_fipe || 0) >= min && (r.valor_fipe || 0) <= max);
    }
    return result;
  }, [registros, filters]);

  // KPIs
  const totalPlacas = filtered.length;
  const totalValorProtegido = useMemo(
    () => filtered.reduce((sum, r) => sum + Math.round((r.valor_fipe || 0) * 100), 0) / 100,
    [filtered]
  );
  const ticketMedio = totalPlacas > 0 ? totalValorProtegido / totalPlacas : 0;
  const totalComEventos = filtered.filter((r) => (r.qtde_evento || 0) > 0).length;
  const taxaEventos = totalPlacas > 0 ? (totalComEventos / totalPlacas) * 100 : 0;

  // Charts data
  const placasPorSituacao = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      // Normalize: trim + uppercase + remove accents to group "ATIVO", "Ativo", "Situação do Veículo" variants
      const raw = r.situacao_veiculo ? String(r.situacao_veiculo).trim() : "N/I";
      const sit = raw.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      map.set(sit, (map.get(sit) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const cadastrosPorMes = useMemo<MonthItem[]>(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      if (r.data_contrato) {
        try {
          const d = parseISO(r.data_contrato);
          const key = format(d, "yyyy-MM");
          map.set(key, (map.get(key) || 0) + 1);
        } catch {}
      }
    });
    const asc = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([raw, total]) => {
        let mes = raw;
        try { mes = format(parseISO(raw + "-01"), "MMM/yy", { locale: ptBR }); } catch {}
        return { raw, mes, total };
      });
    return asc.map((cur, idx) => {
      const prev = idx > 0 ? asc[idx - 1] : null;
      const variacao = prev && prev.total > 0 ? ((cur.total - prev.total) / prev.total) * 100 : null;
      return { ...cur, variacao };
    }).sort((a, b) => b.raw.localeCompare(a.raw));
  }, [filtered]);

  const cadastrosPorMesChart = useMemo(() => [...cadastrosPorMes].reverse(), [cadastrosPorMes]);

  const eventosPorMes = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      if (!r.data_contrato || (r.qtde_evento || 0) <= 0) return;
      try {
        const d = parseISO(r.data_contrato);
        const key = format(d, "yyyy-MM");
        map.set(key, (map.get(key) || 0) + 1);
      } catch {}
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        try { return { mes: format(parseISO(key + "-01"), "MMM/yy", { locale: ptBR }), total: value, raw: key }; }
        catch { return { mes: key, total: value, raw: key }; }
      });
  }, [filtered]);

  // Dynamic faixas based on max valor_fipe in data
  const valorProtegidoPorFaixa = useMemo(() => {
    const maxVal = Math.max(...filtered.map((r) => r.valor_fipe || 0), 0);
    if (maxVal === 0) return [];
    const faixas = buildFaixasValorDinamicas(maxVal);
    return faixas
      .map((f) => ({
        faixa: f.label,
        total: filtered.filter((r) => (r.valor_fipe || 0) >= f.min && (r.valor_fipe || 0) < f.max).length,
      }))
      .filter((f) => f.total > 0);
  }, [filtered]);

  const buildRanking = (field: string, limit = 10) => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const val = r[field];
      if (val) map.set(String(val), (map.get(String(val)) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
  };

  const sexoData = useMemo(() => buildRanking("sexo"), [filtered]);
  const idadeData = useMemo(() => {
    const faixas = [
      { label: "18-25", min: 18, max: 25 }, { label: "26-35", min: 26, max: 35 },
      { label: "36-45", min: 36, max: 45 }, { label: "46-55", min: 46, max: 55 },
      { label: "56-65", min: 56, max: 65 }, { label: "65+", min: 66, max: 200 },
    ];
    return faixas
      .map((f) => ({ faixa: f.label, total: filtered.filter((r) => r.idade_associado >= f.min && r.idade_associado <= f.max).length }))
      .filter((f) => f.total > 0);
  }, [filtered]);

  const estadoCivilData = useMemo(() => buildRanking("estado_civil"), [filtered]);
  const montadoraData = useMemo(() => buildRanking("montadora", 15), [filtered]);
  const modeloData = useMemo(() => buildRanking("modelo", 15), [filtered]);
  const categoriaData = useMemo(() => buildRanking("categoria", 15), [filtered]);
  const anoModeloData = useMemo(() => buildRanking("ano_modelo", 20), [filtered]);
  const regionalData = useMemo(() => buildRanking("cooperativa", 15), [filtered]);
  const voluntarioData = useMemo(() => buildRanking("voluntario", 30), [filtered]);
  const combustivelData = useMemo(() => buildRanking("combustivel", 10), [filtered]);
  const tipoVeiculoData = useMemo(() => buildRanking("tipo_veiculo", 15), [filtered]);
  const corData = useMemo(() => buildRanking("cor", 15), [filtered]);

  const voluntarioTotal = useMemo(() => voluntarioData.reduce((s: number, i: any) => s + (i.value || 0), 0), [voluntarioData]);
  const eventosPorMesList = useMemo(() => [...eventosPorMes].sort((a, b) => (b.raw || "").localeCompare(a.raw || "")).map((i) => ({ name: i.mes, value: i.total })), [eventosPorMes]);
  const eventosTotal = useMemo(() => eventosPorMesList.reduce((s, i) => s + (i.value || 0), 0), [eventosPorMesList]);

  const clearFilters = () => {
    onFiltersChange({
      situacao: [], regional: "todos", cooperativa: "todos",
      dataContratoInicio: "", dataContratoFim: "",
      montadora: "todos", faixaValorProtegido: "todos",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (registros.length === 0) {
    return (
      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="p-6">
          <div className="flex gap-3 items-center">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
            <div>
              <p className="font-medium text-yellow-600">Sem dados importados</p>
              <p className="text-sm text-muted-foreground mt-1">Importe uma planilha de Estudo de Base na aba Importar Dados.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Filtros</span>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs">Limpar</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Situação</Label>
              <Select
                value={filters.situacao.length === 0 ? "todas" : filters.situacao.join(",")}
                onValueChange={(v) => onFiltersChange({ ...filters, situacao: v === "todas" ? [] : v.split(",") })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="ATIVO,SUSPENSO">Ativas e Suspensas</SelectItem>
                  <SelectItem value="ATIVO">Apenas Ativas</SelectItem>
                  <SelectItem value="SUSPENSO">Apenas Suspensas</SelectItem>
                  {filterOptions.situacoes.filter((s) => s !== "ATIVO" && s !== "SUSPENSO").map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Regional/Cooperativa</Label>
              <Select value={filters.regional} onValueChange={(v) => onFiltersChange({ ...filters, regional: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {filterOptions.regionais.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data Contrato De</Label>
              <Input type="date" value={filters.dataContratoInicio} onChange={(e) => onFiltersChange({ ...filters, dataContratoInicio: e.target.value })} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data Contrato Até</Label>
              <Input type="date" value={filters.dataContratoFim} onChange={(e) => onFiltersChange({ ...filters, dataContratoFim: e.target.value })} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Montadora</Label>
              <Select value={filters.montadora} onValueChange={(v) => onFiltersChange({ ...filters, montadora: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {filterOptions.montadoras.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Faixa Valor Protegido</Label>
              <Select value={filters.faixaValorProtegido} onValueChange={(v) => onFiltersChange({ ...filters, faixaValorProtegido: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FAIXAS_VALOR.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Car className="h-4 w-4" />Total de Placas</div>
            <div className="mt-1 text-2xl font-bold">{totalPlacas.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><DollarSign className="h-4 w-4" />Valor Protegido Total</div>
            <div className="mt-1 text-xl font-bold">{formatCurrency(totalValorProtegido)}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><DollarSign className="h-4 w-4" />Ticket Médio</div>
            <div className="mt-1 text-xl font-bold">{formatCurrency(ticketMedio)}</div>
          </CardContent>
        </Card>
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Veículos com Eventos</div>
            <div className="mt-1 text-2xl font-bold">{totalComEventos.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-4 w-4" />Taxa de Sinistro</div>
            <div className="mt-1 text-2xl font-bold">{taxaEventos.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Placas por Situação (full width) */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Placas por Situação</CardTitle></CardHeader>
        <CardContent>
          {placasPorSituacao.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, placasPorSituacao.length * 44)}>
              <BarChart data={placasPorSituacao} layout="vertical" margin={{ top: 4, right: 90, bottom: 4, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fontWeight: 500 }} />
                <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Placas"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={36}>
                  {placasPorSituacao.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  <LabelList dataKey="value" position="right" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 12, fontWeight: 700, fill: "hsl(var(--foreground))" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Sem dados</div>
          )}
        </CardContent>
      </Card>

      {/* Valor Protegido por Faixa (dinâmico) + Tipo de Veículo */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Valor Protegido por Faixa</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {valorProtegidoPorFaixa.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={valorProtegidoPorFaixa} margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="faixa" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Veículos"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="total" position="top" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados de valor protegido</div>
              )}
            </div>
            <NumbersList items={valorProtegidoPorFaixa.map((i) => ({ name: i.faixa, value: i.total }))} max={12} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Tipo de Veículo</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(180, tipoVeiculoData.length * 42)}>
              {tipoVeiculoData.length > 0 ? (
                <BarChart data={tipoVeiculoData} layout="vertical" margin={{ top: 4, right: 80, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Veículos"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={32}>
                    {tipoVeiculoData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    <LabelList dataKey="value" position="right" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                  </Bar>
                </BarChart>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Montadoras + Combustível */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Top Montadoras</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, montadoraData.length * 38)}>
              {montadoraData.length > 0 ? (
                <BarChart data={montadoraData} layout="vertical" margin={{ top: 4, right: 80, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Veículos"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={32}>
                    <LabelList dataKey="value" position="right" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                  </Bar>
                </BarChart>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </ResponsiveContainer>
            <NumbersList items={montadoraData} max={15} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Combustível</CardTitle></CardHeader>
          <CardContent>
            {combustivelData.length > 0 ? (
              <>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={combustivelData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} label={false} labelLine={false} isAnimationActive={false}>
                        {combustivelData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v: any, name: any) => [Number(v).toLocaleString("pt-BR"), name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ScrollCounterList titleLeft="Combustível" titleRight="Qtd" items={combustivelData.map((i) => ({ name: i.name, value: i.value }))} maxHeightClass="max-h-[140px]" />
              </>
            ) : (
              <div className="flex items-center justify-center py-16 text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Eventos por Mês */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Total de Veículos com Evento (por mês)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[280px]">
            {eventosPorMes.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventosPorMes} margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Veículos"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="total" fill="#7c3aed" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    <LabelList dataKey="total" position="top" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem eventos no período filtrado</div>
            )}
          </div>
          <ScrollCounterList titleLeft="Mês" titleRight="Qtd" items={eventosPorMesList} totalBase={eventosTotal} maxHeightClass="max-h-[180px]" />
        </CardContent>
      </Card>

      {/* Cadastros por Mês */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Cadastros por Mês (Data Contrato)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[360px]">
            {cadastrosPorMesChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cadastrosPorMesChart} margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="total" fill="#2563eb" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="total" position="top" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
            )}
          </div>
          <MonthsCounterList items={cadastrosPorMes} maxHeightClass="max-h-[260px]" />
        </CardContent>
      </Card>

      {/* Sexo + Estado Civil */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Sexo</CardTitle></CardHeader>
          <CardContent>
            {sexoData.length > 0 ? (
              <>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sexoData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} label={false} labelLine={false} isAnimationActive={false}>
                        {sexoData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v: any, name: any) => [Number(v).toLocaleString("pt-BR"), name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ScrollCounterList titleLeft="Sexo" titleRight="Qtd" items={sexoData.map((i) => ({ name: i.name, value: i.value }))} maxHeightClass="max-h-[160px]" />
              </>
            ) : (
              <div className="flex items-center justify-center py-16 text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Estado Civil</CardTitle></CardHeader>
          <CardContent>
            {estadoCivilData.length > 0 ? (
              <>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={estadoCivilData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} label={false} labelLine={false} isAnimationActive={false}>
                        {estadoCivilData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v: any, name: any) => [Number(v).toLocaleString("pt-BR"), name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ScrollCounterList titleLeft="Estado Civil" titleRight="Qtd" items={estadoCivilData.map((i) => ({ name: i.name, value: i.value }))} maxHeightClass="max-h-[160px]" />
              </>
            ) : (
              <div className="flex items-center justify-center py-16 text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Faixa Etária + Categoria */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Faixa Etária</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {idadeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={idadeData} margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="faixa" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Associados"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="total" fill="#ec4899" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      <LabelList dataKey="total" position="top" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados de idade</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Categoria</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(180, categoriaData.length * 40)}>
              {categoriaData.length > 0 ? (
                <BarChart data={categoriaData} layout="vertical" margin={{ top: 4, right: 80, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Veículos"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill="#14b8a6" radius={[0, 6, 6, 0]} maxBarSize={32}>
                    {categoriaData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    <LabelList dataKey="value" position="right" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 12, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                  </Bar>
                </BarChart>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Modelos + Ano Modelo */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Top Modelos</CardTitle></CardHeader>
          <CardContent className="h-[400px]">
            {modeloData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modeloData} layout="vertical" margin={{ top: 4, right: 70, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Ano Modelo</CardTitle></CardHeader>
          <CardContent className="h-[400px]">
            {anoModeloData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={anoModeloData} margin={{ top: 20, right: 16, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]}>
                    {anoModeloData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Voluntário - donut full width */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Voluntário</CardTitle></CardHeader>
        <CardContent>
          {voluntarioData.length > 0 ? (
            <>
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={voluntarioData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={90} outerRadius={145} paddingAngle={2} label={false} labelLine={false} minAngle={3} isAnimationActive={false}>
                      {voluntarioData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, name: any) => [Number(v).toLocaleString("pt-BR"), name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ScrollCounterList titleLeft="Voluntário" titleRight="Qtd" items={voluntarioData.map((i) => ({ name: i.name, value: i.value }))} totalBase={voluntarioTotal} maxHeightClass="max-h-[200px]" />
            </>
          ) : (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Sem dados</div>
          )}
        </CardContent>
      </Card>

      {/* Regional */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Regional/Cooperativa</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(200, regionalData.length * 40)}>
            {regionalData.length > 0 ? (
              <BarChart data={regionalData} layout="vertical" margin={{ top: 4, right: 80, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Veículos"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="value" position="right" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                </Bar>
              </BarChart>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
