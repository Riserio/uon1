import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database, Search, Filter, Download, ChevronLeft, ChevronRight,
  AlertCircle, X, SortAsc, SortDesc, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// NOTE (escalabilidade): esta tabela não recebe mais o array cru de
// eventos (a VALECAR sozinha já tem 131k+ eventos na importação ativa,
// muito acima do teto de 100k linhas que a busca antiga usava — os dados
// já estavam sendo truncados silenciosamente). Ela busca sua própria
// página via `listar_eventos_paginado` (filtros + ordenação + paginação
// no servidor), refazendo a busca a cada mudança de filtro/busca/página/
// ordenação. A busca por texto é debounced em 300ms.
interface SGATabelaProps {
  corretoraId: string;
  status: string;
  dataInicio: string;
  dataFim: string;
  regional: string;
  cooperativa: string;
  tipoVeiculo: string;
  loading: boolean;
}

const PAGE_SIZE = 20;
// Cap de exportação: nunca exporta o dataset filtrado inteiro de uma vez
// (poderia passar de 100 mil linhas em associações grandes como a
// VALECAR). Reaproveita a mesma RPC paginada com um limite alto.
const EXPORT_CAP = 50000;

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

const toRpcFilterValue = (value: string) => (!value || value === "todos" ? null : value);

const SITUACAO_COLORS: { [key: string]: string } = {
  "FINALIZADO": "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
  "EM ANALISE": "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  "ABERTO": "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
  "NEGADO": "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
  "ARQUIVADO": "bg-slate-500/20 text-slate-700 dark:text-slate-400 border-slate-500/30",
  "CANCELADO ACIONAMENTO": "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30",
  "CANCELADO": "bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-500/30",
  "EM ABERTO": "bg-sky-500/20 text-sky-700 dark:text-sky-400 border-sky-500/30",
  "PENDENTE": "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30",
  "APROVADO": "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  "RECUSADO": "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
  "AGUARDANDO": "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30",
  "EM ANDAMENTO": "bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
};

// Função para obter cor do status dinamicamente
const getStatusColor = (status: string | null) => {
  if (!status) return "bg-muted text-muted-foreground";
  const upperStatus = status.toUpperCase();
  if (SITUACAO_COLORS[upperStatus]) return SITUACAO_COLORS[upperStatus];
  // Cores genéricas baseadas em palavras-chave
  if (upperStatus.includes("FINAL") || upperStatus.includes("CONCLU")) return SITUACAO_COLORS["FINALIZADO"];
  if (upperStatus.includes("NEGAD") || upperStatus.includes("RECUS")) return SITUACAO_COLORS["NEGADO"];
  if (upperStatus.includes("CANCEL") || upperStatus.includes("ARQUIV")) return SITUACAO_COLORS["ARQUIVADO"];
  if (upperStatus.includes("PENDEN") || upperStatus.includes("AGUARD")) return SITUACAO_COLORS["PENDENTE"];
  if (upperStatus.includes("ANALIS") || upperStatus.includes("ANDAMENTO")) return SITUACAO_COLORS["EM ANALISE"];
  if (upperStatus.includes("ABERT")) return SITUACAO_COLORS["ABERTO"];
  if (upperStatus.includes("APROV")) return SITUACAO_COLORS["APROVADO"];
  return "bg-violet-500/20 text-violet-700 dark:text-violet-400 border-violet-500/30";
};

