import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Download, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import * as XLSX from "xlsx";

interface Props {
  registros: any[];
  loading: boolean;
}

const ITEMS_PER_PAGE = 50;

export default function CadastroTabela({ registros, loading }: Props) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filtroSituacao, setFiltroSituacao] = useState("");
  const [filtroRegional, setFiltroRegional] = useState("");

  const filtered = useMemo(() => {
    let result = [...registros];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r =>
        (r.nome || "").toLowerCase().includes(s) ||
        (r.placa || "").toLowerCase().includes(s) ||
        (r.cpf || "").toLowerCase().includes(s) ||
        (r.modelo_veiculo || "").toLowerCase().includes(s)
      );
    }
    if (filtroSituacao) result = result.filter(r => (r.situacao || "").toLowerCase().includes(filtroSituacao.toLowerCase()));
    if (filtroRegional) result = result.filter(r => (r.regional || "").toLowerCase().includes(filtroRegional.toLowerCase()));
    return result;
  }, [registros, search, filtroSituacao, filtroRegional]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

  const handleExport = () => {
    const data = filtered.map(r => ({
      Nome: r.nome, CPF: r.cpf, Placa: r.placa,
      Marca: r.marca_veiculo, Modelo: r.modelo_veiculo, Ano: r.ano_veiculo,
      Situação: r.situacao, Regional: r.regional, Cooperativa: r.cooperativa,
      Cidade: r.cidade, Estado: r.estado, "Valor Protegido": r.valor_protegido,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cadastro");
    XLSX.writeFile(wb, `cadastro_export_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  if (loading) return <Card><CardContent><Skeleton className="h-[400px] w-full" /></CardContent></Card>;

  if (!registros.length) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum Dado</h3>
          <p className="text-muted-foreground">Importe uma planilha de cadastro.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>Cadastro Completo ({filtered.length.toLocaleString()} registros)</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />Exportar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar nome, placa, CPF..." value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="pl-10" />
          </div>
          <Input placeholder="Filtrar Situação" value={filtroSituacao}
            onChange={(e) => { setFiltroSituacao(e.target.value); setCurrentPage(1); }} className="h-10 text-sm" />
          <Input placeholder="Filtrar Regional" value={filtroRegional}
            onChange={(e) => { setFiltroRegional(e.target.value); setCurrentPage(1); }} className="h-10 text-sm" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-2 font-medium">Nome</th>
                <th className="text-left p-2 font-medium">CPF</th>
                <th className="text-left p-2 font-medium">Placa</th>
                <th className="text-left p-2 font-medium">Veículo</th>
                <th className="text-left p-2 font-medium">Situação</th>
                <th className="text-left p-2 font-medium">Regional</th>
                <th className="text-left p-2 font-medium">Cooperativa</th>
                <th className="text-right p-2 font-medium">Valor Protegido</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((r, i) => (
                <tr key={r.id || i} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="p-2 max-w-[180px] truncate">{r.nome || "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.cpf || "—"}</td>
                  <td className="p-2 font-mono text-xs">{r.placa || "—"}</td>
                  <td className="p-2 text-xs">{[r.marca_veiculo, r.modelo_veiculo, r.ano_veiculo].filter(Boolean).join(" ") || "—"}</td>
                  <td className="p-2">
                    {r.situacao ? (
                      <Badge variant={(r.situacao || "").toUpperCase().includes("ATIV") ? "default" : "secondary"} className="text-[10px]">
                        {r.situacao}
                      </Badge>
                    ) : "—"}
                  </td>
                  <td className="p-2 text-xs">{r.regional || "—"}</td>
                  <td className="p-2 text-xs">{r.cooperativa || "—"}</td>
                  <td className="p-2 text-right text-xs font-medium">
                    {r.valor_protegido ? `R$ ${Number(r.valor_protegido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">Página {currentPage} de {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
