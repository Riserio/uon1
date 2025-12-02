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

export default function SGADashboard({ eventos, loading }: SGADashboardProps) {
  const stats = useMemo(() => {
    if (!eventos.length) return null;

    // Por Estado
    const porEstado = eventos.reduce((acc: any, e) => {
      const estado = e.evento_estado || "N/I";
      acc[estado] = (acc[estado] || 0) + 1;
      return acc;
    }, {});
    const estadoData = Object.entries(porEstado)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10);

    // Por Motivo
    const porMotivo = eventos.reduce((acc: any, e) => {
      const motivo = e.motivo_evento || "N/I";
      acc[motivo] = (acc[motivo] || 0) + 1;
      return acc;
    }, {});
    const motivoData = Object.entries(porMotivo)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value);

    // Por Situação
    const porSituacao = eventos.reduce((acc: any, e) => {
      const situacao = e.situacao_evento || "N/I";
      acc[situacao] = (acc[situacao] || 0) + 1;
      return acc;
    }, {});
    const situacaoData = Object.entries(porSituacao)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value);

    // Por Regional
    const porRegional = eventos.reduce((acc: any, e) => {
      const regional = e.regional || "N/I";
      acc[regional] = (acc[regional] || 0) + 1;
      return acc;
    }, {});
    const regionalData = Object.entries(porRegional)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10);

    // Por Tipo Evento
    const porTipo = eventos.reduce((acc: any, e) => {
      const tipo = e.tipo_evento || "N/I";
      acc[tipo] = (acc[tipo] || 0) + 1;
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
      const regional = e.regional || "N/I";
      acc[regional] = (acc[regional] || 0) + (e.custo_evento || 0);
      return acc;
    }, {});
    const custosRegionalData = Object.entries(custosPorRegional)
      .map(([name, value]) => ({ name, value }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10);

    // Envolvimento
    const porEnvolvimento = eventos.reduce((acc: any, e) => {
      const env = e.envolvimento || "N/I";
      acc[env] = (acc[env] || 0) + 1;
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
      mediaParticipacao: eventos.reduce((acc, e) => acc + (e.participacao || 0), 0) / eventos.length
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
                <p className="text-2xl font-bold">{stats.estadoData.length}</p>
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
              <XAxis dataKey="mesLabel" className="text-xs" />
              <YAxis yAxisId="left" className="text-xs" />
              <YAxis yAxisId="right" orientation="right" className="text-xs" />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  name === 'custo' ? formatCurrency(value) : value,
                  name === 'custo' ? 'Custo' : 'Eventos'
                ]}
              />
              <Legend />
              <Area yAxisId="left" type="monotone" dataKey="eventos" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Eventos" />
              <Line yAxisId="right" type="monotone" dataKey="custo" stroke="#ef4444" name="Custo (R$)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Por Estado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos por Estado</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.estadoData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey="name" className="text-xs" width={40} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por Motivo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos por Motivo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.motivoData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {stats.motivoData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, 'Quantidade']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por Situação */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos por Situação</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.situacaoData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={80} />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Custos por Regional */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custos por Regional (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.custosRegionalData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" tickFormatter={(v) => `R$ ${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" className="text-xs" width={120} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), 'Custo']} />
                <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por Regional */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos por Regional (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.regionalData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey="name" className="text-xs" width={120} />
                <Tooltip />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
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
                <p className="text-sm text-muted-foreground mb-2">Tipo de Evento</p>
                {stats.tipoData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium">{String(item.value)}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Envolvimento</p>
                {stats.envolvimentoData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[(i + 3) % COLORS.length] }} />
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium">{String(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
