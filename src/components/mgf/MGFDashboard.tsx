import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { 
  TrendingUp, 
  DollarSign, 
  Car, 
  Calendar,
  BarChart3,
  PieChart as PieChartIcon,
  Building2,
  MapPin
} from "lucide-react";

interface MGFDashboardProps {
  dados: any[];
  colunas: string[];
  loading: boolean;
  associacaoNome: string;
}

const COLORS = ["#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5", "#0ea5e9", "#06b6d4", "#14b8a6", "#22c55e", "#84cc16"];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
};

const formatCompactCurrency = (value: number) => {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
  return `R$ ${value.toFixed(0)}`;
};

const CustomTooltip = ({ active, payload, label, isCurrency = false }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {isCurrency ? formatCurrency(entry.value) : entry.value?.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function MGFDashboard({ dados, colunas, loading, associacaoNome }: MGFDashboardProps) {
  const stats = useMemo(() => {
    if (!dados.length) return null;

    // Calcular estatísticas básicas
    const totalRegistros = dados.length;
    const totalValor = dados.reduce((acc, d) => acc + (d.valor || 0), 0);
    const totalCusto = dados.reduce((acc, d) => acc + (d.custo || 0), 0);
    
    // Por tipo de evento
    const porTipo = dados.reduce((acc: any, d) => {
      const tipo = d.tipo_evento || d.dados_extras?.["TIPO EVENTO"] || d.dados_extras?.["TIPO"] || "Não informado";
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {});
    const tipoData = Object.entries(porTipo)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10);

    // Por situação
    const porSituacao = dados.reduce((acc: any, d) => {
      const situacao = d.situacao || d.status || d.dados_extras?.["SITUACAO"] || d.dados_extras?.["STATUS"] || "Não informado";
      acc[situacao] = (acc[situacao] || 0) + 1;
      return acc;
    }, {});
    const situacaoData = Object.entries(porSituacao)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 8);

    // Por cooperativa
    const porCooperativa = dados.reduce((acc: any, d) => {
      const coop = d.cooperativa || d.dados_extras?.["COOPERATIVA"] || "Não informado";
      if (coop && coop !== "Não informado") {
        acc[coop] = acc[coop] || { eventos: 0, custo: 0 };
        acc[coop].eventos += 1;
        acc[coop].custo += d.custo || 0;
      }
      return acc;
    }, {});
    const cooperativaData = Object.entries(porCooperativa)
      .map(([name, data]: [string, any]) => ({ name, eventos: data.eventos, custo: data.custo }))
      .sort((a, b) => b.eventos - a.eventos)
      .slice(0, 10);

    // Por regional
    const porRegional = dados.reduce((acc: any, d) => {
      const regional = d.regional || d.dados_extras?.["REGIONAL"] || "Não informado";
      if (regional && regional !== "Não informado") {
        acc[regional] = acc[regional] || { eventos: 0, custo: 0 };
        acc[regional].eventos += 1;
        acc[regional].custo += d.custo || 0;
      }
      return acc;
    }, {});
    const regionalData = Object.entries(porRegional)
      .map(([name, data]: [string, any]) => ({ name, eventos: data.eventos, custo: data.custo }))
      .sort((a, b) => b.eventos - a.eventos)
      .slice(0, 10);

    // Timeline por mês
    const porMes = dados.reduce((acc: any, d) => {
      const dataEvento = d.data_evento || d.data_cadastro;
      if (dataEvento) {
        const date = new Date(dataEvento);
        const mesAno = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        acc[mesAno] = acc[mesAno] || { eventos: 0, custo: 0 };
        acc[mesAno].eventos += 1;
        acc[mesAno].custo += d.custo || 0;
      }
      return acc;
    }, {});
    const timelineData = Object.entries(porMes)
      .map(([mes, data]: [string, any]) => ({
        mes,
        mesLabel: new Date(mes + "-01").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        eventos: data.eventos,
        custo: data.custo,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    // Por classificação
    const porClassificacao = dados.reduce((acc: any, d) => {
      const classif = d.classificacao || d.dados_extras?.["CLASSIFICACAO"] || d.dados_extras?.["CLASSIFICAÇÃO"] || "Não informado";
      if (classif && classif !== "Não informado") {
        acc[classif] = (acc[classif] || 0) + 1;
      }
      return acc;
    }, {});
    const classificacaoData = Object.entries(porClassificacao)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 8);

    // Custo médio
    const custoMedio = totalCusto / totalRegistros || 0;

    return {
      totalRegistros,
      totalValor,
      totalCusto,
      custoMedio,
      tipoData,
      situacaoData,
      cooperativaData,
      regionalData,
      timelineData,
      classificacaoData,
    };
  }, [dados]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!dados.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Nenhum dado importado</h3>
          <p className="text-muted-foreground text-center mt-1">
            Importe uma planilha MGF para visualizar o dashboard de insights
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-orange-500/20">
                <Car className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Registros</p>
                <p className="text-2xl font-bold">{stats.totalRegistros.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-500/20">
                <DollarSign className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalValor)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-red-500/20">
                <TrendingUp className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Custo Total</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalCusto)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-500/20">
                <BarChart3 className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Custo Médio</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.custoMedio)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      {stats.timelineData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-500" />
              Evolução Temporal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div 
              className="overflow-x-auto"
              ref={(el) => { if (el) el.scrollLeft = el.scrollWidth; }}
            >
              <div style={{ minWidth: Math.max(800, stats.timelineData.length * 70) + "px" }}>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={stats.timelineData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="mesLabel" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={50} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCompactCurrency(v)}
                      width={70}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="eventos"
                      stroke="#f97316"
                      fill="#f97316"
                      fillOpacity={0.3}
                      name="Eventos"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="custo"
                      stroke="#ef4444"
                      name="Custo (R$)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Por Tipo */}
        {stats.tipoData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PieChartIcon className="h-5 w-5 text-orange-500" />
                Por Tipo de Evento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={stats.tipoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name.substring(0, 15)}${name.length > 15 ? "..." : ""} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {stats.tipoData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Situação */}
        {stats.situacaoData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-orange-500" />
                Por Situação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.situacaoData} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    width={100}
                    tickFormatter={(v) => v.length > 15 ? v.substring(0, 15) + "..." : v}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} name="Quantidade" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Cooperativa */}
        {stats.cooperativaData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5 text-orange-500" />
                Por Cooperativa (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={stats.cooperativaData} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    width={140}
                    tickFormatter={(v) => v.length > 20 ? v.substring(0, 20) + "..." : v}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="eventos" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Eventos" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Regional */}
        {stats.regionalData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-5 w-5 text-orange-500" />
                Por Regional (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={stats.regionalData} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    width={140}
                    tickFormatter={(v) => v.length > 20 ? v.substring(0, 20) + "..." : v}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="eventos" fill="#22c55e" radius={[0, 4, 4, 0]} name="Eventos" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Classificação */}
        {stats.classificacaoData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PieChartIcon className="h-5 w-5 text-orange-500" />
                Por Classificação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={stats.classificacaoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name.substring(0, 12)}${name.length > 12 ? "..." : ""} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {stats.classificacaoData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Custo por Cooperativa */}
        {stats.cooperativaData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="h-5 w-5 text-orange-500" />
                Custo por Cooperativa (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={stats.cooperativaData} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactCurrency(v)} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    width={140}
                    tickFormatter={(v) => v.length > 20 ? v.substring(0, 20) + "..." : v}
                  />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="custo" fill="#ef4444" radius={[0, 4, 4, 0]} name="Custo" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
