import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  GitBranch, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  Play,
  AlertTriangle,
  PauseCircle,
  History,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SyncConfig {
  id: string;
  ativo: boolean;
  corretora_id: string;
  corretora_nome: string;
  hinova_url: string;
  ultima_execucao: string | null;
  ultimo_status: string | null;
  ultimo_erro: string | null;
}

interface ExecutionLog {
  id: string;
  config_id: string;
  corretora_id: string;
  status: string;
  erro: string | null;
  mensagem: string | null;
  created_at: string;
  finalizado_at: string | null;
  registros_processados: number | null;
  registros_total: number | null;
  nome_arquivo: string | null;
  github_run_id: string | null;
  github_run_url: string | null;
  etapa_atual: string | null;
}

export function GitHubSyncPanel() {
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [expandedConfigId, setExpandedConfigId] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<{ [key: string]: ExecutionLog[] }>({});
  const [loadingLogs, setLoadingLogs] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("cobranca_automacao_config")
        .select(`
          id,
          ativo,
          corretora_id,
          hinova_url,
          ultima_execucao,
          ultimo_status,
          ultimo_erro,
          corretoras!cobranca_automacao_config_corretora_id_fkey(nome)
        `)
        .order("corretoras(nome)");

      if (error) throw error;

      const formatted = (data || []).map((item: any) => ({
        id: item.id,
        ativo: item.ativo,
        corretora_id: item.corretora_id,
        corretora_nome: item.corretoras?.nome || "Desconhecida",
        hinova_url: item.hinova_url,
        ultima_execucao: item.ultima_execucao,
        ultimo_status: item.ultimo_status,
        ultimo_erro: item.ultimo_erro,
      }));

      setConfigs(formatted);
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
      toast.error("Erro ao carregar configurações de sincronização");
    } finally {
      setLoading(false);
    }
  };

  const loadExecutionLogs = async (configId: string) => {
    try {
      setLoadingLogs((prev) => ({ ...prev, [configId]: true }));
      
      const { data, error } = await supabase
        .from("cobranca_automacao_execucoes")
        .select("*")
        .eq("config_id", configId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      setExecutionLogs((prev) => ({ ...prev, [configId]: data || [] }));
    } catch (error) {
      console.error("Erro ao carregar logs:", error);
      toast.error("Erro ao carregar histórico de execuções");
    } finally {
      setLoadingLogs((prev) => ({ ...prev, [configId]: false }));
    }
  };

  const handleToggleExpand = (configId: string) => {
    if (expandedConfigId === configId) {
      setExpandedConfigId(null);
    } else {
      setExpandedConfigId(configId);
      if (!executionLogs[configId]) {
        loadExecutionLogs(configId);
      }
    }
  };

  const handleToggleAtivo = async (id: string, currentAtivo: boolean) => {
    try {
      const { error } = await supabase
        .from("cobranca_automacao_config")
        .update({ ativo: !currentAtivo })
        .eq("id", id);

      if (error) throw error;
      toast.success(`Sincronização ${!currentAtivo ? "ativada" : "desativada"}`);
      loadConfigs();
    } catch (error) {
      console.error("Erro ao alterar status:", error);
      toast.error("Erro ao alterar status");
    }
  };

  const handleExecutar = async (config: SyncConfig) => {
    setExecutingId(config.id);
    
    // Atualizar imediatamente o status local para "executando"
    setConfigs((prev) =>
      prev.map((c) =>
        c.id === config.id ? { ...c, ultimo_status: "executando", ultimo_erro: null } : c
      )
    );
    
    try {
      const { data, error } = await supabase.functions.invoke("disparar-github-workflow", {
        body: {
          action: "dispatch",
          corretora_id: config.corretora_id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Sincronização iniciada com sucesso!");
        // Recarregar logs se estiver expandido
        if (expandedConfigId === config.id) {
          loadExecutionLogs(config.id);
        }
      } else {
        toast.error(data?.message || "Erro ao iniciar sincronização");
        // Reverter status local em caso de erro
        loadConfigs();
      }
    } catch (error: any) {
      console.error("Erro ao executar:", error);
      toast.error(error.message || "Erro ao iniciar sincronização");
      // Reverter status local em caso de erro
      loadConfigs();
    } finally {
      setExecutingId(null);
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) {
      return <Badge variant="secondary">Nunca executado</Badge>;
    }

    switch (status) {
      case "sucesso":
        return (
          <Badge className="bg-green-500 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Sucesso
          </Badge>
        );
      case "erro":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Erro
          </Badge>
        );
      case "executando":
        return (
          <Badge className="bg-blue-500 text-white">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Executando
          </Badge>
        );
      case "parado":
        return (
          <Badge variant="outline">
            <PauseCircle className="h-3 w-3 mr-1" />
            Parado
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getLogStatusColor = (status: string) => {
    switch (status) {
      case "sucesso":
        return "border-l-green-500 bg-green-50 dark:bg-green-900/20";
      case "erro":
        return "border-l-red-500 bg-red-50 dark:bg-red-900/20";
      case "executando":
        return "border-l-blue-500 bg-blue-50 dark:bg-blue-900/20";
      case "parado":
        return "border-l-orange-500 bg-orange-50 dark:bg-orange-900/20";
      default:
        return "border-l-gray-500 bg-gray-50 dark:bg-gray-900/20";
    }
  };

  const activeConfigs = configs.filter(c => c.ativo);
  const inactiveConfigs = configs.filter(c => !c.ativo);
  const withSuccess = configs.filter(c => c.ultimo_status === "sucesso");
  const withErrors = configs.filter(c => c.ultimo_status === "erro");
  const executing = configs.filter(c => c.ultimo_status === "executando");

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Sincronização GitHub
            </CardTitle>
            <CardDescription>
              Associações configuradas para sincronização automática de cobrança
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadConfigs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mt-4">
          {executing.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center border-2 border-blue-300 animate-pulse">
              <p className="text-2xl font-bold text-blue-600">{executing.length}</p>
              <p className="text-xs text-muted-foreground">Em Execução</p>
            </div>
          )}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{withSuccess.length}</p>
            <p className="text-xs text-muted-foreground">Sucesso</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-slate-600">{activeConfigs.length}</p>
            <p className="text-xs text-muted-foreground">Ativas</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-600">{inactiveConfigs.length}</p>
            <p className="text-xs text-muted-foreground">Inativas</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{withErrors.length}</p>
            <p className="text-xs text-muted-foreground">Com Erro</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : configs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma associação configurada para sincronização.
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {configs.map((config) => (
              <Collapsible
                key={config.id}
                open={expandedConfigId === config.id}
                onOpenChange={() => handleToggleExpand(config.id)}
              >
                <div
                  className={`border rounded-lg transition-colors ${
                    config.ativo ? "bg-card" : "bg-muted/50"
                  }`}
                >
                  {/* Main Row */}
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <Switch
                        checked={config.ativo}
                        onCheckedChange={() => handleToggleAtivo(config.id, config.ativo)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">{config.corretora_nome}</p>
                          {getStatusBadge(config.ultimo_status)}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {config.hinova_url}
                        </p>
                        {config.ultima_execucao && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" />
                            Última execução:{" "}
                            {format(new Date(config.ultima_execucao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                        )}
                        {config.ultimo_status === "erro" && config.ultimo_erro && (
                          <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3" />
                            {config.ultimo_erro}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <History className="h-4 w-4 mr-1" />
                          Histórico
                          {expandedConfigId === config.id ? (
                            <ChevronUp className="h-4 w-4 ml-1" />
                          ) : (
                            <ChevronDown className="h-4 w-4 ml-1" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExecutar(config)}
                        disabled={!config.ativo || executingId === config.id || config.ultimo_status === "executando"}
                      >
                        {executingId === config.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        <span className="ml-1 hidden sm:inline">Executar</span>
                      </Button>
                    </div>
                  </div>

                  {/* Execution History */}
                  <CollapsibleContent>
                    <div className="border-t px-4 py-3 bg-muted/30">
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Histórico de Execuções
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadExecutionLogs(config.id)}
                          disabled={loadingLogs[config.id]}
                        >
                          <RefreshCw className={`h-3 w-3 ${loadingLogs[config.id] ? "animate-spin" : ""}`} />
                        </Button>
                      </h4>
                      
                      {loadingLogs[config.id] ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : !executionLogs[config.id] || executionLogs[config.id].length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhuma execução registrada
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                          {executionLogs[config.id].map((log) => (
                            <div
                              key={log.id}
                              className={`p-3 rounded border-l-4 ${getLogStatusColor(log.status)}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {getStatusBadge(log.status)}
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                    </span>
                                  </div>
                                  
                                  {log.etapa_atual && log.status === "executando" && (
                                    <p className="text-xs text-blue-600 mt-1">
                                      Etapa: {log.etapa_atual}
                                    </p>
                                  )}
                                  
                                  {log.status === "sucesso" && (
                                    <div className="text-xs text-green-700 mt-1">
                                      {log.registros_processados !== null && (
                                        <span>✓ {log.registros_processados} registros processados</span>
                                      )}
                                      {log.nome_arquivo && (
                                        <span className="ml-2">• {log.nome_arquivo}</span>
                                      )}
                                    </div>
                                  )}
                                  
                                  {log.status === "erro" && log.erro && (
                                    <p className="text-xs text-red-600 mt-1">
                                      {log.erro}
                                    </p>
                                  )}
                                  
                                  {log.finalizado_at && log.status !== "executando" && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Finalizado: {format(new Date(log.finalizado_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                    </p>
                                  )}
                                </div>
                                
                                {log.github_run_url && (
                                  <a
                                    href={log.github_run_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    GitHub
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
