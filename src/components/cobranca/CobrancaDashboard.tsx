import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area, ComposedChart
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, DollarSign, AlertCircle, Calendar, FileText, CheckCircle2, Clock, Building2 } from "lucide-react";

interface CobrancaDashboardProps {
  boletos: any[];
  loading: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

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

const formatPercent = (value: number) => {
  return `${value.toFixed(2)}%`;
};

// Custom tooltip
const CustomTooltip = ({ active, payload, label, isCurrency = false, isPercent = false }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {isPercent ? formatPercent(entry.value) : isCurrency ? formatCurrency(entry.value) : entry.value.toLocaleString('pt-BR')}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function CobrancaDashboard({ boletos, loading }: CobrancaDashboardProps) {
  const [evolucaoView, setEvolucaoView] = useState<'mes' | 'dia'>('dia');
  const [modoInadimplencia, setModoInadimplencia] = useState<'acumulado' | 'pontual'>('acumulado');
  
  const stats = useMemo(() => {
    if (!boletos.length) return null;

    // Filtrar cancelados conforme especificação
    const boletosFiltrados = boletos.filter(b => 
      b.situacao && b.situacao.toUpperCase() !== 'CANCELADO'
    );

    // Separar por situação
    const boletosAbertos = boletosFiltrados.filter(b => 
      b.situacao && b.situacao.toUpperCase() === 'ABERTO'
    );
    const boletosPagos = boletosFiltrados.filter(b => 
      b.situacao && b.situacao.toUpperCase() === 'BAIXADO'
    );

    // Totais
    const totalBoletos = boletosFiltrados.length;
    const totalValor = boletosFiltrados.reduce((acc, b) => acc + (b.valor || 0), 0);
    const totalPago = boletosPagos.reduce((acc, b) => acc + (b.valor || 0), 0);
    const totalAberto = boletosAbertos.reduce((acc, b) => acc + (b.valor || 0), 0);

    // Por Dia Vencimento Veículo (emitidos)
    const porDiaVencimento = boletosFiltrados.reduce((acc: any, b) => {
      const dia = b.dia_vencimento_veiculo || 'N/I';
      if (!acc[dia]) {
        acc[dia] = { qtde: 0, valor: 0 };
      }
      acc[dia].qtde += 1;
      acc[dia].valor += b.valor || 0;
      return acc;
    }, {});
    const diasVencimentoData = Object.entries(porDiaVencimento)
      .filter(([dia]) => dia !== 'N/I')
      .map(([dia, data]: [string, any]) => ({
        dia: `Dia ${dia}`,
        diaNum: parseInt(dia),
        qtde: data.qtde,
        valor: data.valor
      }))
      .sort((a, b) => a.diaNum - b.diaNum);

    // Por Dia Vencimento - Boletos Pagos
    const porDiaVencimentoPagos = boletosPagos.reduce((acc: any, b) => {
      const dia = b.dia_vencimento_veiculo || 'N/I';
      if (!acc[dia]) {
        acc[dia] = { qtde: 0, valor: 0 };
      }
      acc[dia].qtde += 1;
      acc[dia].valor += b.valor || 0;
      return acc;
    }, {});
    const diasVencimentoPagosData = Object.entries(porDiaVencimentoPagos)
      .filter(([dia]) => dia !== 'N/I')
      .map(([dia, data]: [string, any]) => ({
        dia: `Dia ${dia}`,
        diaNum: parseInt(dia),
        qtde: data.qtde,
        valor: data.valor
      }))
      .sort((a, b) => a.diaNum - b.diaNum);

    // Por Dia Vencimento - Boletos em Aberto
    const porDiaVencimentoAbertos = boletosAbertos.reduce((acc: any, b) => {
      const dia = b.dia_vencimento_veiculo || 'N/I';
      if (!acc[dia]) {
        acc[dia] = { qtde: 0, valor: 0 };
      }
      acc[dia].qtde += 1;
      acc[dia].valor += b.valor || 0;
      return acc;
    }, {});
    const diasVencimentoAbertosData = Object.entries(porDiaVencimentoAbertos)
      .filter(([dia]) => dia !== 'N/I')
      .map(([dia, data]: [string, any]) => ({
        dia: `Dia ${dia}`,
        diaNum: parseInt(dia),
        qtde: data.qtde,
        valor: data.valor
      }))
      .sort((a, b) => a.diaNum - b.diaNum);

    // Gráfico de Inadimplência por Dia do Mês (usando dia_vencimento_veiculo)
    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    const diasDoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
    const inadimplenciaPorDia = [];
    
    for (let dia = 1; dia <= diasDoMes; dia++) {
      // Data de referência para este dia do mês
      const dataRef = new Date(anoAtual, mesAtual, dia);
      
      // ACUMULADO ATUAL: Boletos com dia_vencimento_veiculo ATÉ este dia (estado atual)
      const boletosVencidosAteDia = boletosFiltrados.filter(b => {
        const diaVenc = b.dia_vencimento_veiculo;
        return diaVenc != null && diaVenc <= dia;
      });
      
      const boletosEmAbertoAteDia = boletosVencidosAteDia.filter(b => 
        b.situacao && b.situacao.toUpperCase() === 'ABERTO'
      );
      
      const percentInadimplenciaAcumulado = boletosVencidosAteDia.length > 0 
        ? (boletosEmAbertoAteDia.length / boletosVencidosAteDia.length) * 100 
        : 0;
      
      // PONTUAL ATUAL: Boletos com dia_vencimento_veiculo EXATAMENTE neste dia
      const boletosVencidosNoDia = boletosFiltrados.filter(b => {
        return b.dia_vencimento_veiculo === dia;
      });
      
      const boletosEmAbertoNoDia = boletosVencidosNoDia.filter(b => 
        b.situacao && b.situacao.toUpperCase() === 'ABERTO'
      );
      
      const percentInadimplenciaPontual = boletosVencidosNoDia.length > 0 
        ? (boletosEmAbertoNoDia.length / boletosVencidosNoDia.length) * 100 
        : 0;
      
      // REFERÊNCIA HISTÓRICA: Como estava a inadimplência NAQUELE DIA
      // Um boleto estava "em aberto" no dia X se: ainda não foi pago OU foi pago depois do dia X
      const boletosEmAbertoNaquelaData = boletosVencidosAteDia.filter(b => {
        // Se está aberto agora, estava aberto naquela data também
        if (b.situacao && b.situacao.toUpperCase() === 'ABERTO') return true;
        
        // Se foi pago, verificar se foi pago DEPOIS desta data
        if (b.data_pagamento) {
          const dataPagamento = new Date(b.data_pagamento);
          return dataPagamento > dataRef;
        }
        
        // Se não tem data de pagamento mas está baixado, considerar pago no vencimento
        return false;
      });
      
      const percentInadimplenciaReferencia = boletosVencidosAteDia.length > 0 
        ? (boletosEmAbertoNaquelaData.length / boletosVencidosAteDia.length) * 100 
        : 0;
      
      inadimplenciaPorDia.push({
        dia,
        diaLabel: `${dia}`,
        inadimplenciaAcumulado: percentInadimplenciaAcumulado,
        inadimplenciaPontual: percentInadimplenciaPontual,
        inadimplenciaReferencia: percentInadimplenciaReferencia,
        qtdeAbertoAcumulado: boletosEmAbertoAteDia.length,
        qtdeTotalAcumulado: boletosVencidosAteDia.length,
        qtdeAbertoPontual: boletosEmAbertoNoDia.length,
        qtdeTotalPontual: boletosVencidosNoDia.length,
        qtdeAbertoReferencia: boletosEmAbertoNaquelaData.length
      });
    }

    // Arrecadação Projetada x Recebida (por data de vencimento vs data de pagamento)
    const arrecadacaoPorDia: any = {};
    
    // Vencimentos por dia
    boletosFiltrados.forEach(b => {
      if (b.data_vencimento) {
        const dia = new Date(b.data_vencimento).getDate();
        if (!arrecadacaoPorDia[dia]) {
          arrecadacaoPorDia[dia] = { projetado: 0, recebido: 0 };
        }
        arrecadacaoPorDia[dia].projetado += b.valor || 0;
      }
    });
    
    // Pagamentos por dia
    boletosPagos.forEach(b => {
      if (b.data_pagamento) {
        const dia = new Date(b.data_pagamento).getDate();
        if (!arrecadacaoPorDia[dia]) {
          arrecadacaoPorDia[dia] = { projetado: 0, recebido: 0 };
        }
        arrecadacaoPorDia[dia].recebido += b.valor || 0;
      }
    });
    
    const arrecadacaoData = Object.entries(arrecadacaoPorDia)
      .map(([dia, data]: [string, any]) => ({
        dia: parseInt(dia),
        diaLabel: `Dia ${dia}`,
        projetado: data.projetado,
        recebido: data.recebido
      }))
      .sort((a, b) => a.dia - b.dia);

    // Ranking Regionais - Pagos
    const regionaisPagos = boletosPagos.reduce((acc: any, b) => {
      const regional = b.regional_boleto || 'N/I';
      if (regional !== 'N/I') {
        if (!acc[regional]) acc[regional] = { qtde: 0, valor: 0 };
        acc[regional].qtde += 1;
        acc[regional].valor += b.valor || 0;
      }
      return acc;
    }, {});
    const regionaisPagosData = Object.entries(regionaisPagos)
      .map(([name, data]: [string, any]) => ({ name, qtde: data.qtde, valor: data.valor }))
      .sort((a: any, b: any) => b.valor - a.valor)
      .slice(0, 10);

    // Ranking Regionais - Abertos
    const regionaisAbertos = boletosAbertos.reduce((acc: any, b) => {
      const regional = b.regional_boleto || 'N/I';
      if (regional !== 'N/I') {
        if (!acc[regional]) acc[regional] = { qtde: 0, valor: 0 };
        acc[regional].qtde += 1;
        acc[regional].valor += b.valor || 0;
      }
      return acc;
    }, {});
    const regionaisAbertosData = Object.entries(regionaisAbertos)
      .map(([name, data]: [string, any]) => ({ name, qtde: data.qtde, valor: data.valor }))
      .sort((a: any, b: any) => b.valor - a.valor)
      .slice(0, 10);

    // Ranking Cooperativas - Pagos
    const cooperativasPagos = boletosPagos.reduce((acc: any, b) => {
      const cooperativa = b.cooperativa || 'N/I';
      if (cooperativa !== 'N/I') {
        if (!acc[cooperativa]) acc[cooperativa] = { qtde: 0, valor: 0 };
        acc[cooperativa].qtde += 1;
        acc[cooperativa].valor += b.valor || 0;
      }
      return acc;
    }, {});
    const cooperativasPagosData = Object.entries(cooperativasPagos)
      .map(([name, data]: [string, any]) => ({ name, qtde: data.qtde, valor: data.valor }))
      .sort((a: any, b: any) => b.valor - a.valor)
      .slice(0, 10);

    // Ranking Cooperativas - Abertos
    const cooperativasAbertos = boletosAbertos.reduce((acc: any, b) => {
      const cooperativa = b.cooperativa || 'N/I';
      if (cooperativa !== 'N/I') {
        if (!acc[cooperativa]) acc[cooperativa] = { qtde: 0, valor: 0 };
        acc[cooperativa].qtde += 1;
        acc[cooperativa].valor += b.valor || 0;
      }
      return acc;
    }, {});
    const cooperativasAbertosData = Object.entries(cooperativasAbertos)
      .map(([name, data]: [string, any]) => ({ name, qtde: data.qtde, valor: data.valor }))
      .sort((a: any, b: any) => b.valor - a.valor)
      .slice(0, 10);

    return {
      totalBoletos,
      totalValor,
      totalPago,
      totalAberto,
      qtdePagos: boletosPagos.length,
      qtdeAbertos: boletosAbertos.length,
      diasVencimentoData,
      diasVencimentoPagosData,
      diasVencimentoAbertosData,
      inadimplenciaPorDia,
      arrecadacaoData,
      regionaisPagosData,
      regionaisAbertosData,
      cooperativasPagosData,
      cooperativasAbertosData,
      percentualInadimplencia: totalBoletos > 0 ? (boletosAbertos.length / totalBoletos) * 100 : 0
    };
  }, [boletos]);

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

  if (!boletos.length || !stats) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum Dado Disponível</h3>
          <p className="text-muted-foreground">
            Importe uma planilha de boletos para visualizar os dashboards.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Boletos Emitidos</p>
                <p className="text-2xl font-bold">{stats.totalBoletos.toLocaleString('pt-BR')}</p>
                <p className="text-sm text-blue-600 font-medium">{formatCurrency(stats.totalValor)}</p>
              </div>
              <FileText className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Boletos Pagos</p>
                <p className="text-2xl font-bold">{stats.qtdePagos.toLocaleString('pt-BR')}</p>
                <p className="text-sm text-green-600 font-medium">{formatCurrency(stats.totalPago)}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Boletos em Aberto</p>
                <p className="text-2xl font-bold">{stats.qtdeAbertos.toLocaleString('pt-BR')}</p>
                <p className="text-sm text-red-600 font-medium">{formatCurrency(stats.totalAberto)}</p>
              </div>
              <Clock className="h-8 w-8 text-red-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">% Inadimplência</p>
                <p className="text-2xl font-bold">{formatPercent(stats.percentualInadimplencia)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Boletos por Dia de Vencimento */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-primary" />
              Boletos Emitidos por Dia Venc.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {stats.diasVencimentoData.map((item, index) => (
                <div key={item.dia} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                  <span className="font-medium">{item.dia}</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-blue-600">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border-2 border-primary/20 mt-2">
                <span className="font-bold">Total</span>
                <div className="text-right">
                  <p className="font-bold">{stats.totalBoletos} boletos</p>
                  <p className="text-sm text-blue-600 font-semibold">{formatCurrency(stats.totalValor)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Boletos Pagos por Dia Venc.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {stats.diasVencimentoPagosData.map((item, index) => (
                <div key={item.dia} className="flex items-center justify-between p-2 bg-green-500/10 rounded-lg">
                  <span className="font-medium">{item.dia}</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-green-600">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between p-3 bg-green-500/20 rounded-lg border-2 border-green-500/30 mt-2">
                <span className="font-bold">Total Pagos</span>
                <div className="text-right">
                  <p className="font-bold">{stats.qtdePagos} boletos</p>
                  <p className="text-sm text-green-600 font-semibold">{formatCurrency(stats.totalPago)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-red-500" />
              Boletos em Aberto por Dia Venc.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {stats.diasVencimentoAbertosData.map((item, index) => (
                <div key={item.dia} className="flex items-center justify-between p-2 bg-red-500/10 rounded-lg">
                  <span className="font-medium">{item.dia}</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-red-600">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between p-3 bg-red-500/20 rounded-lg border-2 border-red-500/30 mt-2">
                <span className="font-bold">Total em Aberto</span>
                <div className="text-right">
                  <p className="font-bold">{stats.qtdeAbertos} boletos</p>
                  <p className="text-sm text-red-600 font-semibold">{formatCurrency(stats.totalAberto)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Inadimplência com duas linhas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Inadimplência
            </CardTitle>
            <div className="flex gap-1">
              <Button 
                variant={modoInadimplencia === 'acumulado' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setModoInadimplencia('acumulado')}
              >
                Acumulado
              </Button>
              <Button 
                variant={modoInadimplencia === 'pontual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setModoInadimplencia('pontual')}
              >
                Pontual
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(800, stats.inadimplenciaPorDia.length * 30) + 'px' }}>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={stats.inadimplenciaPorDia}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="diaLabel" 
                    tick={{ fontSize: 10 }} 
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const dataPoint = stats.inadimplenciaPorDia.find(d => d.diaLabel === label);
                        return (
                          <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-medium mb-1">Dia {label}</p>
                            {payload.map((entry: any, index: number) => (
                              <p key={index} style={{ color: entry.color }}>
                                {entry.name}: {formatPercent(entry.value)}
                              </p>
                            ))}
                            {dataPoint && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {modoInadimplencia === 'acumulado' 
                                  ? `${dataPoint.qtdeAbertoAcumulado} abertos de ${dataPoint.qtdeTotalAcumulado} vencidos`
                                  : `${dataPoint.qtdeAbertoPontual} abertos de ${dataPoint.qtdeTotalPontual} no dia`
                                }
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey={modoInadimplencia === 'acumulado' ? 'inadimplenciaAcumulado' : 'inadimplenciaPontual'}
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    name={modoInadimplencia === 'acumulado' ? 'Inadimplência Real (Acumulada)' : 'Inadimplência Real (Pontual)'} 
                    dot={{ fill: '#3b82f6', r: 2 }}
                    connectNulls
                  />
                  <Line 
                    type="monotone" 
                    dataKey="inadimplenciaReferencia" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    name="Inadimplência Referência" 
                    dot={{ fill: '#ef4444', r: 2 }}
                    strokeDasharray="5 5"
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Arrecadação Projetada x Recebida */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Arrecadação Projetada x Recebida no Dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(800, stats.arrecadacaoData.length * 50) + 'px' }}>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={stats.arrecadacaoData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="diaLabel" tick={{ fontSize: 11 }} />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => formatCompactCurrency(v)}
                  />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Legend />
                  <Bar 
                    dataKey="projetado" 
                    fill="#3b82f6" 
                    name="Vencimentos (Projetado)" 
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar 
                    dataKey="recebido" 
                    fill="#10b981" 
                    name="Pagamentos (Recebido)" 
                    radius={[4, 4, 0, 0]}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rankings de Regionais */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-green-500" />
              Ranking Regionais - Boletos Pagos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.regionaisPagosData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3 p-2 bg-green-500/10 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-green-600">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-red-500" />
              Ranking Regionais - Boletos em Aberto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.regionaisAbertosData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3 p-2 bg-red-500/10 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-red-600">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rankings de Cooperativas */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-green-500" />
              Ranking Cooperativas - Boletos Pagos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.cooperativasPagosData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3 p-2 bg-green-500/10 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-green-600">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-red-500" />
              Ranking Cooperativas - Boletos em Aberto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.cooperativasAbertosData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3 p-2 bg-red-500/10 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-red-600">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
