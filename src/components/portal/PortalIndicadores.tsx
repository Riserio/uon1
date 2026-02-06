import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label as RechartsLabel,
} from "recharts";
import { TrendingUp, Package, Building2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import PortalPageWrapper from "./PortalPageWrapper";

type IndicadoresData = {
  producaoPorMes: { mes: string; valor: number }[];
  producaoPorProduto: { produto: string; valor: number }[];
  producaoPorSeguradora: { seguradora: string; valor: number }[];
};

function formatCurrencyBRL(value: number) {
  if (!value && value !== 0) return "R$ 0,00";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function formatCompactCurrency(value: number) {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}K`;
  }
  return formatCurrencyBRL(value);
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border bg-background/95 backdrop-blur-sm px-4 py-3 shadow-xl">
      {label && <p className="mb-2 font-semibold text-foreground">{label}</p>}
      {payload.map((item: any, index: number) => (
        <p key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: item.color || item.fill }} />
          <span>{item.name}:</span>
          <span className="font-bold text-foreground">{formatCurrencyBRL(Number(item.value || 0))}</span>
        </p>
      ))}
    </div>
  );
};

const StatCard = ({ 
  title, 
  value, 
  icon: Icon, 
  trend,
  className 
}: { 
  title: string; 
  value: string; 
  icon: any;
  trend?: string;
  className?: string;
}) => (
  <Card className={cn(
    "relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/80 shadow-lg hover:shadow-xl transition-all duration-300",
    className
  )}>
    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-16 translate-x-16" />
    <CardContent className="p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {trend && (
            <p className="text-xs text-emerald-500 font-medium flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {trend}
            </p>
          )}
        </div>
        <div className="p-3 rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function PortalIndicadores({ corretoraId }: { corretoraId?: string }) {
  const [loading, setLoading] = useState(true);
  const [indicadores, setIndicadores] = useState<IndicadoresData | null>(null);

  const fetchIndicadores = async () => {
    if (!corretoraId) return;

    setLoading(true);
    try {
      const hoje = new Date();
      const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);

      const { data: producao, error } = await supabase
        .from("producao_financeira")
        .select("*")
        .eq("corretora_id", corretoraId)
        .gte("competencia", dataInicio.toISOString().split("T")[0])
        .order("competencia", { ascending: true });

      if (error) throw error;

      const porMes: Record<string, number> = {};
      const porProduto: Record<string, number> = {};
      const porSeguradora: Record<string, number> = {};

      producao?.forEach((p: any) => {
        const mes = p.competencia?.substring(0, 7) || "";
        const valor = p.premio_total || 0;

        porMes[mes] = (porMes[mes] || 0) + valor;
        porProduto[p.produto || "Outros"] = (porProduto[p.produto || "Outros"] || 0) + valor;
        porSeguradora[p.seguradora || "Outros"] = (porSeguradora[p.seguradora || "Outros"] || 0) + valor;
      });

      setIndicadores({
        producaoPorMes: Object.entries(porMes).map(([mes, valor]) => ({
          mes: mes.split("-").reverse().join("/"),
          valor: Number(valor),
        })),
        producaoPorProduto: Object.entries(porProduto)
          .map(([produto, valor]) => ({ produto, valor: Number(valor) }))
          .sort((a, b) => b.valor - a.valor),
        producaoPorSeguradora: Object.entries(porSeguradora)
          .map(([seguradora, valor]) => ({ seguradora, valor: Number(valor) }))
          .sort((a, b) => b.valor - a.valor),
      });
    } catch (error: any) {
      console.error("Error fetching indicadores:", error);
      toast.error("Erro ao carregar indicadores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (corretoraId) {
      fetchIndicadores();
    }
  }, [corretoraId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Carregando indicadores...</p>
      </div>
    );
  }

  if (!indicadores) return null;

  const totalProducao = indicadores.producaoPorMes.reduce((sum, item) => sum + (item.valor || 0), 0);
  const totalProdutos = indicadores.producaoPorProduto.length;
  const totalSeguradoras = indicadores.producaoPorSeguradora.length;
  const mediamensal = totalProducao / Math.max(indicadores.producaoPorMes.length, 1);

  return (
    <PortalPageWrapper>
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Produção Total (12 meses)"
            value={formatCompactCurrency(totalProducao)}
            icon={TrendingUp}
          />
          <StatCard
            title="Média Mensal"
            value={formatCompactCurrency(mediamensal)}
            icon={TrendingUp}
          />
          <StatCard
            title="Produtos Ativos"
            value={totalProdutos.toString()}
            icon={Package}
          />
          <StatCard
            title="Associações"
            value={totalSeguradoras.toString()}
            icon={Building2}
          />
        </div>

        {/* Main Chart - Production by Month */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-card to-card/80">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Evolução da Produção</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Últimos 12 meses</p>
              </div>
              <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
                {formatCompactCurrency(totalProducao)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={indicadores.producaoPorMes} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorProducao" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                <XAxis 
                  dataKey="mes" 
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => formatCompactCurrency(Number(value))}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="valor"
                  name="Produção"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  fill="url(#colorProducao)"
                  dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "hsl(var(--background))" }}
                  activeDot={{ r: 6, fill: "hsl(var(--primary))", strokeWidth: 3, stroke: "hsl(var(--background))" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Donut Chart - Distribution by Product */}
          <Card className="lg:col-span-2 border-0 shadow-lg bg-gradient-to-br from-card to-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Distribuição por Produto</CardTitle>
              <p className="text-sm text-muted-foreground">Participação no faturamento</p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                <div className="w-full h-64">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={indicadores.producaoPorProduto}
                        dataKey="valor"
                        nameKey="produto"
                        cx="50%"
                        cy="50%"
                        innerRadius="58%"
                        outerRadius="85%"
                        paddingAngle={3}
                        stroke="none"
                      >
                        {indicadores.producaoPorProduto.map((_: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                        <RechartsLabel
                          value={formatCompactCurrency(totalProducao)}
                          position="center"
                          className="text-base font-bold"
                          fill="hsl(var(--foreground))"
                        />
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="w-full space-y-2 max-h-40 overflow-y-auto pr-2">
                  {indicadores.producaoPorProduto.map((item, index) => {
                    const percent = ((item.valor / totalProducao) * 100).toFixed(1);
                    return (
                      <div
                        key={item.produto}
                        className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 hover:bg-muted/60 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-sm truncate max-w-[120px]">{item.produto}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{percent}%</span>
                          <span className="text-sm font-semibold whitespace-nowrap">{formatCompactCurrency(item.valor)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bar Chart - Production by Association */}
          <Card className="lg:col-span-3 border-0 shadow-lg bg-gradient-to-br from-card to-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Produção por Associação</CardTitle>
              <p className="text-sm text-muted-foreground">Ranking de faturamento</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={indicadores.producaoPorSeguradora.slice(0, 8)}
                  layout="vertical"
                  margin={{ left: 0, right: 20, top: 10, bottom: 10 }}
                >
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(var(--primary))" />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(value) => formatCompactCurrency(Number(value))}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="seguradora"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={100}
                    tickFormatter={(value) => value.length > 12 ? `${value.substring(0, 12)}...` : value}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="valor" 
                    name="Produção" 
                    fill="url(#barGradient)" 
                    radius={[0, 6, 6, 0]} 
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </PortalPageWrapper>
  );
}
