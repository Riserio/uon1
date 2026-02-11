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

type MonthItem = { mes: string; total: number; raw: string; variacao?: number | null };

// ✅ lista com scroll + % (para “Voluntário” e “Eventos por mês”)
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
  totalBase?: number; // se não vier, calcula pelo somatório dos itens
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

  // Placas por Situação
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

  // Cadastros por mês COM variação (lista: mais atual -> mais antigo)
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

    // base asc para calcular variação corretamente
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

    // lista: mais atual -> mais antigo
    return ascWithVar.sort((a, b) => b.raw.localeCompare(a.raw));
  }, [filtered]);

  // gráfico cronológico (antigo->novo)
  const cadastrosPorMesChart = useMemo(() => [...cadastrosPorMes].reverse(), [cadastrosPorMes]);

  // Veículos com eventos por mês (gráfico)
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

  // Ranking builder
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

  const voluntarioData = useMemo(() => buildRanking("voluntario"), [filtered]);
  const voluntarioTotal = useMemo(
    () => voluntarioData.reduce((s: number, i: any) => s + (i.value || 0), 0),
    [voluntarioData],
  );

  const clearFilters = () => {
    onFiltersChange({
      situacao: ["ATIVO", "SUSPENSO"],
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

  // para a lista de eventos: mais atual -> mais antigo
  const eventosPorMesList = [...eventosPorMes]
    .slice()
    .sort((a, b) => (b.raw || "").localeCompare(a.raw || ""))
    .map((i) => ({ name: i.mes, value: i.total }));

  const eventosTotal = eventosPorMesList.reduce((s, i) => s + (i.value || 0), 0);

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
                value={filters.situacao.join(",") || "ATIVO,SUSPENSO"}
                onValueChange={(v) => onFiltersChange({ ...filters, situacao: v.split(",") })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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

      {/* Placas por Situação + Eventos por Mês */}
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
              titlePct="%"
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

            {/* ✅ scroll + % (participação no total de eventos do período) */}
            <ScrollCounterList
              titleLeft="Mês"
              titleRight="Qtd"
              titlePct="%"
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

            {/* ✅ scroll + % + variação + meses mais atuais primeiro */}
            <MonthsCounterList items={cadastrosPorMes} maxHeightClass="max-h-[260px]" />
          </CardContent>
        </Card>
      </div>

      {/* Voluntário (full width) com scroll + % */}
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Voluntário</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[380px]">
              {voluntarioData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={voluntarioData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={130}
                      paddingAngle={2}
                      label={pieLabel}
                      labelLine={false}
                    >
                      {voluntarioData.map((e: any, i: number) => (
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

            {/* ✅ scroll + % (participação no total de voluntário) */}
            <ScrollCounterList
              titleLeft="Voluntário"
              titleRight="Qtd"
              titlePct="%"
              items={voluntarioData.map((i: any) => ({ name: i.name, value: i.value }))}
              totalBase={voluntarioTotal}
              maxHeightClass="max-h-[240px]"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