export default function SGATabela({
  corretoraId,
  status,
  dataInicio,
  dataFim,
  regional,
  cooperativa,
  tipoVeiculo,
  loading,
}: SGATabelaProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [filterMotivo, setFilterMotivo] = useState<string>("todos");
  const [filterSituacao, setFilterSituacao] = useState<string>("todos");
  const [sortField, setSortField] = useState<string>("data_evento");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [filterOptions, setFilterOptions] = useState<{ estados: string[]; motivos: string[]; situacoes: string[] }>({
    estados: [],
    motivos: [],
    situacoes: [],
  });

  const [rows, setRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [tableLoading, setTableLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchIdRef = useRef(0);

  // Debounce da busca (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Opções dos dropdowns locais (Estado / Motivo / Situação): RPC leve,
  // escopo = importação ativa + status, não depende dos demais filtros.
  useEffect(() => {
    if (!corretoraId) {
      setFilterOptions({ estados: [], motivos: [], situacoes: [] });
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_eventos_filter_options", {
          p_corretora_id: corretoraId,
          p_status: status,
        } as any);
        if (error) throw error;
        const opts = (data as any) || {};
        setFilterOptions({
          estados: [...(opts.estados || [])].sort(),
          motivos: [...(opts.motivos || [])].sort(),
          situacoes: [...(opts.situacoes || [])].sort(),
        });
      } catch (error) {
        console.error("Erro ao carregar opções de filtro da tabela:", error);
      }
    })();
  }, [corretoraId, status]);

  const buildRpcParams = (pageNum: number, pageSize: number) => ({
    p_corretora_id: corretoraId,
    p_status: status,
    p_data_inicio: dataInicio || null,
    p_data_fim: dataFim || null,
    p_regional: toRpcFilterValue(regional),
    p_cooperativa: toRpcFilterValue(cooperativa),
    p_tipo_veiculo: toRpcFilterValue(tipoVeiculo),
    p_search: debouncedSearch || null,
    p_filter_estado: toRpcFilterValue(filterEstado),
    p_filter_motivo: toRpcFilterValue(filterMotivo),
    p_filter_situacao: toRpcFilterValue(filterSituacao),
    p_sort_field: sortField,
    p_sort_dir: sortDir,
    p_page: pageNum,
    p_page_size: pageSize,
  });

  // Busca a página atual sempre que qualquer filtro/busca/ordenação/página muda
  useEffect(() => {
    if (!corretoraId) {
      setRows([]);
      setTotalCount(0);
      setTableLoading(false);
      return;
    }

    const myFetchId = ++fetchIdRef.current;
    setTableLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase.rpc("listar_eventos_paginado", buildRpcParams(page, PAGE_SIZE) as any);
        if (myFetchId !== fetchIdRef.current) return;
        if (error) throw error;
        const result = (data as any) || {};
        setRows(result.rows || []);
        setTotalCount(result.totalCount || 0);
      } catch (error) {
        console.error("Erro ao carregar tabela de eventos:", error);
        if (myFetchId === fetchIdRef.current) {
          toast.error("Erro ao carregar os dados da tabela. Tente novamente.");
        }
      } finally {
        if (myFetchId === fetchIdRef.current) setTableLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    corretoraId, status, dataInicio, dataFim, regional, cooperativa, tipoVeiculo,
    debouncedSearch, filterEstado, filterMotivo, filterSituacao, sortField, sortDir, page,
  ]);

  // Reset de página quando qualquer filtro/busca/ordenação muda
  useEffect(() => {
    setPage(1);
  }, [
    corretoraId, status, dataInicio, dataFim, regional, cooperativa, tipoVeiculo,
    debouncedSearch, filterEstado, filterMotivo, filterSituacao, sortField, sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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

  const exportCSV = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("listar_eventos_paginado", buildRpcParams(1, EXPORT_CAP) as any);
      if (error) throw error;
      const result = (data as any) || {};
      const exportRows = result.rows || [];
      const exportTotal = result.totalCount || 0;

      if (exportTotal > EXPORT_CAP) {
        toast.warning(
          `Exportação limitada aos primeiros ${EXPORT_CAP.toLocaleString('pt-BR')} de ${exportTotal.toLocaleString('pt-BR')} registros filtrados. Refine os filtros para exportar um subconjunto menor.`
        );
      }

      const headers = [
        "Estado", "Data Evento", "Motivo", "Tipo", "Situação", "Placa",
        "Modelo", "Regional", "Custo Evento", "Valor Reparo", "Participação"
      ];

      const csvRows = exportRows.map((e: any) => [
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

      const csv = [headers.join(";"), ...csvRows.map((r: any[]) => r.join(";"))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sga_eventos_${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao exportar dados.");
    } finally {
      setExporting(false);
    }
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

  if (!corretoraId) {
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
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v)}>
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

            <Select value={filterMotivo} onValueChange={(v) => setFilterMotivo(v)}>
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

            <Select value={filterSituacao} onValueChange={(v) => setFilterSituacao(v)}>
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

            <Button variant="outline" onClick={exportCSV} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Exportar CSV
            </Button>
          </div>

          {hasActiveFilters && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>{totalCount.toLocaleString('pt-BR')} registros filtrados</span>
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
                {tableLoading ? (
                  [...Array(8)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={10}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Nenhum registro encontrado com os filtros atuais.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((evento) => (
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
                        <Badge className={getStatusColor(evento.situacao_evento)}>
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Mostrando {((page - 1) * PAGE_SIZE) + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount.toLocaleString('pt-BR')}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || tableLoading}
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
                  disabled={page === totalPages || tableLoading}
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
