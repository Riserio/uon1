import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Download, AlertCircle, ChevronLeft, ChevronRight, SearchCheck, SlidersHorizontal, ChevronDown, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import RevistoriaInadimplenciaDialog from "./RevistoriaInadimplenciaDialog";
import type { CobrancaFilters } from "@/pages/CobrancaInsights";

// NOTE (escalabilidade): esta tabela não recebe mais o array cru de
// boletos (poderia ser 500k+ linhas para associações grandes). Ela busca
// sua própria página de dados via a RPC `listar_cobranca_boletos_dedup`
// (dedup + filtros + paginação feitos no servidor), refazendo a busca a
// cada mudança de filtro/busca/página. A busca por texto é debounced em
// 300ms para não disparar uma query a cada tecla digitada.
interface CobrancaTabelaProps {
  importacaoIds: string[];
  globalFilters: CobrancaFilters;
  filterOptions: {
    regionais: string[];
    cooperativas: string[];
    diasVencimento: number[];
    situacoes: string[];
  };
  loading: boolean;
  corretoraId?: string;
}

const TODOS = "__todos__";
const NONE_SENTINEL = "__none__";
const ITEMS_PER_PAGE = 50;
// Cap de exportação: exportar o dataset filtrado inteiro (que pode passar
// de 100 mil linhas em associações grandes como a VALECAR) num único
// download travaria o navegador. Reaproveitamos a mesma RPC paginada com
// um limite alto (sem offset) — cobre o caso comum (poucos milhares de
// linhas após filtrar) e, quando o total filtrado excede o cap, avisamos
// o usuário e sugerimos refinar os filtros em vez de tentar trazer tudo.
const EXPORT_CAP = 50000;
// Cap para a lista de "Revistoria" (boletos em aberto com placa) — mesma
// lógica: nunca busca o dataset inteiro de uma vez.
const REVISTORIA_CAP = 20000;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try {
    // Parse date string manually to avoid UTC interpretation shifting dates by -1 day
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      const localDate = new Date(year, month - 1, day);
      return format(localDate, "dd/MM/yyyy", { locale: ptBR });
    }
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

