import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Search, Download, ChevronLeft, ChevronRight, Filter, X, Calendar } from "lucide-react";
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

interface TabelaFilters {
  placaEvento: string;
  fornecedor: string;
  operacao: string;
  subOperacao: string;
  centroCusto: string;
  dataVencimento: DateRange | undefined;
  dataPagamento: DateRange | undefined;
}

const PAGE_SIZE = 50;

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

// Função para determinar status de vencimento
const getVencimentoStatus = (dataVencimento: string | null, situacao: string | null, dataPagamento: string | null) => {
  if (!dataVencimento) return null;
  if (situacao?.toLowerCase().includes('pago') || dataPagamento) return 'pago';
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dataVencimento);
  
  if (venc < hoje) return 'vencido';
  
  const diffDias = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias <= 7) return 'vence_7';
  if (diffDias <= 30) return 'vence_30';
  return 'futuro';
};

// Função para cor da situação
const getSituacaoColor = (situacao: string | null) => {
  if (!situacao) return "";
  const s = situacao.toLowerCase();
  if (s.includes('pago')) return "bg-green-500/20 text-green-700 border-green-500/30";
  if (s.includes('pendente') || s.includes('aberto')) return "bg-yellow-500/20 text-yellow-700 border-yellow-500/30";
  if (s.includes('cancel') || s.includes('vencid')) return "bg-red-500/20 text-red-700 border-red-500/30";
  return "bg-blue-500/20 text-blue-700 border-blue-500/30";
};

