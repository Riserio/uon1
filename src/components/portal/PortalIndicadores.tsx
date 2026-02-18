import { useEffect, useMemo, useState } from "react";
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
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, PieChart as PieIcon, BarChart2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type IndicadoresData = {
  producaoPorMes: { mes: string; valor: number }[];
  producaoPorProduto: { produto: string; valor: number }[];
  producaoPorSeguradora: { seguradora: string; valor: number }[];
};

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function formatCurrencyBRL(value: number) {
  if (!value && value !== 0) return "R$ 0,00";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatCompact(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`;
  return `R$ ${value.toFixed(0)}`;
}

const ttStyle = {
  borderRadius: 10,
  fontSize: 11,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
};

// ── Compact horizontal bar widget ──────────────────────────────────────────
function BarWidget({ data, isCurrency = true }: { data: { name: string; value: number }[]; isCurrency?: boolean }) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>;
  const maxVal = data[0]?.value || 1;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="space-y-2 pt-1">
      {data.map((item, i) => {
        const pct = isCurrency ? (item.value / maxVal) * 100 : total > 0 ? (item.value / total) * 100 : 0;
        return (
          <div key={item.name} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground truncate w-28 shrink-0" title={item.name}>
              {item.name}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: COLORS[i % COLORS.length] }}
              />
            </div>
            <span className="text-[11px] font-bold tabular-nums w-20 text-right">
              {isCurrency ? formatCompact(item.value) : item.value.toLocaleString("pt-BR")}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">
              {total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Mini Donut ──────────────────────────────────────────────────────────────
function MiniDonut({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>;
  const total = data.reduce((s, d) => s + d.value, 0);
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
            >
              {top6.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={ttStyle}
              formatter={(v: any, n: string) => [formatCurrencyBRL(Number(v)), n]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {top6.map((item, i) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={item.name} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-[11px] text-muted-foreground truncate flex-1">{item.name}</span>
              <span className="text-[11px] font-bold tabular-nums">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────────
function WidgetSkeleton({ className }: { className?: string }) {
  return (
    <Card className={`rounded-2xl ${className ?? ""}`}>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-40 w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
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
        producaoPorMes: Object.entries(porMes).map(([mes, valor]) => ({ mes, valor: Number(valor) })),
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
    if (corretoraId) fetchIndicadores();
  }, [corretoraId]);

  const totalProdMes = useMemo(
    () => indicadores?.producaoPorMes.reduce((s, d) => s + d.valor, 0) ?? 0,
    [indicadores]
  );

  const produtoData = useMemo(
    () => indicadores?.producaoPorProduto.map((d) => ({ name: d.produto, value: d.valor })) ?? [],
    [indicadores]
  );

  const seguradoraData = useMemo(
    () => indicadores?.producaoPorSeguradora.map((d) => ({ name: d.seguradora, value: d.valor })) ?? [],
    [indicadores]
  );

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <WidgetSkeleton className="lg:col-span-3" />
        <WidgetSkeleton />
        <WidgetSkeleton className="lg:col-span-2" />
      </div>
    );
  }

  if (!indicadores) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">

      {/* ── Área: Produção por Mês ──────────────────────────────────────── */}
      <Card className="lg:col-span-3 rounded-2xl">
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Produção por Mês</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">Últimos 12 meses · Total {formatCurrencyBRL(totalProdMes)}</p>
          </div>
        </CardHeader>
        <CardContent className="pt-2 pb-4">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={indicadores.producaoPorMes} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="gradProdMes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCompact(Number(v))}
                width={62}
              />
              <Tooltip
                contentStyle={ttStyle}
                formatter={(v: any) => [formatCurrencyBRL(Number(v)), "Produção"]}
              />
              <Area
                type="monotone"
                dataKey="valor"
                name="Produção"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#gradProdMes)"
                dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Donut: Distribuição por Produto ─────────────────────────────── */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-chart-2/15">
            <PieIcon className="h-4 w-4" style={{ color: "hsl(var(--chart-2))" }} />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Por Produto</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">Distribuição de prêmios</p>
          </div>
        </CardHeader>
        <CardContent className="pt-1">
          <MiniDonut data={produtoData} />
          <div className="mt-3 space-y-1.5 border-t pt-3">
            {produtoData.slice(0, 5).map((item, i) => {
              const total = produtoData.reduce((s, d) => s + d.value, 0);
              return (
                <div key={item.name} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-muted-foreground truncate max-w-[120px]">{item.name}</span>
                  </div>
                  <span className="font-semibold tabular-nums">{formatCompact(item.value)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Barras: Produção por Associação ─────────────────────────────── */}
      <Card className="lg:col-span-2 rounded-2xl">
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-chart-3/15">
            <BarChart2 className="h-4 w-4" style={{ color: "hsl(var(--chart-3))" }} />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Por Associação / Seguradora</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">Ranking de produção</p>
          </div>
        </CardHeader>
        <CardContent className="pt-1">
          {/* Gráfico de barras horizontais */}
          <ResponsiveContainer width="100%" height={Math.max(120, seguradoraData.length * 32)}>
            <BarChart
              data={seguradoraData.slice(0, 8).map((d) => ({ name: d.name, valor: d.value }))}
              layout="vertical"
              margin={{ left: 0, right: 8, top: 0, bottom: 0 }}
              barCategoryGap="30%"
            >
              <defs>
                <linearGradient id="gradAssoc" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <XAxis
                type="number"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCompact(Number(v))}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={110}
              />
              <Tooltip
                contentStyle={ttStyle}
                formatter={(v: any) => [formatCurrencyBRL(Number(v)), "Produção"]}
              />
              <Bar dataKey="valor" name="Produção" fill="url(#gradAssoc)" radius={[0, 6, 6, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>

          {/* Lista com percentuais */}
          {seguradoraData.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <BarWidget data={seguradoraData.slice(0, 6)} isCurrency />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