export default function CobrancaTabela({ importacaoIds, globalFilters, filterOptions, loading, corretoraId }: CobrancaTabelaProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [revistoriaOpen, setRevistoriaOpen] = useState(false);
  const [maisFiltrosAberto, setMaisFiltrosAberto] = useState(false);

  // Filtro sempre visível (uso mais comum)
  const [filtroSituacao, setFiltroSituacao] = useState("");

  // Filtros avançados (dentro do colapse "Mais filtros")
  const [filtroDataPagamentoDe, setFiltroDataPagamentoDe] = useState("");
  const [filtroDataPagamentoAte, setFiltroDataPagamentoAte] = useState("");
  const [filtroDataVencimentoDe, setFiltroDataVencimentoDe] = useState("");
  const [filtroDataVencimentoAte, setFiltroDataVencimentoAte] = useState("");
  const [filtroDiaVencimento, setFiltroDiaVencimento] = useState("");
  const [filtroRegional, setFiltroRegional] = useState("");
  const [filtroCooperativa, setFiltroCooperativa] = useState("");
  const [filtroVoluntario, setFiltroVoluntario] = useState("");
  const [filtroPlacas, setFiltroPlacas] = useState("");

  // Dados da página atual (vindos do servidor)
  const [rows, setRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [tableLoading, setTableLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Contagem/lista de "Revistoria" (ABERTO + placa preenchida)
  const [revistoriaCount, setRevistoriaCount] = useState(0);
  const [revistoriaRows, setRevistoriaRows] = useState<any[]>([]);
  const [revistoriaLoading, setRevistoriaLoading] = useState(false);

  const fetchIdRef = useRef(0);

  // Debounce da busca (300ms) para não disparar uma query a cada tecla
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Opções dos dropdowns: vêm de `filterOptions` (RPC leve, escopo = todas
  // as importações ativas, sem aplicar os filtros atuais — pode mostrar
  // alguma opção sem resultado no filtro corrente, tradeoff aceitável
  // para evitar mais uma query pesada só para popular dropdowns).
  const opcoesSituacao = filterOptions?.situacoes || [];
  const opcoesRegional = filterOptions?.regionais || [];
  const opcoesCooperativa = filterOptions?.cooperativas || [];

  // Combina o filtro global (vindo do painel de Filtros da página) com o
  // filtro local da tabela para o mesmo campo. Se os dois estiverem
  // preenchidos e forem diferentes, força um resultado vazio (nenhum
  // boleto pode satisfazer duas situações/regionais diferentes ao mesmo
  // tempo) em vez de simplesmente ignorar um dos dois filtros.
  const combineFilter = (localValue: string, globalValue: string | undefined): string | null => {
    const g = globalValue && globalValue !== "todos" ? globalValue : null;
    if (localValue && g && localValue.toUpperCase() !== g.toUpperCase()) return NONE_SENTINEL;
    return localValue || g || null;
  };

  const effectiveSituacao = combineFilter(filtroSituacao, globalFilters.situacao);
  const effectiveRegional = combineFilter(filtroRegional, globalFilters.regional);
  const effectiveCooperativa = combineFilter(filtroCooperativa, globalFilters.cooperativa);
  const effectiveDiaVencimento = combineFilter(filtroDiaVencimento, globalFilters.diaVencimento);

  // Situação forçada para "ABERTO" usada pela Revistoria — mas se o
  // usuário já filtrou explicitamente por outra situação (ex.: BAIXADO),
  // nenhum boleto pode satisfazer as duas ao mesmo tempo, então força 0
  // resultados em vez de ignorar o filtro escolhido.
  const revistoriaSituacao = effectiveSituacao === NONE_SENTINEL
    ? NONE_SENTINEL
    : (effectiveSituacao && effectiveSituacao.toUpperCase() !== "ABERTO" ? NONE_SENTINEL : "ABERTO");

  const buildRpcParams = (limit: number, offset: number) => ({
    p_importacao_ids: importacaoIds,
    p_mes_referencia: globalFilters.mesReferencia || null,
    p_situacao: effectiveSituacao,
    p_regional: effectiveRegional,
    p_cooperativa: effectiveCooperativa,
    p_dia_vencimento: effectiveDiaVencimento && effectiveDiaVencimento !== NONE_SENTINEL ? Number(effectiveDiaVencimento) : (effectiveDiaVencimento === NONE_SENTINEL ? -999999 : null),
    p_search: debouncedSearch || null,
    p_data_pagamento_de: filtroDataPagamentoDe || null,
    p_data_pagamento_ate: filtroDataPagamentoAte || null,
    p_data_vencimento_de: filtroDataVencimentoDe || null,
    p_data_vencimento_ate: filtroDataVencimentoAte || null,
    p_voluntario: filtroVoluntario || null,
    p_placas: filtroPlacas || null,
    p_sort_col: "data_vencimento",
    p_sort_dir: "desc",
    p_limit: limit,
    p_offset: offset,
  });

  // Busca a página atual sempre que filtros/busca/página mudam
  useEffect(() => {
    if (!importacaoIds.length) {
      setRows([]);
      setTotalCount(0);
      setTableLoading(false);
      return;
    }

    const myFetchId = ++fetchIdRef.current;
    setTableLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase.rpc("listar_cobranca_boletos_dedup", buildRpcParams(ITEMS_PER_PAGE, (currentPage - 1) * ITEMS_PER_PAGE) as any);
        if (myFetchId !== fetchIdRef.current) return;
        if (error) throw error;
        setRows((data as any)?.rows || []);
        setTotalCount((data as any)?.totalCount || 0);
      } catch (error) {
        console.error("Erro ao carregar tabela de cobrança:", error);
        if (myFetchId === fetchIdRef.current) {
          toast.error("Erro ao carregar os dados da tabela. Tente novamente.");
        }
      } finally {
        if (myFetchId === fetchIdRef.current) setTableLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    importacaoIds.join(","), globalFilters.mesReferencia, globalFilters.situacao, globalFilters.regional,
    globalFilters.cooperativa, globalFilters.diaVencimento, debouncedSearch, filtroSituacao,
    filtroDataPagamentoDe, filtroDataPagamentoAte, filtroDataVencimentoDe, filtroDataVencimentoAte,
    filtroDiaVencimento, filtroRegional, filtroCooperativa, filtroVoluntario, filtroPlacas, currentPage,
  ]);

  // Reset de página quando qualquer filtro/busca muda
  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch, filtroSituacao, filtroDataPagamentoDe, filtroDataPagamentoAte,
    filtroDataVencimentoDe, filtroDataVencimentoAte, filtroDiaVencimento, filtroRegional,
    filtroCooperativa, filtroVoluntario, filtroPlacas,
    globalFilters.mesReferencia, globalFilters.situacao, globalFilters.regional,
    globalFilters.cooperativa, globalFilters.diaVencimento,
  ]);

  // Contagem de candidatos à Revistoria (ABERTO + placa), respeitando os
  // filtros atuais — busca leve (limit=1, só usamos o totalCount).
  useEffect(() => {
    if (!corretoraId || !importacaoIds.length) {
      setRevistoriaCount(0);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc("listar_cobranca_boletos_dedup", {
          ...buildRpcParams(1, 0),
          p_situacao: revistoriaSituacao,
          p_placas: filtroPlacas || "",
        } as any);
        if (error) throw error;
        setRevistoriaCount((data as any)?.totalCount || 0);
      } catch (error) {
        console.error("Erro ao contar revistoria:", error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    importacaoIds.join(","), corretoraId, globalFilters.mesReferencia, globalFilters.situacao,
    globalFilters.regional, globalFilters.cooperativa, globalFilters.diaVencimento,
    filtroSituacao, filtroRegional, filtroCooperativa, filtroDiaVencimento, filtroPlacas,
    filtroDataPagamentoDe, filtroDataPagamentoAte, filtroDataVencimentoDe, filtroDataVencimentoAte, filtroVoluntario,
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  const handleOpenRevistoria = async () => {
    if (!corretoraId) return;
    setRevistoriaLoading(true);
    setRevistoriaOpen(true);
    try {
      const { data, error } = await supabase.rpc("listar_cobranca_boletos_dedup", {
        ...buildRpcParams(REVISTORIA_CAP, 0),
        p_situacao: revistoriaSituacao,
        p_placas: filtroPlacas || "",
      } as any);
      if (error) throw error;
      const allRows = (data as any)?.rows || [];
      if (((data as any)?.totalCount || 0) > REVISTORIA_CAP) {
        toast.warning(`Revistoria limitada aos primeiros ${REVISTORIA_CAP.toLocaleString('pt-BR')} boletos em aberto com placa.`);
      }
      setRevistoriaRows(allRows);
    } catch (error) {
      console.error("Erro ao carregar lista de revistoria:", error);
      toast.error("Erro ao carregar lista de revistoria.");
    } finally {
      setRevistoriaLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("listar_cobranca_boletos_dedup", buildRpcParams(EXPORT_CAP, 0) as any);
      if (error) throw error;
      const allRows = (data as any)?.rows || [];
      const exportTotal = (data as any)?.totalCount || 0;

      if (exportTotal > EXPORT_CAP) {
        toast.warning(
          `Exportação limitada às primeiras ${EXPORT_CAP.toLocaleString('pt-BR')} de ${exportTotal.toLocaleString('pt-BR')} linhas filtradas. Refine os filtros para exportar um subconjunto menor.`
        );
      }

      const exportData = allRows.map((b: any) => ({
        "Data Pagamento": formatDate(b.data_pagamento),
        "Data Vencimento Original": formatDate(b.data_vencimento_original),
        "Dia Vencimento Veículo": b.dia_vencimento_veiculo,
        "Regional": b.regional_boleto,
        "Cooperativa": b.cooperativa,
        "Voluntário": b.voluntario,
        "Nome": b.nome,
        "Placas": b.placas,
        "Valor": b.valor,
        "Data Vencimento": formatDate(b.data_vencimento),
        "Dias Atraso": b.qtde_dias_atraso_vencimento_original,
        "Situação": b.situacao
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cobrança");
      XLSX.writeFile(wb, `cobranca_export_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao exportar dados.");
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setFiltroSituacao("");
    setFiltroDataPagamentoDe("");
    setFiltroDataPagamentoAte("");
    setFiltroDataVencimentoDe("");
    setFiltroDataVencimentoAte("");
    setFiltroDiaVencimento("");
    setFiltroRegional("");
    setFiltroCooperativa("");
    setFiltroVoluntario("");
    setFiltroPlacas("");
    setCurrentPage(1);
  };

  const filtrosAvancadosAtivos = [
    filtroDataPagamentoDe, filtroDataPagamentoAte,
    filtroDataVencimentoDe, filtroDataVencimentoAte,
    filtroDiaVencimento, filtroRegional, filtroCooperativa, filtroVoluntario, filtroPlacas,
  ].filter(Boolean).length;

  const hasFilters = !!(search || filtroSituacao || filtrosAvancadosAtivos);

  // Determinar cor da linha baseado na situação
  const getRowClass = (situacao: string) => {
    if (!situacao) return "";
    const sit = situacao.toUpperCase();
    if (sit === "BAIXADO") return "bg-green-50 dark:bg-green-950/20";
    if (sit === "ABERTO") return "bg-red-50 dark:bg-red-950/20";
    return "";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dados Completos</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!importacaoIds.length) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum Dado Disponível</h3>
          <p className="text-muted-foreground">
            Importe uma planilha de cobrança para visualizar os dados.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            Dados Completos ({totalCount.toLocaleString('pt-BR')} registros)
            {tableLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpar Filtros
              </Button>
            )}
             {corretoraId && revistoriaCount > 0 && (
               <Button variant="outline" size="sm" onClick={handleOpenRevistoria} className="gap-1.5">
                 <SearchCheck className="h-4 w-4" />
                 Revistoria ({revistoriaCount.toLocaleString('pt-BR')})
               </Button>
             )}
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Exportar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Busca geral + situação (uso mais comum, sempre visíveis) */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, placa, voluntário, regional ou cooperativa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select
            value={filtroSituacao || TODOS}
            onValueChange={(v) => setFiltroSituacao(v === TODOS ? "" : v)}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas as situações</SelectItem>
              {opcoesSituacao.map(op => (
                <SelectItem key={op} value={op}>{op}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="default"
            onClick={() => setMaisFiltrosAberto(v => !v)}
            className="gap-1.5 shrink-0"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Mais filtros
            {filtrosAvancadosAtivos > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">{filtrosAvancadosAtivos}</Badge>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${maisFiltrosAberto ? "rotate-180" : ""}`} />
          </Button>
        </div>

        {/* Filtros avançados (colapsável) */}
        {maisFiltrosAberto && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4 p-3 rounded-lg border bg-muted/30">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data Pagamento — de</Label>
              <Input
                type="date"
                value={filtroDataPagamentoDe}
                onChange={(e) => setFiltroDataPagamentoDe(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data Pagamento — até</Label>
              <Input
                type="date"
                value={filtroDataPagamentoAte}
                onChange={(e) => setFiltroDataPagamentoAte(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data Vencimento — de</Label>
              <Input
                type="date"
                value={filtroDataVencimentoDe}
                onChange={(e) => setFiltroDataVencimentoDe(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data Vencimento — até</Label>
              <Input
                type="date"
                value={filtroDataVencimentoAte}
                onChange={(e) => setFiltroDataVencimentoAte(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Regional</Label>
              <Select
                value={filtroRegional || TODOS}
                onValueChange={(v) => setFiltroRegional(v === TODOS ? "" : v)}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas</SelectItem>
                  {opcoesRegional.map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cooperativa</Label>
              <Select
                value={filtroCooperativa || TODOS}
                onValueChange={(v) => setFiltroCooperativa(v === TODOS ? "" : v)}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas</SelectItem>
                  {opcoesCooperativa.map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Dia Vencimento</Label>
              <Input
                placeholder="Ex: 10"
                value={filtroDiaVencimento}
                onChange={(e) => setFiltroDiaVencimento(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Voluntário</Label>
              <Input
                placeholder="Nome do voluntário"
                value={filtroVoluntario}
                onChange={(e) => setFiltroVoluntario(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Placa</Label>
              <Input
                placeholder="Ex: ABC1234"
                value={filtroPlacas}
                onChange={(e) => setFiltroPlacas(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>
        )}

        {/* Tabela */}
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted border-b">
                <th className="p-2 text-left font-medium whitespace-nowrap">Data Pagamento</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">Venc. Original</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">Dia Venc.</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">Regional</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">Cooperativa</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">Voluntário</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">Nome</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">Placa</th>
                <th className="p-2 text-right font-medium whitespace-nowrap">Valor</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">Data Vencimento</th>
                <th className="p-2 text-center font-medium whitespace-nowrap">Dias Atraso</th>
                <th className="p-2 text-center font-medium whitespace-nowrap">Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b, i) => (
                <tr key={b.id || i} className={`border-b hover:bg-muted/50 ${getRowClass(b.situacao)}`}>
                  <td className="p-2">{formatDate(b.data_pagamento)}</td>
                  <td className="p-2">{formatDate(b.data_vencimento_original)}</td>
                  <td className="p-2">{b.dia_vencimento_veiculo || "-"}</td>
                  <td className="p-2 max-w-[150px] truncate">{b.regional_boleto || "-"}</td>
                  <td className="p-2 max-w-[150px] truncate">{b.cooperativa || "-"}</td>
                  <td className="p-2 max-w-[120px] truncate">{b.voluntario || "-"}</td>
                  <td className="p-2 max-w-[150px] truncate">{b.nome || "-"}</td>
                  <td className="p-2 font-mono">{b.placas || "-"}</td>
                  <td className="p-2 text-right text-blue-600 font-medium">{formatCurrency(b.valor)}</td>
                  <td className="p-2">{formatDate(b.data_vencimento)}</td>
                  <td className="p-2 text-center">
                    {b.qtde_dias_atraso_vencimento_original > 0 ? (
                      <span className="text-red-600 font-medium">{b.qtde_dias_atraso_vencimento_original}</span>
                    ) : (
                      b.qtde_dias_atraso_vencimento_original || "-"
                    )}
                  </td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      b.situacao?.toUpperCase() === "BAIXADO"
                        ? "bg-green-100 text-green-700"
                        : b.situacao?.toUpperCase() === "ABERTO"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-700"
                    }`}>
                      {b.situacao || "-"}
                    </span>
                  </td>
                </tr>
              ))}
              {!tableLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-muted-foreground">
                    Nenhum registro encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} de {totalCount.toLocaleString('pt-BR')}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || tableLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || tableLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {corretoraId && (
      <RevistoriaInadimplenciaDialog
        open={revistoriaOpen}
        onOpenChange={setRevistoriaOpen}
        inadimplentes={revistoriaLoading ? [] : revistoriaRows}
        corretoraId={corretoraId}
      />
    )}
    </>
  );
}
