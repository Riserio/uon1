import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  CheckCircle, 
  XCircle, 
  Loader2, 
  RefreshCw,
  Clock,
  FileSpreadsheet,
  Download,
  Upload,
  Github,
  ExternalLink,
  Filter,
  ChevronDown,
  ChevronRight,
  Calendar
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CobrancaAutomacaoLogsProps {
  configId: string;
  corretoraId: string;
}

interface FiltrosAplicados {
  periodo_tipo?: string;
  data_inicio?: string;
  data_fim?: string;
  situacoes?: string[];
  boletos_anteriores?: string;
  referencia?: string;
  layout?: string;
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
  tipo_disparo: string | null;
  github_run_id: string | null;
  github_run_url: string | null;
  filtros_aplicados: FiltrosAplicados | null;
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
        .limit(10);

      if (error) throw error;
      // Cast filtros_aplicados to correct type
      const typedData = (data || []).map(item => ({
        ...item,
        filtros_aplicados: item.filtros_aplicados as FiltrosAplicados | null
      }));
      setLogs(typedData);
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
        return (
          <Badge className="bg-orange-500/20 text-orange-600 border-orange-500/30 gap-1">
            <XCircle className="h-3 w-3" />
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
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma execução registrada</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <span className="text-xs text-muted-foreground">
            {logs.length} execução(ões) recente(s)
          </span>
          <Button variant="ghost" size="sm" onClick={loadLogs} className="h-7 w-7 p-0">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        
        <ScrollArea className="h-[350px]">
          <div className="divide-y">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`p-3 transition-colors ${
                  log.status === "executando" ? "bg-yellow-500/5" : ""
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(log.status)}
                    {log.tipo_disparo === 'github_actions' && (
                      <Badge variant="outline" className="gap-1 text-xs h-5">
                        <Github className="h-3 w-3" />
                        GitHub
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3" />
                    {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                
                {/* Etapa atual para execuções em andamento */}
                {log.status === "executando" && log.etapa_atual && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {getEtapaLabel(log.etapa_atual)}
                  </p>
                )}

                {/* Barra de progresso do download */}
                {log.status === "executando" && (log.progresso_download !== null && log.progresso_download > 0 || log.bytes_baixados) && (
                  <div className="mb-2 space-y-1">
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
                        {log.bytes_baixados 
                          ? ` (${formatBytes(log.bytes_baixados)})`
                          : ''
                        }
                      </span>
                    </div>
                    <Progress 
                      value={log.progresso_download || 0} 
                      className="h-1.5"
                    />
                  </div>
                )}

                {/* Barra de progresso da importação */}
                {log.status === "executando" && (log.progresso_importacao !== null && log.progresso_importacao > 0 || log.registros_processados) && (
                  <div className="mb-2 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-green-600">
                        <Upload className="h-3 w-3" />
                        Importação
                      </span>
                      <span className="text-muted-foreground">
                        {log.registros_processados !== null 
                          ? `${log.registros_processados.toLocaleString('pt-BR')} registros`
                          : ''
                        }
                      </span>
                    </div>
                    <Progress 
                      value={log.progresso_importacao || 0} 
                      className="h-1.5"
                    />
                  </div>
                )}

                {log.mensagem && (
                  <p className="text-sm mb-2">{log.mensagem}</p>
                )}
                
                {log.erro && (
                  <p className="text-xs text-red-600 mb-2 font-mono bg-red-500/10 p-2 rounded">
                    {log.erro}
                  </p>
                )}

                {/* Filtros aplicados (collapsible) */}
                {log.filtros_aplicados && Object.keys(log.filtros_aplicados).length > 0 && (
                  <Collapsible className="mt-2">
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group w-full">
                      <Filter className="h-3 w-3" />
                      <span>Filtros aplicados</span>
                      <ChevronRight className="h-3 w-3 ml-auto group-data-[state=open]:hidden" />
                      <ChevronDown className="h-3 w-3 ml-auto hidden group-data-[state=open]:block" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <div className="text-xs bg-muted/50 rounded-lg p-2.5 space-y-1">
                        {log.filtros_aplicados.periodo_tipo && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">Período:</span>
                            <span className="font-medium">
                              {log.filtros_aplicados.periodo_tipo === 'mes_atual' 
                                ? 'Mês atual' 
                                : `${log.filtros_aplicados.data_inicio || '?'} - ${log.filtros_aplicados.data_fim || '?'}`
                              }
                            </span>
                          </div>
                        )}
                        {log.filtros_aplicados.situacoes && log.filtros_aplicados.situacoes.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {log.filtros_aplicados.situacoes.map(sit => (
                              <Badge key={sit} variant="secondary" className="text-[10px] h-4 px-1.5">
                                {sit}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-4">
                          {log.filtros_aplicados.boletos_anteriores && (
                            <span>
                              <span className="text-muted-foreground">Boletos: </span>
                              <span className="font-medium">
                                {log.filtros_aplicados.boletos_anteriores === 'nao_possui' 
                                  ? 'Não possui' 
                                  : log.filtros_aplicados.boletos_anteriores === 'possui'
                                    ? 'Possui'
                                    : 'Todos'
                                }
                              </span>
                            </span>
                          )}
                          {log.filtros_aplicados.referencia && (
                            <span>
                              <span className="text-muted-foreground">Ref: </span>
                              <span className="font-medium">
                                {log.filtros_aplicados.referencia === 'vencimento_original' 
                                  ? 'Venc. Original' 
                                  : 'Data Pagto.'
                                }
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
                
                {/* Métricas finais para execuções concluídas */}
                {log.status !== "executando" && (
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2 pt-2 border-t border-dashed">
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
                    {log.github_run_url && (
                      <a 
                        href={log.github_run_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:underline ml-auto"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver no GitHub
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
