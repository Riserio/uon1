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

// ✅ RESUMO “FORA DO GRÁFICO”
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

// ✅ LABEL “FORA” PARA PIZZA (mostra valor + %)
const pieLabel = (props: any) => {
  const { name, value, percent } = props;
  const pct = typeof percent === "number" ? `${(percent * 100).toFixed(0)}%` : "";
  return `${name}: ${Number(value).toLocaleString("pt-BR")} ${pct ? `(${pct})` : ""}`;
};

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
      result = result.filter((r) => r.valor_protegido >= min && r.valor_protegido <= max);
    }

    return result;
  }, [registros, filters]);

  const totalPlacas = filtered.length;
  const totalValorProtegido = filtered.reduce((sum, r) => sum + (r.valor_protegido || 0), 0);
  const ticketMedio = totalPlacas > 0 ? totalValorProtegido / totalPlacas : 0;
  const totalComEventos = filtered.filter((r) => (r.qtde_evento || 0) > 0).length;

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

  const cadastrosPorMes = useMemo(() => {
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

  // ✅ NOVO: VEÍCULOS COM EVENTOS POR MÊS
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
  const categoriaData = useMemo(() => buildRanking("categoria"), [filtered]);
  const anoModeloData = useMemo(() => buildRanking("ano_modelo", 15), [filtered]);
  const passageirosData = useMemo(() => buildRanking("num_passageiros"), [filtered]);
  const regionalData = useMemo(() => buildRanking("cooperativa", 15), [filtered]);
  const voluntarioData = useMemo(() => buildRanking("voluntario"), [filtered]);

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

      {/* Row 1: Situação + Cadastros */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Placas por Situação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {placasPorSituacao.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={placasPorSituacao}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                      label={pieLabel}
                      labelLine={false}
                    >
                      {placasPorSituacao.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => v.toLocaleString("pt-BR")} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            {/* ✅ números fora */}
            <NumbersList items={placasPorSituacao} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cadastros por Mês (Data Contrato)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {cadastrosPorMes.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cadastrosPorMes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip formatter={(v: any) => v.toLocaleString("pt-BR")} />
                    <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]}>
                      {/* ✅ valor na barra */}
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            {/* ✅ números fora */}
            <NumbersList items={cadastrosPorMes.map((i) => ({ name: i.mes, value: i.total }))} />
          </CardContent>
        </Card>
      </div>

      {/* ✅ NOVA ROW: VEÍCULOS COM EVENTOS POR MÊS */}
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Veículos com Eventos por Mês (Data Contrato)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              {eventosPorMes.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventosPorMes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip formatter={(v: any) => v.toLocaleString("pt-BR")} />
                    <Bar dataKey="total" fill="#7c3aed" radius={[4, 4, 0, 0]}>
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
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

            {/* ✅ números fora */}
            <NumbersList items={eventosPorMes.map((i) => ({ name: i.mes, value: i.total }))} />
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Valor Faixa + Montadora */}
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
                    <YAxis />
                    <Tooltip formatter={(v: any) => v.toLocaleString("pt-BR")} />
                    <Bar dataKey="total" fill="#16a34a" radius={[4, 4, 0, 0]}>
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            <NumbersList items={valorProtegidoPorFaixa.map((i) => ({ name: i.faixa, value: i.total }))} />
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
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => v.toLocaleString("pt-BR")} />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                      <LabelList
                        dataKey="value"
                        position="right"
                        formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
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

      {/* Row 3: Sexo + Idade */}
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
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                      label={pieLabel}
                      labelLine={false}
                    >
                      {sexoData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => v.toLocaleString("pt-BR")} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            <NumbersList items={sexoData} />
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
                    <YAxis />
                    <Tooltip formatter={(v: any) => v.toLocaleString("pt-BR")} />
                    <Bar dataKey="total" fill="#ec4899" radius={[4, 4, 0, 0]}>
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(v: any) => Number(v).toLocaleString("pt-BR")}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
              )}
            </div>

            <NumbersList items={idadeData.map((i) => ({ name: i.faixa, value: i.total }))} />
          </CardContent>
        </Card>
      </div>

      {/* (o resto do seu componente pode ficar igual; se quiser, é só repetir o mesmo padrão:
          - Bar: <LabelList .../>
          - Pizza: label={pieLabel} + <NumbersList .../> abaixo
      ) */}
      {/* ... */}
    </div>
  );
}
