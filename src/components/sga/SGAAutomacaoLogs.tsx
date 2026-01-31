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
  Github,
  StopCircle,
  Square,
} from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface SGAAutomacaoLogsProps {
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

// Função para detectar execuções órfãs
const isOrphanExecution = (log: ExecucaoLog): boolean => {
  if (log.status !== 'executando') return false;
  if (log.finalizado_at) return false;
  
  const minutesElapsed = differenceInMinutes(new Date(), new Date(log.created_at));
  return minutesElapsed > 70;
};

const getRealStatus = (log: ExecucaoLog): string => {
  if (isOrphanExecution(log)) {
    return 'erro';
  }
  return log.status;
};

const isGitHubError = (log: ExecucaoLog): boolean => {
  const erro = log.erro?.toLowerCase() || '';
  return erro.includes('github') || 
         erro.includes('workflow') || 
         erro.includes('dispatch') ||
         (log.etapa_atual === 'disparo' && log.status === 'erro');
};

export default function SGAAutomacaoLogs({ configId, corretoraId }: SGAAutomacaoLogsProps) {
  const [logs, setLogs] = useState<ExecucaoLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  useEffect(() => {
    if (configId) {
      loadLogs();
      
      const channel = supabase
        .channel(`sga-automacao-logs-${configId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'sga_automacao_execucoes',
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
        .from("sga_automacao_execucoes")
        .select("*")
        .eq("config_id", configId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      
      const orphanLogs = (data || []).filter(isOrphanExecution);
      if (orphanLogs.length > 0) {
        await Promise.all(orphanLogs.map(async (log) => {
          await supabase
            .from("sga_automacao_execucoes")
            .update({
              status: 'erro',
              erro: 'Execução não finalizada - timeout ou falha de comunicação',
              finalizado_at: new Date().toISOString(),
            })
            .eq("id", log.id);
        }));
        const { data: refreshedData } = await supabase
          .from("sga_automacao_execucoes")
          .select("*")
          .eq("config_id", configId)
          .order("created_at", { ascending: false })
          .limit(20);
        setLogs(refreshedData || []);
      } else {
        setLogs(data || []);
      }
    } catch (error) {
      console.error("Erro ao carregar logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStopExecution = async (log: ExecucaoLog) => {
    if (!log.id) return;

    setStoppingId(log.id);
    try {
      if (log.github_run_id) {
        const { data: cancelData, error: cancelError } = await supabase.functions.invoke('disparar-sga-workflow', {
          body: { action: 'cancel', run_id: log.github_run_id }
        });
        
        if (cancelError) {
          console.warn("Erro ao cancelar no GitHub:", cancelError);
        } else if (cancelData?.success) {
          console.log("Solicitação de cancelamento enviada ao GitHub");
        }
      }

      const { error: updateError } = await supabase
        .from("sga_automacao_execucoes")
        .update({
          status: 'parado',
          erro: 'Execução interrompida pelo usuário',
          finalizado_at: new Date().toISOString(),
        })
        .eq("id", log.id);

      if (updateError) throw updateError;

      await supabase
        .from("sga_automacao_config")
        .update({
          ultimo_status: 'parado',
          ultimo_erro: 'Execução interrompida pelo usuário',
        })
        .eq("id", configId);

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("bi_audit_logs").insert({
        modulo: "sga_insights",
        acao: "execucao_parada",
        descricao: `Execução da automação SGA Hinova interrompida`,
        corretora_id: corretoraId,
        user_id: user?.id || '',
        user_nome: user?.email || "Usuário",
        dados_novos: {
          execucao_id: log.id,
          github_run_id: log.github_run_id,
          motivo: 'Interrupção manual pelo usuário',
        },
      });

      toast.success("Execução interrompida com sucesso");
      loadLogs();
    } catch (error: any) {
      console.error("Erro ao parar execução:", error);
      toast.error("Erro ao parar: " + (error.message || "Erro desconhecido"));
    } finally {
      setStoppingId(null);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    setDeletingId(logId);
    try {
      const { error } = await supabase
        .from("sga_automacao_execucoes")
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
      const idsToDelete = logs.filter(l => l.status !== 'executando').map(l => l.id);
      
      if (idsToDelete.length === 0) {
        toast.info("Não há registros para excluir");
        return;
      }

      const { error } = await supabase
        .from("sga_automacao_execucoes")
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

  const getStatusBadge = (log: ExecucaoLog) => {
    const status = getRealStatus(log);
    const isGitError = isGitHubError(log);
    
    switch (status) {
      case "sucesso":
        return (
          <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 gap-1 text-xs">
            <CheckCircle className="h-3 w-3" />
            Concluído
          </Badge>
        );
      case "erro":
        return (
          <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30 gap-1 text-xs">
            {isGitError ? <Github className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {isGitError ? 'Erro GitHub' : 'Erro'}
          </Badge>
        );
      case "executando":
        return (
          <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30 gap-1 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            Em execução
          </Badge>
        );
      case "parado":
      case "cancelled":
        return (
          <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30 gap-1 text-xs">
            <StopCircle className="h-3 w-3" />
            Cancelado
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
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
      'disparo': 'Disparando workflow...',
      'login': 'Fazendo login...',
      'filtros': 'Aplicando filtros...',
      'campos': 'Selecionando campos...',
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
          <ScrollArea className="h-[400px] pr-2">
            <div className="space-y-2">
              {logs.map((log) => {
                const realStatus = getRealStatus(log);
                const isRunning = realStatus === 'executando';
                const isGitError = isGitHubError(log);
                
                return (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg border transition-all ${
                      realStatus === "sucesso"
                        ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
                        : realStatus === "erro"
                        ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
                        : realStatus === "executando"
                        ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900"
                        : realStatus === "parado" || realStatus === "cancelled"
                        ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900"
                        : "bg-muted/30 border-border"
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                        {getStatusBadge(log)}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                        {log.tipo_disparo && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {log.tipo_disparo === 'manual' ? 'Manual' : 'Agendado'}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        {log.github_run_url && (
                          <a
                            href={log.github_run_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver no GitHub"
                          >
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <Github className="h-3 w-3" />
                            </Button>
                          </a>
                        )}

                        {isRunning && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                                disabled={stoppingId === log.id}
                                title="Parar execução"
                              >
                                {stoppingId === log.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Square className="h-3 w-3" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Parar execução</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja interromper esta execução? O workflow será cancelado no GitHub.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleStopExecution(log)} className="bg-orange-600 hover:bg-orange-700">
                                  Parar Execução
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}

                        {!isRunning && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                disabled={deletingId === log.id}
                              >
                                {deletingId === log.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir registro</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir este registro do histórico?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteLog(log.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>

                    {/* Progresso para execuções em andamento */}
                    {isRunning && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{getEtapaLabel(log.etapa_atual)}</span>
                        </div>
                        
                        {log.progresso_download !== null && log.progresso_download > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1">
                                <Download className="h-3 w-3" />
                                Download
                              </span>
                              <span>{log.progresso_download}%</span>
                            </div>
                            <Progress value={log.progresso_download} className="h-1.5" />
                            {log.bytes_baixados !== null && log.bytes_total !== null && (
                              <span className="text-[10px] text-muted-foreground">
                                {formatBytes(log.bytes_baixados)} / {formatBytes(log.bytes_total)}
                              </span>
                            )}
                          </div>
                        )}
                        
                        {log.progresso_importacao !== null && log.progresso_importacao > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1">
                                <Upload className="h-3 w-3" />
                                Importação
                              </span>
                              <span>{log.progresso_importacao}%</span>
                            </div>
                            <Progress value={log.progresso_importacao} className="h-1.5" />
                            {log.registros_processados !== null && log.registros_total !== null && (
                              <span className="text-[10px] text-muted-foreground">
                                {log.registros_processados.toLocaleString('pt-BR')} / {log.registros_total.toLocaleString('pt-BR')} registros
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Detalhes para execuções concluídas */}
                    {!isRunning && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {log.duracao_segundos && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(log.duracao_segundos)}
                          </span>
                        )}
                        {log.registros_processados !== null && (
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <FileSpreadsheet className="h-3 w-3" />
                            {log.registros_processados.toLocaleString('pt-BR')} registros
                          </span>
                        )}
                        {log.nome_arquivo && (
                          <span className="truncate max-w-[200px]" title={log.nome_arquivo}>
                            {log.nome_arquivo}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Mensagem de erro */}
                    {log.erro && realStatus === 'erro' && (
                      <div className="mt-2 p-2 bg-red-100 dark:bg-red-950/50 rounded text-xs text-red-700 dark:text-red-400">
                        {log.erro}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
