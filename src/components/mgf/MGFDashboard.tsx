import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
  Truck,
  FileText,
  Users,
  Package,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface MGFDashboardProps {
  dados: any[];
  colunas: string[];
  loading: boolean;
  associacaoNome: string;
}

const COLORS = ["#f97316", "#fb923c", "#fdba74", "#0ea5e9", "#06b6d4", "#14b8a6", "#22c55e", "#84cc16", "#eab308", "#ef4444"];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
};

const formatFullCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
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
            {entry.name}: {isCurrency ? formatFullCurrency(entry.value) : entry.value?.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const truncateText = (text: string, maxLength: number = 18) => {
  if (!text) return "-";
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
};

export default function MGFDashboard({ dados, colunas, loading, associacaoNome }: MGFDashboardProps) {
  const [evolucaoView, setEvolucaoView] = useState<'mes' | 'dia'>('mes');

  const stats = useMemo(() => {
    if (!dados.length) return null;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const em7Dias = new Date(hoje);
    em7Dias.setDate(em7Dias.getDate() + 7);
    const em30Dias = new Date(hoje);
    em30Dias.setDate(em30Dias.getDate() + 30);
    const em60Dias = new Date(hoje);
    em60Dias.setDate(em60Dias.getDate() + 60);
    const em90Dias = new Date(hoje);
    em90Dias.setDate(em90Dias.getDate() + 90);

    // KPIs Financeiros
    const totalRegistros = dados.length;
    const valorTotal = dados.reduce((acc, d) => acc + (d.valor || 0), 0);
    const valorTotalLancamento = dados.reduce((acc, d) => acc + (d.valor_total_lancamento || 0), 0);
    
    // Pagos vs A Pagar
    const pagos = dados.filter(d => d.situacao_pagamento?.toLowerCase().includes('pago') || d.data_pagamento);
    const valorPago = pagos.reduce((acc, d) => acc + (d.valor_pagamento || d.valor || 0), 0);
    const qtdPagos = pagos.length;
    
    const aPagar = dados.filter(d => !d.situacao_pagamento?.toLowerCase().includes('pago') && !d.data_pagamento);
    const valorAPagar = aPagar.reduce((acc, d) => acc + (d.valor || 0), 0);
    const qtdAPagar = aPagar.length;
    
    // Vencidos
    const vencidos = dados.filter(d => {
      if (d.situacao_pagamento?.toLowerCase().includes('pago') || d.data_pagamento) return false;
      if (!d.data_vencimento) return false;
      const venc = new Date(d.data_vencimento);
      return venc < hoje;
    });
    const valorVencido = vencidos.reduce((acc, d) => acc + (d.valor || 0), 0);
    const qtdVencidos = vencidos.length;
    
    // A vencer em 7 dias
    const filterAVencer = (diasInicio: number, diasFim: number) => {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() + diasInicio);
      const fim = new Date(hoje);
      fim.setDate(fim.getDate() + diasFim);
      
      return dados.filter(d => {
        if (d.situacao_pagamento?.toLowerCase().includes('pago') || d.data_pagamento) return false;
        if (!d.data_vencimento) return false;
        const venc = new Date(d.data_vencimento);
        return venc >= inicio && venc <= fim;
      });
    };
    
    const aVencer7 = filterAVencer(0, 7);
    const valorAVencer7Dias = aVencer7.reduce((acc, d) => acc + (d.valor || 0), 0);
    const qtdAVencer7 = aVencer7.length;
    
    // A vencer em 30 dias (8-30)
    const aVencer30 = filterAVencer(0, 30);
    const valorAVencer30Dias = aVencer30.reduce((acc, d) => acc + (d.valor || 0), 0);
    const qtdAVencer30 = aVencer30.length;
    
    // A vencer em 60 dias (31-60)
    const aVencer60 = filterAVencer(0, 60);
    const valorAVencer60Dias = aVencer60.reduce((acc, d) => acc + (d.valor || 0), 0);
    const qtdAVencer60 = aVencer60.length;
    
    // A vencer em 90 dias (61-90)
    const aVencer90 = filterAVencer(0, 90);
    const valorAVencer90Dias = aVencer90.reduce((acc, d) => acc + (d.valor || 0), 0);
    const qtdAVencer90 = aVencer90.length;

    // Total multa e juros
    const totalMulta = dados.reduce((acc, d) => acc + (d.multa || 0), 0);
    const totalJuros = dados.reduce((acc, d) => acc + (d.juros || 0), 0);
    const totalImpostos = dados.reduce((acc, d) => acc + (d.impostos || 0), 0);

    // Ticket médio
    const ticketMedio = valorTotal / totalRegistros;

    // Fornecedores únicos
    const fornecedoresUnicos = new Set(dados.filter(d => d.fornecedor || d.nome_fantasia_fornecedor).map(d => d.fornecedor || d.nome_fantasia_fornecedor)).size;

    // Por Operação
    const porOperacao = dados.reduce((acc: any, d) => {
      const op = d.operacao || "Não informado";
      if (op !== "Não informado") {
        acc[op] = acc[op] || { count: 0, valor: 0 };
        acc[op].count += 1;
        acc[op].valor += d.valor || 0;
      }
      return acc;
    }, {});
    const operacaoData = Object.entries(porOperacao)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    // Por SubOperação
    const porSubOperacao = dados.reduce((acc: any, d) => {
      const subOp = d.sub_operacao || "Não informado";
      if (subOp !== "Não informado") {
        acc[subOp] = acc[subOp] || { count: 0, valor: 0 };
        acc[subOp].count += 1;
        acc[subOp].valor += d.valor || 0;
      }
      return acc;
    }, {});
    const subOperacaoData = Object.entries(porSubOperacao)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

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

    // Por Associado
    const porAssociado = dados.reduce((acc: any, d) => {
      const assoc = d.associado || "Não informado";
      if (assoc !== "Não informado") {
        acc[assoc] = acc[assoc] || { count: 0, valor: 0 };
        acc[assoc].count += 1;
        acc[assoc].valor += d.valor || 0;
      }
      return acc;
    }, {});
    const associadoData = Object.entries(porAssociado)
      .map(([name, data]: [string, any]) => ({ name, count: data.count, valor: data.valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    // Timeline por mês
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

    // Timeline por dia
    const porDia = dados.reduce((acc: any, d) => {
      const dataRef = d.data_vencimento || d.data_evento || d.data_nota_fiscal;
      if (dataRef) {
        const date = new Date(dataRef);
        if (!isNaN(date.getTime())) {
          const diaKey = date.toISOString().split('T')[0];
          acc[diaKey] = acc[diaKey] || { count: 0, valor: 0, pago: 0 };
          acc[diaKey].count += 1;
          acc[diaKey].valor += d.valor || 0;
          if (d.situacao_pagamento?.toLowerCase().includes('pago') || d.data_pagamento) {
            acc[diaKey].pago += d.valor_pagamento || d.valor || 0;
          }
        }
      }
      return acc;
    }, {});
    const timelineDiaData = Object.entries(porDia)
      .map(([dia, data]: [string, any]) => ({
        dia,
        diaLabel: new Date(dia + 'T12:00:00').toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' }),
        count: data.count,
        valor: data.valor,
        pago: data.pago,
      }))
      .sort((a, b) => a.dia.localeCompare(b.dia));

    return {
      totalRegistros,
      valorTotal,
      valorTotalLancamento,
      valorPago,
      qtdPagos,
      valorAPagar,
      qtdAPagar,
      valorVencido,
      qtdVencidos,
      valorAVencer7Dias,
      qtdAVencer7,
      valorAVencer30Dias,
      qtdAVencer30,
      valorAVencer60Dias,
      qtdAVencer60,
      valorAVencer90Dias,
      qtdAVencer90,
      totalMulta,
      totalJuros,
      totalImpostos,
      ticketMedio,
      fornecedoresUnicos,
      operacaoData,
      subOperacaoData,
      situacaoData,
      fornecedorData,
      cooperativaData,
      formaPagamentoData,
      regionalData,
      tipoVeiculoData,
      centroCustoData,
      motivoEventoData,
      associadoData,
      timelineData,
      timelineDiaData,
    };
  }, [dados]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
          {[...Array(8)].map((_, i) => (
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
      {/* KPIs Principais - Row 1 */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Banknote className="h-4 w-4 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground">Valor Total</p>
                <p className="text-base font-bold text-blue-600">{formatFullCurrency(stats.valorTotal)}</p>
                <p className="text-[10px] text-muted-foreground">{stats.totalRegistros.toLocaleString()} registros</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-green-500/20">
                <CheckCircle className="h-4 w-4 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground">Pago</p>
                <p className="text-base font-bold text-green-600">{formatFullCurrency(stats.valorPago)}</p>
                <p className="text-[10px] text-muted-foreground">{stats.qtdPagos.toLocaleString()} registros</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <Clock className="h-4 w-4 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground">A Pagar</p>
                <p className="text-base font-bold text-orange-600">{formatFullCurrency(stats.valorAPagar)}</p>
                <p className="text-[10px] text-muted-foreground">{stats.qtdAPagar.toLocaleString()} registros</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-500/20">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground">Vencido</p>
                <p className="text-base font-bold text-red-600">{formatFullCurrency(stats.valorVencido)}</p>
                <p className="text-[10px] text-muted-foreground">{stats.qtdVencidos.toLocaleString()} registros</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <TrendingUp className="h-4 w-4 text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground">Multa + Juros</p>
                <p className="text-base font-bold text-purple-600">{formatFullCurrency(stats.totalMulta + stats.totalJuros)}</p>
                <p className="text-[10px] text-muted-foreground">Ticket médio: {formatCurrency(stats.ticketMedio)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPIs Previsão Vencimentos */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Vence em 7 dias</p>
                <p className="text-lg font-bold text-yellow-600">{formatFullCurrency(stats.valorAVencer7Dias)}</p>
                <p className="text-[10px] text-muted-foreground">{stats.qtdAVencer7} registro(s)</p>
              </div>
              <Calendar className="h-8 w-8 text-yellow-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Vence em 30 dias</p>
                <p className="text-lg font-bold text-amber-600">{formatFullCurrency(stats.valorAVencer30Dias)}</p>
                <p className="text-[10px] text-muted-foreground">{stats.qtdAVencer30} registro(s)</p>
              </div>
              <Calendar className="h-8 w-8 text-amber-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Vence em 60 dias</p>
                <p className="text-lg font-bold text-orange-600">{formatFullCurrency(stats.valorAVencer60Dias)}</p>
                <p className="text-[10px] text-muted-foreground">{stats.qtdAVencer60} registro(s)</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Vence em 90 dias</p>
                <p className="text-lg font-bold text-cyan-600">{formatFullCurrency(stats.valorAVencer90Dias)}</p>
                <p className="text-[10px] text-muted-foreground">{stats.qtdAVencer90} registro(s)</p>
              </div>
              <Calendar className="h-8 w-8 text-cyan-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      {stats.timelineData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-5 w-5 text-orange-500" />
                Evolução Temporal
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant={evolucaoView === 'mes' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEvolucaoView('mes')}
                >
                  Mês
                </Button>
                <Button
                  variant={evolucaoView === 'dia' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEvolucaoView('dia')}
                >
                  Dia
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto" ref={(el) => { if (el) el.scrollLeft = el.scrollWidth; }}>
              <div style={{ 
                minWidth: evolucaoView === 'mes' 
                  ? Math.max(800, stats.timelineData.length * 70) + "px"
                  : Math.max(800, stats.timelineDiaData.length * 45) + "px"
              }}>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={evolucaoView === 'mes' ? stats.timelineData : stats.timelineDiaData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey={evolucaoView === 'mes' ? 'mesLabel' : 'diaLabel'} 
                      tick={{ fontSize: 11 }} 
                      interval={0} 
                    />
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

      {/* Charts Grid - Row 1 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Por Operação */}
        {stats.operacaoData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-orange-500" />
                Por Operação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.operacaoData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} tickFormatter={(v) => truncateText(v, 15)} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#f97316" name="Valor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por SubOperação */}
        {stats.subOperacaoData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-orange-500" />
                Por SubOperação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.subOperacaoData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} tickFormatter={(v) => truncateText(v, 15)} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#fb923c" name="Valor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Situação */}
        {stats.situacaoData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <PieChartIcon className="h-4 w-4 text-orange-500" />
                Por Situação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={stats.situacaoData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="valor"
                    >
                      {stats.situacaoData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatFullCurrency(value), 'Valor']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1">
                  {stats.situacaoData.slice(0, 5).map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="truncate flex-1">{truncateText(item.name, 12)}</span>
                      <span className="font-medium">{formatCurrency(item.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts Grid - Row 2 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Por Fornecedor */}
        {stats.fornecedorData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-orange-500" />
                Por Fornecedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.fornecedorData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} tickFormatter={(v) => truncateText(v, 15)} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#0ea5e9" name="Valor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Cooperativa */}
        {stats.cooperativaData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-orange-500" />
                Por Cooperativa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.cooperativaData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} tickFormatter={(v) => truncateText(v, 15)} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#06b6d4" name="Valor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Forma de Pagamento */}
        {stats.formaPagamentoData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4 text-orange-500" />
                Por Forma de Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={stats.formaPagamentoData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="valor"
                    >
                      {stats.formaPagamentoData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatFullCurrency(value), 'Valor']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1">
                  {stats.formaPagamentoData.slice(0, 5).map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="truncate flex-1">{truncateText(item.name, 12)}</span>
                      <span className="font-medium">{formatCurrency(item.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts Grid - Row 3 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Por Regional */}
        {stats.regionalData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-orange-500" />
                Por Regional
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.regionalData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} tickFormatter={(v) => truncateText(v, 15)} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#14b8a6" name="Valor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Tipo de Veículo */}
        {stats.tipoVeiculoData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Truck className="h-4 w-4 text-orange-500" />
                Por Tipo de Veículo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={stats.tipoVeiculoData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="valor"
                    >
                      {stats.tipoVeiculoData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatFullCurrency(value), 'Valor']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1">
                  {stats.tipoVeiculoData.slice(0, 5).map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="truncate flex-1">{truncateText(item.name, 12)}</span>
                      <span className="font-medium">{formatCurrency(item.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Por Centro de Custo */}
        {stats.centroCustoData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-orange-500" />
                Por Centro de Custo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.centroCustoData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} tickFormatter={(v) => truncateText(v, 15)} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#22c55e" name="Valor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts Grid - Row 4 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Por Motivo Evento */}
        {stats.motivoEventoData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Por Motivo Evento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.motivoEventoData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} tickFormatter={(v) => truncateText(v, 18)} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#ef4444" name="Valor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Por Associado */}
        {stats.associadoData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-orange-500" />
                Por Associado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.associadoData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} tickFormatter={(v) => truncateText(v, 18)} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Bar dataKey="valor" fill="#8b5cf6" name="Valor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
