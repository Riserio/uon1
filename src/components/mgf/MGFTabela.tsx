import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Search, Download, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import * as XLSX from "xlsx";

interface MGFTabelaProps {
  dados: any[];
  colunas: string[];
  loading: boolean;
}

const PAGE_SIZE = 50;

// Todas as 38 colunas
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

export default function MGFTabela({ dados, colunas, loading }: MGFTabelaProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [situacaoFilter, setSituacaoFilter] = useState<string>("all");
  const [operacaoFilter, setOperacaoFilter] = useState<string>("all");

  // Extrair opções únicas para filtros
  const filterOptions = useMemo(() => {
    const situacoes = new Set<string>();
    const operacoes = new Set<string>();
    
    dados.forEach(d => {
      if (d.situacao_pagamento) situacoes.add(d.situacao_pagamento);
      if (d.operacao) operacoes.add(d.operacao);
    });
    
    return {
      situacoes: Array.from(situacoes).sort(),
      operacoes: Array.from(operacoes).sort()
    };
  }, [dados]);

  // Filtrar dados
  const filteredDados = useMemo(() => {
    let result = dados;
    
    // Filtro por situação
    if (situacaoFilter !== "all") {
      result = result.filter(d => d.situacao_pagamento === situacaoFilter);
    }
    
    // Filtro por operação
    if (operacaoFilter !== "all") {
      result = result.filter(d => d.operacao === operacaoFilter);
    }
    
    // Filtro por busca
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter((d) => {
        return ALL_COLUMNS.some(col => {
          const val = d[col.key];
          return val && String(val).toLowerCase().includes(searchLower);
        });
      });
    }
    
    return result;
  }, [dados, search, situacaoFilter, operacaoFilter]);

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

  const formatCellValue = (value: any, key: string) => {
    if (value === null || value === undefined) return "-";
    
    // Datas
    if (key.includes("data_") && value) {
      try {
        return new Date(value).toLocaleDateString("pt-BR");
      } catch {
        return String(value);
      }
    }
    
    // Valores monetários
    if (["valor", "valor_total_lancamento", "valor_pagamento", "multa", "juros", "impostos"].includes(key)) {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(value || 0);
    }
    
    return String(value);
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
                  className="pl-9 w-64"
                />
              </div>
              <Button variant="outline" size="icon" onClick={handleExport} title="Exportar Excel">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filtros:</span>
            </div>
            
            <Select value={situacaoFilter} onValueChange={(v) => { setSituacaoFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Situações</SelectItem>
                {filterOptions.situacoes.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={operacaoFilter} onValueChange={(v) => { setOperacaoFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Operação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Operações</SelectItem>
                {filterOptions.operacoes.map(o => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[600px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  {ALL_COLUMNS.map((col) => (
                    <TableHead key={col.key} className="whitespace-nowrap text-xs">
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDados.map((d, i) => (
                  <TableRow key={d.id || i}>
                    {ALL_COLUMNS.map((col) => (
                      <TableCell key={col.key} className="whitespace-nowrap text-xs">
                        {formatCellValue(d[col.key], col.key)}
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
              Página {page + 1} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
