import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { History, CheckCircle, XCircle, Loader2, Clock, FileSpreadsheet, ExternalLink, Trash2, Square, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MGFAutomacaoLogsProps {
  configId: string;
  corretoraId: string;
}

interface Execucao {
  id: string;
  status: string;
  etapa_atual: string | null;
  mensagem: string | null;
  erro: string | null;
  registros_processados: number | null;
  registros_total: number | null;
  nome_arquivo: string | null;
  progresso_download: number | null;
  progresso_importacao: number | null;
  duracao_segundos: number | null;
  tipo_disparo: string | null;
  github_run_id: string | null;
  github_run_url: string | null;
  created_at: string;
  finalizado_at: string | null;
}

const statusColors: Record<string, string> = {
  sucesso: "bg-green-100 text-green-800 border-green-200",
  erro: "bg-red-100 text-red-800 border-red-200",
  executando: "bg-yellow-100 text-yellow-800 border-yellow-200",
  parado: "bg-orange-100 text-orange-800 border-orange-200",
  pendente: "bg-gray-100 text-gray-800 border-gray-200",
};

const statusIcons: Record<string, React.ReactNode> = {
  sucesso: <CheckCircle className="h-4 w-4" />,
  erro: <XCircle className="h-4 w-4" />,
  executando: <Loader2 className="h-4 w-4 animate-spin" />,
  parado: <Square className="h-4 w-4" />,
  pendente: <Clock className="h-4 w-4" />,
};

export default function MGFAutomacaoLogs({ configId, corretoraId }: MGFAutomacaoLogsProps) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExecucoes();
    
    // Subscrição realtime
    const channel = supabase
      .channel(`mgf-execucoes-${configId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mgf_automacao_execucoes',
          filter: `config_id=eq.${configId}`,
        },
        () => {
          loadExecucoes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [configId]);

  const loadExecucoes = async () => {
    try {
      const { data, error } = await supabase
        .from("mgf_automacao_execucoes")
        .select("*")
        .eq("config_id", configId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setExecucoes(data || []);
    } catch (error) {
      console.error("Erro ao carregar execuções:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (execucaoId: string) => {
    try {
      const { error } = await supabase
        .from("mgf_automacao_execucoes")
        .delete()
        .eq("id", execucaoId);

      if (error) throw error;
      toast.success("Registro excluído");
      loadExecucoes();
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
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

  if (execucoes.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nenhuma execução registrada ainda.</p>
          <p className="text-sm">Clique em "Executar Agora" para iniciar.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <History className="h-4 w-4" />
          Últimas Execuções
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="space-y-3 p-4">
            {execucoes.map((exec) => (
              <Card
                key={exec.id}
                className={`border ${
                  exec.status === 'sucesso' ? 'border-green-200 bg-green-50/50' :
                  exec.status === 'erro' ? 'border-red-200 bg-red-50/50' :
                  exec.status === 'executando' ? 'border-yellow-200 bg-yellow-50/50' :
                  exec.status === 'parado' ? 'border-orange-200 bg-orange-50/50' :
                  'border-border'
                }`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={statusColors[exec.status] || statusColors.pendente}>
                          <span className="flex items-center gap-1">
                            {statusIcons[exec.status]}
                            {exec.status}
                          </span>
                        </Badge>
                        
                        {exec.tipo_disparo && (
                          <Badge variant="outline" className="text-xs">
                            {exec.tipo_disparo === 'manual' ? 'Manual' : 'Automático'}
                          </Badge>
                        )}
                        
                        {exec.etapa_atual && exec.status === 'executando' && (
                          <Badge variant="secondary" className="text-xs">
                            {exec.etapa_atual === 'aguardando_geracao' ? '⏳ Gerando relatório' : exec.etapa_atual}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Mensagem de progresso em tempo real */}
                      {exec.mensagem && exec.status === 'executando' && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                          <span className="animate-pulse">●</span>
                          {exec.mensagem}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(exec.created_at), { addSuffix: true, locale: ptBR })}
                        
                        {exec.duracao_segundos && (
                          <>
                            <span>•</span>
                            <span>{formatDuration(exec.duracao_segundos)}</span>
                          </>
                        )}
                      </div>
                      
                      {/* Progresso */}
                      {exec.status === 'executando' && (
                        <div className="mt-2 space-y-1">
                          {exec.progresso_download !== null && exec.progresso_download > 0 && exec.progresso_download < 100 && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span>Geração do relatório</span>
                                <span>{exec.progresso_download}%</span>
                              </div>
                              <Progress value={exec.progresso_download} className="h-1.5" />
                            </div>
                          )}
                          {exec.progresso_importacao !== null && exec.progresso_importacao > 0 && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span>Importação</span>
                                <span>{exec.progresso_importacao}%</span>
                              </div>
                              <Progress value={exec.progresso_importacao} className="h-1.5" />
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Registros */}
                      {exec.registros_total !== null && exec.registros_total > 0 && (
                        <div className="flex items-center gap-1 mt-2 text-xs">
                          <FileSpreadsheet className="h-3 w-3 text-orange-500" />
                          <span className="text-orange-700 font-medium">
                            {exec.registros_processados?.toLocaleString('pt-BR') || 0} / {exec.registros_total.toLocaleString('pt-BR')} registros
                          </span>
                        </div>
                      )}
                      
                      {/* Arquivo */}
                      {exec.nome_arquivo && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          📄 {exec.nome_arquivo}
                        </p>
                      )}
                      
                      {/* Erro */}
                      {exec.erro && (
                        <p className="text-xs text-red-600 mt-2 line-clamp-2">
                          ❌ {exec.erro}
                        </p>
                      )}
                    </div>
                    
                    {/* Ações */}
                    <div className="flex items-center gap-1 shrink-0">
                      {exec.github_run_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => window.open(exec.github_run_url!, '_blank')}
                          title="Ver no GitHub"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                      
                      {exec.status !== 'executando' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. O registro será removido permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(exec.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
