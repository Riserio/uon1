import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Filter, Car, DollarSign, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
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
  "#2563eb",
  "#16a34a",
  "#eab308",
  "#dc2626",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
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

const pieLabel = (props: any) => {
  const { name, value, percent } = props;
  const pct = typeof percent === "number" ? `${(percent * 100).toFixed(0)}%` : "";
  return `${name}: ${Number(value).toLocaleString("pt-BR")}${pct ? ` (${pct})` : ""}`;
};

function NumbersList({
  items,
  valueKey = "value",
  nameKey = "name",
  max = 10,
}: {
  items: any[];
  valueKey?: string;
  nameKey?: string;
  max?: number;
}) {
  if (!items?.length) return null;
  const show = items.slice(0, max);

  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
      {show.map((it, idx) => (
        <div
          key={`${it[nameKey]}-${idx}`}
          className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs"
        >
          <span className="truncate max-w-[70%]">{String(it[nameKey])}</span>
          <span className="font-semibold tabular-nums">{Number(it[valueKey] ?? 0).toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
}

type MonthItem = { mes: string; total: number; raw: string; variacao?: number | null };

function MonthsCounterList({
  items,
  maxHeightClass = "max-h-[260px]",
}: {
  items: MonthItem[];
  maxHeightClass?: string;
}) {
  if (!items?.length) return null;

  const total = items.reduce((s, i) => s + (i.total || 0), 0);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span>Mês</span>
        <span className="flex items-center gap-6">
          <span>Qtd</span>
          <span>%</span>
          <span>Variação</span>
        </span>
      </div>

      <div className={`overflow-y-auto pr-1 ${maxHeightClass}`}>
        <div className="space-y-2">
          {items.map((it, idx) => {
            const v = it.variacao;
            const hasVar = typeof v === "number" && Number.isFinite(v);
            const isPos = hasVar && v > 0;
            const isNeg = hasVar && v < 0;

            const pct = total > 0 ? (it.total / total) * 100 : 0;

            return (
              <div
                key={`${it.raw}-${idx}`}
                className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-2"
              >
                <span className="text-xs font-medium">{it.mes}</span>

                <div className="flex items-center gap-6">
                  <span className="text-sm font-bold tabular-nums min-w-[56px] text-right">
                    {Number(it.total).toLocaleString("pt-BR")}
                  </span>

                  <span className="text-xs font-semibold tabular-nums min-w-[64px] text-right text-muted-foreground">
                    {formatPct(pct)}
                  </span>

                  <span
                    className={[
                      "text-xs font-semibold tabular-nums min-w-[86px] text-right",
                      hasVar ? "" : "text-muted-foreground",
                      isPos ? "text-green-600" : "",
                      isNeg ? "text-red-600" : "",
                    ].join(" ")}
                    title={
                      hasVar ? "Variação vs mês anterior" : "Sem base para comparar (mês anterior = 0 ou inexistente)"
                    }
                  >
                    {hasVar ? `${v > 0 ? "+" : ""}${formatPct(v)}` : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        “%” = participação no total do período filtrado. Variação calculada vs mês anterior (quando mês anterior = 0,
        fica “—”).
      </p>
    </div>
  );
}

function ScrollCounterList({
  titleLeft = "Item",
  titleRight = "Qtd",
  titlePct = "%",
  items,
  maxHeightClass = "max-h-[240px]",
  totalBase,
}: {
  titleLeft?: string;
  titleRight?: string;
  titlePct?: string;
  items: { name: string; value: number }[];
  maxHeightClass?: string;
  totalBase?: number;
}) {
  if (!items?.length) return null;
  const total = typeof totalBase === "number" ? totalBase : items.reduce((s, i) => s + (i.value || 0), 0);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span>{titleLeft}</span>
        <span className="flex items-center gap-6">
          <span>{titleRight}</span>
          <span>{titlePct}</span>
        </span>
      </div>

      <div className={`overflow-y-auto pr-1 ${maxHeightClass}`}>
        <div className="space-y-2">
          {items.map((it, idx) => {
            const pct = total > 0 ? (it.value / total) * 100 : 0;
            return (
              <div
                key={`${it.name}-${idx}`}
                className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-2"
              >
                <span className="text-xs font-medium truncate max-w-[55%]">{it.name}</span>

                <div className="flex items-center gap-6">
                  <span className="text-sm font-bold tabular-nums min-w-[56px] text-right">
                    {Number(it.value).toLocaleString("pt-BR")}
                  </span>
                  <span className="text-xs font-semibold tabular-nums min-w-[72px] text-right text-muted-foreground">
                    {formatPct(pct)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Percentual calculado sobre o total exibido no período filtrado.
      </p>
    </div>
  );
}

// ✅ melhoria exclusiva do gráfico de Voluntário (sem labels nas fatias + tooltip com % + total no centro)
function VoluntarioTooltip({ active, payload, total }: { active?: boolean; payload?: any[]; total: number }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  const name = String(p?.name ?? "");
  const value = Number(p?.value ?? 0);
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 shadow-sm">
      <div className="text-xs font-semibold">{name}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{value.toLocaleString("pt-BR")}</span>{" "}
        <span>({formatPct(pct)})</span>
      </div>
    </div>
  );
}

// ---------- Component ----------

export default function EstudoBaseDashboard({ registros, loading, filters, onFiltersChange }: Props) {
  // Extract filter options
  const filterOptions = useMemo(() => {
    const situacoes = [...new Set(registros.map((r) => r.situacao_veiculo).filter(Boolean))].sort();
    const regionais = [...new Set(registros.map((r) => r.cooperativa || r.regional).filter(Boolean))].sort();
    const cooperativas = [...new Set(registros.map((r) => r.cooperativa).filter(Boolean))].sort();
    const montadoras = [...new Set(registros.map((r) => r.montadora).filter(Boolean))].sort();
    return { situacoes, regionais, cooperativas, montadoras };
  }, [registros]);

  // Filter records
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
      result = result.filter((r) => r.valor_protegido >= min && r.valor_protegido <= max);
    }

    return result;
  }, [registros, filters]);

  // KPIs
  const totalPlacas = filtered.length;
  const totalValorProtegido = filtered.reduce((sum, r) => sum + (r.valor_protegido || 0), 0);
  const ticketMedio = totalPlacas > 0 ? totalValorProtegido / totalPlacas : 0;
  const totalComEventos = filtered.filter((r) => (r.qtde_evento || 0) > 0).length;

  // Charts data
  const placasPorSituacao = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const sit = r.situacao_veiculo || "N/I";
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
        try {
          mes = format(parseISO(raw + "-01"), "MMM/yy", { locale: ptBR });
        } catch {}
        return { raw, mes, total };
      });

    const ascWithVar: MonthItem[] = asc.map((cur, idx) => {
      const prev = idx > 0 ? asc[idx - 1] : null;

      let variacao: number | null = null;
      if (prev && prev.total > 0) {
        variacao = ((cur.total - prev.total) / prev.total) * 100;
      } else {
        variacao = null;
      }

      return { ...cur, variacao };
    });

    return ascWithVar.sort((a, b) => b.raw.localeCompare(a.raw));
  }, [filtered]);

  const cadastrosPorMesChart = useMemo(() => [...cadastrosPorMes].reverse(), [cadastrosPorMes]);

  const eventosPorMes = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      if (!r.data_contrato) return;
      if ((r.qtde_evento || 0) <= 0) return;

      try {
        const d = parseISO(r.data_contrato);
        const key = format(d, "yyyy-MM");
        map.set(key, (map.get(key) || 0) + 1);
      } catch {}
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        try {
          return { mes: format(parseISO(key + "-01"), "MMM/yy", { locale: ptBR }), total: value, raw: key };
        } catch {
          return { mes: key, total: value, raw: key };
        }
      });
  }, [filtered]);

  const valorProtegidoPorFaixa = useMemo(() => {
    const faixas = [
      { label: "0-10k", min: 0, max: 10000 },
      { label: "10-20k", min: 10000, max: 20000 },
      { label: "20-30k", min: 20000, max: 30000 },
      { label: "30-40k", min: 30000, max: 40000 },
      { label: "40-50k", min: 40000, max: 50000 },
      { label: "50-60k", min: 50000, max: 60000 },
      { label: "60-70k", min: 60000, max: 70000 },
      { label: "70-80k", min: 70000, max: 80000 },
      { label: "80-90k", min: 80000, max: 90000 },
      { label: "90-100k", min: 90000, max: 100000 },
      { label: "+100k", min: 100000, max: Infinity },
    ];
    return faixas
      .map((f) => ({
        faixa: f.label,
        total: filtered.filter((r) => r.valor_protegido >= f.min && r.valor_protegido < f.max).length,
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
      { label: "18-25", min: 18, max: 25 },
      { label: "26-35", min: 26, max: 35 },
      { label: "36-45", min: 36, max: 45 },
      { label: "46-55", min: 46, max: 55 },
      { label: "56-65", min: 56, max: 65 },
      { label: "65+", min: 66, max: 200 },
    ];
    return faixas
      .map((f) => ({
        faixa: f.label,
        total: filtered.filter((r) => r.idade_associado >= f.min && r.idade_associado <= f.max).length,
      }))
      .filter((f) => f.total > 0);
  }, [filtered]);

  const estadoCivilData = useMemo(() => buildRanking("estado_civil"), [filtered]);
  const montadoraData = useMemo(() => buildRanking("montadora", 15), [filtered]);
  const modeloData = useMemo(() => buildRanking("modelo", 15), [filtered]);
  const categoriaData = useMemo(() => buildRanking("categoria", 15), [filtered]);
  const anoModeloData = useMemo(() => buildRanking("ano_modelo", 15), [filtered]);
  const passageirosData = useMemo(() => buildRanking("num_passageiros", 15), [filtered]);
  const regionalData = useMemo(() => buildRanking("cooperativa", 15), [filtered]);
  const voluntarioData = useMemo(() => buildRanking("voluntario", 30), [filtered]);

  const voluntarioTotal = useMemo(
    () => voluntarioData.reduce((s: number, i: any) => s + (i.value || 0), 0),
    [voluntarioData],
  );

  const eventosPorMesList = useMemo(() => {
    return [...eventosPorMes]
      .slice()
      .sort((a, b) => (b.raw || "").localeCompare(a.raw || ""))
      .map((i) => ({ name: i.mes, value: i.total }));
  }, [eventosPorMes]);

  const eventosTotal = useMemo(() => eventosPorMesList.reduce((s, i) => s + (i.value || 0), 0), [eventosPorMesList]);

  const clearFilters = () => {
    onFiltersChange({
      situacao: [],
      regional: "todos",
      cooperativa: "todos",
      dataContratoInicio: "",
      dataContratoFim: "",
      montadora: "todos",
      faixaValorProtegido: "todos",
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
              <p className="text-sm text-muted-foreground mt-1">
                Importe uma planilha de Estudo de Base na aba Importar Dados.
              </p>
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
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs">
              Limpar
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Situação</Label>
              <Select
                value={filters.situacao.length === 0 ? "todas" : filters.situacao.join(",")}
                onValueChange={(v) => onFiltersChange({ ...filters, situacao: v === "todas" ? [] : v.split(",") })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="ATIVO,SUSPENSO">Ativas e Suspensas</SelectItem>
                  <SelectItem value="ATIVO">Apenas Ativas</SelectItem>
                  <SelectItem value="SUSPENSO">Apenas Suspensas</SelectItem>
                  {filterOptions.situacoes
                    .filter((s) => s !== "ATIVO" && s !== "SUSPENSO")
                    .map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Regional/Cooperativa</Label>
              <Select value={filters.regional} onValueChange={(v) => onFiltersChange({ ...filters, regional: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {filterOptions.regionais.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data Contrato De</Label>
              <Input
                type="date"
                value={filters.dataContratoInicio}
                onChange={(e) => onFiltersChange({ ...filters, dataContratoInicio: e.target.value })}
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data Contrato Até</Label>
              <Input
                type="date"
                value={filters.dataContratoFim}
                onChange={(e) => onFiltersChange({ ...filters, dataContratoFim: e.target.value })}
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Montadora</Label>
              <Select value={filters.montadora} onValueChange={(v) => onFiltersChange({ ...filters, montadora: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {filterOptions.montadoras.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Faixa Valor Protegido</Label>
              <Select
                value={filters.faixaValorProtegido}
                onValueChange={(v) => onFiltersChange({ ...filters, faixaValorProtegido: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FAIXAS_VALOR.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Car className="h-4 w-4" />
              Total de Placas
            </div>
            <div className="mt-1 text-2xl font-bold">{totalPlacas.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Valor Protegido Total
            </div>
            <div className="mt-1 text-2xl font-bold">{formatCurrency(totalValorProtegido)}</div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Ticket Médio
            </div>
            <div className="mt-1 text-2xl font-bold">{formatCurrency(ticketMedio)}</div>
          </CardContent>
        </Card>

        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Veículos com Eventos
            </div>
            <div className="mt-1 text-2xl font-bold">{totalComEventos.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
      </div>

      {/* ROW: Placas por Situação + Eventos por Mês */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Placas por Situação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              {placasPorSituacao.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={placasPorSituacao}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      label={pieLabel}
                      labelLine={false}
                    >
                      {placasPorSituacao.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            <ScrollCounterList
              titleLeft="Situação"
              titleRight="Qtd"
              items={placasPorSituacao.map((i) => ({ name: i.name, value: i.value }))}
              maxHeightClass="max-h-[220px]"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total de Veículos com Evento (por mês)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              {eventosPorMes.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventosPorMes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                    <Bar dataKey="total" fill="#7c3aed" radius={[4, 4, 0, 0]}>
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                        style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Sem eventos no período filtrado
                </div>
              )}
            </div>

            <ScrollCounterList
              titleLeft="Mês"
              titleRight="Qtd"
              items={eventosPorMesList}
              totalBase={eventosTotal}
              maxHeightClass="max-h-[220px]"
            />
          </CardContent>
        </Card>
      </div>

      {/* Cadastros por Mês (full width) */}
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cadastros por Mês (Data Contrato)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[360px]">
              {cadastrosPorMesChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cadastrosPorMesChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                    <Bar dataKey="total" fill="#2563eb" radius={[6, 6, 0, 0]}>
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                        style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      />
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
      </div>

      {/* Valor Protegido Faixa + Montadora */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Valor Protegido por Faixa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {valorProtegidoPorFaixa.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={valorProtegidoPorFaixa}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="faixa" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                    <Bar dataKey="total" fill="#16a34a" radius={[4, 4, 0, 0]}>
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                        style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            <NumbersList items={valorProtegidoPorFaixa.map((i) => ({ name: i.faixa, value: i.total }))} max={12} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Montadoras</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {montadoraData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={montadoraData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                      <LabelList
                        dataKey="value"
                        position="right"
                        formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                        style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            <NumbersList items={montadoraData} max={15} />
          </CardContent>
        </Card>
      </div>

      {/* Sexo + Faixa Etária */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sexo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {sexoData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sexoData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      label={pieLabel}
                      labelLine={false}
                    >
                      {sexoData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            <ScrollCounterList
              titleLeft="Sexo"
              titleRight="Qtd"
              items={sexoData.map((i) => ({ name: i.name, value: i.value }))}
              maxHeightClass="max-h-[220px]"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Faixa Etária</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {idadeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={idadeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="faixa" />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                    <Bar dataKey="total" fill="#ec4899" radius={[4, 4, 0, 0]}>
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                        style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            <ScrollCounterList
              titleLeft="Faixa"
              titleRight="Qtd"
              items={idadeData.map((i) => ({ name: i.faixa, value: i.total }))}
              maxHeightClass="max-h-[220px]"
            />
          </CardContent>
        </Card>
      </div>

      {/* Estado Civil + Categoria */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estado Civil</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {estadoCivilData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={estadoCivilData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      label={pieLabel}
                      labelLine={false}
                    >
                      {estadoCivilData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            <ScrollCounterList
              titleLeft="Estado"
              titleRight="Qtd"
              items={estadoCivilData.map((i) => ({ name: i.name, value: i.value }))}
              maxHeightClass="max-h-[220px]"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Categoria</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {categoriaData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoriaData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                  <Bar dataKey="value" fill="#14b8a6" radius={[0, 4, 4, 0]}>
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                      style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Modelos + Ano Modelo */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Modelos</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            {modeloData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modeloData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                  <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]}>
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                      style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ano Modelo</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            {anoModeloData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={anoModeloData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                  <Bar dataKey="value" fill="#06b6d4" radius={[6, 6, 0, 0]}>
                    <LabelList
                      dataKey="value"
                      position="top"
                      formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                      style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ✅ Voluntário em largura total (MELHORIA EXCLUSIVA AQUI) */}
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Voluntário</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="h-[420px]">
              {voluntarioData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                    {/* donut maior, sem labels nas fatias (evita “embolado”) */}
                    <Pie
                      data={voluntarioData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={95}
                      outerRadius={150}
                      paddingAngle={2}
                      label={false}
                      labelLine={false}
                      minAngle={3}
                      isAnimationActive={false}
                    >
                      {voluntarioData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Pie>

                    {/* tooltip com % + qtd */}
                    <Tooltip content={<VoluntarioTooltip total={voluntarioTotal} />} />

                    {/* legenda mantida, mas mais “limpa” */}
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 12 }} />

                    {/* total no centro */}
                    <text
                      x="50%"
                      y="46%"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    >
                      Total
                    </text>
                    <text
                      x="50%"
                      y="54%"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ fontSize: 20, fontWeight: 800, fill: "hsl(var(--foreground))" }}
                    >
                      {voluntarioTotal.toLocaleString("pt-BR")}
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            {/* ✅ scroll + % (mantido) */}
            <ScrollCounterList
              titleLeft="Voluntário"
              titleRight="Qtd"
              items={voluntarioData.map((i) => ({ name: i.name, value: i.value }))}
              totalBase={voluntarioTotal}
              maxHeightClass="max-h-[240px]"
            />
          </CardContent>
        </Card>
      </div>

      {/* Regional + Passageiros */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Regional/Cooperativa</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            {regionalData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionalData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                  <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]}>
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                      style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nº de Passageiros</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            {passageirosData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={passageirosData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR")} />
                  <Bar dataKey="value" fill="#84cc16" radius={[6, 6, 0, 0]}>
                    <LabelList
                      dataKey="value"
                      position="top"
                      formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                      style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
