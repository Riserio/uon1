import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  History, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  RefreshCw,
  Clock,
  FileSpreadsheet,
  Download,
  Upload,
  Trash2,
  ExternalLink,
  Github,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface CobrancaAutomacaoLogsProps {
  configId: string;
  corretoraId: string;
}

interface ExecucaoLog {
  id: string;
  config_id: string;
  corretora_id: string;
  status: string;
  mensagem: string | null;
  erro: string | null;
  registros_processados: number | null;
  registros_total: number | null;
  nome_arquivo: string | null;
  duracao_segundos: number | null;
  iniciado_por: string | null;
  created_at: string;
  finalizado_at: string | null;
  progresso_download: number | null;
  bytes_baixados: number | null;
  bytes_total: number | null;
  progresso_importacao: number | null;
  etapa_atual: string | null;
  github_run_id: string | null;
  github_run_url: string | null;
  tipo_disparo: string | null;
}

export default function CobrancaAutomacaoLogs({ configId, corretoraId }: CobrancaAutomacaoLogsProps) {
  const [logs, setLogs] = useState<ExecucaoLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (configId) {
      loadLogs();
      
      // Realtime subscription
      const channel = supabase
        .channel(`automacao-logs-${configId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'cobranca_automacao_execucoes',
            filter: `config_id=eq.${configId}`,
          },
          () => {
            loadLogs();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [configId]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cobranca_automacao_execucoes")
        .select("*")
        .eq("config_id", configId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error("Erro ao carregar logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    setDeletingId(logId);
    try {
      const { error } = await supabase
        .from("cobranca_automacao_execucoes")
        .delete()
        .eq("id", logId);

      if (error) throw error;
      toast.success("Registro excluído com sucesso");
      setLogs(prev => prev.filter(log => log.id !== logId));
    } catch (error: any) {
      console.error("Erro ao excluir log:", error);
      toast.error("Erro ao excluir: " + (error.message || "Erro desconhecido"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    try {
      // Deletar apenas logs que não estão em execução
      const idsToDelete = logs.filter(l => l.status !== 'executando').map(l => l.id);
      
      if (idsToDelete.length === 0) {
        toast.info("Não há registros para excluir");
        return;
      }

      const { error } = await supabase
        .from("cobranca_automacao_execucoes")
        .delete()
        .in("id", idsToDelete);

      if (error) throw error;
      toast.success(`${idsToDelete.length} registro(s) excluído(s)`);
      loadLogs();
    } catch (error: any) {
      console.error("Erro ao excluir logs:", error);
      toast.error("Erro ao excluir: " + (error.message || "Erro desconhecido"));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sucesso":
        return (
          <Badge className="bg-green-500/20 text-green-600 border-green-500/30 gap-1">
            <CheckCircle className="h-3 w-3" />
            Sucesso
          </Badge>
        );
      case "erro":
        return (
          <Badge className="bg-red-500/20 text-red-600 border-red-500/30 gap-1">
            <XCircle className="h-3 w-3" />
            Erro
          </Badge>
        );
      case "executando":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30 gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Executando
          </Badge>
        );
      case "parado":
      case "cancelled":
        return (
          <Badge className="bg-orange-500/20 text-orange-600 border-orange-500/30 gap-1">
            <AlertCircle className="h-3 w-3" />
            {status === 'cancelled' ? 'Cancelado' : 'Parado'}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status}
          </Badge>
        );
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getEtapaLabel = (etapa: string | null) => {
    const etapas: { [key: string]: string } = {
      'login': 'Fazendo login...',
      'filtros': 'Aplicando filtros...',
      'download': 'Baixando arquivo...',
      'processamento': 'Processando dados...',
      'importacao': 'Importando registros...',
    };
    return etapas[etapa || ''] || etapa || 'Iniciando...';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasNonExecutingLogs = logs.some(l => l.status !== 'executando');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-primary" />
            Histórico de Execuções
            {logs.length > 0 && (
              <Badge variant="secondary" className="ml-2">{logs.length}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasNonExecutingLogs && logs.length > 1 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Limpar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar histórico</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir todos os registros do histórico? Execuções em andamento não serão afetadas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Excluir tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="ghost" size="sm" onClick={loadLogs}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma execução registrada</p>
            <p className="text-sm mt-1">Execute a automação para ver o histórico aqui</p>
          </div>
        ) : (
          <ScrollArea className="h-[450px] pr-4">
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    log.status === "sucesso"
                      ? "bg-green-500/5 border-green-500/20 hover:bg-green-500/10"
                      : log.status === "erro"
                      ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                      : log.status === "executando"
                      ? "bg-yellow-500/5 border-yellow-500/20"
                      : log.status === "parado" || log.status === "cancelled"
                      ? "bg-orange-500/5 border-orange-500/20 hover:bg-orange-500/10"
                      : "bg-muted/30 hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Header: Status + Data */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {getStatusBadge(log.status)}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                        {log.tipo_disparo && (
                          <Badge variant="outline" className="text-xs">
                            {log.tipo_disparo === 'manual' ? 'Manual' : 'Agendado'}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Etapa atual para execuções em andamento */}
                      {log.status === "executando" && log.etapa_atual && (
                        <p className="text-sm text-yellow-600 mt-2 font-medium">
                          {getEtapaLabel(log.etapa_atual)}
                        </p>
                      )}

                      {/* Barra de progresso do download */}
                      {log.status === "executando" && (log.progresso_download !== null && log.progresso_download > 0 || log.bytes_baixados) && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1 text-blue-600">
                              <Download className="h-3 w-3" />
                              Download
                            </span>
                            <span className="text-muted-foreground">
                              {log.progresso_download !== null && log.progresso_download > 0 
                                ? `${log.progresso_download}%`
                                : ''
                              }
                              {log.bytes_baixados && log.bytes_total && log.bytes_total > 0
                                ? ` (${formatBytes(log.bytes_baixados)} / ${formatBytes(log.bytes_total)})`
                                : log.bytes_baixados 
                                  ? ` (${formatBytes(log.bytes_baixados)})`
                                  : ''
                              }
                            </span>
                          </div>
                          <Progress value={log.progresso_download || 0} className="h-1.5" />
                        </div>
                      )}

                      {/* Barra de progresso da importação */}
                      {log.status === "executando" && (log.progresso_importacao !== null && log.progresso_importacao > 0 || log.registros_processados) && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1 text-green-600">
                              <Upload className="h-3 w-3" />
                              Importação
                            </span>
                            <span className="text-muted-foreground">
                              {log.progresso_importacao !== null && log.progresso_importacao > 0 
                                ? `${log.progresso_importacao}%`
                                : ''
                              }
                              {log.registros_processados !== null && log.registros_total && log.registros_total > 0
                                ? ` (${log.registros_processados.toLocaleString('pt-BR')} / ${log.registros_total.toLocaleString('pt-BR')})`
                                : log.registros_processados 
                                  ? ` (${log.registros_processados.toLocaleString('pt-BR')} registros)`
                                  : ''
                              }
                            </span>
                          </div>
                          <Progress value={log.progresso_importacao || 0} className="h-1.5" />
                        </div>
                      )}

                      {/* Mensagem */}
                      {log.mensagem && log.status !== "executando" && (
                        <p className="text-sm mt-2 text-muted-foreground">{log.mensagem}</p>
                      )}
                      
                      {/* Erro */}
                      {log.erro && (
                        <p className="text-xs text-red-600 mt-2 font-mono bg-red-500/10 p-2 rounded max-h-20 overflow-y-auto">
                          {log.erro}
                        </p>
                      )}
                      
                      {/* Métricas finais para execuções concluídas */}
                      {log.status !== "executando" && (
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                          {log.registros_processados !== null && log.registros_processados > 0 && (
                            <span className="flex items-center gap-1">
                              <FileSpreadsheet className="h-3 w-3" />
                              {log.registros_processados.toLocaleString('pt-BR')} registros
                            </span>
                          )}
                          {log.bytes_total !== null && log.bytes_total > 0 && (
                            <span className="flex items-center gap-1">
                              <Download className="h-3 w-3" />
                              {formatBytes(log.bytes_total)}
                            </span>
                          )}
                          {log.duracao_segundos !== null && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(log.duracao_segundos)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Ações */}
                    <div className="flex items-center gap-1 shrink-0">
                      {log.github_run_url && (
                        <a
                          href={log.github_run_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ver no GitHub"
                        >
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Github className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                      
                      {log.status !== "executando" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              disabled={deletingId === log.id}
                            >
                              {deletingId === log.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir registro</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir este registro do histórico? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDeleteLog(log.id)} 
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
