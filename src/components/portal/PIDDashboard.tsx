import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency, formatPercent, calcPercent } from "@/lib/formatters";
import { classificarSituacao } from "@/lib/situacaoVeiculo";
import {
  DollarSign,
  Car,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Percent,
  BarChart3,
  CreditCard,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  LayoutDashboard,
  ChevronDown,
  UserX,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
} from "recharts";

interface PIDDashboardProps {
  corretoraId?: string;
}

const mesesNome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/* =====================================================================
 * Formatação compartilhada
 * ===================================================================== */
type ValueFormat = "number" | "percent" | "currency" | "decimal";

const fmtValue = (v: number, format: ValueFormat): string => {
  switch (format) {
    case "currency":
      return formatCurrency(v || 0);
    case "percent":
      return `${Number(v || 0)
        .toFixed(2)
        .replace(".", ",")}%`;
    case "decimal":
      return Number(v || 0)
        .toFixed(2)
        .replace(".", ",");
    default:
      return (v || 0).toLocaleString("pt-BR");
  }
};

const fmtAxis = (v: number, format: ValueFormat): string => {
  switch (format) {
    case "currency":
      return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);
    case "percent":
      return `${v.toFixed(1)}%`;
    case "decimal":
      return v.toFixed(2);
    default:
      return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString("pt-BR");
  }
};

/** Moeda compacta para KPIs (evita estourar o card): R$ 954,4 mil / R$ 1,2 mi */
const formatCurrencyCompact = (v: number): string => {
  const abs = Math.abs(v || 0);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 100_000) return `R$ ${(v / 1_000).toFixed(1).replace(".", ",")} mil`;
  return formatCurrency(v || 0);
};

const EmptyChart = () => (
  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem dados disponíveis</div>
);

/* =====================================================================
 * Tooltip base (mesmo padrão visual para todos os gráficos)
 * ===================================================================== */
const DefaultTooltipContent = ({
  active,
  payload,
  label,
  formatter,
  showTotal = false,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  formatter?: (value: number) => string;
  showTotal?: boolean;
}) => {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((acc, item) => acc + (item.value || 0), 0);
  return (
    <div className="rounded-md border bg-background px-3 py-2 shadow-sm text-xs">
      {label && <div className="font-semibold mb-1">{label}</div>}
      {payload.map((item: any) => {
        const value = item.value || 0;
        const color = item.color || item.stroke || item.fill || "#6b7280";
        return (
          <div key={item.dataKey} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <span>{item.name || item.dataKey}</span>
            </span>
            <span>{formatter ? formatter(value) : value.toLocaleString("pt-BR")}</span>
          </div>
        );
      })}
      {showTotal && (
        <div className="mt-1 border-t pt-1 flex items-center justify-between font-semibold">
          <span>Total :</span>
          <span>{formatter ? formatter(total) : total.toLocaleString("pt-BR")}</span>
        </div>
      )}
    </div>
  );
};

const PermanenciaTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const entradaItem = payload.find((p: any) => p.dataKey === "entrada");
  const perdasItem = payload.find((p: any) => p.dataKey === "perdas");
  const variacaoItem = payload.find((p: any) => p.dataKey === "variacao_permanencia");
  const entrada = entradaItem?.value || 0;
  const perdas = perdasItem?.value || 0;
  const saldo = entrada - perdas;
  const variacao = variacaoItem?.value || 0;
  return (
    <div className="rounded-md border bg-background px-3 py-2 shadow-sm text-xs">
      <div className="font-semibold mb-1">{label}</div>
      {entradaItem && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#16a34a" }} />
            <span>Entrada</span>
          </span>
          <span>{entrada.toLocaleString("pt-BR")}</span>
        </div>
      )}
      {perdasItem && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#dc2626" }} />
            <span>Perdas</span>
          </span>
          <span>{perdas.toLocaleString("pt-BR")}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 font-semibold mt-1 border-t pt-1">
        <span>Saldo (Entrada - Perdas)</span>
        <span>{saldo.toLocaleString("pt-BR")}</span>
      </div>
      {variacaoItem && (
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#2563eb" }} />
            <span>% Var. Saldo vs mês anterior</span>
          </span>
          <span>{formatPercent(variacao || 0)}</span>
        </div>
      )}
    </div>
  );
};

/* =====================================================================
 * Componentes genéricos de gráfico — garantem visual 100% consistente
 * e eliminam repetição de código.
 * ===================================================================== */
interface ChartCardProps {
  title: string;
  subtitle?: string;
  height?: number;
  children: React.ReactNode;
  hasData: boolean;
  /** Cor de destaque do widget (mesma cor da série) */
  accentColor?: string;
  /** Conteúdo opcional à direita do cabeçalho (ex.: toggle Mês/Dia) */
  headerRight?: React.ReactNode;
}

const ChartCard = ({ title, subtitle, height = 260, children, hasData, accentColor = "#64748b", headerRight }: ChartCardProps) => (
  <Card className="rounded-xl border-border/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
    <CardHeader className="pb-1 pt-4 px-4">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: accentColor }}
        />
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {headerRight && <div className="ml-auto">{headerRight}</div>}
      </div>
      {subtitle && <p className="text-xs text-muted-foreground pl-[18px]">{subtitle}</p>}
    </CardHeader>
    <CardContent className="px-2 pb-3" style={{ height }}>
      {hasData ? children : <EmptyChart />}
    </CardContent>
  </Card>
);

/** Label de valor exibido apenas no último ponto — mantém o gráfico limpo. */
const lastPointLabel =
  (dataLength: number, color: string, format: ValueFormat) =>
  ({ x, y, value, index, width }: any) => {
    if (index !== dataLength - 1) return null;
    const cx = width != null ? x + width / 2 : x;
    return (
      <text x={cx} y={y - 8} textAnchor="middle" fontSize={10} fontWeight={600} fill={color}>
        {fmtValue(Number(value), format)}
      </text>
    );
  };

/**
 * Corta os meses iniciais em que a(s) série(s) exibida(s) ainda não tinham
 * dado. Em "todo período" as linhas antigas do PID existem só com
 * placas_ativas (reconstruídas pela data de contrato); sem o corte, gráficos
 * como Faturamento, Churn ou Total de Associados mostravam anos de zeros à
 * esquerda e o dado real virava um "spike" ilegível no fim do eixo.
 */
const trimLeadingEmpty = (data: any[], keys: string[]) => {
  const first = data.findIndex((d) => keys.some((k) => Math.abs(Number(d?.[k] ?? 0)) > 0));
  return first <= 0 ? data : data.slice(first);
};

interface SingleSeriesChartProps {
  data: any[];
  dataKey: string;
  name: string;
  color: string;
  kind: "line" | "bar";
  format?: ValueFormat;
}

