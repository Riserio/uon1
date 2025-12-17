import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";

interface MGFTabelaProps {
  dados: any[];
  colunas: string[];
  loading: boolean;
}

const PAGE_SIZE = 50;

export default function MGFTabela({ dados, colunas, loading }: MGFTabelaProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Filtrar dados
  const filteredDados = useMemo(() => {
    if (!search.trim()) return dados;
    const searchLower = search.toLowerCase();
    return dados.filter((d) => {
      // Buscar em todos os campos principais
      const mainFields = [
        d.tipo_evento,
        d.situacao,
        d.placa,
        d.modelo_veiculo,
        d.cooperativa,
        d.regional,
        d.classificacao,
        d.status,
      ];
      
      // Buscar também em dados_extras
      const extrasValues = d.dados_extras ? Object.values(d.dados_extras) : [];
      
      return [...mainFields, ...extrasValues].some(
        (val) => val && String(val).toLowerCase().includes(searchLower)
      );
    });
  }, [dados, search]);

  // Paginação
  const totalPages = Math.ceil(filteredDados.length / PAGE_SIZE);
  const paginatedDados = filteredDados.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Colunas a exibir
  const displayColumns = useMemo(() => {
    const mainCols = [
      { key: "data_evento", label: "Data Evento" },
      { key: "tipo_evento", label: "Tipo" },
      { key: "situacao", label: "Situação" },
      { key: "placa", label: "Placa" },
      { key: "modelo_veiculo", label: "Modelo" },
      { key: "cooperativa", label: "Cooperativa" },
      { key: "regional", label: "Regional" },
      { key: "valor", label: "Valor" },
      { key: "custo", label: "Custo" },
    ];
    return mainCols;
  }, []);

  // Exportar para Excel
  const handleExport = () => {
    const exportData = filteredDados.map((d) => {
      const row: any = {};
      displayColumns.forEach((col) => {
        row[col.label] = d[col.key] || "";
      });
      // Adicionar dados extras
      if (d.dados_extras) {
        Object.entries(d.dados_extras).forEach(([key, value]) => {
          row[key] = value;
        });
      }
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados MGF");
    XLSX.writeFile(wb, "mgf_dados_exportados.xlsx");
  };

  const formatCellValue = (value: any, key: string) => {
    if (value === null || value === undefined) return "-";
    
    if (key === "data_evento" || key === "data_cadastro") {
      if (value) {
        return new Date(value).toLocaleDateString("pt-BR");
      }
      return "-";
    }
    
    if (key === "valor" || key === "custo") {
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-orange-500" />
            Dados Completos ({filteredDados.length.toLocaleString()} registros)
          </CardTitle>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-9 w-full sm:w-64"
              />
            </div>
            <Button variant="outline" size="icon" onClick={handleExport} title="Exportar Excel">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {displayColumns.map((col) => (
                    <TableHead key={col.key} className="whitespace-nowrap">
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDados.map((d, i) => (
                  <TableRow key={d.id || i}>
                    {displayColumns.map((col) => (
                      <TableCell key={col.key} className="whitespace-nowrap">
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
