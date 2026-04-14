import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, AlertCircle, ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import RevistoriaInadimplenciaDialog from "./RevistoriaInadimplenciaDialog";

interface CobrancaTabelaProps {
  boletos: any[];
  loading: boolean;
  corretoraId?: string;
}

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

const ITEMS_PER_PAGE = 50;

export default function CobrancaTabela({ boletos, loading, corretoraId }: CobrancaTabelaProps) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [revistoriaOpen, setRevistoriaOpen] = useState(false);
  
  // Filtros individuais
  const [filtroDataPagamento, setFiltroDataPagamento] = useState("");
  const [filtroDiaVencimento, setFiltroDiaVencimento] = useState("");
  const [filtroRegional, setFiltroRegional] = useState("");
  const [filtroCooperativa, setFiltroCooperativa] = useState("");
  const [filtroVoluntario, setFiltroVoluntario] = useState("");
  const [filtroPlacas, setFiltroPlacas] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState("");
  const [filtroDataVencimento, setFiltroDataVencimento] = useState("");

  const filteredBoletos = useMemo(() => {
    let result = [...boletos];
    
    // Busca geral
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(b => 
        (b.nome || "").toLowerCase().includes(searchLower) ||
        (b.placas || "").toLowerCase().includes(searchLower) ||
        (b.voluntario || "").toLowerCase().includes(searchLower) ||
        (b.regional_boleto || "").toLowerCase().includes(searchLower) ||
        (b.cooperativa || "").toLowerCase().includes(searchLower)
      );
    }
    
    // Filtros individuais
    if (filtroDataPagamento) {
      result = result.filter(b => b.data_pagamento && b.data_pagamento.includes(filtroDataPagamento));
    }
    if (filtroDiaVencimento) {
      result = result.filter(b => String(b.dia_vencimento_veiculo) === filtroDiaVencimento);
    }
    if (filtroRegional) {
      result = result.filter(b => (b.regional_boleto || "").toLowerCase().includes(filtroRegional.toLowerCase()));
    }
    if (filtroCooperativa) {
      result = result.filter(b => (b.cooperativa || "").toLowerCase().includes(filtroCooperativa.toLowerCase()));
    }
    if (filtroVoluntario) {
      result = result.filter(b => (b.voluntario || "").toLowerCase().includes(filtroVoluntario.toLowerCase()));
    }
    if (filtroPlacas) {
      result = result.filter(b => (b.placas || "").toLowerCase().includes(filtroPlacas.toLowerCase()));
    }
    if (filtroSituacao) {
      result = result.filter(b => (b.situacao || "").toLowerCase().includes(filtroSituacao.toLowerCase()));
    }
    if (filtroDataVencimento) {
      result = result.filter(b => b.data_vencimento && b.data_vencimento.includes(filtroDataVencimento));
    }
    
    return result;
  }, [boletos, search, filtroDataPagamento, filtroDiaVencimento, filtroRegional, filtroCooperativa, filtroVoluntario, filtroPlacas, filtroSituacao, filtroDataVencimento]);

  const paginatedBoletos = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBoletos.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBoletos, currentPage]);

  const totalPages = Math.ceil(filteredBoletos.length / ITEMS_PER_PAGE);

  const handleExport = () => {
    const exportData = filteredBoletos.map(b => ({
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
  };

  const clearFilters = () => {
    setSearch("");
    setFiltroDataPagamento("");
    setFiltroDiaVencimento("");
    setFiltroRegional("");
    setFiltroCooperativa("");
    setFiltroVoluntario("");
    setFiltroPlacas("");
    setFiltroSituacao("");
    setFiltroDataVencimento("");
    setCurrentPage(1);
  };

  const hasFilters = search || filtroDataPagamento || filtroDiaVencimento || filtroRegional || filtroCooperativa || filtroVoluntario || filtroPlacas || filtroSituacao || filtroDataVencimento;

  const inadimplentesAberto = useMemo(() => {
    return filteredBoletos.filter(b => (b.situacao || "").toUpperCase() === "ABERTO" && b.placas);
  }, [filteredBoletos]);

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

  if (!boletos.length) {
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
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>Dados Completos ({filteredBoletos.length.toLocaleString()} registros)</CardTitle>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpar Filtros
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Busca geral */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, placa, voluntário, regional ou cooperativa..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-10"
            />
          </div>
        </div>

        {/* Filtros individuais */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
          <Input
            placeholder="Data Pag."
            type="date"
            value={filtroDataPagamento}
            onChange={(e) => { setFiltroDataPagamento(e.target.value); setCurrentPage(1); }}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Dia Venc."
            value={filtroDiaVencimento}
            onChange={(e) => { setFiltroDiaVencimento(e.target.value); setCurrentPage(1); }}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Regional"
            value={filtroRegional}
            onChange={(e) => { setFiltroRegional(e.target.value); setCurrentPage(1); }}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Cooperativa"
            value={filtroCooperativa}
            onChange={(e) => { setFiltroCooperativa(e.target.value); setCurrentPage(1); }}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Voluntário"
            value={filtroVoluntario}
            onChange={(e) => { setFiltroVoluntario(e.target.value); setCurrentPage(1); }}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Placa"
            value={filtroPlacas}
            onChange={(e) => { setFiltroPlacas(e.target.value); setCurrentPage(1); }}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Situação"
            value={filtroSituacao}
            onChange={(e) => { setFiltroSituacao(e.target.value); setCurrentPage(1); }}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Data Venc."
            type="date"
            value={filtroDataVencimento}
            onChange={(e) => { setFiltroDataVencimento(e.target.value); setCurrentPage(1); }}
            className="h-8 text-xs"
          />
        </div>

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
              {paginatedBoletos.map((b, i) => (
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
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredBoletos.length)} de {filteredBoletos.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
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
                disabled={currentPage === totalPages}
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
