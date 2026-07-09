import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Search, Download, ChevronLeft, ChevronRight, Filter, X, Calendar, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

interface MGFTabelaProps {
  dados: any[];
  colunas: string[];
  loading: boolean;
}

type StatusKey = "a_vencer" | "vencido" | "pago" | "inativo";
type Periodo = 7 | 15 | 30 | 60 | 90 | "custom";

interface TabelaFilters {
  placaEvento: string;
  fornecedor: string;
  operacao: string;
  subOperacao: string;
  centroCusto: string;
  dataPagamento: DateRange | undefined;
}

const PAGE_SIZE = 50;
const PERIODOS: number[] = [7, 15, 30, 60, 90];

const STATUS_OPTS: { key: StatusKey; label: string; onCls: string }[] = [
  { key: "a_vencer", label: "A Vencer", onCls: "bg-amber-500 hover:bg-amber-500/90 text-white border-amber-500" },
  { key: "vencido", label: "Vencido", onCls: "bg-red-500 hover:bg-red-500/90 text-white border-red-500" },
  { key: "pago", label: "Pago", onCls: "bg-emerald-600 hover:bg-emerald-600/90 text-white border-emerald-600" },
  { key: "inativo", label: "Inativos (cancel./exclu./estorn.)", onCls: "bg-gray-500 hover:bg-gray-500/90 text-white border-gray-500" },
];

// Colunas visíveis conforme solicitado
const VISIBLE_COLUMNS = [
  { key: "operacao", label: "Operação" },
  { key: "sub_operacao", label: "SubOperação" },
  { key: "descricao", label: "Descrição" },
  { key: "fornecedor", label: "Fornecedor" },
  { key: "centro_custo", label: "Centro de Custo" },
  { key: "valor", label: "Valor" },
  { key: "valor_pagamento", label: "Valor Pagamento" },
  { key: "data_vencimento", label: "Data Vencimento" },
  { key: "data_vencimento_original", label: "Data Venc. Original" },
  { key: "situacao_pagamento", label: "Situação" },
  { key: "data_pagamento", label: "Data Pagamento" },
  { key: "controle_interno", label: "Controle Interno" },
  { key: "veiculo_evento", label: "Veículo Evento" },
];

// Todas as colunas para exportação
const ALL_COLUMNS = [
  { key: "operacao", label: "Operação" },
  { key: "sub_operacao", label: "SubOperação" },
  { key: "descricao", label: "Descrição" },
  { key: "nota_fiscal", label: "Nota Fiscal" },
  { key: "valor", label: "Valor" },
  { key: "valor_total_lancamento", label: "Valor Total Lançamento" },
  { key: "valor_pagamento", label: "Valor Pagamento" },
  { key: "data_nota_fiscal", label: "Data Nota Fiscal" },
  { key: "data_vencimento", label: "Data Vencimento" },
  { key: "situacao_pagamento", label: "Situação" },
  { key: "quantidade_parcela", label: "Qtd Parcela" },
  { key: "forma_pagamento", label: "Forma Pagamento" },
  { key: "data_vencimento_original", label: "Data Venc. Original" },
  { key: "data_pagamento", label: "Data Pagamento" },
  { key: "controle_interno", label: "Controle Interno" },
  { key: "veiculo_lancamento", label: "Veículo Lançamento" },
  { key: "tipo_veiculo", label: "Tipo de Veículo" },
  { key: "classificacao_veiculo", label: "Classificação Veículo" },
  { key: "associado", label: "Associado" },
  { key: "cnpj_fornecedor", label: "CNPJ Fornecedor" },
  { key: "cpf_cnpj_cliente", label: "CPF/CNPJ Cliente" },
  { key: "fornecedor", label: "Fornecedor" },
  { key: "nome_fantasia_fornecedor", label: "Nome Fantasia Fornecedor" },
  { key: "voluntario", label: "Voluntário" },
  { key: "cooperativa", label: "Cooperativa" },
  { key: "centro_custo", label: "Centro de Custo" },
  { key: "multa", label: "Multa" },
  { key: "juros", label: "Juros" },
  { key: "mes_referente", label: "Mês Referente" },
  { key: "regional", label: "Regional" },
  { key: "categoria_veiculo", label: "Categoria Veículo" },
  { key: "impostos", label: "Impostos" },
  { key: "protocolo_evento", label: "Protocolo Evento" },
  { key: "veiculo_evento", label: "Veículo Evento" },
  { key: "motivo_evento", label: "Motivo Evento" },
  { key: "terceiro_evento", label: "Terceiro (Evento)" },
  { key: "data_evento", label: "Data Evento" },
  { key: "regional_evento", label: "Regional Evento" },
  { key: "placa_terceiro_evento", label: "Placa Terceiro (Evento)" },
];

