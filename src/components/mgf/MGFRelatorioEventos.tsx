import { useMemo, useState, useEffect, useRef } from "react";
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
  Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// NOTE (escalabilidade): este relatório não recebe mais o array cru de
// lançamentos MGF. Os KPIs/gráficos vêm de uma chamada "leve" à RPC
// `calcular_relatorio_eventos_mgf` (sem busca, só os filtros globais) que
// só é refeita quando os filtros globais mudam — evitando recalcular tudo a
// cada tecla digitada na busca da tabela de detalhamento. A tabela de
// detalhamento (com busca + paginação de 20/página) chama a MESMA RPC de
// novo, agora com `p_search`/`p_page`, e usa `rows`/`totalCount`
// retornados. A busca é debounced em 300ms.
interface MGFRelatorioEventosProps {
  corretoraId: string;
  operacao: string | null;
  subOperacao: string | null;
  situacao: string | null;
  cooperativa: string | null;
  regional: string | null;
  formaPagamento: string | null;
  tipoVeiculo: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  loading: boolean;
  refreshToken?: number;
}

const COLORS_RATEAVEL = ["#22c55e", "#f97316"]; // Verde para rateável, laranja para não rateável

const PAGE_SIZE = 20;
// Cap de exportação: nunca busca o dataset filtrado inteiro de uma vez.
const EXPORT_CAP = 20000;

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

const EMPTY_KPI = {
  totalEventos: 0,
  totalRateaveis: 0,
  totalNaoRateaveis: 0,
  valorTotalEventos: 0,
  valorRateaveis: 0,
  valorNaoRateaveis: 0,
  subOperacaoData: [] as any[],
  cooperativaData: [] as any[],
  evolucaoData: [] as any[],
};

