import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Legend,
  LineChart,
  Line,
  LabelList,
} from "recharts";
import { 
  FileSpreadsheet,
  TrendingUp, 
  DollarSign, 
  AlertCircle,
  Search,
  Download,
  Check,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";

interface MGFRelatorioEventosProps {
  dados: any[];
  loading: boolean;
}

const COLORS_RATEAVEL = ["#22c55e", "#f97316"]; // Verde para rateável, laranja para não rateável
const COLORS = ["#0ea5e9", "#06b6d4", "#14b8a6", "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#ec4899", "#8b5cf6"];

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

const truncateText = (text: string, maxLength: number = 20) => {
  if (!text) return "-";
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
};

// Função para determinar se um evento é rateável
const isRateavel = (item: any): boolean => {
  const subOp = (item.sub_operacao || "").toLowerCase();
  const operacao = (item.operacao || "").toLowerCase();
  const centroCusto = (item.centro_custo || "").toLowerCase();
  
  // Verifica se contém "ratea" em qualquer campo relevante
  return subOp.includes("ratea") || 
         operacao.includes("ratea") || 
         centroCusto.includes("ratea");
};

// Função para identificar eventos (registros relacionados a eventos/sinistros)
const isEvento = (item: any): boolean => {
  const subOp = (item.sub_operacao || "").toLowerCase();
  
  return subOp.includes("evento") || 
         subOp.includes("indeniz") || 
         subOp.includes("sinistro") ||
         subOp.includes("juridico") ||
         !!item.veiculo_evento ||
         !!item.protocolo_evento;
};

export default function MGFRelatorioEventos({ dados, loading }: MGFRelatorioEventosProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const stats = useMemo(() => {
    if (!dados.length) return null;

    // Filtrar apenas registros de eventos
    const eventos = dados.filter(isEvento);
    
    // Separar rateáveis e não rateáveis
    const rateaveis = eventos.filter(isRateavel);
    const naoRateaveis = eventos.filter(item => !isRateavel(item));

    // Totais
    const totalEventos = eventos.length;
    const totalRateaveis = rateaveis.length;
    const totalNaoRateaveis = naoRateaveis.length;
    
    const valorTotalEventos = eventos.reduce((acc, d) => acc + (d.valor || 0), 0);
    const valorRateaveis = rateaveis.reduce((acc, d) => acc + (d.valor || 0), 0);
    const valorNaoRateaveis = naoRateaveis.reduce((acc, d) => acc + (d.valor || 0), 0);

    // Percentuais
    const percentualRateaveis = totalEventos > 0 ? (totalRateaveis / totalEventos) * 100 : 0;
    const percentualValorRateaveis = valorTotalEventos > 0 ? (valorRateaveis / valorTotalEventos) * 100 : 0;

    // Dados para gráfico de pizza
    const pieData = [
      { name: "Rateáveis", value: valorRateaveis, count: totalRateaveis },
      { name: "Não Rateáveis", value: valorNaoRateaveis, count: totalNaoRateaveis },
    ];

    // Agrupar por SubOperação
    const porSubOperacao: Record<string, { rateavel: number; naoRateavel: number; valorRateavel: number; valorNaoRateavel: number }> = {};
    eventos.forEach(item => {
      const subOp = item.sub_operacao || "Não informado";
      if (!porSubOperacao[subOp]) {
        porSubOperacao[subOp] = { rateavel: 0, naoRateavel: 0, valorRateavel: 0, valorNaoRateavel: 0 };
      }
      if (isRateavel(item)) {
        porSubOperacao[subOp].rateavel += 1;
        porSubOperacao[subOp].valorRateavel += item.valor || 0;
      } else {
        porSubOperacao[subOp].naoRateavel += 1;
        porSubOperacao[subOp].valorNaoRateavel += item.valor || 0;
      }
    });

    const subOperacaoData = Object.entries(porSubOperacao)
      .map(([name, data]) => ({
        name: truncateText(name, 25),
        fullName: name,
        rateavel: data.valorRateavel,
        naoRateavel: data.valorNaoRateavel,
        countRateavel: data.rateavel,
        countNaoRateavel: data.naoRateavel,
      }))
      .sort((a, b) => (b.rateavel + b.naoRateavel) - (a.rateavel + a.naoRateavel))
      .slice(0, 10);

    // Evolução mensal
    const evolucaoMensal: Record<string, { rateavel: number; naoRateavel: number }> = {};
    eventos.forEach(item => {
      let data = item.data_evento || item.data_vencimento || item.data_nota_fiscal;
      if (!data) return;
      const mes = data.substring(0, 7); // YYYY-MM
      if (!evolucaoMensal[mes]) {
        evolucaoMensal[mes] = { rateavel: 0, naoRateavel: 0 };
      }
      if (isRateavel(item)) {
        evolucaoMensal[mes].rateavel += item.valor || 0;
      } else {
        evolucaoMensal[mes].naoRateavel += item.valor || 0;
      }
    });

    const evolucaoData = Object.entries(evolucaoMensal)
      .map(([mes, data]) => ({
        mes,
        mesLabel: mes.split("-").reverse().join("/"),
        rateavel: data.rateavel,
        naoRateavel: data.naoRateavel,
        total: data.rateavel + data.naoRateavel,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12);

    // Agrupar por Cooperativa
    const porCooperativa: Record<string, { rateavel: number; naoRateavel: number }> = {};
    eventos.forEach(item => {
      const coop = item.cooperativa || "Não informado";
      if (coop === "Não informado") return;
      if (!porCooperativa[coop]) {
        porCooperativa[coop] = { rateavel: 0, naoRateavel: 0 };
      }
      if (isRateavel(item)) {
        porCooperativa[coop].rateavel += item.valor || 0;
      } else {
        porCooperativa[coop].naoRateavel += item.valor || 0;
      }
    });

    const cooperativaData = Object.entries(porCooperativa)
      .map(([name, data]) => ({
        name: truncateText(name, 20),
        fullName: name,
        rateavel: data.rateavel,
        naoRateavel: data.naoRateavel,
      }))
      .sort((a, b) => (b.rateavel + b.naoRateavel) - (a.rateavel + a.naoRateavel))
      .slice(0, 10);

    return {
      eventos,
      totalEventos,
      totalRateaveis,
      totalNaoRateaveis,
      valorTotalEventos,
      valorRateaveis,
      valorNaoRateaveis,
      percentualRateaveis,
      percentualValorRateaveis,
      pieData,
      subOperacaoData,
      evolucaoData,
      cooperativaData,
    };
  }, [dados]);

  // Filtro de busca na tabela
  const filteredEventos = useMemo(() => {
    if (!stats?.eventos) return [];
    if (!searchTerm) return stats.eventos;
    
    const term = searchTerm.toLowerCase();
    return stats.eventos.filter(item => 
      (item.sub_operacao || "").toLowerCase().includes(term) ||
      (item.descricao || "").toLowerCase().includes(term) ||
      (item.veiculo_evento || "").toLowerCase().includes(term) ||
      (item.fornecedor || "").toLowerCase().includes(term) ||
      (item.cooperativa || "").toLowerCase().includes(term)
    );
  }, [stats?.eventos, searchTerm]);

  // Paginação
  const paginatedEventos = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredEventos.slice(start, start + pageSize);
  }, [filteredEventos, page, pageSize]);

  const totalPages = Math.ceil(filteredEventos.length / pageSize);

  // Exportar para Excel
  const handleExportExcel = () => {
    if (!stats?.eventos.length) return;
    
    const exportData = stats.eventos.map(item => ({
      "SubOperação": item.sub_operacao || "",
      "Descrição": item.descricao || "",
      "Veículo Evento": item.veiculo_evento || "",
      "Fornecedor": item.fornecedor || "",
      "Cooperativa": item.cooperativa || "",
      "Valor": item.valor || 0,
      "Rateável": isRateavel(item) ? "Sim" : "Não",
      "Data Evento": item.data_evento || "",
      "Protocolo": item.protocolo_evento || "",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Eventos");
    XLSX.writeFile(wb, `relatorio_eventos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!dados.length || !stats) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum dado disponível para o relatório de eventos.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Eventos</p>
                <p className="text-2xl font-bold">{stats.totalEventos.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatCurrency(stats.valorTotalEventos)}
                </p>
              </div>
              <FileSpreadsheet className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Eventos Rateáveis</p>
                <p className="text-2xl font-bold text-green-600">{stats.totalRateaveis.toLocaleString()}</p>
                <p className="text-sm text-green-600 mt-1">
                  {formatCurrency(stats.valorRateaveis)}
                </p>
              </div>
              <Check className="h-8 w-8 text-green-500 opacity-80" />
            </div>
            <Badge variant="secondary" className="mt-2 bg-green-100 text-green-700">
              {stats.percentualRateaveis.toFixed(1)}% dos eventos
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Não Rateáveis</p>
                <p className="text-2xl font-bold text-orange-600">{stats.totalNaoRateaveis.toLocaleString()}</p>
                <p className="text-sm text-orange-600 mt-1">
                  {formatCurrency(stats.valorNaoRateaveis)}
                </p>
              </div>
              <X className="h-8 w-8 text-orange-500 opacity-80" />
            </div>
            <Badge variant="secondary" className="mt-2 bg-orange-100 text-orange-700">
              {(100 - stats.percentualRateaveis).toFixed(1)}% dos eventos
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">% Valor Rateável</p>
                <p className="text-2xl font-bold text-blue-600">{stats.percentualValorRateaveis.toFixed(1)}%</p>
                <p className="text-sm text-muted-foreground mt-1">
                  do valor total
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribuição Pizza */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Distribuição de Valores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  >
                    {stats.pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS_RATEAVEL[index % COLORS_RATEAVEL.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Evolução Mensal */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Evolução Mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.evolucaoData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="mesLabel" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Legend />
                  <Bar dataKey="rateavel" name="Rateáveis" fill="#22c55e" stackId="a" />
                  <Bar dataKey="naoRateavel" name="Não Rateáveis" fill="#f97316" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Por SubOperação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Por SubOperação (Top 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.subOperacaoData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={95} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Legend />
                  <Bar dataKey="rateavel" name="Rateáveis" fill="#22c55e" stackId="a" />
                  <Bar dataKey="naoRateavel" name="Não Rateáveis" fill="#f97316" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Por Cooperativa */}
        {stats.cooperativaData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Por Cooperativa (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.cooperativaData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                    <Tooltip content={<CustomTooltip isCurrency />} />
                    <Legend />
                    <Bar dataKey="rateavel" name="Rateáveis" fill="#22c55e" stackId="a" />
                    <Bar dataKey="naoRateavel" name="Não Rateáveis" fill="#f97316" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabela de Detalhes */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Detalhamento de Eventos ({filteredEventos.length.toLocaleString()} registros)
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleExportExcel}>
                <Download className="h-4 w-4 mr-2" />
                Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SubOperação</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Cooperativa</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Rateável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEventos.map((item, idx) => (
                  <TableRow key={item.id || idx}>
                    <TableCell className="max-w-[200px] truncate" title={item.sub_operacao}>
                      {truncateText(item.sub_operacao || "-", 30)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={item.descricao}>
                      {truncateText(item.descricao || "-", 30)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.veiculo_evento || "-"}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate" title={item.fornecedor}>
                      {truncateText(item.fornecedor || "-", 20)}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate" title={item.cooperativa}>
                      {truncateText(item.cooperativa || "-", 20)}
                    </TableCell>
                    <TableCell className="text-right text-blue-600 font-medium">
                      {formatFullCurrency(item.valor || 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {isRateavel(item) ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-200">Sim</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-200">Não</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedEventos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum evento encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Próximo
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
