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
  Line,
} from "recharts";
import { 
  TrendingUp, 
  DollarSign, 
  Calendar,
  BarChart3,
  PieChart as PieChartIcon,
  Building2,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Clock,
  Banknote,
  CreditCard,
  Truck
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

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const em7Dias = new Date(hoje);
    em7Dias.setDate(em7Dias.getDate() + 7);

    // KPIs Financeiros
    const totalRegistros = dados.length;
    const valorTotal = dados.reduce((acc, d) => acc + (d.valor || 0), 0);
    const valorTotalLancamento = dados.reduce((acc, d) => acc + (d.valor_total_lancamento || 0), 0);
    
    // Pagos vs A Pagar
    const valorPago = dados
      .filter(d => d.situacao_pagamento?.toLowerCase().includes('pago') || d.data_pagamento)
      .reduce((acc, d) => acc + (d.valor_pagamento || d.valor || 0), 0);
    
    const valorAPagar = dados
      .filter(d => !d.situacao_pagamento?.toLowerCase().includes('pago') && !d.data_pagamento)
      .reduce((acc, d) => acc + (d.valor || 0), 0);
    
    // Vencidos
    const valorVencido = dados
      .filter(d => {
        if (d.situacao_pagamento?.toLowerCase().includes('pago') || d.data_pagamento) return false;
        if (!d.data_vencimento) return false;
        const venc = new Date(d.data_vencimento);
        return venc < hoje;
      })
      .reduce((acc, d) => acc + (d.valor || 0), 0);
    
    // A vencer em 7 dias
    const valorAVencer7Dias = dados
      .filter(d => {
        if (d.situacao_pagamento?.toLowerCase().includes('pago') || d.data_pagamento) return false;
        if (!d.data_vencimento) return false;
        const venc = new Date(d.data_vencimento);
        return venc >= hoje && venc <= em7Dias;
      })
      .reduce((acc, d) => acc + (d.valor || 0), 0);

    // Total multa e juros
    const totalMulta = dados.reduce((acc, d) => acc + (d.multa || 0), 0);
    const totalJuros = dados.reduce((acc, d) => acc + (d.juros || 0), 0);

    // Por Situação de Pagamento
    const porSituacao = dados.reduce((acc: any, d) => {
      const situacao = d.situacao_pagamento || "Não informado";
      acc[situacao] = acc[situacao] || { count: 0, valor: 0 };
      acc[situacao].count += 1;
      acc[situacao].valor += d.valor || 0;
      return acc;
    }, {});
    const situacaoData = Object.entries(porSituacao)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);

    // Por Operação
    const porOperacao = dados.reduce((acc: any, d) => {
      const op = d.operacao || "Não informado";
      acc[op] = acc[op] || { count: 0, valor: 0 };
      acc[op].count += 1;
      acc[op].valor += d.valor || 0;
      return acc;
    }, {});
    const operacaoData = Object.entries(porOperacao)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    // Por Fornecedor
    const porFornecedor = dados.reduce((acc: any, d) => {
      const forn = d.fornecedor || d.nome_fantasia_fornecedor || "Não informado";
      if (forn !== "Não informado") {
        acc[forn] = acc[forn] || { count: 0, valor: 0 };
        acc[forn].count += 1;
        acc[forn].valor += d.valor || 0;
      }
      return acc;
    }, {});
    const fornecedorData = Object.entries(porFornecedor)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    // Por Cooperativa
    const porCooperativa = dados.reduce((acc: any, d) => {
      const coop = d.cooperativa || "Não informado";
      if (coop !== "Não informado") {
        acc[coop] = acc[coop] || { count: 0, valor: 0 };
        acc[coop].count += 1;
        acc[coop].valor += d.valor || 0;
      }
      return acc;
    }, {});
    const cooperativaData = Object.entries(porCooperativa)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    // Por Forma de Pagamento
    const porFormaPagamento = dados.reduce((acc: any, d) => {
      const forma = d.forma_pagamento || "Não informado";
      if (forma !== "Não informado") {
        acc[forma] = acc[forma] || { count: 0, valor: 0 };
        acc[forma].count += 1;
        acc[forma].valor += d.valor || 0;
      }
      return acc;
    }, {});
    const formaPagamentoData = Object.entries(porFormaPagamento)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);

    // Por Regional
    const porRegional = dados.reduce((acc: any, d) => {
      const regional = d.regional || d.regional_evento || "Não informado";
      if (regional !== "Não informado") {
        acc[regional] = acc[regional] || { count: 0, valor: 0 };
        acc[regional].count += 1;
        acc[regional].valor += d.valor || 0;
      }
      return acc;
    }, {});
    const regionalData = Object.entries(porRegional)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    // Por Tipo de Veículo
    const porTipoVeiculo = dados.reduce((acc: any, d) => {
      const tipo = d.tipo_veiculo || d.categoria_veiculo || "Não informado";
      if (tipo !== "Não informado") {
        acc[tipo] = acc[tipo] || { count: 0, valor: 0 };
        acc[tipo].count += 1;
        acc[tipo].valor += d.valor || 0;
      }
      return acc;
    }, {});
    const tipoVeiculoData = Object.entries(porTipoVeiculo)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);

    // Por Centro de Custo
    const porCentroCusto = dados.reduce((acc: any, d) => {
      const cc = d.centro_custo || "Não informado";
      if (cc !== "Não informado") {
        acc[cc] = acc[cc] || { count: 0, valor: 0 };
        acc[cc].count += 1;
        acc[cc].valor += d.valor || 0;
      }
      return acc;
    }, {});
    const centroCustoData = Object.entries(porCentroCusto)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    // Por Motivo Evento
    const porMotivoEvento = dados.reduce((acc: any, d) => {
      const motivo = d.motivo_evento || "Não informado";
      if (motivo !== "Não informado") {
        acc[motivo] = acc[motivo] || { count: 0, valor: 0 };
        acc[motivo].count += 1;
        acc[motivo].valor += d.valor || 0;
      }
      return acc;
    }, {});
    const motivoEventoData = Object.entries(porMotivoEvento)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    // Timeline por mês (data_vencimento ou data_evento)
    const porMes = dados.reduce((acc: any, d) => {
      const dataRef = d.data_vencimento || d.data_evento || d.data_nota_fiscal;
      if (dataRef) {
        const date = new Date(dataRef);
        if (!isNaN(date.getTime())) {
          const mesAno = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          acc[mesAno] = acc[mesAno] || { count: 0, valor: 0, pago: 0 };
          acc[mesAno].count += 1;
          acc[mesAno].valor += d.valor || 0;
          if (d.situacao_pagamento?.toLowerCase().includes('pago') || d.data_pagamento) {
            acc[mesAno].pago += d.valor_pagamento || d.valor || 0;
          }
        }
      }
      return acc;
    }, {});
    const timelineData = Object.entries(porMes)
      .map(([mes, data]: [string, any]) => ({
        mes,
        mesLabel: new Date(mes + "-01").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        count: data.count,
        valor: data.valor,
        pago: data.pago,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    return {
      totalRegistros,
      valorTotal,
      valorTotalLancamento,
      valorPago,
      valorAPagar,
      valorVencido,
      valorAVencer7Dias,
      totalMulta,
      totalJuros,
      situacaoData,
      operacaoData,
      fornecedorData,
      cooperativaData,
      formaPagamentoData,
      regionalData,
      tipoVeiculoData,
      centroCustoData,
      motivoEventoData,
      timelineData,
    };
  }, [dados]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-16 w-full" />
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
            Importe uma planilha MGF para visualizar o dashboard
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* KPIs Financeiros */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Banknote className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor Total</p>
                <p className="text-lg font-bold">{formatCurrency(stats.valorTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pago</p>
                <p className="text-lg font-bold">{formatCurrency(stats.valorPago)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <Clock className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">A Pagar</p>
                <p className="text-lg font-bold">{formatCurrency(stats.valorAPagar)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vencido</p>
                <p className="text-lg font-bold">{formatCurrency(stats.valorVencido)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <Calendar className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vence em 7 dias</p>
                <p className="text-lg font-bold">{formatCurrency(stats.valorAVencer7Dias)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Multa + Juros</p>
                <p className="text-lg font-bold">{formatCurrency(stats.totalMulta + stats.totalJuros)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      {stats.timelineData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5 text-orange-500" />
              Evolução Temporal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto" ref={(el) => { if (el) el.scrollLeft = el.scrollWidth; }}>
              <div style={{ minWidth: Math.max(800, stats.timelineData.length * 70) + "px" }}>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={stats.timelineData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="mesLabel" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactCurrency(v)} />
                    <Tooltip content={<CustomTooltip isCurrency />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="valor" stroke="#f97316" fill="#f97316" fillOpacity={0.3} name="Valor Total" />
                    <Line type="monotone" dataKey="pago" stroke="#22c55e" name="Pago" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Por Situação */}
        {stats.situacaoData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <PieChartIcon className="h-4 w-4 text-orange-500" />
                Por Situação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={stats.situacaoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="valor"
                    nameKey="name"
                  >
                    {stats.situacaoData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Operação */}
        {stats.operacaoData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-orange-500" />
                Por Operação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.operacaoData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactCurrency(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} tickFormatter={(v) => v.length > 12 ? v.substring(0, 12) + "..." : v} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#f97316" radius={[0, 4, 4, 0]} name="Valor" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Fornecedor */}
        {stats.fornecedorData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-orange-500" />
                Por Fornecedor (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.fornecedorData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactCurrency(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} tickFormatter={(v) => v.length > 12 ? v.substring(0, 12) + "..." : v} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Valor" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Cooperativa */}
        {stats.cooperativaData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-orange-500" />
                Por Cooperativa (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.cooperativaData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactCurrency(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} tickFormatter={(v) => v.length > 12 ? v.substring(0, 12) + "..." : v} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#22c55e" radius={[0, 4, 4, 0]} name="Valor" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Forma de Pagamento */}
        {stats.formaPagamentoData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4 text-orange-500" />
                Por Forma de Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={stats.formaPagamentoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="valor"
                    nameKey="name"
                  >
                    {stats.formaPagamentoData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Regional */}
        {stats.regionalData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-orange-500" />
                Por Regional (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.regionalData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactCurrency(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} tickFormatter={(v) => v.length > 12 ? v.substring(0, 12) + "..." : v} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Valor" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Tipo de Veículo */}
        {stats.tipoVeiculoData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Truck className="h-4 w-4 text-orange-500" />
                Por Tipo de Veículo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={stats.tipoVeiculoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="valor"
                    nameKey="name"
                  >
                    {stats.tipoVeiculoData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Centro de Custo */}
        {stats.centroCustoData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-orange-500" />
                Por Centro de Custo (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.centroCustoData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactCurrency(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} tickFormatter={(v) => v.length > 12 ? v.substring(0, 12) + "..." : v} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#ec4899" radius={[0, 4, 4, 0]} name="Valor" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Motivo Evento */}
        {stats.motivoEventoData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Por Motivo Evento (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.motivoEventoData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactCurrency(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} tickFormatter={(v) => v.length > 12 ? v.substring(0, 12) + "..." : v} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#14b8a6" radius={[0, 4, 4, 0]} name="Valor" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
