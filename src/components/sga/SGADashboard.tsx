import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area 
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Car, MapPin, Calendar, DollarSign, AlertCircle } from "lucide-react";

interface SGADashboardProps {
  eventos: any[];
  loading: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatCompactCurrency = (value: number) => {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}k`;
  }
  return `R$ ${value.toFixed(0)}`;
};

// Filtrar valores N/I e vazios
const filterValidValues = (data: any[], excludeNI = true) => {
  if (!excludeNI) return data;
  return data.filter(item => 
    item.name && 
    item.name !== "N/I" && 
    item.name !== "" && 
    item.name !== "NAO INFORMADO" &&
    item.name !== "NÃO INFORMADO"
  );
};

// Truncar texto longo
const truncateText = (text: string, maxLength: number = 15) => {
  if (!text) return "-";
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
};

// Custom tooltip
const CustomTooltip = ({ active, payload, label, isCurrency = false }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {isCurrency ? formatCurrency(entry.value) : entry.value.toLocaleString('pt-BR')}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function SGADashboard({ eventos, loading }: SGADashboardProps) {
  const stats = useMemo(() => {
    if (!eventos.length) return null;

    // Por Estado (filtrar N/I)
    const porEstado = eventos.reduce((acc: any, e) => {
      const estado = e.evento_estado || "";
      // Filtrar apenas siglas de estado válidas (2 caracteres)
      if (estado && estado !== "N/I" && estado !== "NAO INFORMADO" && estado.length === 2) {
        acc[estado] = (acc[estado] || 0) + 1;
      }
      return acc;
    }, {});
    const totalEstadosDistintos = Object.keys(porEstado).length;
    const estadoData = Object.entries(porEstado)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10);

    // Por Motivo (filtrar N/I)
    const porMotivo = eventos.reduce((acc: any, e) => {
      const motivo = e.motivo_evento || "";
      if (motivo && motivo !== "N/I" && motivo !== "NAO INFORMADO") {
        acc[motivo] = (acc[motivo] || 0) + 1;
      }
      return acc;
    }, {});
    const motivoData = Object.entries(porMotivo)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value);

    // Por Situação (filtrar N/I)
    const porSituacao = eventos.reduce((acc: any, e) => {
      const situacao = e.situacao_evento || "";
      if (situacao && situacao !== "N/I" && situacao !== "NAO INFORMADO") {
        acc[situacao] = (acc[situacao] || 0) + 1;
      }
      return acc;
    }, {});
    const situacaoData = Object.entries(porSituacao)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value);

    // Por Regional (filtrar N/I)
    const porRegional = eventos.reduce((acc: any, e) => {
      const regional = e.regional || "";
      if (regional && regional !== "N/I" && regional !== "NAO INFORMADO") {
        acc[regional] = (acc[regional] || 0) + 1;
      }
      return acc;
    }, {});
    const regionalData = Object.entries(porRegional)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10);

    // Por Tipo Evento
    const porTipo = eventos.reduce((acc: any, e) => {
      const tipo = e.tipo_evento || "";
      if (tipo && tipo !== "N/I" && tipo !== "NAO INFORMADO") {
        acc[tipo] = (acc[tipo] || 0) + 1;
      }
      return acc;
    }, {});
    const tipoData = Object.entries(porTipo)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value);

    // Timeline por mês
    const porMes = eventos.reduce((acc: any, e) => {
      if (e.data_evento) {
        const date = new Date(e.data_evento);
        const mesAno = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        acc[mesAno] = acc[mesAno] || { eventos: 0, custo: 0 };
        acc[mesAno].eventos += 1;
        acc[mesAno].custo += e.custo_evento || 0;
      }
      return acc;
    }, {});
    const timelineData = Object.entries(porMes)
      .map(([mes, data]: [string, any]) => ({
        mes,
        mesLabel: new Date(mes + "-01").toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        eventos: data.eventos,
        custo: data.custo
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    // Custos por Regional
    const custosPorRegional = eventos.reduce((acc: any, e) => {
      const regional = e.regional || "";
      if (regional && regional !== "N/I" && regional !== "NAO INFORMADO") {
        acc[regional] = (acc[regional] || 0) + (e.custo_evento || 0);
      }
      return acc;
    }, {});
    const custosRegionalData = Object.entries(custosPorRegional)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10);

    // Envolvimento
    const porEnvolvimento = eventos.reduce((acc: any, e) => {
      const env = e.envolvimento || "";
      if (env && env !== "N/I" && env !== "NAO INFORMADO") {
        acc[env] = (acc[env] || 0) + 1;
      }
      return acc;
    }, {});
    const envolvimentoData = Object.entries(porEnvolvimento)
      .map(([name, value]) => ({ name, value }));

    return {
      estadoData,
      motivoData,
      situacaoData,
      regionalData,
      tipoData,
      timelineData,
      custosRegionalData,
      envolvimentoData,
      totalCusto: eventos.reduce((acc, e) => acc + (e.custo_evento || 0), 0),
      totalReparo: eventos.reduce((acc, e) => acc + (e.valor_reparo || 0), 0),
      mediaParticipacao: eventos.reduce((acc, e) => acc + (e.participacao || 0), 0) / eventos.length,
      totalEstadosDistintos
    };
  }, [eventos]);

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!eventos.length || !stats) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum Dado Disponível</h3>
          <p className="text-muted-foreground">
            Importe uma planilha do SGA para visualizar os dashboards.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Custo Total Eventos</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalCusto)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Valor Reparo</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalReparo)}</p>
              </div>
              <Car className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Média Participação</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.mediaParticipacao)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Estados Distintos</p>
                <p className="text-2xl font-bold">{stats.totalEstadosDistintos}</p>
              </div>
              <MapPin className="h-8 w-8 text-purple-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Evolução Mensal de Eventos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={stats.timelineData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="mesLabel" 
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis 
                yAxisId="left" 
                tick={{ fontSize: 11 }}
                width={50}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCompactCurrency(v)}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area yAxisId="left" type="monotone" dataKey="eventos" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Eventos" />
              <Line yAxisId="right" type="monotone" dataKey="custo" stroke="#ef4444" name="Custo (R$)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Por Situação - Full Width */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos por Situação</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.situacaoData} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis 
                type="category" 
                dataKey="name" 
                tick={{ fontSize: 11 }} 
                width={150}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} name="Eventos" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Por Regional - Full Width */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos por Regional (Top 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={stats.regionalData} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis 
                type="category" 
                dataKey="name" 
                tick={{ fontSize: 11 }} 
                width={180}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Eventos" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Por Estado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos por Estado (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.estadoData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 11 }} 
                  width={35}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Eventos" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por Motivo - Donut com legenda */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos por Motivo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={250}>
                <PieChart>
                  <Pie
                    data={stats.motivoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {stats.motivoData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Quantidade']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2 max-h-[250px] overflow-y-auto">
                {stats.motivoData.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2 text-sm">
                    <div 
                      className="w-3 h-3 rounded-full shrink-0" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }} 
                    />
                    <span className="truncate flex-1" title={item.name}>{item.name}</span>
                    <span className="font-medium text-muted-foreground">{String(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custos por Regional */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custos por Regional (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.custosRegionalData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis 
                  type="number" 
                  tick={{ fontSize: 10 }} 
                  tickFormatter={(v) => formatCompactCurrency(v)}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 10 }} 
                  width={100}
                  tickFormatter={(v) => truncateText(v, 18)}
                />
                <Tooltip content={<CustomTooltip isCurrency />} />
                <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} name="Custo" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por Tipo / Envolvimento */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tipo de Evento vs Envolvimento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2 font-medium">Tipo de Evento</p>
                <div className="space-y-1.5">
                  {stats.tipoData.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-sm truncate" title={item.name}>{item.name}</span>
                      </div>
                      <span className="text-sm font-medium ml-2">{String(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2 font-medium">Envolvimento</p>
                <div className="space-y-1.5">
                  {stats.envolvimentoData.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[(i + 3) % COLORS.length] }} />
                        <span className="text-sm truncate" title={item.name}>{item.name}</span>
                      </div>
                      <span className="text-sm font-medium ml-2">{String(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}