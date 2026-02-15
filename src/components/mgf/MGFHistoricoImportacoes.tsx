import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, CheckCircle2, Trash2, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";

interface MGFHistoricoImportacoesProps {
  onActivate: () => void;
  corretoraId: string;
}

export default function MGFHistoricoImportacoes({ onActivate, corretoraId }: MGFHistoricoImportacoesProps) {
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

    try {
      const { data, error } = await supabase
        .from("mgf_importacoes")
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

  const handleActivate = async (id: string) => {
    setActivating(id);
    try {
      await supabase
        .from("mgf_importacoes")
        .update({ ativo: false })
        .eq("corretora_id", corretoraId);

      await supabase
        .from("mgf_importacoes")
        .update({ ativo: true })
        .eq("id", id);

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
    if (!confirm("Tem certeza que deseja excluir esta importação?")) return;

    setDeleting(id);
    try {
      await supabase.from("mgf_dados").delete().eq("importacao_id", id);
      await supabase.from("mgf_importacoes").delete().eq("id", id);

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
      const allDados: any[] = [];
      let from = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from("mgf_dados")
          .select("*")
          .eq("importacao_id", importacaoId)
          .range(from, from + batchSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allDados.push(...data);
        from += batchSize;
        
        if (data.length < batchSize) break;
      }
      
      if (allDados.length === 0) {
        toast.error("Nenhum registro encontrado para download");
        return;
      }
      
      const dadosFormatados = allDados.map(d => ({
        "Protocolo Evento": d.protocolo_evento || "",
        "Associado": d.associado || "",
        "Voluntário": d.voluntario || "",
        "Placa": d.placa || "",
        "Cooperativa": d.cooperativa || "",
        "Regional": d.regional || "",
        "Centro Custo": d.centro_custo || "",
        "Operação": d.operacao || "",
        "Sub Operação": d.sub_operacao || "",
        "Descrição": d.descricao || "",
        "Fornecedor": d.fornecedor || "",
        "CNPJ Fornecedor": d.cnpj_fornecedor || "",
        "Nota Fiscal": d.nota_fiscal || "",
        "Situação": d.situacao || "",
        "Status": d.status || "",
        "Situação Pagamento": d.situacao_pagamento || "",
        "Forma Pagamento": d.forma_pagamento || "",
        "Valor": d.valor || 0,
        "Custo": d.custo || 0,
        "Impostos": d.impostos || 0,
        "Juros": d.juros || 0,
        "Multa": d.multa || 0,
        "Valor Pagamento": d.valor_pagamento || 0,
        "Valor Total Lançamento": d.valor_total_lancamento || 0,
        "Data Evento": d.data_evento || "",
        "Data Cadastro": d.data_cadastro || "",
        "Data Vencimento": d.data_vencimento || "",
        "Data Pagamento": d.data_pagamento || "",
        "Data Nota Fiscal": d.data_nota_fiscal || "",
        "Mês Referente": d.mes_referente || "",
        "Tipo Evento": d.tipo_evento || "",
        "Motivo Evento": d.motivo_evento || "",
        "Modelo Veículo": d.modelo_veiculo || "",
        "Tipo Veículo": d.tipo_veiculo || "",
        "Categoria Veículo": d.categoria_veiculo || "",
        "Classificação": d.classificacao || "",
        "Controle Interno": d.controle_interno || "",
      }));
      
      const ws = XLSX.utils.json_to_sheet(dadosFormatados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "MGF");
      
      ws["!cols"] = dadosFormatados.length > 0
        ? Object.keys(dadosFormatados[0]).map(() => ({ wch: 18 }))
        : [];
      
      const nomeExcel = nomeArquivo.replace(/\.(json|xlsx|csv|xls)$/i, "") + "_export.xlsx";
      XLSX.writeFile(wb, nomeExcel);
      toast.success(`Download concluído: ${allDados.length} registros`);
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
        <CardContent className="p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (importacoes.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-5 w-5 text-orange-500" />
          Histórico de Importações
        </CardTitle>
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
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{imp.nome_arquivo}</p>
                  {imp.ativo && (
                    <Badge variant="default" className="bg-green-500">
                      Ativo
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {imp.total_registros?.toLocaleString()} registros •{" "}
                  {format(new Date(imp.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>
              <div className="flex items-center gap-2">
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
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <span className="ml-1 hidden sm:inline">Ativar</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(imp.id)}
                  disabled={deleting === imp.id}
                  className="text-destructive hover:text-destructive"
                >
                  {deleting === imp.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
