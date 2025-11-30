import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  LineChart,
  Line,
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
  ResponsiveContainer,
  Label as RechartsLabel,
} from "recharts";

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

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((item: any, index: number) => (
        <p key={index} className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span>{item.name}:</span>
          <span className="font-semibold text-foreground">{formatCurrencyBRL(Number(item.value || 0))}</span>
        </p>
      ))}
    </div>
  );
};

export default function PortalIndicadores({ corretoraId }: { corretoraId?: string }) {
  const [loading, setLoading] = useState(true);
  const [indicadores, setIndicadores] = useState<IndicadoresData | null>(null);

  const fetchIndicadores = async () => {
    if (!corretoraId) return; // Aguardar seleção de corretora

    setLoading(true);
    try {
      // Buscar dados dos últimos 12 meses
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
          mes,
          valor: Number(valor),
        })),
        producaoPorProduto: Object.entries(porProduto).map(([produto, valor]) => ({
          produto,
          valor: Number(valor),
        })),
        producaoPorSeguradora: Object.entries(porSeguradora).map(([seguradora, valor]) => ({
          seguradora,
          valor: Number(valor),
        })),
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
    return <div className="text-center py-12 text-muted-foreground">Carregando indicadores...</div>;
  }

  if (!indicadores) return null;

  const totalProdutos = indicadores.producaoPorProduto.reduce((sum, item) => sum + (item.valor || 0), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
      {/* Linha / Área - Produção por Mês */}
      <Card className="lg:col-span-2 xl:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Produção por Mês (Últimos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={indicadores.producaoPorMes}>
              <defs>
                <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => formatCurrencyBRL(Number(value)).replace("R$ ", "")}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="valor"
                name="Produção"
                stroke="hsl(var(--primary))"
                strokeWidth={2.4}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              {/* Área “fake” com gradiente usando o mesmo dataKey */}
              <Line type="monotone" dataKey="valor" stroke="transparent" fill="url(#colorValor)" fillOpacity={0.8} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Donut - Distribuição por Produto */}
      <Card className="xl:col-span-1">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Distribuição por Produto</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-full h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={indicadores.producaoPorProduto}
                    dataKey="valor"
                    nameKey="produto"
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={3}
                  >
                    {indicadores.producaoPorProduto.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    <RechartsLabel
                      value={formatCurrencyBRL(totalProdutos)}
                      position="center"
                      className="text-sm font-semibold text-center"
                    />
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 text-xs">
              {indicadores.producaoPorProduto.map((item, index) => (
                <div
                  key={item.produto}
                  className="flex items-center justify-between rounded-md border bg-muted/40 px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="truncate">{item.produto}</span>
                  </div>
                  <span className="font-medium">{formatCurrencyBRL(Number(item.valor || 0))}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Barras - Produção por Associação */}
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Produção por Associação</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={indicadores.producaoPorSeguradora}
              barCategoryGap="20%"
              margin={{ left: 0, right: 16, top: 16, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="seguradora"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => formatCurrencyBRL(Number(value)).replace("R$ ", "")}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="valor" name="Produção" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
