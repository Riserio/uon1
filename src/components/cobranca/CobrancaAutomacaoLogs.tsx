import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { 
  History, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  RefreshCw,
  Clock,
  FileSpreadsheet,
  Download,
  Upload
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
}

export default function CobrancaAutomacaoLogs({ configId, corretoraId }: CobrancaAutomacaoLogsProps) {
  const [logs, setLogs] = useState<ExecucaoLog[]>([]);
  const [loading, setLoading] = useState(true);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sucesso":
        return (
          <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
            <CheckCircle className="h-3 w-3 mr-1" />
            Sucesso
          </Badge>
        );
      case "erro":
        return (
          <Badge className="bg-red-500/20 text-red-600 border-red-500/30">
            <XCircle className="h-3 w-3 mr-1" />
            Erro
          </Badge>
        );
      case "executando":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Executando
          </Badge>
        );
      case "parado":
        return (
          <Badge className="bg-orange-500/20 text-orange-600 border-orange-500/30">
            <XCircle className="h-3 w-3 mr-1" />
            Parado
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
      'login': 'Login',
      'filtros': 'Aplicando filtros',
      'download': 'Baixando arquivo',
      'processamento': 'Processando dados',
      'importacao': 'Importando registros',
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-primary" />
            Histórico de Execuções
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadLogs}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma execução registrada</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-4 rounded-lg border ${
                    log.status === "sucesso"
                      ? "bg-green-500/5 border-green-500/20"
                      : log.status === "erro"
                      ? "bg-red-500/5 border-red-500/20"
                      : log.status === "executando"
                      ? "bg-yellow-500/5 border-yellow-500/20"
                      : log.status === "parado"
                      ? "bg-orange-500/5 border-orange-500/20"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {getStatusBadge(log.status)}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      
                      {/* Etapa atual para execuções em andamento */}
                      {log.status === "executando" && log.etapa_atual && (
                        <p className="text-sm text-muted-foreground mb-3">
                          {getEtapaLabel(log.etapa_atual)}
                        </p>
                      )}

                      {/* Barra de progresso do download */}
                      {log.status === "executando" && (log.progresso_download !== null && log.progresso_download > 0 || log.bytes_baixados) && (
                        <div className="mb-3 space-y-1">
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
                          <Progress 
                            value={log.progresso_download || 0} 
                            className="h-2"
                          />
                        </div>
                      )}

                      {/* Barra de progresso da importação */}
                      {log.status === "executando" && (log.progresso_importacao !== null && log.progresso_importacao > 0 || log.registros_processados) && (
                        <div className="mb-3 space-y-1">
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
                                ? ` (${log.registros_processados.toLocaleString('pt-BR')} / ${log.registros_total.toLocaleString('pt-BR')} registros)`
                                : log.registros_processados 
                                  ? ` (${log.registros_processados.toLocaleString('pt-BR')} registros)`
                                  : ''
                              }
                            </span>
                          </div>
                          <Progress 
                            value={log.progresso_importacao || 0} 
                            className="h-2"
                          />
                        </div>
                      )}

                      {log.mensagem && (
                        <p className="text-sm mb-2">{log.mensagem}</p>
                      )}
                      
                      {log.erro && (
                        <p className="text-sm text-red-600 mb-2 font-mono text-xs bg-red-500/10 p-2 rounded">
                          {log.erro}
                        </p>
                      )}
                      
                      {/* Métricas finais para execuções concluídas */}
                      {log.status !== "executando" && (
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
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
                          {log.nome_arquivo && (
                            <span className="flex items-center gap-1 truncate max-w-[200px]">
                              <FileSpreadsheet className="h-3 w-3" />
                              {log.nome_arquivo}
                            </span>
                          )}
                        </div>
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
