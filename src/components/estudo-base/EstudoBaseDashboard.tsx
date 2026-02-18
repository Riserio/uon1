import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Filter, Car, DollarSign, ShieldCheck, AlertTriangle, Loader2, TrendingUp, ChevronDown, X } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
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
  hideFilters?: boolean;
}

// ── Exported collapsible filter card (used by parent page above the tabs) ──
export interface EstudoBaseFilterBarProps {
  registros: any[];
  filters: EstudoBaseFilters;
  onFiltersChange: (filters: EstudoBaseFilters) => void;
}

export function EstudoBaseFilterBar({ registros, filters, onFiltersChange }: EstudoBaseFilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterOptions = useMemo(() => {
    const situacoes = [...new Set(registros.map((r) => r.situacao_veiculo).filter(Boolean))].sort();
    const regionais = [...new Set(registros.map((r) => r.cooperativa || r.regional).filter(Boolean))].sort();
    const montadoras = [...new Set(registros.map((r) => r.montadora).filter(Boolean))].sort();
    return { situacoes, regionais, montadoras };
  }, [registros]);

  const clearFilters = () => {
    onFiltersChange({
      situacao: [], regional: "todos", cooperativa: "todos",
      dataContratoInicio: "", dataContratoFim: "",
      montadora: "todos", faixaValorProtegido: "todos",
    });
  };

  const activeCount = [
    filters.situacao.length > 0,
    filters.regional !== "todos",
    filters.montadora !== "todos",
    !!filters.dataContratoInicio,
    !!filters.dataContratoFim,
    filters.faixaValorProtegido !== "todos",
  ].filter(Boolean).length;

  return (
    <Card className="bg-card/60 border-border/40 rounded-2xl">
      <CardContent className="p-0">
        <button
          className="w-full flex items-center gap-2 px-4 py-3 text-left"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <Filter className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-semibold text-xs tracking-wide uppercase text-muted-foreground flex-1">Filtros</span>
          {!filtersOpen && activeCount > 0 && (
            <span className="text-[11px] text-muted-foreground truncate max-w-[45%]">
              {[
                filters.situacao.length > 0 ? filters.situacao.join(", ") : null,
                filters.regional !== "todos" ? filters.regional : null,
                filters.montadora !== "todos" ? filters.montadora : null,
                filters.dataContratoInicio ? `De: ${filters.dataContratoInicio}` : null,
                filters.dataContratoFim ? `Até: ${filters.dataContratoFim}` : null,
                filters.faixaValorProtegido !== "todos" ? FAIXAS_VALOR.find(f => f.value === filters.faixaValorProtegido)?.label : null,
              ].filter(Boolean).join(" · ")}
            </span>
          )}
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold shrink-0">
              {activeCount}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${filtersOpen ? "rotate-180" : ""}`} />
        </button>

        {filtersOpen && (
          <div className="px-4 pb-4 border-t border-border/30 pt-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                {
                  label: "Situação",
                  el: (
                    <Select value={filters.situacao.length === 0 ? "todas" : filters.situacao.join(",")} onValueChange={(v) => onFiltersChange({ ...filters, situacao: v === "todas" ? [] : v.split(",") })}>
                      <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
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
                  ),
                },
                {
                  label: "Regional",
                  el: (
                    <Select value={filters.regional} onValueChange={(v) => onFiltersChange({ ...filters, regional: v })}>
                      <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        {filterOptions.regionais.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ),
                },
                { label: "Contrato De", el: <Input type="date" value={filters.dataContratoInicio} onChange={(e) => onFiltersChange({ ...filters, dataContratoInicio: e.target.value })} className="h-8 text-xs rounded-lg" /> },
                { label: "Contrato Até", el: <Input type="date" value={filters.dataContratoFim} onChange={(e) => onFiltersChange({ ...filters, dataContratoFim: e.target.value })} className="h-8 text-xs rounded-lg" /> },
                {
                  label: "Montadora",
                  el: (
                    <Select value={filters.montadora} onValueChange={(v) => onFiltersChange({ ...filters, montadora: v })}>
                      <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        {filterOptions.montadoras.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ),
                },
                {
                  label: "Faixa Valor",
                  el: (
                    <Select value={filters.faixaValorProtegido} onValueChange={(v) => onFiltersChange({ ...filters, faixaValorProtegido: v })}>
                      <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FAIXAS_VALOR.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ),
                },
              ].map(({ label, el }) => (
                <div key={label} className="space-y-1">
                  <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
                  {el}
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-3">
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-3 text-xs">
                <X className="h-3 w-3 mr-1" />Limpar filtros
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
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

function formatPct(n: number) {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
}

function buildFaixasValorDinamicas(maxValue: number) {
  const step = 10000;
  const maxFaixa = Math.ceil(maxValue / step) * step;
  const faixas: { label: string; min: number; max: number }[] = [];
  for (let min = 0; min < maxFaixa; min += step) {
    const max = min + step;
    const label = min === 0
      ? `Até ${(max / 1000).toFixed(0)}k`
      : `${(min / 1000).toFixed(0)}-${(max / 1000).toFixed(0)}k`;
    faixas.push({ label, min, max });
  }
  faixas.push({ label: `+${(maxFaixa / 1000).toFixed(0)}k`, min: maxFaixa, max: Infinity });
  return faixas;
}

type MonthItem = { mes: string; total: number; raw: string; variacao?: number | null };

function MonthsCounterList({ items, maxHeightClass = "max-h-[260px]" }: { items: MonthItem[]; maxHeightClass?: string }) {
  if (!items?.length) return null;
  const total = items.reduce((s, i) => s + (i.total || 0), 0);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
        <span>Mês</span>
        <span className="flex items-center gap-6"><span>Qtd</span><span>%</span><span>Variação</span></span>
      </div>
      <div className={`overflow-y-auto pr-1 ${maxHeightClass}`}>
        <div className="space-y-1">
          {items.map((it, idx) => {
            const v = it.variacao;
            const hasVar = typeof v === "number" && Number.isFinite(v);
            const pct = total > 0 ? (it.total / total) * 100 : 0;
            return (
              <div key={`${it.raw}-${idx}`} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-2.5 py-1.5">
                <span className="text-xs font-medium">{it.mes}</span>
                <div className="flex items-center gap-6">
                  <span className="text-xs font-bold tabular-nums min-w-[48px] text-right">{Number(it.total).toLocaleString("pt-BR")}</span>
                  <span className="text-[11px] tabular-nums min-w-[56px] text-right text-muted-foreground">{formatPct(pct)}</span>
                  <span className={["text-[11px] tabular-nums min-w-[80px] text-right font-medium", !hasVar ? "text-muted-foreground" : v! > 0 ? "text-emerald-600" : "text-destructive"].join(" ")}>
                    {hasVar ? `${v! > 0 ? "+" : ""}${formatPct(v!)}` : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">Variação vs mês anterior.</p>
    </div>
  );
}

function ScrollCounterList({
  titleLeft = "Item", titleRight = "Qtd", titlePct = "%",
  items, maxHeightClass = "max-h-[200px]", totalBase,
}: {
  titleLeft?: string; titleRight?: string; titlePct?: string;
  items: { name: string; value: number }[]; maxHeightClass?: string; totalBase?: number;
}) {
  if (!items?.length) return null;
  const total = typeof totalBase === "number" ? totalBase : items.reduce((s, i) => s + (i.value || 0), 0);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
        <span>{titleLeft}</span>
        <span className="flex items-center gap-6"><span>{titleRight}</span><span>{titlePct}</span></span>
      </div>
      <div className={`overflow-y-auto pr-1 ${maxHeightClass}`}>
        <div className="space-y-1">
          {items.map((it, idx) => {
            const pct = total > 0 ? (it.value / total) * 100 : 0;
            return (
              <div key={`${it.name}-${idx}`} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-2.5 py-1.5">
                <span className="text-xs font-medium truncate max-w-[55%]">{it.name}</span>
                <div className="flex items-center gap-6">
                  <span className="text-xs font-bold tabular-nums min-w-[48px] text-right">{Number(it.value).toLocaleString("pt-BR")}</span>
                  <span className="text-[11px] tabular-nums min-w-[64px] text-right text-muted-foreground">{formatPct(pct)}</span>
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

export default function EstudoBaseDashboard({ registros, loading, filters, onFiltersChange, hideFilters = false }: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterOptions = useMemo(() => {
    const situacoes = [...new Set(registros.map((r) => r.situacao_veiculo).filter(Boolean))].sort();
    const regionais = [...new Set(registros.map((r) => r.cooperativa || r.regional).filter(Boolean))].sort();
    const montadoras = [...new Set(registros.map((r) => r.montadora).filter(Boolean))].sort();
    return { situacoes, regionais, montadoras };
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

  const totalPlacas = filtered.length;
  const totalValorProtegido = useMemo(
    () => filtered.reduce((sum, r) => sum + Math.round((r.valor_fipe || 0) * 100), 0) / 100,
    [filtered]
  );
  const ticketMedio = totalPlacas > 0 ? totalValorProtegido / totalPlacas : 0;
  const totalComEventos = filtered.filter((r) => (r.qtde_evento || 0) > 0).length;
  const taxaEventos = totalPlacas > 0 ? (totalComEventos / totalPlacas) * 100 : 0;

  const placasPorSituacao = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
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
          const key = format(parseISO(r.data_contrato), "yyyy-MM");
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

  // Últimos 12 meses para o gráfico (ordem cronológica)
  const cadastrosPorMesChart = useMemo(() => {
    const asc = [...cadastrosPorMes].reverse();
    return asc.slice(-12);
  }, [cadastrosPorMes]);

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
  const voluntarioTotal = useMemo(() => voluntarioData.reduce((s, i) => s + (i.value || 0), 0), [voluntarioData]);

  // Veículos com evento por mês (últimos 12 meses)
  const eventosPorMesChart = useMemo(() => {
    const map = new Map<string, { total: number; comEvento: number }>();
    filtered.forEach((r) => {
      if (r.data_contrato) {
        try {
          const key = format(parseISO(r.data_contrato), "yyyy-MM");
          const cur = map.get(key) || { total: 0, comEvento: 0 };
          cur.total++;
          if ((r.qtde_evento || 0) > 0) cur.comEvento++;
          map.set(key, cur);
        } catch {}
      }
    });
    const sorted = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([raw, { total, comEvento }]) => {
        let mes = raw;
        try { mes = format(parseISO(raw + "-01"), "MMM/yy", { locale: ptBR }); } catch {}
        const taxa = total > 0 ? ((comEvento / total) * 100) : 0;
        return { mes, total, comEvento, semEvento: total - comEvento, taxa };
      });
    return sorted;
  }, [filtered]);

  const clearFilters = () => {
    onFiltersChange({
      situacao: [], regional: "todos", cooperativa: "todos",
      dataContratoInicio: "", dataContratoFim: "",
      montadora: "todos", faixaValorProtegido: "todos",
    });
  };

  const ttStyle = { borderRadius: 10, fontSize: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (registros.length === 0) {
    return (
      <Card className="border-yellow-500/20 bg-yellow-500/5 rounded-2xl">
        <CardContent className="p-6 flex gap-3 items-center">
          <AlertTriangle className="h-6 w-6 text-yellow-500 shrink-0" />
          <div>
            <p className="font-semibold text-yellow-600">Sem dados importados</p>
            <p className="text-sm text-muted-foreground mt-0.5">Importe uma planilha de Estudo de Base na aba Importar Dados.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Filters (collapsible, only when not controlled externally) ── */}
      {!hideFilters && (
        <Card className="bg-card/60 border-border/40 rounded-2xl">
          <CardContent className="p-0">
            <button
              className="w-full flex items-center gap-2 px-4 py-3 text-left"
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <Filter className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-semibold text-xs tracking-wide uppercase text-muted-foreground flex-1">Filtros</span>
              {!filtersOpen && (() => {
                const parts: string[] = [];
                if (filters.situacao.length > 0) parts.push(filters.situacao.join(", "));
                if (filters.regional !== "todos") parts.push(filters.regional);
                if (filters.montadora !== "todos") parts.push(filters.montadora);
                if (filters.dataContratoInicio) parts.push(`De: ${filters.dataContratoInicio}`);
                if (filters.dataContratoFim) parts.push(`Até: ${filters.dataContratoFim}`);
                if (filters.faixaValorProtegido !== "todos") parts.push(FAIXAS_VALOR.find(f => f.value === filters.faixaValorProtegido)?.label || "");
                return parts.length > 0 ? (
                  <span className="text-[11px] text-muted-foreground truncate max-w-[45%]">{parts.join(" · ")}</span>
                ) : null;
              })()}
              {!filtersOpen && (filters.situacao.length > 0 || filters.regional !== "todos" || filters.montadora !== "todos" || filters.dataContratoInicio || filters.dataContratoFim || filters.faixaValorProtegido !== "todos") && (
                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold shrink-0">
                  {[filters.situacao.length > 0, filters.regional !== "todos", filters.montadora !== "todos", !!filters.dataContratoInicio, !!filters.dataContratoFim, filters.faixaValorProtegido !== "todos"].filter(Boolean).length}
                </span>
              )}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${filtersOpen ? "rotate-180" : ""}`} />
            </button>
            {filtersOpen && (
              <div className="px-4 pb-4 border-t border-border/30 pt-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {[
                    {
                      label: "Situação",
                      el: (
                        <Select value={filters.situacao.length === 0 ? "todas" : filters.situacao.join(",")} onValueChange={(v) => onFiltersChange({ ...filters, situacao: v === "todas" ? [] : v.split(",") })}>
                          <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
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
                      ),
                    },
                    {
                      label: "Regional",
                      el: (
                        <Select value={filters.regional} onValueChange={(v) => onFiltersChange({ ...filters, regional: v })}>
                          <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Todas" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todas</SelectItem>
                            {filterOptions.regionais.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ),
                    },
                    { label: "Contrato De", el: <Input type="date" value={filters.dataContratoInicio} onChange={(e) => onFiltersChange({ ...filters, dataContratoInicio: e.target.value })} className="h-8 text-xs rounded-lg" /> },
                    { label: "Contrato Até", el: <Input type="date" value={filters.dataContratoFim} onChange={(e) => onFiltersChange({ ...filters, dataContratoFim: e.target.value })} className="h-8 text-xs rounded-lg" /> },
                    {
                      label: "Montadora",
                      el: (
                        <Select value={filters.montadora} onValueChange={(v) => onFiltersChange({ ...filters, montadora: v })}>
                          <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Todas" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todas</SelectItem>
                            {filterOptions.montadoras.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ),
                    },
                    {
                      label: "Faixa Valor",
                      el: (
                        <Select value={filters.faixaValorProtegido} onValueChange={(v) => onFiltersChange({ ...filters, faixaValorProtegido: v })}>
                          <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FAIXAS_VALOR.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ),
                    },
                  ].map(({ label, el }) => (
                    <div key={label} className="space-y-1">
                      <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
                      {el}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-3">
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-3 text-xs">
                    <X className="h-3 w-3 mr-1" />Limpar filtros
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total de Placas", value: totalPlacas.toLocaleString("pt-BR"), icon: Car, cls: "text-primary bg-primary/5 border-primary/20" },
          { label: "Valor Protegido", value: formatCurrency(totalValorProtegido), icon: DollarSign, cls: "text-emerald-600 bg-emerald-500/5 border-emerald-500/20" },
          { label: "Ticket Médio", value: formatCurrency(ticketMedio), icon: DollarSign, cls: "text-amber-600 bg-amber-500/5 border-amber-500/20" },
          { label: "Com Eventos", value: totalComEventos.toLocaleString("pt-BR"), icon: ShieldCheck, cls: "text-violet-600 bg-violet-500/5 border-violet-500/20" },
          { label: "Taxa Sinistro", value: `${taxaEventos.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`, icon: TrendingUp, cls: "text-rose-600 bg-rose-500/5 border-rose-500/20" },
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

      {/* ── Situação + Tipo Veículo ── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2 rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Placas por Situação</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            {placasPorSituacao.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(120, placasPorSituacao.length * 38)}>
                <BarChart data={placasPorSituacao} layout="vertical" margin={{ top: 2, right: 64, bottom: 2, left: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Placas"]} contentStyle={ttStyle} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26} background={{ fill: "hsl(var(--muted)/0.25)", radius: 6 }}>
                    {placasPorSituacao.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    <LabelList dataKey="value" position="right" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 11, fontWeight: 700, fill: "hsl(var(--foreground))" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Tipo de Veículo</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            {tipoVeiculoData.length > 0 ? (
              <div className="space-y-2.5 pt-1">
                {tipoVeiculoData.slice(0, 8).map((item) => {
                  const pct = totalPlacas > 0 ? (item.value / totalPlacas) * 100 : 0;
                  return (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground truncate w-20 shrink-0">{item.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: item.fill }} />
                      </div>
                      <span className="text-[11px] font-bold tabular-nums w-10 text-right">{item.value.toLocaleString("pt-BR")}</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>}
          </CardContent>
        </Card>
      </div>

      {/* ── Valor FIPE por Faixa + Combustível ── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2 rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Valor FIPE por Faixa</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[200px]">
              {valorProtegidoPorFaixa.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={valorProtegidoPorFaixa} margin={{ top: 18, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="faixa" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Veículos"]} contentStyle={ttStyle} />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} maxBarSize={36}>
                      <LabelList dataKey="total" position="top" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 9, fontWeight: 600, fill: "hsl(var(--muted-foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Sem dados</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Combustível</CardTitle></CardHeader>
          <CardContent className="px-3 pb-4">
            {combustivelData.length > 0 ? (
              <div className="space-y-2 pt-1">
                {combustivelData.map((item) => {
                  const total = combustivelData.reduce((s, i) => s + i.value, 0);
                  const pct = total > 0 ? (item.value / total) * 100 : 0;
                  return (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground truncate w-20 shrink-0">{item.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: item.fill }} />
                      </div>
                      <span className="text-[11px] font-bold tabular-nums w-10 text-right">{item.value.toLocaleString("pt-BR")}</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>}
          </CardContent>
        </Card>
      </div>

      {/* ── Montadoras + Modelos ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Top Montadoras</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            {montadoraData.length > 0 ? (
              <div className="space-y-2 pt-1">
                {montadoraData.map((item) => {
                  const pct = totalPlacas > 0 ? (item.value / totalPlacas) * 100 : 0;
                  return (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground truncate w-24 shrink-0">{item.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: item.fill }} />
                      </div>
                      <span className="text-[11px] font-bold tabular-nums w-12 text-right">{item.value.toLocaleString("pt-BR")}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground py-6 text-center">Sem dados</p>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Top Modelos</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            {modeloData.length > 0 ? (
              <div className="space-y-2 pt-1">
                {modeloData.map((item) => {
                  const pct = totalPlacas > 0 ? (item.value / totalPlacas) * 100 : 0;
                  return (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground truncate w-32 shrink-0">{item.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: item.fill }} />
                      </div>
                      <span className="text-[11px] font-bold tabular-nums w-12 text-right">{item.value.toLocaleString("pt-BR")}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground py-6 text-center">Sem dados</p>}
          </CardContent>
        </Card>
      </div>

      {/* ── Cadastros por Mês ── */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-1 pt-4 px-5">
          <CardTitle className="text-sm font-semibold">Cadastros por Mês <span className="text-[11px] font-normal text-muted-foreground ml-1">(últimos 12 meses)</span></CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {cadastrosPorMesChart.length > 0 ? (
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(600, cadastrosPorMesChart.length * 72) }}>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cadastrosPorMesChart} margin={{ top: 18, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Cadastros"]} contentStyle={ttStyle} />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} maxBarSize={48}>
                        <LabelList dataKey="total" position="top" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">Sem dados</div>}
          <MonthsCounterList items={cadastrosPorMes} maxHeightClass="max-h-[160px]" />
        </CardContent>
      </Card>

      {/* ── Veículos com Evento por Mês ── */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-1 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Veículos com Evento por Mês
              <span className="text-[11px] font-normal text-muted-foreground ml-1">(últimos 12 meses)</span>
            </CardTitle>
            {eventosPorMesChart.length > 0 && (
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500 inline-block" />Com Evento</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-muted inline-block" />Sem Evento</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {eventosPorMesChart.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(600, eventosPorMesChart.length * 72) }}>
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={eventosPorMesChart} margin={{ top: 18, right: 12, bottom: 4, left: 0 }} barCategoryGap="30%">
                        <defs>
                          <linearGradient id="gradEvento" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.7} />
                          </linearGradient>
                          <linearGradient id="gradSemEvento" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
                        <Tooltip
                          contentStyle={ttStyle}
                          formatter={(v: any, name: string) => [Number(v).toLocaleString("pt-BR"), name]}
                        />
                        <Bar dataKey="semEvento" name="Sem Evento" stackId="a" fill="url(#gradSemEvento)" maxBarSize={48} />
                        <Bar dataKey="comEvento" name="Com Evento" stackId="a" fill="url(#gradEvento)" radius={[5, 5, 0, 0]} maxBarSize={48}>
                          <LabelList dataKey="comEvento" position="top" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 9, fontWeight: 600, fill: "hsl(var(--muted-foreground))" }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              {/* Taxa de evento por mês */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                  <span>Mês</span>
                  <span className="flex items-center gap-6"><span>Com Evento</span><span>Total</span><span>Taxa %</span></span>
                </div>
                <div className="overflow-y-auto max-h-[160px] pr-1 space-y-1">
                  {[...eventosPorMesChart].reverse().map((it) => (
                    <div key={it.mes} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-2.5 py-1.5">
                      <span className="text-xs font-medium">{it.mes}</span>
                      <div className="flex items-center gap-6">
                        <span className="text-xs font-bold tabular-nums min-w-[52px] text-right text-violet-600">{Number(it.comEvento).toLocaleString("pt-BR")}</span>
                        <span className="text-xs tabular-nums min-w-[48px] text-right text-muted-foreground">{Number(it.total).toLocaleString("pt-BR")}</span>
                        <span className="text-[11px] font-semibold tabular-nums min-w-[56px] text-right text-rose-500">{it.taxa.toFixed(2)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">Sem dados de evento</div>}
        </CardContent>
      </Card>


      <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
        {[
          { title: "Sexo", data: sexoData },
          { title: "Estado Civil", data: estadoCivilData },
        ].map(({ title, data }) => (
          <Card key={title} className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              {data.length > 0 ? (
                <div className="space-y-2 pt-1">
                  {data.map((item) => {
                    const total = data.reduce((s, i) => s + i.value, 0);
                    const pct = total > 0 ? (item.value / total) * 100 : 0;
                    return (
                      <div key={item.name} className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground truncate w-20 shrink-0">{item.name}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: item.fill }} />
                        </div>
                        <span className="text-[11px] font-bold tabular-nums w-12 text-right">{item.value.toLocaleString("pt-BR")}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-sm text-muted-foreground py-6 text-center">Sem dados</p>}
            </CardContent>
          </Card>
        ))}

        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Faixa Etária</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[200px]">
              {idadeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={idadeData} margin={{ top: 14, right: 4, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="faixa" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Associados"]} contentStyle={ttStyle} />
                    <Bar dataKey="total" fill="#ec4899" radius={[5, 5, 0, 0]} maxBarSize={40}>
                      <LabelList dataKey="total" position="top" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 9, fontWeight: 600, fill: "hsl(var(--muted-foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Sem dados</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Voluntário + Categoria ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Voluntário</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            {voluntarioData.length > 0 ? (
              <div className="overflow-y-auto max-h-[240px] pr-1 space-y-1.5 pt-1">
                {voluntarioData.map((item) => {
                  const pct = voluntarioTotal > 0 ? (item.value / voluntarioTotal) * 100 : 0;
                  return (
                    <div key={item.name} className="flex items-center gap-2.5">
                      <span className="text-[11px] text-muted-foreground truncate w-32 shrink-0">{item.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: item.fill }} />
                      </div>
                      <span className="text-[11px] font-bold tabular-nums w-12 text-right">{item.value.toLocaleString("pt-BR")}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Categoria</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={Math.max(140, categoriaData.length * 32)}>
              {categoriaData.length > 0 ? (
                <BarChart data={categoriaData} layout="vertical" margin={{ top: 2, right: 56, bottom: 2, left: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Veículos"]} contentStyle={ttStyle} />
                  <Bar dataKey="value" fill="#14b8a6" radius={[0, 5, 5, 0]} maxBarSize={22} background={{ fill: "hsl(var(--muted)/0.25)", radius: 5 }}>
                    {categoriaData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    <LabelList dataKey="value" position="right" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--muted-foreground))" }} />
                  </Bar>
                </BarChart>
              ) : <p className="text-sm text-muted-foreground py-6 text-center">Sem dados</p>}
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Ano do Modelo ── */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Ano do Modelo</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="h-[200px]">
            {anoModeloData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={anoModeloData} margin={{ top: 14, right: 8, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Veículos"]} contentStyle={ttStyle} />
                  <Bar dataKey="value" fill="#06b6d4" radius={[5, 5, 0, 0]} maxBarSize={30}>
                    {anoModeloData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Sem dados</div>}
          </div>
        </CardContent>
      </Card>

      {/* ── Regional / Cooperativa ── */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">Regional / Cooperativa</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={Math.max(100, regionalData.length * 32)}>
            {regionalData.length > 0 ? (
              <BarChart data={regionalData} layout="vertical" margin={{ top: 2, right: 56, bottom: 2, left: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => [Number(v).toLocaleString("pt-BR"), "Veículos"]} contentStyle={ttStyle} />
                <Bar dataKey="value" fill="#2563eb" radius={[0, 5, 5, 0]} maxBarSize={22} background={{ fill: "hsl(var(--muted)/0.25)", radius: 5 }}>
                  <LabelList dataKey="value" position="right" formatter={(v: any) => Number(v).toLocaleString("pt-BR")} style={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--muted-foreground))" }} />
                </Bar>
              </BarChart>
            ) : <p className="text-sm text-muted-foreground py-6 text-center">Sem dados</p>}
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