export default function MGFRelatorioEventos({
  corretoraId, operacao, subOperacao, situacao, cooperativa, regional, formaPagamento, tipoVeiculo,
  dataInicio, dataFim, loading, refreshToken,
}: MGFRelatorioEventosProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [kpiData, setKpiData] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(true);

  const [rows, setRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [tableLoading, setTableLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const kpiFetchIdRef = useRef(0);
  const tableFetchIdRef = useRef(0);

  // Debounce da busca (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // KPIs/gráficos — chamada "leve" (sem busca), só depende dos filtros globais.
  useEffect(() => {
    if (!corretoraId) {
      setKpiData(null);
      setKpiLoading(false);
      return;
    }
    const myId = ++kpiFetchIdRef.current;
    setKpiLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("calcular_relatorio_eventos_mgf", {
          p_corretora_id: corretoraId,
          p_operacao: operacao,
          p_sub_operacao: subOperacao,
          p_situacao: situacao,
          p_cooperativa: cooperativa,
          p_regional: regional,
          p_forma_pagamento: formaPagamento,
          p_tipo_veiculo: tipoVeiculo,
          p_data_inicio: dataInicio,
          p_data_fim: dataFim,
          p_page: 1,
          p_page_size: 1,
        } as any);
        if (myId !== kpiFetchIdRef.current) return;
        if (error) throw error;
        setKpiData(data);
      } catch (error) {
        console.error("Erro ao calcular relatório de eventos MGF:", error);
        if (myId === kpiFetchIdRef.current) setKpiData(null);
      } finally {
        if (myId === kpiFetchIdRef.current) setKpiLoading(false);
      }
    })();
  }, [corretoraId, operacao, subOperacao, situacao, cooperativa, regional, formaPagamento, tipoVeiculo, dataInicio, dataFim, refreshToken]);

  // Tabela de detalhamento — chamada com busca + paginação.
  useEffect(() => {
    if (!corretoraId) {
      setRows([]);
      setTotalCount(0);
      setTableLoading(false);
      return;
    }
    const myId = ++tableFetchIdRef.current;
    setTableLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("calcular_relatorio_eventos_mgf", {
          p_corretora_id: corretoraId,
          p_operacao: operacao,
          p_sub_operacao: subOperacao,
          p_situacao: situacao,
          p_cooperativa: cooperativa,
          p_regional: regional,
          p_forma_pagamento: formaPagamento,
          p_tipo_veiculo: tipoVeiculo,
          p_data_inicio: dataInicio,
          p_data_fim: dataFim,
          p_search: debouncedSearch.trim() || null,
          p_page: page,
          p_page_size: PAGE_SIZE,
        } as any);
        if (myId !== tableFetchIdRef.current) return;
        if (error) throw error;
        const result = (data as any) || {};
        setRows(result.rows || []);
        setTotalCount(result.totalCount || 0);
      } catch (error) {
        console.error("Erro ao carregar detalhamento de eventos MGF:", error);
        if (myId === tableFetchIdRef.current) {
          toast.error("Erro ao carregar a tabela de eventos. Tente novamente.");
        }
      } finally {
        if (myId === tableFetchIdRef.current) setTableLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corretoraId, operacao, subOperacao, situacao, cooperativa, regional, formaPagamento, tipoVeiculo, dataInicio, dataFim, debouncedSearch, page, refreshToken]);

  // Reset de página quando filtros/busca mudam
  useEffect(() => {
    setPage(1);
  }, [corretoraId, operacao, subOperacao, situacao, cooperativa, regional, formaPagamento, tipoVeiculo, dataInicio, dataFim, debouncedSearch, refreshToken]);

  const kpi = kpiData || EMPTY_KPI;

  const percentualRateaveis = kpi.totalEventos > 0 ? (kpi.totalRateaveis / kpi.totalEventos) * 100 : 0;
  const percentualValorRateaveis = kpi.valorTotalEventos > 0 ? (kpi.valorRateaveis / kpi.valorTotalEventos) * 100 : 0;

  const pieData = useMemo(
    () => [
      { name: "Rateáveis", value: kpi.valorRateaveis, count: kpi.totalRateaveis },
      { name: "Não Rateáveis", value: kpi.valorNaoRateaveis, count: kpi.totalNaoRateaveis },
    ],
    [kpi.valorRateaveis, kpi.valorNaoRateaveis, kpi.totalRateaveis, kpi.totalNaoRateaveis],
  );

  // A RPC retorna o nome completo em subOperacaoData/cooperativaData — o
  // truncamento pra exibição continua sendo feito no cliente, igual antes.
  const subOperacaoData = useMemo(
    () =>
      (kpi.subOperacaoData || []).map((d: any) => ({
        fullName: d.name,
        name: truncateText(d.name, 25),
        rateavel: d.rateavel,
        naoRateavel: d.naoRateavel,
        countRateavel: d.countRateavel,
        countNaoRateavel: d.countNaoRateavel,
      })),
    [kpi.subOperacaoData],
  );

  const cooperativaData = useMemo(
    () =>
      (kpi.cooperativaData || []).map((d: any) => ({
        fullName: d.name,
        name: truncateText(d.name, 20),
        rateavel: d.rateavel,
        naoRateavel: d.naoRateavel,
      })),
    [kpi.cooperativaData],
  );

  const evolucaoData = useMemo(
    () =>
      (kpi.evolucaoData || []).map((d: any) => ({
        ...d,
        mesLabel: d.mes.split("-").reverse().join("/"),
      })),
    [kpi.evolucaoData],
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Exportar para Excel — busca até EXPORT_CAP linhas (sem busca) com os
  // mesmos filtros globais ativos, em vez de exportar um array em memória.
  const handleExportExcel = async () => {
    if (!corretoraId) return;
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("calcular_relatorio_eventos_mgf", {
        p_corretora_id: corretoraId,
        p_operacao: operacao,
        p_sub_operacao: subOperacao,
        p_situacao: situacao,
        p_cooperativa: cooperativa,
        p_regional: regional,
        p_forma_pagamento: formaPagamento,
        p_tipo_veiculo: tipoVeiculo,
        p_data_inicio: dataInicio,
        p_data_fim: dataFim,
        p_page: 1,
        p_page_size: EXPORT_CAP,
      } as any);
      if (error) throw error;
      const result = (data as any) || {};
      const exportRows = result.rows || [];
      const exportTotal = result.totalCount || 0;

      if (exportTotal > EXPORT_CAP) {
        toast.warning(
          `Exportação limitada aos primeiros ${EXPORT_CAP.toLocaleString('pt-BR')} de ${exportTotal.toLocaleString('pt-BR')} eventos filtrados. Refine os filtros para exportar um subconjunto menor.`
        );
      }

      const exportData = exportRows.map((item: any) => ({
        "SubOperação": item.sub_operacao || "",
        "Descrição": item.descricao || "",
        "Veículo Evento": item.veiculo_evento || "",
        "Fornecedor": item.fornecedor || "",
        "Cooperativa": item.cooperativa || "",
        "Valor": item.valor || 0,
        "Rateável": item.is_rateavel ? "Sim" : "Não",
        "Data Evento": item.data_evento || "",
        "Protocolo": item.protocolo_evento || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Eventos");
      XLSX.writeFile(wb, `relatorio_eventos_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error("Erro ao exportar relatório de eventos MGF:", error);
      toast.error("Erro ao exportar os dados. Tente novamente.");
    } finally {
      setExporting(false);
    }
  };

  if (loading || (kpiLoading && !kpiData)) {
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

  if (!corretoraId) {
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
      {/* KPIs — padrão widget */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><FileSpreadsheet className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total de Eventos</p>
              <p className="text-xl font-bold leading-tight">{kpi.totalEventos.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground truncate">{formatCurrency(kpi.valorTotalEventos)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0"><Check className="h-5 w-5 text-emerald-600" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Eventos Rateáveis</p>
              <p className="text-xl font-bold text-emerald-600 leading-tight">{kpi.totalRateaveis.toLocaleString()}</p>
              <p className="text-[11px] text-emerald-600/80 truncate">{formatCurrency(kpi.valorRateaveis)} · {percentualRateaveis.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0"><X className="h-5 w-5 text-orange-600" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Não Rateáveis</p>
              <p className="text-xl font-bold text-orange-600 leading-tight">{kpi.totalNaoRateaveis.toLocaleString()}</p>
              <p className="text-[11px] text-orange-600/80 truncate">{formatCurrency(kpi.valorNaoRateaveis)} · {(100 - percentualRateaveis).toFixed(1)}%</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0"><TrendingUp className="h-5 w-5 text-blue-600" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">% Valor Rateável</p>
              <p className="text-xl font-bold text-blue-600 leading-tight">{percentualValorRateaveis.toFixed(1)}%</p>
              <p className="text-[11px] text-muted-foreground truncate">do valor total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Distribuição Pizza */}
        <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm font-semibold">Distribuição de Valores</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  >
                    {pieData.map((_, index) => (
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
        <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm font-semibold">Evolução Mensal</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolucaoData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
        <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm font-semibold">Por SubOperação (Top 10)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subOperacaoData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
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
        {cooperativaData.length > 0 && (
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm font-semibold">Por Cooperativa (Top 10)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cooperativaData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
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
      <Card className="rounded-2xl border-border/40">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Detalhamento de Eventos ({totalCount.toLocaleString()} registros)
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
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
                {tableLoading ? (
                  [...Array(6)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum evento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((item, idx) => (
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
                        {item.is_rateavel ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-200">Sim</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-200">Não</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
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
                  disabled={page === 1 || tableLoading}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || tableLoading}
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
