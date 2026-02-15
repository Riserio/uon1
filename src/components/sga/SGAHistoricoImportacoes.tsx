import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { History, CheckCircle, Trash2, RefreshCw, FileSpreadsheet, Loader2, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useBIAuditLog } from "@/hooks/useBIAuditLog";
import * as XLSX from "xlsx";

interface SGAHistoricoImportacoesProps {
  onActivate: () => void;
  corretoraId: string;
}

export default function SGAHistoricoImportacoes({ onActivate, corretoraId }: SGAHistoricoImportacoesProps) {
  const { registrarLog } = useBIAuditLog();
  const [importacoes, setImportacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchImportacoes = async () => {
    if (!corretoraId) {
      setImportacoes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sga_importacoes")
        .select("*")
        .eq("corretora_id", corretoraId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setImportacoes(data || []);
    } catch (error) {
      console.error("Erro ao buscar importações:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImportacoes();
  }, [corretoraId]);

  const handleActivate = async (id: string) => {
    setActivating(id);
    try {
      const importacao = importacoes.find(i => i.id === id);
      
      await supabase
        .from("sga_importacoes")
        .update({ ativo: false })
        .eq("corretora_id", corretoraId)
        .neq("id", id);

      await supabase
        .from("sga_importacoes")
        .update({ ativo: true })
        .eq("id", id);

      await registrarLog({
        modulo: "sga_insights",
        acao: "alteracao",
        descricao: `Importação ativada: ${importacao?.nome_arquivo}`,
        corretoraId,
        dadosNovos: {
          importacao_id: id,
          arquivo: importacao?.nome_arquivo,
          total_registros: importacao?.total_registros,
        },
      });

      toast.success("Importação ativada com sucesso!");
      fetchImportacoes();
      onActivate();
    } catch (error) {
      console.error("Erro ao ativar:", error);
      toast.error("Erro ao ativar importação");
    } finally {
      setActivating(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const importacao = importacoes.find(i => i.id === id);
      
      await supabase
        .from("sga_eventos")
        .delete()
        .eq("importacao_id", id);

      await supabase
        .from("sga_importacoes")
        .delete()
        .eq("id", id);

      await registrarLog({
        modulo: "sga_insights",
        acao: "exclusao",
        descricao: `Importação excluída: ${importacao?.nome_arquivo}`,
        corretoraId,
        dadosAnteriores: {
          importacao_id: id,
          arquivo: importacao?.nome_arquivo,
          total_registros: importacao?.total_registros,
        },
      });

      toast.success("Importação excluída com sucesso!");
      fetchImportacoes();
      onActivate();
    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir importação");
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = async (importacaoId: string, nomeArquivo: string) => {
    setDownloading(importacaoId);
    try {
      const allEventos: any[] = [];
      let from = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from("sga_eventos")
          .select("*")
          .eq("importacao_id", importacaoId)
          .range(from, from + batchSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allEventos.push(...data);
        from += batchSize;
        
        if (data.length < batchSize) break;
      }
      
      if (allEventos.length === 0) {
        toast.error("Nenhum registro encontrado para download");
        return;
      }
      
      const dadosFormatados = allEventos.map(e => ({
        "Protocolo": e.protocolo || "",
        "Placa": e.placa || "",
        "Voluntário": e.voluntario || "",
        "Cooperativa": e.cooperativa || "",
        "Regional": e.regional || "",
        "Tipo Evento": e.tipo_evento || "",
        "Motivo Evento": e.motivo_evento || "",
        "Situação Evento": e.situacao_evento || "",
        "Situação Análise": e.situacao_analise_evento || "",
        "Classificação": e.classificacao || "",
        "Data Evento": e.data_evento || "",
        "Data Cadastro": e.data_cadastro_evento || "",
        "Data Conclusão": e.data_conclusao || "",
        "Modelo Veículo": e.modelo_veiculo || "",
        "Categoria Veículo": e.categoria_veiculo || "",
        "Ano Fabricação": e.ano_fabricacao || "",
        "Valor Protegido": e.valor_protegido_veiculo || 0,
        "Custo Evento": e.custo_evento || 0,
        "Valor Reparo": e.valor_reparo || 0,
        "Previsão Reparo": e.previsao_valor_reparo || 0,
        "Valor Mão de Obra": e.valor_mao_de_obra || 0,
        "Participação": e.participacao || 0,
        "Envolvimento": e.envolvimento || "",
        "Analista Responsável": e.analista_responsavel || "",
        "Observações": e.observacoes || "",
        "Regional Veículo": e.regional_veiculo || "",
        "Estado Associado": e.associado_estado || "",
        "Cidade Evento": e.evento_cidade || "",
        "Estado Evento": e.evento_estado || "",
      }));
      
      const ws = XLSX.utils.json_to_sheet(dadosFormatados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Eventos");
      
      ws["!cols"] = [
        { wch: 15 }, { wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 25 },
        { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 15 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 18 },
        { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
        { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 30 },
        { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 15 },
      ];
      
      const nomeExcel = nomeArquivo.replace(/\.(json|xlsx|csv|xls)$/i, "") + "_export.xlsx";
      XLSX.writeFile(wb, nomeExcel);
      toast.success(`Download concluído: ${allEventos.length} registros`);
    } catch (error: any) {
      console.error("Erro ao baixar:", error);
      toast.error("Erro ao baixar importação");
    } finally {
      setDownloading(null);
    }
  };

  if (!corretoraId) {
    return (
      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="p-6">
          <div className="flex gap-3 items-center">
            <AlertCircle className="h-6 w-6 text-yellow-500" />
            <div>
              <p className="font-medium text-yellow-600">Selecione uma Associação</p>
              <p className="text-sm text-muted-foreground mt-1">
                Para ver o histórico de importações, primeiro selecione uma associação no filtro acima.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Histórico de Importações
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : importacoes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma importação realizada para esta associação.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Registros</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {importacoes.map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-green-600" />
                      {imp.nome_arquivo}
                    </div>
                  </TableCell>
                  <TableCell>{imp.total_registros?.toLocaleString()}</TableCell>
                  <TableCell>
                    {format(new Date(imp.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    {imp.ativo ? (
                      <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Ativa
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inativa</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-300"
                        onClick={() => handleDownload(imp.id, imp.nome_arquivo)}
                        disabled={downloading === imp.id}
                        title="Baixar como Excel"
                      >
                        {downloading === imp.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                      {!imp.ativo && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleActivate(imp.id)}
                          disabled={activating === imp.id}
                        >
                          {activating === imp.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Ativar
                            </>
                          )}
                        </Button>
                      )}
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={deleting === imp.id}
                          >
                            {deleting === imp.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir Importação?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação irá excluir permanentemente a importação "{imp.nome_arquivo}" 
                              e todos os {imp.total_registros?.toLocaleString()} registros associados.
                              Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(imp.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