// É um lançamento pago?
const isPagoRow = (d: any) => {
  const sit = d.situacao_pagamento?.toLowerCase() || "";
  return sit.includes("pago") || sit.includes("paga") || !!d.data_pagamento;
};

// Lançamentos que NÃO são obrigações reais (cancelados/excluídos/estornados).
// Mesma regra usada no MGFDashboard — não devem contar como pago / a pagar /
// a vencer / vencido, para não distorcer os números.
const isInativoRow = (d: any) => {
  const sit = d.situacao_pagamento?.toLowerCase() || "";
  return sit.includes("cancel") || sit.includes("exclu") || sit.includes("estorn");
};

// Classifica o lançamento em relação a hoje: pago / vencido / a_vencer / inativo.
const rowVencStatus = (d: any, hoje: Date): StatusKey | null => {
  if (isInativoRow(d)) return "inativo";
  if (isPagoRow(d)) return "pago";
  if (!d.data_vencimento) return null;
  const venc = new Date(d.data_vencimento);
  if (isNaN(venc.getTime())) return null;
  return venc < hoje ? "vencido" : "a_vencer";
};

// Função para determinar status de vencimento (usado na cor da célula/linha)
const getVencimentoStatus = (dataVencimento: string | null, situacao: string | null, dataPagamento: string | null) => {
  const sitLower = situacao?.toLowerCase() || "";
  if (sitLower.includes("cancel") || sitLower.includes("exclu") || sitLower.includes("estorn")) return "inativo";
  if (!dataVencimento) return null;
  if (sitLower.includes("pago") || dataPagamento) return "pago";

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dataVencimento);

  if (venc < hoje) return "vencido";

  const diffDias = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias <= 7) return "vence_7";
  if (diffDias <= 30) return "vence_30";
  return "futuro";
};

// Função para cor da situação
const getSituacaoColor = (situacao: string | null) => {
  if (!situacao) return "";
  const s = situacao.toLowerCase();
  if (s.includes("cancel") || s.includes("exclu") || s.includes("estorn")) return "bg-gray-400/20 text-gray-600 border-gray-400/30";
  if (s.includes("pago")) return "bg-green-500/20 text-green-700 border-green-500/30";
  if (s.includes("pendente") || s.includes("aberto")) return "bg-yellow-500/20 text-yellow-700 border-yellow-500/30";
  if (s.includes("vencid")) return "bg-red-500/20 text-red-700 border-red-500/30";
  return "bg-blue-500/20 text-blue-700 border-blue-500/30";
};