/** Gráfico de uma série só: sem legenda (o título do card já identifica). */
const SingleSeriesChart = ({ data: rawData, dataKey, name, color, kind, format = "number" }: SingleSeriesChartProps) => {
  const data = useMemo(() => trimLeadingEmpty(rawData, [dataKey]), [rawData, dataKey]);
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
      <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
      <YAxis
        tickFormatter={(v) => fmtAxis(v, format)}
        tick={{ fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        width={52}
      />
      <Tooltip content={<DefaultTooltipContent formatter={(v: number) => fmtValue(v, format)} />} />
    </>
  );
  if (kind === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
          {common}
          <Bar
            dataKey={dataKey}
            name={name}
            fill={color}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            label={lastPointLabel(data.length, color, format)}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  // Linha com preenchimento em degradê (estilo widget)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {common}
        <Area
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#grad-${dataKey})`}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          label={lastPointLabel(data.length, color, format)}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

interface MultiSeries {
  dataKey: string;
  name: string;
  color: string;
}

interface MultiSeriesChartProps {
  data: any[];
  series: MultiSeries[];
  kind: "line" | "bar";
  format?: ValueFormat;
  showTotal?: boolean;
}

/** Gráfico com poucas séries (2 a 4), com legenda compacta. */
const MultiSeriesChart = ({ data: rawData, series, kind, format = "number", showTotal = false }: MultiSeriesChartProps) => {
  const data = useMemo(
    () => trimLeadingEmpty(rawData, series.map((s) => s.dataKey)),
    [rawData, series],
  );
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
      <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
      <YAxis
        tickFormatter={(v) => fmtAxis(v, format)}
        tick={{ fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        width={52}
      />
      <Tooltip
        content={<DefaultTooltipContent formatter={(v: number) => fmtValue(v, format)} showTotal={showTotal} />}
      />
      <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
    </>
  );
  if (kind === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          {common}
          {series.map((s) => (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              name={s.name}
              fill={s.color}
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {common}
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

/* =====================================================================
 * Indicador de variação vs mês anterior
 * ===================================================================== */
interface VariationIndicatorProps {
  current: number;
  previous: number | null | undefined;
  format?: "number" | "currency" | "percent";
}

const VariationIndicator = ({ current, previous, format = "number" }: VariationIndicatorProps) => {
  if (previous === null || previous === undefined) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
        <Minus className="h-3 w-3" />
        <span>—</span>
      </div>
    );
  }
  const diff = current - previous;
  const percentChange = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : current > 0 ? 100 : 0;
  const isPositive = diff > 0;
  const isNeutral = diff === 0;
  const formatDiff = () => {
    switch (format) {
      case "currency":
        return formatCurrency(Math.abs(diff));
      case "percent":
        return Math.abs(diff).toFixed(2).replace(".", ",") + " p.p.";
      default:
        return Math.abs(diff).toLocaleString("pt-BR");
    }
  };
  const colorClass = isNeutral ? "text-muted-foreground" : isPositive ? "text-green-600" : "text-red-600";
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  return (
    <div className={`flex items-center gap-1 text-xs mt-1 ${colorClass}`}>
      <Icon className="h-3 w-3" />
      <span className="sm:hidden">
        {isPositive ? "+" : isNeutral ? "" : "-"}
        {Math.abs(percentChange).toFixed(1)}%
      </span>
      <span className="hidden sm:inline">
        {isPositive ? "+" : isNeutral ? "" : "-"}
        {formatDiff()} ({isPositive ? "+" : ""}
        {percentChange.toFixed(1)}%)
      </span>
    </div>
  );
};

/* =====================================================================
 * Card de KPI padronizado
 * ===================================================================== */
type KpiAccent = "blue" | "green" | "emerald" | "purple" | "cyan" | "amber" | "red" | "rose";

const accentClasses: Record<KpiAccent, string> = {
  blue: "bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20",
  green: "bg-gradient-to-br from-green-500/10 to-transparent border-green-500/20",
  emerald: "bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20",
  purple: "bg-gradient-to-br from-purple-500/10 to-transparent border-purple-500/20",
  cyan: "bg-gradient-to-br from-cyan-500/10 to-transparent border-cyan-500/20",
  amber: "bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20",
  red: "bg-gradient-to-br from-red-500/10 to-transparent border-red-500/20",
  rose: "bg-gradient-to-br from-rose-500/10 to-transparent border-rose-500/20",
};

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Valor completo exibido no hover quando `value` está compactado */
  fullValue?: string;
  accent: KpiAccent;
  badge?: string;
  variation?: React.ReactNode;
  valueClassName?: string;
}

const KpiCard = ({ icon, label, value, fullValue, accent, badge, variation, valueClassName }: KpiCardProps) => (
  <Card className={`${accentClasses[accent]} shadow-sm min-w-0`}>
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        {icon}
        {badge && (
          <Badge variant="outline" className="text-[10px]">
            {badge}
          </Badge>
        )}
      </div>
      <div className="mt-2 min-w-0">
        <div
          className={`text-lg sm:text-xl xl:text-2xl font-bold tracking-tight truncate ${valueClassName || ""}`}
          title={fullValue || value}
        >
          {value}
        </div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        {variation}
      </div>
    </CardContent>
  </Card>
);

/* =====================================================================
 * Componente principal
 * ===================================================================== */
export default function PIDDashboard({ corretoraId }: PIDDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState<string>("");
  const [mes, setMes] = useState<string>("");
  const [todoPeriodo, setTodoPeriodo] = useState(false); // padrão: mês atual
  const [dadosAno, setDadosAno] = useState<any[]>([]);
  const [dadosAtual, setDadosAtual] = useState<any>(null);
  const [dadosAnterior, setDadosAnterior] = useState<any>(null);
  // Contagem SEMPRE ATUAL de placas a partir da base ativa (mesma fonte do
  // Estudo de Base) — garante que Indicadores e Estudo de Base batem o mesmo
  // número (ex.: 4909 ativas) e alimenta o card de Inadimplentes.
  const [baseCounts, setBaseCounts] = useState<{ ativas: number; inadimplentes: number } | null>(null);
  // Janela dos GRÁFICOS (independente do mês dos cards). 999 = tudo.
  const [chartRange, setChartRange] = useState<number>(12);
  // Modo do gráfico da frota: 'mes' (histórico mensal) ou 'dia' (snapshot diário)
  const [frotaModo, setFrotaModo] = useState<"mes" | "dia">("mes");
  const [frotaDiaData, setFrotaDiaData] = useState<{ mes: string; placas_ativas: number }[]>([]);
  // Inadimplentes do MÊS CORRENTE (fonte Cobrança): boletos JÁ VENCIDOS e ainda
  // em aberto, contados por placa distinta. Ver cobranca_boletos_ativos.
  const [cobrancaInad, setCobrancaInad] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [ultimoMesComDados, setUltimoMesComDados] = useState<{ ano: string; mes: string } | null>(null);
  const [filterSlot, setFilterSlot] = useState<HTMLElement | null>(null);
  const [periodoOpen, setPeriodoOpen] = useState(false);

  // Slot acima das abas (definido em PID.tsx) onde a barra de período é projetada
  useEffect(() => {
    setFilterSlot(document.getElementById("pid-filters-slot"));
  }, []);

  const currentYear = new Date().getFullYear();
  const anos = Array.from({ length: 6 }, (_, i) => (currentYear + 1 - i).toString());

  const mesesOptions = [
    { value: "1", label: "Janeiro" },
    { value: "2", label: "Fevereiro" },
    { value: "3", label: "Março" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Maio" },
    { value: "6", label: "Junho" },
    { value: "7", label: "Julho" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  const fetchMostRecentPeriod = async () => {
    if (!corretoraId) return;
    try {
      const { data: results, error } = await supabase
        .from("pid_operacional")
        .select("ano, mes, placas_ativas, faturamento_operacional, total_recebido")
        .eq("corretora_id", corretoraId)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false })
        .limit(12);
      if (error) throw error;

      // Nunca considerar meses FUTUROS como período atual (o backfill de
      // faturamento cria linhas de meses à frente com boletos a vencer).
      // O Indicadores deve sempre mostrar o mês corrente.
      const now = new Date();
      const curY = now.getFullYear();
      const curM = now.getMonth() + 1;
      const naoFuturos = (results || []).filter(
        (r) => r.ano < curY || (r.ano === curY && r.mes <= curM),
      );

      if (naoFuturos.length > 0) {
        // Regra: usa o MÊS CORRENTE quando tem dados; se o mês atual ainda não
        // tem importação/dados, cai para o mês mais recente com dados (mês
        // passado) até que o mês atual seja atualizado.
        const temDados = (r: { placas_ativas?: number | null; faturamento_operacional?: number | null; total_recebido?: number | null }) =>
          (r.placas_ativas && r.placas_ativas > 0) ||
          (r.faturamento_operacional && r.faturamento_operacional > 0) ||
          (r.total_recebido && r.total_recebido > 0);
        const mesCorrenteComDados = naoFuturos.find((r) => r.ano === curY && r.mes === curM && temDados(r));
        const registroComDados = naoFuturos.find(temDados);
        const mesCorrente = naoFuturos.find((r) => r.ano === curY && r.mes === curM);
        const result = mesCorrenteComDados || registroComDados || mesCorrente || naoFuturos[0];
        const anoStr = result.ano.toString();
        const mesStr = result.mes.toString();
        setAno(anoStr);
        setMes(mesStr);
        setUltimoMesComDados({ ano: anoStr, mes: mesStr });
      } else {
        const anoStr = new Date().getFullYear().toString();
        const mesStr = (new Date().getMonth() + 1).toString();
        setAno(anoStr);
        setMes(mesStr);
        setUltimoMesComDados(null);
      }
      setInitialized(true);
    } catch (error: any) {
      console.error("Error fetching most recent period:", error);
      const anoStr = new Date().getFullYear().toString();
      const mesStr = (new Date().getMonth() + 1).toString();
      setAno(anoStr);
      setMes(mesStr);
      setUltimoMesComDados(null);
      setInitialized(true);
    }
  };

  const handleTodoPeriodoToggle = () => {
    if (todoPeriodo) {
      if (ultimoMesComDados) {
        setAno(ultimoMesComDados.ano);
        setMes(ultimoMesComDados.mes);
      }
    }
    setTodoPeriodo(!todoPeriodo);
  };

  const fetchDados = async () => {
    if (!corretoraId) return;
    setLoading(true);
    try {
      // SEMPRE carrega a série completa: os GRÁFICOS mostram o histórico (últimos
      // 12 meses por padrão), enquanto os CARDS usam o mês selecionado (dadosAtual).
      const { data: anoData, error } = await supabase
        .from("pid_operacional")
        .select("*")
        .eq("corretora_id", corretoraId)
        .order("ano", { ascending: true })
        .order("mes", { ascending: true });
      if (error) throw error;
      const rows = anoData || [];
      setDadosAno(rows);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const temDados = (d: any) =>
        (d.placas_ativas && d.placas_ativas > 0) ||
        (d.faturamento_operacional && d.faturamento_operacional > 0) ||
        (d.total_recebido && d.total_recebido > 0);
      if (rows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let dadoAtual: any;
        if (!todoPeriodo && ano && mes) {
          dadoAtual =
            rows.find((d) => d.ano === parseInt(ano) && d.mes === parseInt(mes)) ||
            [...rows].reverse().find(temDados) ||
            rows[rows.length - 1];
        } else {
          const comDados = rows.filter(temDados);
          dadoAtual = comDados.length > 0 ? comDados[comDados.length - 1] : rows[rows.length - 1];
        }
        setDadosAtual(dadoAtual);
        const idx = rows.findIndex((d) => d.ano === dadoAtual.ano && d.mes === dadoAtual.mes);
        setDadosAnterior(idx > 0 ? rows[idx - 1] : null);
      } else {
        setDadosAtual(null);
        setDadosAnterior(null);
      }
    } catch (error: any) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (corretoraId && !initialized) {
      fetchMostRecentPeriod();
    }
  }, [corretoraId]);

  useEffect(() => {
    if (corretoraId && initialized) {
      fetchDados();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corretoraId, ano, mes, todoPeriodo, initialized]);

  // Conta placas ATIVAS e INADIMPLENTES direto da base ativa (estudo_base_registros),
  // a mesma fonte usada pelo Estudo de Base. Assim os números batem e ficam sempre atuais.
  useEffect(() => {
    let cancelado = false;
    const fetchBaseCounts = async () => {
      if (!corretoraId) { setBaseCounts(null); return; }
      try {
        const { data: imp } = await supabase
          .from("estudo_base_importacoes")
          .select("id")
          .eq("ativo", true)
          .eq("corretora_id", corretoraId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!imp?.id) { if (!cancelado) setBaseCounts(null); return; }

        let ativas = 0, inadimplentes = 0, offset = 0;
        const PAGE = 1000;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data: batch, error } = await supabase
            .from("estudo_base_registros")
            .select("situacao_veiculo")
            .eq("importacao_id", imp.id)
            .range(offset, offset + PAGE - 1);
          if (error) break;
          if (!batch || batch.length === 0) break;
          for (const r of batch) {
            const cat = classificarSituacao((r as { situacao_veiculo?: string | null }).situacao_veiculo);
            if (cat === "ativo") ativas++;
            else if (cat === "inadimplente") inadimplentes++;
          }
          if (batch.length < PAGE) break;
          offset += PAGE;
          if (offset >= 200000) break;
        }
        if (!cancelado) setBaseCounts({ ativas, inadimplentes });
      } catch {
        if (!cancelado) setBaseCounts(null);
      }
    };
    fetchBaseCounts();
    return () => { cancelado = true; };
  }, [corretoraId]);

  // Inadimplentes do mês corrente via Cobrança (boletos já vencidos e abertos).
  useEffect(() => {
    let cancelado = false;
    const fetchCobrancaInad = async () => {
      if (!corretoraId) { setCobrancaInad(null); return; }
      try {
        const now = new Date();
        const firstISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const todayISO = now.toISOString().slice(0, 10); // hoje (exclusivo) => já vencidos
        const placas = new Set<string>();
        let offset = 0;
        const PAGE = 1000;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data: batch, error } = await supabase
            .from("cobranca_boletos_ativos")
            .select("placas")
            .eq("corretora_id", corretoraId)
            .ilike("situacao", "ABERTO")
            .is("data_pagamento", null)
            .gte("data_vencimento", firstISO)
            .lt("data_vencimento", todayISO)
            .range(offset, offset + PAGE - 1);
          if (error) break;
          if (!batch || batch.length === 0) break;
          for (const r of batch) {
            const pl = (r as { placas?: string | null }).placas;
            if (pl) placas.add(String(pl).trim().toUpperCase());
          }
          if (batch.length < PAGE) break;
          offset += PAGE;
          if (offset >= 100000) break;
        }
        if (!cancelado) setCobrancaInad(placas.size);
      } catch {
        if (!cancelado) setCobrancaInad(null);
      }
    };
    fetchCobrancaInad();
    return () => { cancelado = true; };
  }, [corretoraId]);

  // Snapshot diário da frota (tabela pid_placas_diario) para o modo "Dia".
  useEffect(() => {
    let cancelado = false;
    const fetchFrotaDia = async () => {
      if (!corretoraId) { setFrotaDiaData([]); return; }
      try {
        const desde = new Date();
        desde.setDate(desde.getDate() - 60);
        // pid_placas_diario ainda não está nos tipos gerados — cast controlado.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from("pid_placas_diario")
          .select("data, placas_ativas")
          .eq("corretora_id", corretoraId)
          .gte("data", desde.toISOString().slice(0, 10))
          .order("data", { ascending: true });
        if (cancelado) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setFrotaDiaData(
          ((data || []) as any[]).map((r) => ({
            mes: String(r.data).slice(8, 10) + "/" + String(r.data).slice(5, 7),
            placas_ativas: Number(r.placas_ativas) || 0,
          })),
        );
      } catch {
        if (!cancelado) setFrotaDiaData([]);
      }
    };
    fetchFrotaDia();
    return () => { cancelado = true; };
  }, [corretoraId]);

  const chartData = useMemo(() => {
    const serie = chartRange >= 999 ? dadosAno : dadosAno.slice(-chartRange);
    return serie.map((d, index) => {
      const prev = index > 0 ? serie[index - 1] : null;
      const currFaturamento = Number(d.faturamento_operacional ?? 0);
      const currRecebido = Number(d.total_recebido ?? 0);
      const prevFaturamento = Number(prev?.faturamento_operacional ?? 0);
      const prevRecebido = Number(prev?.total_recebido ?? 0);
      const crescimentoFaturamento =
        prev && prevFaturamento > 0 ? ((currFaturamento - prevFaturamento) / prevFaturamento) * 100 : 0;
      const crescimentoRecebido = prev && prevRecebido > 0 ? ((currRecebido - prevRecebido) / prevRecebido) * 100 : 0;
      const indiceVeiculosPorAssociado = d.total_associados > 0 ? (d.placas_ativas || 0) / d.total_associados : 0;
      const indiceNovosCadastros = d.placas_ativas > 0 ? calcPercent(d.cadastros_realizados, d.placas_ativas) : 0;
      const totalEntrada = (d.cadastros_realizados || 0) + (d.reativacao || 0);
      const totalPerdas = (d.cancelamentos || 0) + (d.inadimplentes || 0);
      const permanencia = totalEntrada - totalPerdas;
      const indicePermanencia = d.placas_ativas > 0 ? calcPercent(permanencia, d.placas_ativas) : 0;
      const inadimplenciaBoletos =
        d.percentual_inadimplencia_boletos || calcPercent(d.boletos_abertos, d.boletos_emitidos);
      const cancelamentoBoletos =
        d.percentual_cancelamento_boletos || calcPercent(d.boletos_cancelados, d.boletos_emitidos);
      const inadimplenciaFinanceira =
        d.percentual_inadimplencia_financeira || calcPercent(d.valor_boletos_abertos, d.faturamento_operacional);
      const arrecadacaoJuros =
        d.arrecadamento_juros && currRecebido ? (Number(d.arrecadamento_juros || 0) / currRecebido) * 100 : 0;
      const descontadoBanco =
        d.descontado_banco && currRecebido ? (Number(d.descontado_banco || 0) / currRecebido) * 100 : 0;
      const custoTotalEventos =
        d.custo_total_eventos ??
        (d.pagamento_valor_parcial_associado || 0) +
          (d.pagamento_valor_parcial_terceiro || 0) +
          (d.pagamento_valor_integral_associado || 0) +
          (d.pagamento_valor_integral_terceiro || 0) +
          (d.pagamento_valor_vidros || 0) +
          (d.pagamento_valor_carro_reserva || 0);
      const sinistroFinanceiro = d.sinistralidade_financeira ?? calcPercent(custoTotalEventos, d.total_recebido);
      const sinistroGeral = d.sinistralidade_geral ?? calcPercent(d.abertura_total_eventos, d.placas_ativas);
      const mesLabel = `${mesesNome[d.mes - 1]}/${String(d.ano).slice(-2)}`;
      return {
        mes: mesLabel,
        placas_ativas: d.placas_ativas || 0,
        total_cotas: d.total_cotas || 0,
        total_associados: d.total_associados || 0,
        indice_veiculos_por_associado: indiceVeiculosPorAssociado,
        cadastros_realizados: d.cadastros_realizados || 0,
        indice_novos_cadastros: indiceNovosCadastros,
        indice_crescimento_bruto: (d.indice_crescimento_bruto || 0) * 100,
        crescimento_liquido: d.crescimento_liquido || 0,
        cancelamentos: d.cancelamentos || 0,
        inadimplentes: d.inadimplentes || 0,
        reativacao: d.reativacao || 0,
        churn: (d.churn || 0) * 100,
        permanencia: permanencia,
        indice_permanencia: indicePermanencia,
        boletos_emitidos: d.boletos_emitidos || 0,
        boletos_liquidados: d.boletos_liquidados || 0,
        boletos_abertos: d.boletos_abertos || 0,
        boletos_cancelados: d.boletos_cancelados || 0,
        faturamento_operacional: d.faturamento_operacional || 0,
        total_recebido: d.total_recebido || 0,
        baixado_pendencia: d.baixado_pendencia || 0,
        valor_boletos_abertos: d.valor_boletos_abertos || 0,
        valor_boletos_cancelados: d.valor_boletos_cancelados || 0,
        recebimento_operacional: d.recebimento_operacional || 0,
        arrecadamento_juros: d.arrecadamento_juros || 0,
        descontado_banco: d.descontado_banco || 0,
        percentual_inadimplencia_boletos: inadimplenciaBoletos,
        percentual_cancelamento_boletos: cancelamentoBoletos,
        percentual_inadimplencia_financeira: inadimplenciaFinanceira,
        ticket_medio_boleto: d.ticket_medio_boleto || 0,
        percentual_arrecadacao_juros: arrecadacaoJuros,
        percentual_descontado_banco: descontadoBanco,
        percentual_crescimento_faturamento: crescimentoFaturamento,
        percentual_crescimento_recebido: crescimentoRecebido,
        abertura_parcial_associado: d.abertura_indenizacao_parcial_associado || 0,
        abertura_parcial_terceiro: d.abertura_indenizacao_parcial_terceiro || 0,
        abertura_integral_associado: d.abertura_indenizacao_integral_associado || 0,
        abertura_integral_terceiro: d.abertura_indenizacao_integral_terceiro || 0,
        abertura_vidros: d.abertura_vidros || 0,
        abertura_carro_reserva: d.abertura_carro_reserva || 0,
        abertura_total_eventos: d.abertura_total_eventos || 0,
        pagamento_qtd_parcial_associado: d.pagamento_qtd_parcial_associado || 0,
        pagamento_qtd_parcial_terceiro: d.pagamento_qtd_parcial_terceiro || 0,
        pagamento_qtd_integral_associado: d.pagamento_qtd_integral_associado || 0,
        pagamento_qtd_integral_terceiro: d.pagamento_qtd_integral_terceiro || 0,
        pagamento_qtd_vidros: d.pagamento_qtd_vidros || 0,
        pagamento_qtd_carro_reserva: d.pagamento_qtd_carro_reserva || 0,
        custo_total_eventos: d.custo_total_eventos || 0,
        pagamento_valor_parcial_associado: d.pagamento_valor_parcial_associado || 0,
        pagamento_valor_parcial_terceiro: d.pagamento_valor_parcial_terceiro || 0,
        pagamento_valor_integral_associado: d.pagamento_valor_integral_associado || 0,
        pagamento_valor_integral_terceiro: d.pagamento_valor_integral_terceiro || 0,
        pagamento_valor_vidros: d.pagamento_valor_vidros || 0,
        pagamento_valor_carro_reserva: d.pagamento_valor_carro_reserva || 0,
        sinistralidade_financeira: sinistroFinanceiro * 100,
        sinistralidade_geral: sinistroGeral * 100,
        indice_dano_parcial: (d.indice_dano_parcial || 0) * 100,
        indice_dano_integral: (d.indice_dano_integral || 0) * 100,
        ticket_medio_parcial: d.ticket_medio_parcial || 0,
        ticket_medio_integral: d.ticket_medio_integral || 0,
        ticket_medio_vidros: d.ticket_medio_vidros || 0,
        ticket_medio_carro_reserva: d.ticket_medio_carro_reserva || 0,
        acionamentos_assistencia: d.acionamentos_assistencia || 0,
        custo_assistencia: d.custo_assistencia || 0,
        comprometimento_assistencia: (d.comprometimento_assistencia || 0) * 100,
        veiculos_rastreados: d.veiculos_rastreados || 0,
        instalacoes_rastreamento: d.instalacoes_rastreamento || 0,
        custo_rastreamento: d.custo_rastreamento || 0,
        comprometimento_rastreamento: (d.comprometimento_rastreamento || 0) * 100,
        custo_total_rateavel: d.custo_total_rateavel || 0,
        rateio_periodo: d.rateio_periodo || 0,
        percentual_rateio: (d.percentual_rateio || 0) * 100,
        cme_explit: d.cme_explit || 0,
      };
    });
  }, [dadosAno, todoPeriodo, chartRange]);

  const permanenciaSeries = useMemo(() => {
    if (!dadosAno || !dadosAno.length) return [];
    return dadosAno.map((d, index) => {
      const entrada = (d.cadastros_realizados || 0) + (d.reativacao || 0);
      const perdas = (d.cancelamentos || 0) + (d.inadimplentes || 0);
      const saldo = entrada - perdas;
      let variacao = 0;
      if (index > 0) {
        const prev = dadosAno[index - 1];
        const prevEntrada = (prev.cadastros_realizados || 0) + (prev.reativacao || 0);
        const prevPerdas = (prev.cancelamentos || 0) + (prev.inadimplentes || 0);
        const prevSaldo = prevEntrada - prevPerdas;
        if (prevSaldo !== 0) {
          variacao = calcPercent(saldo - prevSaldo, prevSaldo);
        }
      }
      const mesLabel = todoPeriodo ? `${mesesNome[d.mes - 1]}/${String(d.ano).slice(-2)}` : mesesNome[d.mes - 1];
      return { mes: mesLabel, entrada, perdas, saldo, variacao_permanencia: variacao };
    });
  }, [dadosAno, todoPeriodo]);

  const mediasConsolidadas = useMemo(() => {
    if (!todoPeriodo || !dadosAno || dadosAno.length === 0) return null;
    const count = dadosAno.length;
    const sum = (field: string) => dadosAno.reduce((acc, d) => acc + (d[field] || 0), 0);
    const avg = (field: string) => sum(field) / count;
    return {
      sinistralidade_geral: avg("sinistralidade_geral"),
      sinistralidade_financeira: avg("sinistralidade_financeira"),
      percentual_inadimplencia: avg("percentual_inadimplencia"),
      percentual_inadimplencia_boletos: avg("percentual_inadimplencia_boletos"),
      percentual_inadimplencia_financeira: avg("percentual_inadimplencia_financeira"),
    };
  }, [todoPeriodo, dadosAno]);

  const mesAtualLabel = useMemo(() => {
    if (todoPeriodo) {
      if (dadosAtual) return mesesNome[dadosAtual.mes - 1];
      return "";
    }
    const mesIndex = parseInt(mes) - 1;
    return mesesNome[mesIndex] || "";
  }, [todoPeriodo, mes, dadosAtual]);

  // Considera "período atual" quando o mês/ano selecionado é o corrente (ou "Todo
  // Período"). Só nesse caso sobrepomos a contagem viva da base às placas ativas
  // e inadimplentes, para exibir sempre o número atual (ex.: 4909 ativas).
  const isPeriodoAtual = useMemo(() => {
    if (todoPeriodo) return true;
    const now = new Date();
    return parseInt(ano) === now.getFullYear() && parseInt(mes) === now.getMonth() + 1;
  }, [todoPeriodo, ano, mes]);

  const placasAtivasView =
    baseCounts && isPeriodoAtual ? baseCounts.ativas : dadosAtual?.placas_ativas;
  const inadimplentesView =
    isPeriodoAtual && cobrancaInad != null ? cobrancaInad : dadosAtual?.inadimplentes;

  const hasData = chartData.length > 0;

  // Spinner de tela cheia apenas no PRIMEIRO carregamento.
  // Nas trocas de período, o conteúdo permanece visível com leve esmaecimento (transição suave).
  if (loading && !dadosAtual) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const periodoResumo = todoPeriodo
    ? "Todo Período"
    : `${mesesOptions.find((m) => m.value === mes)?.label || ""} · ${ano}`;

  const filterBar = (
    <Card className="bg-card/50 backdrop-blur border-border/50 overflow-hidden">
      {/* Header - sempre visível */}
      <button
        onClick={() => setPeriodoOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Período de análise</span>
          <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full">
            {periodoResumo}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${periodoOpen ? "rotate-180" : ""}`}
        />
      </button>
      {/* Corpo colapsável - controles de período */}
      {periodoOpen && (
        <div className="px-4 pb-4 border-t border-border/50">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">Período</span>
              <Button
                variant={todoPeriodo ? "default" : "outline"}
                size="sm"
                onClick={handleTodoPeriodoToggle}
                className="whitespace-nowrap h-9 w-full"
              >
                Todo Período
              </Button>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">Mês</span>
              {/* Vazio quando "Todo Período" está ativo; selecionar um mês desativa o Todo Período
                  e mantém o ano atual indicado automaticamente */}
              <Select
                value={todoPeriodo ? "" : mes}
                onValueChange={(v) => {
                  setMes(v);
                  if (!ano) setAno(ultimoMesComDados?.ano || new Date().getFullYear().toString());
                  setTodoPeriodo(false);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione o mês" />
                </SelectTrigger>
                <SelectContent>
                  {mesesOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">Ano</span>
              <Select
                value={todoPeriodo ? "" : ano}
                onValueChange={(v) => {
                  setAno(v);
                  if (!mes) setMes(ultimoMesComDados?.mes || (new Date().getMonth() + 1).toString());
                  setTodoPeriodo(false);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione o ano" />
                </SelectTrigger>
                <SelectContent>
                  {anos.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <div
      className={`space-y-6 transition-opacity duration-300 ${loading ? "opacity-50 pointer-events-none" : "opacity-100"}`}
    >
      {/* Barra de período: projetada acima das abas quando o slot existe; senão, renderiza aqui */}
      {filterSlot ? createPortal(filterBar, filterSlot) : filterBar}

      {!dadosAtual ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {todoPeriodo
              ? "Nenhum dado histórico encontrado. Cadastre informações na aba Operacional."
              : `Nenhum dado encontrado para ${mesesOptions.find((m) => m.value === mes)?.label} de ${ano}. Cadastre informações na aba Operacional.`}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ============ KPIs (sempre visíveis) ============ */}
          <div className="grid gap-2.5 sm:gap-3 grid-cols-2 md:grid-cols-4 2xl:grid-cols-8">
            <KpiCard
              icon={<Car className="h-5 w-5 text-blue-500" />}
              accent="blue"
              badge={mesAtualLabel || undefined}
              value={(placasAtivasView ?? 0).toLocaleString("pt-BR")}
              label="Placas Ativas"
              variation={
                <VariationIndicator
                  current={placasAtivasView || 0}
                  previous={dadosAnterior?.placas_ativas}
                  format="number"
                />
              }
            />
            <KpiCard
              icon={<UserX className="h-5 w-5 text-orange-500" />}
              accent="amber"
              badge={isPeriodoAtual ? mesAtualLabel || undefined : undefined}
              value={(inadimplentesView ?? 0).toLocaleString("pt-BR")}
              label="Inadimplentes"
              variation={
                <VariationIndicator
                  current={inadimplentesView || 0}
                  previous={dadosAnterior?.inadimplentes}
                  format="number"
                />
              }
            />
            <KpiCard
              icon={<DollarSign className="h-5 w-5 text-green-500" />}
              accent="green"
              value={formatCurrencyCompact(dadosAtual.faturamento_operacional)}
              fullValue={formatCurrency(dadosAtual.faturamento_operacional)}
              label="Faturamento"
              variation={
                <VariationIndicator
                  current={dadosAtual.faturamento_operacional || 0}
                  previous={dadosAnterior?.faturamento_operacional}
                  format="currency"
                />
              }
            />
            <KpiCard
              icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
              accent="emerald"
              value={formatCurrencyCompact(dadosAtual.total_recebido)}
              fullValue={formatCurrency(dadosAtual.total_recebido)}
              label="Total Recebido"
              variation={
                <VariationIndicator
                  current={dadosAtual.total_recebido || 0}
                  previous={dadosAnterior?.total_recebido}
                  format="currency"
                />
              }
            />
            <KpiCard
              icon={<CreditCard className="h-5 w-5 text-cyan-500" />}
              accent="cyan"
              value={formatCurrency(dadosAtual.ticket_medio_boleto || 0)}
              label="Ticket Médio"
              variation={
                <VariationIndicator
                  current={dadosAtual.ticket_medio_boleto || 0}
                  previous={dadosAnterior?.ticket_medio_boleto}
                  format="currency"
                />
              }
            />
            <KpiCard
              icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
              accent="amber"
              badge={todoPeriodo ? "Média" : undefined}
              value={formatPercent(
                todoPeriodo && mediasConsolidadas
                  ? mediasConsolidadas.sinistralidade_geral
                  : dadosAtual.sinistralidade_geral || 0,
              )}
              label="Sinistralidade Geral"
              variation={
                !todoPeriodo ? (
                  <VariationIndicator
                    current={(dadosAtual.sinistralidade_geral || 0) * 100}
                    previous={dadosAnterior ? (dadosAnterior.sinistralidade_geral || 0) * 100 : null}
                    format="percent"
                  />
                ) : undefined
              }
            />
            <KpiCard
              icon={<Percent className="h-5 w-5 text-red-500" />}
              accent="red"
              badge={todoPeriodo ? "Média" : undefined}
              value={formatPercent(
                todoPeriodo && mediasConsolidadas
                  ? mediasConsolidadas.percentual_inadimplencia_boletos
                  : dadosAtual.percentual_inadimplencia_boletos || 0,
              )}
              label="Inadimpl. Boletos"
              variation={
                !todoPeriodo ? (
                  <VariationIndicator
                    current={(dadosAtual.percentual_inadimplencia_boletos || 0) * 100}
                    previous={dadosAnterior ? (dadosAnterior.percentual_inadimplencia_boletos || 0) * 100 : null}
                    format="percent"
                  />
                ) : undefined
              }
            />
            <KpiCard
              icon={<Percent className="h-5 w-5 text-rose-500" />}
              accent="rose"
              badge={todoPeriodo ? "Média" : undefined}
              value={formatPercent(
                todoPeriodo && mediasConsolidadas
                  ? mediasConsolidadas.percentual_inadimplencia_financeira
                  : dadosAtual.percentual_inadimplencia_financeira || 0,
              )}
              label="Inadimpl. Financeira"
              variation={
                !todoPeriodo ? (
                  <VariationIndicator
                    current={(dadosAtual.percentual_inadimplencia_financeira || 0) * 100}
                    previous={dadosAnterior ? (dadosAnterior.percentual_inadimplencia_financeira || 0) * 100 : null}
                    format="percent"
                  />
                ) : undefined
              }
            />
          </div>

          {/* ============ Abas por tema ============ */}
          <Tabs defaultValue="visao-geral" className="space-y-4">
            {/* Barra de navegação das abas + range de gráficos.
                No mobile empilha: linha 1 = pills roláveis horizontalmente
                (sem overflow, sem quebra em duas linhas com "Financeiro"
                escondido atrás do seletor), linha 2 = seletor. No desktop
                fica lado a lado como antes. */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="-mx-1 overflow-x-auto scrollbar-none">
                <TabsList className="inline-flex h-auto w-max min-w-full md:min-w-0 gap-1 rounded-full bg-muted/60 p-1 mx-1">
                  {[
                    { value: "visao-geral", icon: LayoutDashboard, label: "Visão Geral" },
                    { value: "base", icon: Users, label: "Base de Associados" },
                    { value: "financeiro", icon: CreditCard, label: "Financeiro" },
                    { value: "permanencia", icon: Activity, label: "Permanência" },
                  ].map(({ value, icon: Icon, label }) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
                <span className="text-xs font-medium text-muted-foreground">Gráficos</span>
                <Select value={String(chartRange)} onValueChange={(v) => setChartRange(Number(v))}>
                  <SelectTrigger className="h-8 w-[168px] rounded-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">Últimos 6 meses</SelectItem>
                    <SelectItem value="12">Últimos 12 meses</SelectItem>
                    <SelectItem value="24">Últimos 24 meses</SelectItem>
                    <SelectItem value="999">Todo o período</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ---------- VISÃO GERAL: só o essencial ---------- */}
            <TabsContent value="visao-geral" className="space-y-4">
              {/* Frota protegida — gráfico principal em largura total, com modo Mês/Dia */}
              <ChartCard
                title="Evolução da Frota Protegida"
                accentColor="#2563eb"
                subtitle={frotaModo === "dia" ? "Placas ativas por dia" : "Placas ativas por mês"}
                hasData={frotaModo === "dia" ? frotaDiaData.length > 0 : hasData}
                height={300}
                headerRight={
                  <div className="flex items-center gap-1 rounded-full bg-muted/60 p-0.5">
                    <button
                      onClick={() => setFrotaModo("mes")}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${frotaModo === "mes" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      Mês
                    </button>
                    <button
                      onClick={() => setFrotaModo("dia")}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${frotaModo === "dia" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      Dia
                    </button>
                  </div>
                }
              >
                <SingleSeriesChart
                  data={frotaModo === "dia" ? frotaDiaData : chartData}
                  dataKey="placas_ativas"
                  name="Placas Ativas"
                  color="#2563eb"
                  kind="line"
                />
              </ChartCard>
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard
                  title="Histórico de Inadimplentes"
                  accentColor="#f97316"
                  subtitle="Inadimplentes por mês"
                  hasData={hasData}
                >
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="inadimplentes"
                    name="Inadimplentes"
                    color="#f97316"
                    kind="bar"
                  />
                </ChartCard>
                <ChartCard
                  title="Faturamento vs Recebido"
                  accentColor="#2563eb"
                  subtitle="Comparativo mensal (R$)"
                  hasData={hasData}
                >
                  <MultiSeriesChart
                    data={chartData}
                    kind="line"
                    format="currency"
                    series={[
                      { dataKey: "faturamento_operacional", name: "Faturamento", color: "#2563eb" },
                      { dataKey: "total_recebido", name: "Recebido", color: "#16a34a" },
                    ]}
                  />
                </ChartCard>
                <ChartCard
                  title="Crescimento Líquido"
                  accentColor="#16a34a"
                  subtitle="Saldo de placas no mês"
                  hasData={hasData}
                >
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="crescimento_liquido"
                    name="Crescimento Líquido"
                    color="#16a34a"
                    kind="bar"
                  />
                </ChartCard>
                <ChartCard
                  title="Churn (%)"
                  accentColor="#dc2626"
                  subtitle="Taxa de perda de associados"
                  hasData={hasData}
                >
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="churn"
                    name="Churn"
                    color="#dc2626"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
              </div>
            </TabsContent>

            {/* ---------- BASE DE ASSOCIADOS ---------- */}
            <TabsContent value="base" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <ChartCard title="Total de Associados" accentColor="#8b5cf6" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="total_associados"
                    name="Associados"
                    color="#8b5cf6"
                    kind="bar"
                  />
                </ChartCard>
                <ChartCard title="Veículos por Associado" accentColor="#0ea5e9" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="indice_veiculos_por_associado"
                    name="Veículos/Associado"
                    color="#0ea5e9"
                    kind="line"
                    format="decimal"
                  />
                </ChartCard>
                <ChartCard title="Cadastros Realizados" accentColor="#16a34a" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="cadastros_realizados"
                    name="Cadastros"
                    color="#16a34a"
                    kind="bar"
                  />
                </ChartCard>
                <ChartCard title="Novos Cadastros (%)" accentColor="#f59e0b" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="indice_novos_cadastros"
                    name="% Novos Cadastros"
                    color="#f59e0b"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
                <ChartCard title="Crescimento Bruto (%)" accentColor="#8b5cf6" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="indice_crescimento_bruto"
                    name="Crescimento Bruto"
                    color="#8b5cf6"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
                <ChartCard title="Crescimento Líquido" accentColor="#16a34a" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="crescimento_liquido"
                    name="Crescimento Líquido"
                    color="#16a34a"
                    kind="bar"
                  />
                </ChartCard>
                <ChartCard title="Cancelamentos" accentColor="#dc2626" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="cancelamentos"
                    name="Cancelamentos"
                    color="#dc2626"
                    kind="bar"
                  />
                </ChartCard>
                <ChartCard title="Veículos Inadimplentes" accentColor="#f97316" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="inadimplentes"
                    name="Inadimplentes"
                    color="#f97316"
                    kind="bar"
                  />
                </ChartCard>
                <ChartCard title="Reativações" accentColor="#14b8a6" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="reativacao"
                    name="Reativações"
                    color="#14b8a6"
                    kind="bar"
                  />
                </ChartCard>
              </div>
            </TabsContent>

            {/* ---------- FINANCEIRO ---------- */}
            <TabsContent value="financeiro" className="space-y-4">
              {/* Gráficos principais em destaque */}
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard
                  title="Faturamento vs Recebido"
                  accentColor="#2563eb"
                  subtitle="Principais valores do mês (R$)"
                  height={300}
                  hasData={hasData}
                >
                  <MultiSeriesChart
                    data={chartData}
                    kind="line"
                    format="currency"
                    series={[
                      { dataKey: "faturamento_operacional", name: "Faturamento", color: "#2563eb" },
                      { dataKey: "total_recebido", name: "Recebido", color: "#16a34a" },
                    ]}
                  />
                </ChartCard>
                <ChartCard
                  title="Boletos no Período"
                  accentColor="#2563eb"
                  subtitle="Quantidade por situação"
                  height={300}
                  hasData={hasData}
                >
                  <MultiSeriesChart
                    data={chartData}
                    kind="bar"
                    series={[
                      { dataKey: "boletos_emitidos", name: "Emitidos", color: "#2563eb" },
                      { dataKey: "boletos_liquidados", name: "Liquidados", color: "#16a34a" },
                      { dataKey: "boletos_abertos", name: "Em Aberto", color: "#f59e0b" },
                      { dataKey: "boletos_cancelados", name: "Cancelados", color: "#dc2626" },
                    ]}
                  />
                </ChartCard>
                <ChartCard
                  title="Recebimentos Detalhados"
                  accentColor="#8b5cf6"
                  subtitle="Composição do recebimento (R$)"
                  height={300}
                  hasData={hasData}
                >
                  <MultiSeriesChart
                    data={chartData}
                    kind="line"
                    format="currency"
                    series={[
                      { dataKey: "recebimento_operacional", name: "Receb. Operacional", color: "#8b5cf6" },
                      { dataKey: "baixado_pendencia", name: "Baixado c/ Pendência", color: "#f59e0b" },
                      { dataKey: "valor_boletos_abertos", name: "Boletos em Aberto", color: "#dc2626" },
                    ]}
                  />
                </ChartCard>
                <ChartCard
                  title="Juros e Tarifas Bancárias"
                  accentColor="#0ea5e9"
                  subtitle="Valores acessórios (R$)"
                  height={300}
                  hasData={hasData}
                >
                  <MultiSeriesChart
                    data={chartData}
                    kind="line"
                    format="currency"
                    series={[
                      { dataKey: "arrecadamento_juros", name: "Juros Arrecadados", color: "#0ea5e9" },
                      { dataKey: "descontado_banco", name: "Descontado Banco", color: "#ec4899" },
                    ]}
                  />
                </ChartCard>
              </div>
              {/* Índices percentuais em grade compacta */}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <ChartCard title="Inadimplência de Boletos (%)" accentColor="#dc2626" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="percentual_inadimplencia_boletos"
                    name="% Inadimplência"
                    color="#dc2626"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
                <ChartCard title="Cancelamento de Boletos (%)" accentColor="#f97316" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="percentual_cancelamento_boletos"
                    name="% Cancelamento"
                    color="#f97316"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
                <ChartCard title="Inadimplência Financeira (%)" accentColor="#dc2626" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="percentual_inadimplencia_financeira"
                    name="% Inadimpl. Financeira"
                    color="#dc2626"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
                <ChartCard title="Ticket Médio por Boleto (R$)" accentColor="#16a34a" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="ticket_medio_boleto"
                    name="Ticket Médio"
                    color="#16a34a"
                    kind="line"
                    format="currency"
                  />
                </ChartCard>
                <ChartCard title="Arrecadação de Juros (%)" accentColor="#0ea5e9" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="percentual_arrecadacao_juros"
                    name="% Juros"
                    color="#0ea5e9"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
                <ChartCard title="Descontado Banco (%)" accentColor="#ec4899" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="percentual_descontado_banco"
                    name="% Descontado"
                    color="#ec4899"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
                <ChartCard title="Crescimento de Faturamento (%)" accentColor="#2563eb" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="percentual_crescimento_faturamento"
                    name="% Cresc. Faturamento"
                    color="#2563eb"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
                <ChartCard title="Crescimento de Recebido (%)" accentColor="#16a34a" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="percentual_crescimento_recebido"
                    name="% Cresc. Recebido"
                    color="#16a34a"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
              </div>
            </TabsContent>

            {/* ---------- PERMANÊNCIA ---------- */}
            <TabsContent value="permanencia" className="space-y-4">
              <ChartCard
                title="Entrada vs Perdas (Mês a Mês)"
                accentColor="#16a34a"
                subtitle="Cadastros + Reativações vs Cancelamentos + Inadimplentes, com variação do saldo"
                height={360}
                hasData={permanenciaSeries.length > 0}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trimLeadingEmpty(permanenciaSeries, ["entrada", "perdas"])} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(v) => `${v.toFixed(0)}%`}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                    />
                    <Tooltip content={<PermanenciaTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                    <Bar
                      yAxisId="left"
                      dataKey="entrada"
                      name="Entrada (Cadastros + Reativ.)"
                      fill="#16a34a"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="perdas"
                      name="Perdas (Cancelamentos + Inadimpl.)"
                      fill="#dc2626"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="variacao_permanencia"
                      name="% Var. Saldo"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
              <div className="grid gap-4 lg:grid-cols-3">
                <ChartCard
                  title="Saldo de Permanência"
                  accentColor="#8b5cf6"
                  subtitle="Entrada - Perdas"
                  hasData={hasData}
                >
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="permanencia"
                    name="Permanência"
                    color="#8b5cf6"
                    kind="bar"
                  />
                </ChartCard>
                <ChartCard title="Índice de Permanência (%)" accentColor="#16a34a" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="indice_permanencia"
                    name="% Permanência"
                    color="#16a34a"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
                <ChartCard title="Churn (%)" accentColor="#dc2626" hasData={hasData}>
                  <SingleSeriesChart
                    data={chartData}
                    dataKey="churn"
                    name="Churn"
                    color="#dc2626"
                    kind="line"
                    format="percent"
                  />
                </ChartCard>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
