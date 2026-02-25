import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, FileSpreadsheet, Check, Clock, AlertCircle, Loader2, Power, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CobrancaHistoricoImportacoesProps {
  corretoraId: string;
  onImportacaoAtivada?: () => void;
}

// Parse YYYY-MM-DD as local date to avoid UTC shift
const formatLocalDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const parts = dateStr.split("T")[0].split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return dateStr;
};

export default function CobrancaHistoricoImportacoes({ corretoraId, onImportacaoAtivada }: CobrancaHistoricoImportacoesProps) {
  const [importacoes, setImportacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchImportacoes = async () => {
    if (!corretoraId) return;
    
    try {
      const { data, error } = await supabase
        .from("cobranca_importacoes")
        .select("*")
        .eq("corretora_id", corretoraId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setImportacoes(data || []);
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImportacoes();
  }, [corretoraId]);

  // Realtime para atualizar lista quando houver mudanças
  useEffect(() => {
    if (!corretoraId) return;

    const channel = supabase
      .channel(`historico-importacoes-${corretoraId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cobranca_importacoes',
          filter: `corretora_id=eq.${corretoraId}`,
        },
        () => {
          fetchImportacoes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [corretoraId]);

  const handleActivate = async (importacaoId: string) => {
    setActivating(importacaoId);
    try {
      // Primeiro, desativar todas as importações desta corretora
      const { error: deactivateError } = await supabase
        .from("cobranca_importacoes")
        .update({ ativo: false })
        .eq("corretora_id", corretoraId);

      if (deactivateError) throw deactivateError;

      // Depois, ativar a importação selecionada
      const { error: activateError } = await supabase
        .from("cobranca_importacoes")
        .update({ ativo: true, updated_at: new Date().toISOString() })
        .eq("id", importacaoId);

      if (activateError) throw activateError;

      toast.success("Importação ativada com sucesso! Dashboard atualizado.");
      fetchImportacoes();
      onImportacaoAtivada?.();
    } catch (error: any) {
      console.error("Erro ao ativar:", error);
      toast.error("Erro ao ativar importação");
    } finally {
      setActivating(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    setDeleting(true);
    try {
      // Primeiro deletar os boletos relacionados
      const { error: boletosError } = await supabase
        .from("cobranca_boletos")
        .delete()
        .eq("importacao_id", deleteId);

      if (boletosError) throw boletosError;

      // Depois deletar a importação
      const { error: impError } = await supabase
        .from("cobranca_importacoes")
        .delete()
        .eq("id", deleteId);

      if (impError) throw impError;

      toast.success("Importação excluída com sucesso!");
      fetchImportacoes();
      onImportacaoAtivada?.();
    } catch (error: any) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir importação");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const handleDownload = async (importacaoId: string, nomeArquivo: string) => {
    setDownloading(importacaoId);
    try {
      // Buscar todos os boletos desta importação
      const allBoletos: any[] = [];
      let from = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from("cobranca_boletos")
          .select("*")
          .eq("importacao_id", importacaoId)
          .range(from, from + batchSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allBoletos.push(...data);
        from += batchSize;
        
        if (data.length < batchSize) break;
      }
      
      if (allBoletos.length === 0) {
        toast.error("Nenhum registro encontrado para download");
        return;
      }
      
      // Formatar dados para Excel
      const dadosFormatados = allBoletos.map(boleto => ({
        "Nome": boleto.nome || "",
        "Voluntário": boleto.voluntario || "",
        "Placas": boleto.placas || "",
        "Cooperativa": boleto.cooperativa || "",
        "Regional": boleto.regional_boleto || "",
        "Situação": boleto.situacao || "",
        "Valor": boleto.valor || 0,
        "Data Vencimento": boleto.data_vencimento ? formatLocalDate(boleto.data_vencimento) : "",
        "Data Vencimento Original": boleto.data_vencimento_original ? formatLocalDate(boleto.data_vencimento_original) : "",
        "Data Pagamento": boleto.data_pagamento ? formatLocalDate(boleto.data_pagamento) : "",
        "Dia Vencimento Veículo": boleto.dia_vencimento_veiculo || "",
        "Dias Atraso": boleto.qtde_dias_atraso_vencimento_original || "",
      }));
      
      // Criar workbook Excel
      const ws = XLSX.utils.json_to_sheet(dadosFormatados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Boletos");
      
      // Ajustar largura das colunas
      const colWidths = [
        { wch: 35 }, // Nome
        { wch: 25 }, // Voluntário
        { wch: 12 }, // Placas
        { wch: 20 }, // Cooperativa
        { wch: 25 }, // Regional
        { wch: 12 }, // Situação
        { wch: 12 }, // Valor
        { wch: 15 }, // Data Vencimento
        { wch: 20 }, // Data Vencimento Original
        { wch: 15 }, // Data Pagamento
        { wch: 20 }, // Dia Vencimento Veículo
        { wch: 12 }, // Dias Atraso
      ];
      ws["!cols"] = colWidths;
      
      // Gerar nome do arquivo
      const nomeExcel = nomeArquivo.replace(/\.(json|xlsx|csv)$/i, "") + "_export.xlsx";
      
      // Download
      XLSX.writeFile(wb, nomeExcel);
      toast.success(`Download concluído: ${allBoletos.length} registros`);
    } catch (error: any) {
      console.error("Erro ao baixar:", error);
      toast.error("Erro ao baixar importação");
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Importações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (importacoes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Importações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>Nenhuma importação realizada ainda</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Importações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {importacoes.map((imp) => (
              <div
                key={imp.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  imp.ativo ? "bg-green-500/10 border-green-500/30" : "bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className={`h-5 w-5 ${imp.ativo ? "text-green-600" : "text-muted-foreground"}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{imp.nome_arquivo}</p>
                      {imp.ativo && (
                        <span className="flex items-center gap-1 text-xs bg-green-500 text-white px-2 py-0.5 rounded">
                          <Check className="h-3 w-3" />
                          Ativo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="whitespace-nowrap">{imp.total_registros?.toLocaleString('pt-BR')} registros</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(imp.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
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
                      className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-300"
                      onClick={() => handleActivate(imp.id)}
                      disabled={activating === imp.id}
                    >
                      {activating === imp.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Power className="h-4 w-4 mr-1" />
                          Ativar
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-700 hover:bg-red-100"
                    onClick={() => setDeleteId(imp.id)}
                    disabled={imp.ativo}
                    title={imp.ativo ? "Não é possível excluir a importação ativa" : "Excluir importação"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá excluir permanentemente a importação e todos os boletos associados.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