export default function MGFTabela({ dados, colunas, loading }: MGFTabelaProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Filtros rápidos: período de vencimento + status (padrão: 7 dias / a vencer + vencido)
  const [periodo, setPeriodo] = useState<Periodo>(7);
  const [customVenc, setCustomVenc] = useState<DateRange | undefined>(undefined);
  const [status, setStatus] = useState<Record<StatusKey, boolean>>({
    a_vencer: true,
    vencido: true,
    pago: false,
    inativo: false,
  });

  // Filtros detalhados
  const [filters, setFilters] = useState<TabelaFilters>({
    placaEvento: "",
    fornecedor: "all",
    operacao: "all",
    subOperacao: "all",
    centroCusto: "all",
    dataPagamento: undefined,
  });

  // Extrair opções únicas para filtros
  const filterOptions = useMemo(() => {
    const fornecedores = new Set<string>();
    const operacoes = new Set<string>();
    const subOperacoes = new Set<string>();
    const centrosCusto = new Set<string>();

    dados.forEach((d) => {
      if (d.fornecedor) fornecedores.add(d.fornecedor);
      if (d.operacao) operacoes.add(d.operacao);
      if (d.sub_operacao) subOperacoes.add(d.sub_operacao);
      if (d.centro_custo) centrosCusto.add(d.centro_custo);
    });

    return {
      fornecedores: Array.from(fornecedores).sort(),
      operacoes: Array.from(operacoes).sort(),
      subOperacoes: Array.from(subOperacoes).sort(),
      centrosCusto: Array.from(centrosCusto).sort(),
    };
  }, [dados]);

  // Filtrar dados
  const filteredDados = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let result = dados;

    // Busca geral
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter((d) => {
        return VISIBLE_COLUMNS.some((col) => {
          const val = d[col.key];
          return val && String(val).toLowerCase().includes(searchLower);
        });
      });
    }

    // Filtro Placa Evento
    if (filters.placaEvento.trim()) {
      const placaLower = filters.placaEvento.toLowerCase();
      result = result.filter((d) => d.veiculo_evento && String(d.veiculo_evento).toLowerCase().includes(placaLower));
    }

    // Filtro Fornecedor
    if (filters.fornecedor !== "all") {
      result = result.filter((d) => d.fornecedor === filters.fornecedor);
    }

    // Filtro Operação
    if (filters.operacao !== "all") {
      result = result.filter((d) => d.operacao === filters.operacao);
    }

    // Filtro SubOperação
    if (filters.subOperacao !== "all") {
      result = result.filter((d) => d.sub_operacao === filters.subOperacao);
    }

    // Filtro Centro de Custo
    if (filters.centroCusto !== "all") {
      result = result.filter((d) => d.centro_custo === filters.centroCusto);
    }

    // Filtro Data Pagamento
    if (filters.dataPagamento?.from) {
      result = result.filter((d) => {
        if (!d.data_pagamento) return false;
        const date = new Date(d.data_pagamento);
        if (filters.dataPagamento?.from && date < filters.dataPagamento.from) return false;
        if (filters.dataPagamento?.to && date > filters.dataPagamento.to) return false;
        return true;
      });
    }

    // Filtro de STATUS (a vencer / vencido / pago / inativo)
    const anyStatus = status.a_vencer || status.vencido || status.pago || status.inativo;
    if (anyStatus) {
      result = result.filter((d) => {
        const st = rowVencStatus(d, hoje);
        if (!st) return false;
        return status[st];
      });
    }

    // Filtro de PERÍODO (janela sobre a data de vencimento) — deixa a tela leve,
    // exibindo só os lançamentos dentro do período selecionado.
    if (periodo === "custom") {
      if (customVenc?.from) {
        result = result.filter((d) => {
          if (!d.data_vencimento) return false;
          const date = new Date(d.data_vencimento);
          if (isNaN(date.getTime())) return false;
          if (customVenc.from && date < customVenc.from) return false;
          if (customVenc.to) {
            const to = new Date(customVenc.to);
            to.setHours(23, 59, 59, 999);
            if (date > to) return false;
          }
          return true;
        });
      }
    } else {
      const n = periodo;
      const start = new Date(hoje);
      start.setDate(start.getDate() - n);
      const end = new Date(hoje);
      end.setDate(end.getDate() + n);
      end.setHours(23, 59, 59, 999);
      result = result.filter((d) => {
        if (!d.data_vencimento) return false;
        const date = new Date(d.data_vencimento);
        if (isNaN(date.getTime())) return false;
        return date >= start && date <= end;
      });
    }

    // Ordenar por data de vencimento (mais próximos primeiro)
    result = [...result].sort((a, b) => {
      const da = a.data_vencimento ? new Date(a.data_vencimento).getTime() : Infinity;
      const db = b.data_vencimento ? new Date(b.data_vencimento).getTime() : Infinity;
      return da - db;
    });

    return result;
  }, [dados, search, filters, periodo, customVenc, status]);

  // Contar filtros detalhados ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.placaEvento.trim()) count++;
    if (filters.fornecedor !== "all") count++;
    if (filters.operacao !== "all") count++;
    if (filters.subOperacao !== "all") count++;
    if (filters.centroCusto !== "all") count++;
    if (filters.dataPagamento?.from) count++;
    return count;
  }, [filters]);

  const clearFilters = () => {
    setFilters({
      placaEvento: "",
      fornecedor: "all",
      operacao: "all",
      subOperacao: "all",
      centroCusto: "all",
      dataPagamento: undefined,
    });
    setPeriodo(7);
    setCustomVenc(undefined);
    setStatus({ a_vencer: true, vencido: true, pago: false, inativo: false });
    setPage(0);
  };

  const toggleStatus = (key: StatusKey) => {
    setStatus((prev) => ({ ...prev, [key]: !prev[key] }));
    setPage(0);
  };

  const selectPeriodo = (n: number) => {
    setPeriodo(n as Periodo);
    setCustomVenc(undefined);
    setPage(0);
  };

  // Paginação
  const totalPages = Math.ceil(filteredDados.length / PAGE_SIZE);
  const paginatedDados = filteredDados.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Exportar para Excel
  const handleExport = () => {
    const exportData = filteredDados.map((d) => {
      const row: any = {};
      ALL_COLUMNS.forEach((col) => {
        row[col.label] = d[col.key] ?? "";
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados MGF");
    XLSX.writeFile(wb, "mgf_dados_exportados.xlsx");
  };

  const formatCellValue = (value: any, key: string, row: any) => {
    if (value === null || value === undefined) return "-";

    // Situação com badge colorido
    if (key === "situacao_pagamento" && value) {
      return (
        <Badge variant="outline" className={cn("text-[10px] font-medium", getSituacaoColor(value))}>
          {value}
        </Badge>
      );
    }

    // Data de vencimento com destaque de cor
    if (key === "data_vencimento" && value) {
      const st = getVencimentoStatus(value, row.situacao_pagamento, row.data_pagamento);
      const formattedDate = new Date(value).toLocaleDateString("pt-BR");

      if (st === "inativo") {
        return <span className="text-muted-foreground line-through">{formattedDate}</span>;
      }
      if (st === "vencido") {
        return <span className="text-red-600 font-semibold">{formattedDate}</span>;
      }
      if (st === "vence_7") {
        return <span className="text-orange-600 font-semibold">{formattedDate}</span>;
      }
      if (st === "vence_30") {
        return <span className="text-yellow-600 font-medium">{formattedDate}</span>;
      }
      if (st === "pago") {
        return <span className="text-green-600">{formattedDate}</span>;
      }
      return formattedDate;
    }

    // Outras datas
    if (key.includes("data_") && value) {
      try {
        return new Date(value).toLocaleDateString("pt-BR");
      } catch {
        return String(value);
      }
    }

    // Valores monetários com destaque
    if (["valor", "valor_pagamento"].includes(key)) {
      const formatted = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(value || 0);
      return <span className="font-medium text-blue-600">{formatted}</span>;
    }

    return String(value);
  };

  // Row background based on status
  const getRowClassName = (row: any) => {
    const st = getVencimentoStatus(row.data_vencimento, row.situacao_pagamento, row.data_pagamento);
    if (st === "inativo") return "bg-gray-50 dark:bg-gray-900/20 opacity-60 hover:opacity-100";
    if (st === "vencido") return "bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30";
    if (st === "vence_7") return "bg-orange-50 dark:bg-orange-950/20 hover:bg-orange-100 dark:hover:bg-orange-950/30";
    if (st === "pago") return "bg-green-50 dark:bg-green-950/10 hover:bg-green-100 dark:hover:bg-green-950/20";
    return "hover:bg-muted/50";
  };

  // Rótulo do período ativo (pra descrição)
  const periodoLabel = periodo === "custom" ? "período personalizado" : `±${periodo} dias`;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!dados.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Database className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Nenhum dado disponível</h3>
          <p className="text-muted-foreground text-center mt-1">Importe uma planilha MGF para visualizar os dados</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-orange-500" />
              Dados Completos ({filteredDados.length.toLocaleString()} registros)
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="pl-9 w-48"
                />
              </div>
              <Button variant="outline" size="icon" onClick={handleExport} title="Exportar Excel">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filtros rápidos: período + status */}
          <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
            {/* Período de vencimento */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-orange-500" />
                Vencimento:
              </span>
              {PERIODOS.map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={periodo === n ? "default" : "outline"}
                  className="h-8 px-3 text-xs"
                  onClick={() => selectPeriodo(n)}
                >
                  {n} dias
                </Button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant={periodo === "custom" ? "default" : "outline"}
                    className="h-8 px-3 text-xs"
                  >
                    <Calendar className="h-3 w-3 mr-1" />
                    {periodo === "custom" && customVenc?.from
                      ? customVenc.to
                        ? `${format(customVenc.from, "dd/MM", { locale: ptBR })} - ${format(customVenc.to, "dd/MM", { locale: ptBR })}`
                        : format(customVenc.from, "dd/MM/yy", { locale: ptBR })
                      : "Outro período"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    initialFocus
                    mode="range"
                    defaultMonth={customVenc?.from}
                    selected={customVenc}
                    onSelect={(range) => {
                      setCustomVenc(range);
                      setPeriodo("custom");
                      setPage(0);
                    }}
                    numberOfMonths={2}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Status */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                <Filter className="h-3.5 w-3.5 text-orange-500" />
                Status:
              </span>
              {STATUS_OPTS.map((s) => {
                const on = status[s.key];
                return (
                  <Button
                    key={s.key}
                    size="sm"
                    variant="outline"
                    className={cn("h-8 px-3 text-xs", on && s.onCls)}
                    onClick={() => toggleStatus(s.key)}
                  >
                    {on && <Check className="h-3 w-3 mr-1" />}
                    {s.label}
                  </Button>
                );
              })}
              <span className="text-[11px] text-muted-foreground ml-1">
                (exibindo {periodoLabel} da data de vencimento)
              </span>
            </div>

            {/* Filtros detalhados */}
            <div className="pt-1 border-t border-border/60">
              <div className="flex items-center gap-2 mb-2 mt-2">
                <Filter className="h-4 w-4 text-orange-500" />
                <span className="font-semibold text-xs">Filtros detalhados</span>
                {activeFiltersCount > 0 && (
                  <>
                    <Badge variant="secondary" className="ml-1">
                      {activeFiltersCount} ativo{activeFiltersCount > 1 ? "s" : ""}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs">
                      <X className="h-3 w-3 mr-1" />
                      Limpar tudo
                    </Button>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {/* Placa Evento */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Placa Evento"
                    value={filters.placaEvento}
                    onChange={(e) => {
                      setFilters((f) => ({ ...f, placaEvento: e.target.value }));
                      setPage(0);
                    }}
                    className="h-9 text-xs pl-7"
                  />
                </div>

                {/* Fornecedor */}
                <Select
                  value={filters.fornecedor}
                  onValueChange={(v) => {
                    setFilters((f) => ({ ...f, fornecedor: v }));
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Fornecedores</SelectItem>
                    {filterOptions.fornecedores.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Operação */}
                <Select
                  value={filters.operacao}
                  onValueChange={(v) => {
                    setFilters((f) => ({ ...f, operacao: v }));
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Operação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas Operações</SelectItem>
                    {filterOptions.operacoes.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* SubOperação */}
                <Select
                  value={filters.subOperacao}
                  onValueChange={(v) => {
                    setFilters((f) => ({ ...f, subOperacao: v }));
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="SubOperação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas SubOperações</SelectItem>
                    {filterOptions.subOperacoes.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Centro de Custo */}
                <Select
                  value={filters.centroCusto}
                  onValueChange={(v) => {
                    setFilters((f) => ({ ...f, centroCusto: v }));
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Centro de Custo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Centros de Custo</SelectItem>
                    {filterOptions.centrosCusto.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Data Pagamento */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("h-9 text-xs justify-start", filters.dataPagamento?.from && "text-foreground")}
                    >
                      <Calendar className="h-3 w-3 mr-1" />
                      {filters.dataPagamento?.from
                        ? filters.dataPagamento.to
                          ? `${format(filters.dataPagamento.from, "dd/MM", { locale: ptBR })} - ${format(filters.dataPagamento.to, "dd/MM", { locale: ptBR })}`
                          : format(filters.dataPagamento.from, "dd/MM/yy", { locale: ptBR })
                        : "Dt. Pgto."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      initialFocus
                      mode="range"
                      defaultMonth={filters.dataPagamento?.from}
                      selected={filters.dataPagamento}
                      onSelect={(range) => {
                        setFilters((f) => ({ ...f, dataPagamento: range }));
                        setPage(0);
                      }}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[600px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  {VISIBLE_COLUMNS.map((col) => (
                    <TableHead key={col.key} className="whitespace-nowrap text-xs font-semibold">
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={VISIBLE_COLUMNS.length} className="text-center text-sm text-muted-foreground py-8">
                      Nenhum lançamento no período/status selecionado. Ajuste os filtros acima.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedDados.map((d, i) => (
                    <TableRow key={d.id || i} className={getRowClassName(d)}>
                      {VISIBLE_COLUMNS.map((col) => (
                        <TableCell key={col.key} className="whitespace-nowrap text-xs">
                          {formatCellValue(d[col.key], col.key, d)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Mostrando {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, filteredDados.length)} de{" "}
              {filteredDados.length.toLocaleString()} registros
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(0)} disabled={page === 0}>
                Primeira
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2">
                Página {page + 1} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1}
              >
                Última
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
