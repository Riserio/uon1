import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { History, User, Calendar, FileText, Database, Upload, Edit, Trash2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Json } from "@/integrations/supabase/types";

interface BIAuditLog {
  id: string;
  user_id: string;
  user_nome: string;
  corretora_id: string | null;
  modulo: string;
  acao: string;
  descricao: string;
  dados_anteriores: Json | null;
  dados_novos: Json | null;
  created_at: string;
}

interface BIAuditLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modulo: "bi_indicadores" | "sga_insights";
  corretoraId?: string;
}

const getActionIcon = (acao: string) => {
  switch (acao) {
    case "importacao":
      return <Upload className="h-4 w-4" />;
    case "alteracao":
      return <Edit className="h-4 w-4" />;
    case "exclusao":
      return <Trash2 className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

const getActionColor = (acao: string) => {
  switch (acao) {
    case "importacao":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "alteracao":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "exclusao":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export function BIAuditLogDialog({ open, onOpenChange, modulo, corretoraId }: BIAuditLogDialogProps) {
  const [logs, setLogs] = useState<BIAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open, modulo, corretoraId]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("bi_audit_logs")
        .select("*")
        .eq("modulo", modulo)
        .order("created_at", { ascending: false })
        .limit(100);

      if (corretoraId) {
        query = query.eq("corretora_id", corretoraId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erro ao buscar logs:", error);
        return;
      }

      setLogs((data as BIAuditLog[]) || []);
    } catch (error) {
      console.error("Erro ao buscar logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const moduloLabel = modulo === "bi_indicadores" ? "BI - Indicadores" : "SGA Insights";

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "number") {
      return value.toLocaleString("pt-BR");
    }
    return String(value);
  };

  const formatJsonData = (data: Json | null): string => {
    if (!data) return "";
    if (typeof data === "object") {
      return JSON.stringify(data, null, 2);
    }
    return String(data);
  };

  const renderComparison = (log: BIAuditLog) => {
    const anterior = log.dados_anteriores as Record<string, any> | null;
    const novo = log.dados_novos as Record<string, any> | null;
    
    if (!anterior && !novo) return null;
    
    // Get all unique keys from both objects
    const allKeys = new Set([
      ...(anterior ? Object.keys(anterior) : []),
      ...(novo ? Object.keys(novo) : [])
    ]);

    const fieldLabels: Record<string, string> = {
      ano: "Ano",
      mes: "Mês",
      placas_ativas: "Placas Ativas",
      total_cotas: "Total Cotas",
      total_associados: "Total Associados",
      cadastros_realizados: "Cadastros Realizados",
      cancelamentos: "Cancelamentos",
      inadimplentes: "Inadimplentes",
      faturamento_operacional: "Faturamento Operacional",
      total_recebido: "Total Recebido",
      data_referencia: "Data Referência",
      total_veiculos_geral: "Total Veículos",
      total_veiculos_ativos: "Veículos Ativos",
      protegido_geral: "Valor Protegido",
      tm_geral: "TM Geral",
      arquivo: "Arquivo",
      total_registros: "Total Registros",
      corretora: "Associação",
    };

    return (
      <div className="mt-3 border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Campo</th>
              {anterior && <th className="px-3 py-2 text-left font-medium text-red-400">Valor Anterior</th>}
              {novo && <th className="px-3 py-2 text-left font-medium text-green-400">Novo Valor</th>}
            </tr>
          </thead>
          <tbody>
            {Array.from(allKeys).map((key) => {
              const oldValue = anterior?.[key];
              const newValue = novo?.[key];
              const hasChanged = JSON.stringify(oldValue) !== JSON.stringify(newValue);
              
              return (
                <tr key={key} className={hasChanged ? "bg-yellow-500/5" : ""}>
                  <td className="px-3 py-1.5 border-t font-medium text-muted-foreground">
                    {fieldLabels[key] || key}
                  </td>
                  {anterior && (
                    <td className={`px-3 py-1.5 border-t ${hasChanged ? "text-red-400 line-through" : ""}`}>
                      {formatValue(oldValue)}
                    </td>
                  )}
                  {novo && (
                    <td className={`px-3 py-1.5 border-t ${hasChanged ? "text-green-400 font-medium" : ""}`}>
                      {formatValue(newValue)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Alterações - {moduloLabel}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Database className="h-12 w-12 mb-4 opacity-50" />
              <p>Nenhum registro de alteração encontrado</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-lg ${getActionColor(log.acao)}`}>
                        {getActionIcon(log.acao)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="capitalize">
                            {log.acao}
                          </Badge>
                          <span className="text-sm font-medium">{log.descricao}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {log.user_nome}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>

                        {(log.dados_anteriores || log.dados_novos) && renderComparison(log)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