export default function MGFTabela({ dados, colunas, loading }: MGFTabelaProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  
  // Filtros da tabela
  const [filters, setFilters] = useState<TabelaFilters>({
    placaEvento: "",
    fornecedor: "all",
    operacao: "all",
    subOperacao: "all",
    centroCusto: "all",
    dataVencimento: undefined,
    dataPagamento: undefined,
  });

  // Extrair opções únicas para filtros
  const filterOptions = useMemo(() => {
    const fornecedores = new Set<string>();
    const operacoes = new Set<string>();
    const subOperacoes = new Set<string>();
    const centrosCusto = new Set<string>();

    dados.forEach(d => {
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
    let result = dados;

    // Busca geral
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter((d) => {
        return VISIBLE_COLUMNS.some(col => {
          const val = d[col.key];
          return val && String(val).toLowerCase().includes(searchLower);
        });
      });
    }

    // Filtro Placa Evento
    if (filters.placaEvento.trim()) {
      const placaLower = filters.placaEvento.toLowerCase();
      result = result.filter(d => 
        d.veiculo_evento && String(d.veiculo_evento).toLowerCase().includes(placaLower)
      );
    }

    // Filtro Fornecedor
    if (filters.fornecedor !== "all") {
      result = result.filter(d => d.fornecedor === filters.fornecedor);
    }

    // Filtro Operação
    if (filters.operacao !== "all") {
      result = result.filter(d => d.operacao === filters.operacao);
    }

    // Filtro SubOperação
    if (filters.subOperacao !== "all") {
      result = result.filter(d => d.sub_operacao === filters.subOperacao);
    }

    // Filtro Centro de Custo
    if (filters.centroCusto !== "all") {
      result = result.filter(d => d.centro_custo === filters.centroCusto);
    }

    // Filtro Data Vencimento
    if (filters.dataVencimento?.from) {
      result = result.filter(d => {
        if (!d.data_vencimento) return false;
        const date = new Date(d.data_vencimento);
        if (filters.dataVencimento?.from && date < filters.dataVencimento.from) return false;
        if (filters.dataVencimento?.to && date > filters.dataVencimento.to) return false;
        return true;
      });
    }

    // Filtro Data Pagamento
    if (filters.dataPagamento?.from) {
      result = result.filter(d => {
        if (!d.data_pagamento) return false;
        const date = new Date(d.data_pagamento);
        if (filters.dataPagamento?.from && date < filters.dataPagamento.from) return false;
        if (filters.dataPagamento?.to && date > filters.dataPagamento.to) return false;
        return true;
      });
    }

    return result;
  }, [dados, search, filters]);

  // Contar filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.placaEvento.trim()) count++;
    if (filters.fornecedor !== "all") count++;
    if (filters.operacao !== "all") count++;
    if (filters.subOperacao !== "all") count++;
    if (filters.centroCusto !== "all") count++;
    if (filters.dataVencimento?.from) count++;
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
      dataVencimento: undefined,
      dataPagamento: undefined,
    });
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
      const status = getVencimentoStatus(value, row.situacao_pagamento, row.data_pagamento);
      const formattedDate = new Date(value).toLocaleDateString("pt-BR");
      
      if (status === 'vencido') {
        return <span className="text-red-600 font-semibold">{formattedDate}</span>;
      }
      if (status === 'vence_7') {
        return <span className="text-orange-600 font-semibold">{formattedDate}</span>;
      }
      if (status === 'vence_30') {
        return <span className="text-yellow-600 font-medium">{formattedDate}</span>;
      }
      if (status === 'pago') {
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
    const status = getVencimentoStatus(row.data_vencimento, row.situacao_pagamento, row.data_pagamento);
    if (status === 'vencido') return "bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30";
    if (status === 'vence_7') return "bg-orange-50 dark:bg-orange-950/20 hover:bg-orange-100 dark:hover:bg-orange-950/30";
    if (status === 'pago') return "bg-green-50 dark:bg-green-950/10 hover:bg-green-100 dark:hover:bg-green-950/20";
    return "hover:bg-muted/50";
  };

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
          <p className="text-muted-foreground text-center mt-1">
            Importe uma planilha MGF para visualizar os dados
          </p>
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

          {/* Filtros */}
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-orange-500" />
              <span className="font-semibold text-sm">Filtros</span>
              {activeFiltersCount > 0 && (
                <>
                  <Badge variant="secondary" className="ml-2">
                    {activeFiltersCount} ativo{activeFiltersCount > 1 ? "s" : ""}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs">
                    <X className="h-3 w-3 mr-1" />
                    Limpar
                  </Button>
                </>
              )}
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {/* Placa Evento */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Placa Evento"
                  value={filters.placaEvento}
                  onChange={(e) => {
                    setFilters(f => ({ ...f, placaEvento: e.target.value }));
                    setPage(0);
                  }}
                  className="h-9 text-xs pl-7"
                />
              </div>

              {/* Fornecedor */}
              <Select value={filters.fornecedor} onValueChange={(v) => { setFilters(f => ({ ...f, fornecedor: v })); setPage(0); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Fornecedores</SelectItem>
                  {filterOptions.fornecedores.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Operação */}
              <Select value={filters.operacao} onValueChange={(v) => { setFilters(f => ({ ...f, operacao: v })); setPage(0); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Operação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Operações</SelectItem>
                  {filterOptions.operacoes.map(o => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* SubOperação */}
              <Select value={filters.subOperacao} onValueChange={(v) => { setFilters(f => ({ ...f, subOperacao: v })); setPage(0); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="SubOperação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas SubOperações</SelectItem>
                  {filterOptions.subOperacoes.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Centro de Custo */}
              <Select value={filters.centroCusto} onValueChange={(v) => { setFilters(f => ({ ...f, centroCusto: v })); setPage(0); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Centro de Custo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Centros de Custo</SelectItem>
                  {filterOptions.centrosCusto.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Data Vencimento */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-9 text-xs justify-start", filters.dataVencimento?.from && "text-foreground")}>
                    <Calendar className="h-3 w-3 mr-1" />
                    {filters.dataVencimento?.from ? (
                      filters.dataVencimento.to ? (
                        `${format(filters.dataVencimento.from, "dd/MM", { locale: ptBR })} - ${format(filters.dataVencimento.to, "dd/MM", { locale: ptBR })}`
                      ) : (
                        format(filters.dataVencimento.from, "dd/MM/yy", { locale: ptBR })
                      )
                    ) : (
                      "Dt. Venc."
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    initialFocus
                    mode="range"
                    defaultMonth={filters.dataVencimento?.from}
                    selected={filters.dataVencimento}
                    onSelect={(range) => { setFilters(f => ({ ...f, dataVencimento: range })); setPage(0); }}
                    numberOfMonths={2}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>

              {/* Data Pagamento */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-9 text-xs justify-start", filters.dataPagamento?.from && "text-foreground")}>
                    <Calendar className="h-3 w-3 mr-1" />
                    {filters.dataPagamento?.from ? (
                      filters.dataPagamento.to ? (
                        `${format(filters.dataPagamento.from, "dd/MM", { locale: ptBR })} - ${format(filters.dataPagamento.to, "dd/MM", { locale: ptBR })}`
                      ) : (
                        format(filters.dataPagamento.from, "dd/MM/yy", { locale: ptBR })
                      )
                    ) : (
                      "Dt. Pgto."
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    initialFocus
                    mode="range"
                    defaultMonth={filters.dataPagamento?.from}
                    selected={filters.dataPagamento}
                    onSelect={(range) => { setFilters(f => ({ ...f, dataPagamento: range })); setPage(0); }}
                    numberOfMonths={2}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
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
                {paginatedDados.map((d, i) => (
                  <TableRow key={d.id || i} className={getRowClassName(d)}>
                    {VISIBLE_COLUMNS.map((col) => (
                      <TableCell key={col.key} className="whitespace-nowrap text-xs">
                        {formatCellValue(d[col.key], col.key, d)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Mostrando {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, filteredDados.length)} de {filteredDados.length.toLocaleString()} registros
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(0)}
                disabled={page === 0}
              >
                Primeira
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
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
