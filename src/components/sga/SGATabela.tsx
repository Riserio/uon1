import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Database, Search, Filter, Download, ChevronLeft, ChevronRight, 
  AlertCircle, X, SortAsc, SortDesc 
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SGATabelaProps {
  eventos: any[];
  loading: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

const formatDate = (date: string | null) => {
  if (!date) return "-";
  try {
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return date;
  }
};

const SITUACAO_COLORS: { [key: string]: string } = {
  "FINALIZADO": "bg-green-500/20 text-green-600 border-green-500/30",
  "EM ANALISE": "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
  "ABERTO": "bg-blue-500/20 text-blue-600 border-blue-500/30",
  "NEGADO": "bg-red-500/20 text-red-600 border-red-500/30",
  "ARQUIVADO": "bg-gray-500/20 text-gray-600 border-gray-500/30",
  "CANCELADO ACIONAMENTO": "bg-orange-500/20 text-orange-600 border-orange-500/30"
};

export default function SGATabela({ eventos, loading }: SGATabelaProps) {
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [filterMotivo, setFilterMotivo] = useState<string>("todos");
  const [filterSituacao, setFilterSituacao] = useState<string>("todos");
  const [sortField, setSortField] = useState<string>("data_evento");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Extrair opções únicas para filtros
  const filterOptions = useMemo(() => {
    const estados = [...new Set(eventos.map(e => e.evento_estado).filter(Boolean))].sort();
    const motivos = [...new Set(eventos.map(e => e.motivo_evento).filter(Boolean))].sort();
    const situacoes = [...new Set(eventos.map(e => e.situacao_evento).filter(Boolean))].sort();
    return { estados, motivos, situacoes };
  }, [eventos]);

  // Filtrar e ordenar
  const filteredEventos = useMemo(() => {
    let result = [...eventos];

    // Busca global
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(e =>
        (e.placa || "").toLowerCase().includes(searchLower) ||
        (e.modelo_veiculo || "").toLowerCase().includes(searchLower) ||
        (e.regional || "").toLowerCase().includes(searchLower) ||
        (e.cooperativa || "").toLowerCase().includes(searchLower) ||
        (e.voluntario || "").toLowerCase().includes(searchLower)
      );
    }

    // Filtros
    if (filterEstado !== "todos") {
      result = result.filter(e => e.evento_estado === filterEstado);
    }
    if (filterMotivo !== "todos") {
      result = result.filter(e => e.motivo_evento === filterMotivo);
    }
    if (filterSituacao !== "todos") {
      result = result.filter(e => e.situacao_evento === filterSituacao);
    }

    // Ordenação
    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Tratar datas
      if (sortField.startsWith("data_")) {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }
      // Tratar valores numéricos
      else if (["valor_reparo", "custo_evento", "participacao", "valor_protegido_veiculo"].includes(sortField)) {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }

      if (sortDir === "asc") {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

    return result;
  }, [eventos, search, filterEstado, filterMotivo, filterSituacao, sortField, sortDir]);

  // Paginação
  const totalPages = Math.ceil(filteredEventos.length / pageSize);
  const paginatedEventos = filteredEventos.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setFilterEstado("todos");
    setFilterMotivo("todos");
    setFilterSituacao("todos");
    setPage(1);
  };

  const exportCSV = () => {
    const headers = [
      "Estado", "Data Evento", "Motivo", "Tipo", "Situação", "Placa", 
      "Modelo", "Regional", "Custo Evento", "Valor Reparo", "Participação"
    ];
    
    const rows = filteredEventos.map(e => [
      e.evento_estado,
      formatDate(e.data_evento),
      e.motivo_evento,
      e.tipo_evento,
      e.situacao_evento,
      e.placa,
      e.modelo_veiculo,
      e.regional,
      e.custo_evento,
      e.valor_reparo,
      e.participacao
    ]);

    const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sga_eventos_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-12 w-full mb-4" />
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!eventos.length) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum Dado Disponível</h3>
          <p className="text-muted-foreground">
            Importe uma planilha do SGA para visualizar os dados.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasActiveFilters = search || filterEstado !== "todos" || filterMotivo !== "todos" || filterSituacao !== "todos";

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar placa, modelo, regional..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={filterEstado} onValueChange={(v) => { setFilterEstado(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Estados</SelectItem>
                {filterOptions.estados.map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterMotivo} onValueChange={(v) => { setFilterMotivo(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Motivos</SelectItem>
                {filterOptions.motivos.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterSituacao} onValueChange={(v) => { setFilterSituacao(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas Situações</SelectItem>
                {filterOptions.situacoes.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="icon" onClick={clearFilters}>
                <X className="h-4 w-4" />
              </Button>
            )}

            <Button variant="outline" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>

          {hasActiveFilters && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>{filteredEventos.length} de {eventos.length} registros</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("evento_estado")}
                  >
                    <div className="flex items-center gap-1">
                      UF
                      {sortField === "evento_estado" && (sortDir === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("data_evento")}
                  >
                    <div className="flex items-center gap-1">
                      Data Evento
                      {sortField === "data_evento" && (sortDir === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                    </div>
                  </TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead className="max-w-[200px]">Modelo</TableHead>
                  <TableHead className="max-w-[150px]">Regional</TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("custo_evento")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Custo
                      {sortField === "custo_evento" && (sortDir === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("valor_reparo")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Reparo
                      {sortField === "valor_reparo" && (sortDir === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEventos.map((evento) => (
                  <TableRow key={evento.id}>
                    <TableCell className="font-medium">{evento.evento_estado || "-"}</TableCell>
                    <TableCell>{formatDate(evento.data_evento)}</TableCell>
                    <TableCell>{evento.motivo_evento || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {evento.tipo_evento || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={SITUACAO_COLORS[evento.situacao_evento] || "bg-muted"}>
                        {evento.situacao_evento || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{evento.placa || "-"}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={evento.modelo_veiculo}>
                      {evento.modelo_veiculo || "-"}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate" title={evento.regional}>
                      {evento.regional || "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(evento.custo_evento)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(evento.valor_reparo)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Mostrando {((page - 1) * pageSize) + 1} a {Math.min(page * pageSize, filteredEventos.length)} de {filteredEventos.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
