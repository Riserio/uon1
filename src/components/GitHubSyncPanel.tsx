import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ExternalLink,
  Wallet,
  Calendar,
  DollarSign
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getNextDailyRunBrasilia, cronUTCLabel, countdown } from "@/lib/cobrancaSchedule";

interface SyncConfig {
  id: string;
  ativo: boolean;
  corretora_id: string;
  corretora_nome: string;
  hinova_url: string;
  hora_agendada: string | null;
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

type RobotType = "cobranca" | "eventos" | "mgf";

export function GitHubSyncPanel() {
  const [activeTab, setActiveTab] = useState<RobotType>("cobranca");
  
  // Cobrança state
  const [cobrancaConfigs, setCobrancaConfigs] = useState<SyncConfig[]>([]);
  const [cobrancaLoading, setCobrancaLoading] = useState(true);
  const [cobrancaPendingCount, setCobrancaPendingCount] = useState(0);
  
  // Eventos state
  const [eventosConfigs, setEventosConfigs] = useState<SyncConfig[]>([]);
  const [eventosLoading, setEventosLoading] = useState(true);
  const [eventosPendingCount, setEventosPendingCount] = useState(0);
  
  // MGF state
  const [mgfConfigs, setMgfConfigs] = useState<SyncConfig[]>([]);
  const [mgfLoading, setMgfLoading] = useState(true);
  const [mgfPendingCount, setMgfPendingCount] = useState(0);
  
  // Shared state
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [expandedConfigId, setExpandedConfigId] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<{ [key: string]: ExecutionLog[] }>({});
  const [loadingLogs, setLoadingLogs] = useState<{ [key: string]: boolean }>({});
  const [executingPending, setExecutingPending] = useState(false);
  const [executingAllPending, setExecutingAllPending] = useState(false);

  // Carregar dados iniciais (uma vez)
  useEffect(() => {
    loadCobrancaConfigs();
    loadEventosConfigs();
    loadMgfConfigs();
  }, []);

  // Subscrever a mudanças em tempo real (sem recarregar configs inteiros a cada evento)
  useEffect(() => {
    const cobrancaChannel = supabase
      .channel('cobranca-automacao-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cobranca_automacao_execucoes' },
        () => {
          loadCobrancaConfigs();
          if (expandedConfigId && activeTab === "cobranca") {
            loadExecutionLogs(expandedConfigId, "cobranca");
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cobranca_automacao_config' },
        () => loadCobrancaConfigs()
      )
      .subscribe();

    const eventosChannel = supabase
      .channel('eventos-automacao-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sga_automacao_execucoes' },
        () => {
          loadEventosConfigs();
          if (expandedConfigId && activeTab === "eventos") {
            loadExecutionLogs(expandedConfigId, "eventos");
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sga_automacao_config' },
        () => loadEventosConfigs()
      )
      .subscribe();

    const mgfChannel = supabase
      .channel('mgf-automacao-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mgf_automacao_execucoes' },
        () => {
          loadMgfConfigs();
          if (expandedConfigId && activeTab === "mgf") {
            loadExecutionLogs(expandedConfigId, "mgf");
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mgf_automacao_config' },
        () => loadMgfConfigs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(cobrancaChannel);
      supabase.removeChannel(eventosChannel);
      supabase.removeChannel(mgfChannel);
    };
  }, [expandedConfigId, activeTab]);

  // Recuperação automática de execuções órfãs (stuck > 70 min)
  const recoverOrphanExecutions = async (type: RobotType) => {
    const tableName = type === "cobranca" 
      ? "cobranca_automacao_execucoes" 
      : type === "eventos" 
        ? "sga_automacao_execucoes" 
        : "mgf_automacao_execucoes";
    
    try {
      const cutoff = new Date(Date.now() - 70 * 60 * 1000).toISOString();
      const { data: orphans } = await supabase
        .from(tableName)
        .select("id")
        .eq("status", "executando")
        .lt("created_at", cutoff);
      
      if (orphans && orphans.length > 0) {
        for (const orphan of orphans) {
          await supabase
            .from(tableName)
            .update({ 
              status: "erro", 
              erro: "Timeout: execução não respondeu em 70 minutos",
              finalizado_at: new Date().toISOString()
            })
            .eq("id", orphan.id);
        }
        console.log(`[Sync] Recuperadas ${orphans.length} execuções órfãs em ${type}`);
      }
    } catch (e) {
      console.error("Erro ao recuperar órfãos:", e);
    }
  };

  const loadCobrancaConfigs = async () => {
    try {
      await recoverOrphanExecutions("cobranca");
      setCobrancaLoading(true);
      const { data, error } = await supabase
        .from("cobranca_automacao_config")
        .select(`
          id, ativo, corretora_id, hinova_url, hora_agendada,
          ultima_execucao, ultimo_status, ultimo_erro,
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
        hora_agendada: item.hora_agendada ?? "09:00:00",
        ultima_execucao: item.ultima_execucao,
        ultimo_status: item.ultimo_status,
        ultimo_erro: item.ultimo_erro,
      }));

      setCobrancaConfigs(formatted);
      await checkPendingExecutions(formatted, "cobranca");
    } catch (error) {
      console.error("Erro ao carregar configurações de cobrança:", error);
      toast.error("Erro ao carregar configurações de cobrança");
    } finally {
      setCobrancaLoading(false);
    }
  };

  const loadEventosConfigs = async () => {
    try {
      await recoverOrphanExecutions("eventos");
      setEventosLoading(true);
      const { data, error } = await supabase
        .from("sga_automacao_config")
        .select(`
          id, ativo, corretora_id, hinova_url, hora_agendada,
          ultima_execucao, ultimo_status, ultimo_erro,
          corretoras!sga_automacao_config_corretora_id_fkey(nome)
        `)
        .order("corretoras(nome)");

      if (error) throw error;

      const formatted = (data || []).map((item: any) => ({
        id: item.id,
        ativo: item.ativo,
        corretora_id: item.corretora_id,
        corretora_nome: item.corretoras?.nome || "Desconhecida",
        hinova_url: item.hinova_url,
        hora_agendada: item.hora_agendada ?? "09:00:00",
        ultima_execucao: item.ultima_execucao,
        ultimo_status: item.ultimo_status,
        ultimo_erro: item.ultimo_erro,
      }));

      setEventosConfigs(formatted);
      await checkPendingExecutions(formatted, "eventos");
    } catch (error) {
      console.error("Erro ao carregar configurações de eventos:", error);
      toast.error("Erro ao carregar configurações de eventos");
    } finally {
      setEventosLoading(false);
    }
  };

  const loadMgfConfigs = async () => {
    try {
      await recoverOrphanExecutions("mgf");
      setMgfLoading(true);
      const { data, error } = await supabase
        .from("mgf_automacao_config")
        .select(`
          id, ativo, corretora_id, hinova_url, hora_agendada,
          ultima_execucao, ultimo_status, ultimo_erro,
          corretoras!mgf_automacao_config_corretora_id_fkey(nome)
        `)
        .order("corretoras(nome)");

      if (error) throw error;

      const formatted = (data || []).map((item: any) => ({
        id: item.id,
        ativo: item.ativo,
        corretora_id: item.corretora_id,
        corretora_nome: item.corretoras?.nome || "Desconhecida",
        hinova_url: item.hinova_url,
        hora_agendada: item.hora_agendada ?? "09:00:00",
        ultima_execucao: item.ultima_execucao,
        ultimo_status: item.ultimo_status,
        ultimo_erro: item.ultimo_erro,
      }));

      setMgfConfigs(formatted);
      await checkPendingExecutions(formatted, "mgf");
    } catch (error) {
      console.error("Erro ao carregar configurações de MGF:", error);
      toast.error("Erro ao carregar configurações de MGF");
    } finally {
      setMgfLoading(false);
    }
  };

  const checkPendingExecutions = async (configList: SyncConfig[], type: RobotType) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const activeConfigIds = configList.filter(c => c.ativo).map(c => c.id);
      
      if (activeConfigIds.length === 0) {
        if (type === "cobranca") setCobrancaPendingCount(0);
        else if (type === "eventos") setEventosPendingCount(0);
        else setMgfPendingCount(0);
        return;
      }

      const tableName = type === "cobranca" 
        ? "cobranca_automacao_execucoes" 
        : type === "eventos" 
          ? "sga_automacao_execucoes" 
          : "mgf_automacao_execucoes";
      
      const { data: todayExecutions } = await supabase
        .from(tableName)
        .select("config_id, status")
        .in("config_id", activeConfigIds)
        .gte("created_at", `${today}T00:00:00`)
        .in("status", ["sucesso", "executando"]);

      const executedConfigIds = new Set((todayExecutions || []).map(e => e.config_id));
      const pending = activeConfigIds.filter(id => !executedConfigIds.has(id));
      
      if (type === "cobranca") setCobrancaPendingCount(pending.length);
      else if (type === "eventos") setEventosPendingCount(pending.length);
      else setMgfPendingCount(pending.length);
    } catch (error) {
      console.error("Erro ao verificar pendentes:", error);
    }
  };

  const loadExecutionLogs = async (configId: string, type: RobotType) => {
    try {
      setLoadingLogs((prev) => ({ ...prev, [configId]: true }));
      
      const tableName = type === "cobranca" 
        ? "cobranca_automacao_execucoes" 
        : type === "eventos" 
          ? "sga_automacao_execucoes" 
          : "mgf_automacao_execucoes";
      
      const { data, error } = await supabase
        .from(tableName)
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

  const handleToggleExpand = (configId: string, type: RobotType) => {
    if (expandedConfigId === configId) {
      setExpandedConfigId(null);
    } else {
      setExpandedConfigId(configId);
      loadExecutionLogs(configId, type);
    }
  };

  const handleToggleAtivo = async (id: string, currentAtivo: boolean, type: RobotType) => {
    const tableName = type === "cobranca" 
      ? "cobranca_automacao_config" 
      : type === "eventos" 
        ? "sga_automacao_config" 
        : "mgf_automacao_config";
    try {
      const { error } = await supabase
        .from(tableName)
        .update({ ativo: !currentAtivo })
        .eq("id", id);

      if (error) throw error;
      toast.success(`Sincronização ${!currentAtivo ? "ativada" : "desativada"}`);
      if (type === "cobranca") loadCobrancaConfigs();
      else if (type === "eventos") loadEventosConfigs();
      else loadMgfConfigs();
    } catch (error) {
      console.error("Erro ao alterar status:", error);
      toast.error("Erro ao alterar status");
    }
  };

  const handleExecutar = async (config: SyncConfig, type: RobotType) => {
    setExecutingId(config.id);
    
    const setConfigs = type === "cobranca" 
      ? setCobrancaConfigs 
      : type === "eventos" 
        ? setEventosConfigs 
        : setMgfConfigs;
    setConfigs((prev) =>
      prev.map((c) =>
        c.id === config.id ? { ...c, ultimo_status: "executando", ultimo_erro: null } : c
      )
    );
    
    const functionName = type === "cobranca" 
      ? "disparar-github-workflow" 
      : type === "eventos" 
        ? "disparar-sga-workflow" 
        : "disparar-mgf-workflow";
    
    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          action: "dispatch",
          corretora_id: config.corretora_id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Sincronização iniciada com sucesso!");
        if (expandedConfigId === config.id) {
          loadExecutionLogs(config.id, type);
        }
      } else {
        toast.error(data?.message || "Erro ao iniciar sincronização");
        if (type === "cobranca") loadCobrancaConfigs();
        else if (type === "eventos") loadEventosConfigs();
        else loadMgfConfigs();
      }
    } catch (error: any) {
      console.error("Erro ao executar:", error);
      toast.error(error.message || "Erro ao iniciar sincronização");
      if (type === "cobranca") loadCobrancaConfigs();
      else if (type === "eventos") loadEventosConfigs();
      else loadMgfConfigs();
    } finally {
      setExecutingId(null);
    }
  };

  const handleExecutarPendentes = async (type: RobotType) => {
    const pendingCount = type === "cobranca" 
      ? cobrancaPendingCount 
      : type === "eventos" 
        ? eventosPendingCount 
        : mgfPendingCount;
    
    if (pendingCount === 0) {
      toast.info("Não há execuções pendentes para hoje");
      return;
    }

    setExecutingPending(true);
    
    const functionName = type === "cobranca" 
      ? "scheduler-cobranca-hinova" 
      : type === "eventos" 
        ? "scheduler-sga-hinova" 
        : "scheduler-mgf-hinova";
    
    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { force: true },
      });

      if (error) throw error;

      if (data?.success) {
        const disparados = data.disparados || 0;
        const erros = data.erros || 0;
        
        if (disparados > 0) {
          toast.success(`${disparados} sincronização(ões) iniciada(s)${erros > 0 ? ` (${erros} com erro)` : ''}`);
        } else if (erros > 0) {
          toast.error(`${erros} erro(s) ao iniciar sincronizações`);
        } else {
          toast.info("Nenhuma sincronização pendente encontrada");
        }
        
        if (type === "cobranca") loadCobrancaConfigs();
        else if (type === "eventos") loadEventosConfigs();
        else loadMgfConfigs();
      } else {
        toast.error(data?.message || "Erro ao executar pendentes");
      }
    } catch (error: any) {
      console.error("Erro ao executar pendentes:", error);
      toast.error(error.message || "Erro ao executar sincronizações pendentes");
    } finally {
      setExecutingPending(false);
    }
  };

  const handleExecutarTodosPendentes = async () => {
    const totalPending = cobrancaPendingCount + eventosPendingCount + mgfPendingCount;
    
    if (totalPending === 0) {
      toast.info("Não há execuções pendentes para hoje");
      return;
    }

    setExecutingAllPending(true);
    
    try {
      let totalDisparados = 0;
      let totalErros = 0;

      // Executar cobrança se houver pendentes
      if (cobrancaPendingCount > 0) {
        try {
          const { data, error } = await supabase.functions.invoke("scheduler-cobranca-hinova", {
            body: { force: true },
          });
          if (!error && data?.success) {
            totalDisparados += data.disparados || 0;
            totalErros += data.erros || 0;
          }
        } catch (e) {
          totalErros++;
          console.error("Erro ao executar cobrança:", e);
        }
      }

      // Executar eventos se houver pendentes
      if (eventosPendingCount > 0) {
        try {
          const { data, error } = await supabase.functions.invoke("scheduler-sga-hinova", {
            body: { force: true },
          });
          if (!error && data?.success) {
            totalDisparados += data.disparados || 0;
            totalErros += data.erros || 0;
          }
        } catch (e) {
          totalErros++;
          console.error("Erro ao executar eventos:", e);
        }
      }

      // Executar MGF se houver pendentes
      if (mgfPendingCount > 0) {
        try {
          const { data, error } = await supabase.functions.invoke("scheduler-mgf-hinova", {
            body: { force: true },
          });
          if (!error && data?.success) {
            totalDisparados += data.disparados || 0;
            totalErros += data.erros || 0;
          }
        } catch (e) {
          totalErros++;
          console.error("Erro ao executar MGF:", e);
        }
      }

      if (totalDisparados > 0) {
        toast.success(`${totalDisparados} sincronização(ões) iniciada(s)${totalErros > 0 ? ` (${totalErros} com erro)` : ''}`);
      } else if (totalErros > 0) {
        toast.error(`${totalErros} erro(s) ao iniciar sincronizações`);
      }
      
      loadCobrancaConfigs();
      loadEventosConfigs();
      loadMgfConfigs();
    } catch (error: any) {
      console.error("Erro ao executar todos pendentes:", error);
      toast.error(error.message || "Erro ao executar sincronizações pendentes");
    } finally {
      setExecutingAllPending(false);
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

  const renderStats = (configs: SyncConfig[]) => {
    const activeConfigs = configs.filter(c => c.ativo);
    const inactiveConfigs = configs.filter(c => !c.ativo);
    const withSuccess = configs.filter(c => c.ultimo_status === "sucesso");
    const withErrors = configs.filter(c => c.ultimo_status === "erro");
    const executing = configs.filter(c => c.ultimo_status === "executando");

    return (
      <div className="grid grid-cols-5 gap-3">
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
    );
  };

  const renderConfigList = (configs: SyncConfig[], type: RobotType, loading: boolean, pendingCount: number) => {
    const loadConfigs = type === "cobranca" 
      ? loadCobrancaConfigs 
      : type === "eventos" 
        ? loadEventosConfigs 
        : loadMgfConfigs;
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => handleExecutarPendentes(type)} 
                disabled={executingPending || loading}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {executingPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Executar {pendingCount} Pendente{pendingCount > 1 ? 's' : ''}
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={loadConfigs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {renderStats(configs)}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : configs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma associação configurada para sincronização.
          </div>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {configs.map((config) => (
              <Collapsible
                key={config.id}
                open={expandedConfigId === config.id}
                onOpenChange={() => handleToggleExpand(config.id, type)}
              >
                <div
                  className={`border rounded-lg transition-colors ${
                    config.ativo ? "bg-card" : "bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <Switch
                        checked={config.ativo}
                        onCheckedChange={() => handleToggleAtivo(config.id, config.ativo, type)}
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

                        {config.ativo && (
                          <div className="flex flex-col gap-0.5 mt-1">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Próxima:{" "}
                              {format(getNextDailyRunBrasilia(config.hora_agendada), "dd/MM 'às' HH:mm", { locale: ptBR })} ({countdown(getNextDailyRunBrasilia(config.hora_agendada))})
                            </p>
                            <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0">
                              Cron: {cronUTCLabel(config.hora_agendada)}
                            </Badge>
                          </div>
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
                        onClick={() => handleExecutar(config, type)}
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

                  <CollapsibleContent>
                    <div className="border-t px-4 py-3 bg-muted/30">
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Histórico de Execuções
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadExecutionLogs(config.id, type)}
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
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {getStatusBadge(log.status)}
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
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
                                        <span className="whitespace-nowrap">✓ {log.registros_processados.toLocaleString('pt-BR')} registros processados</span>
                                      )}
                                      {log.nome_arquivo && (
                                        <span className="ml-2 truncate">• {log.nome_arquivo}</span>
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
      </div>
    );
  };

  const totalPending = cobrancaPendingCount + eventosPendingCount + mgfPendingCount;
  const totalWithErrors = cobrancaConfigs.filter(c => c.ultimo_status === "erro").length + 
                          eventosConfigs.filter(c => c.ultimo_status === "erro").length +
                          mgfConfigs.filter(c => c.ultimo_status === "erro").length;

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
              Gerenciamento centralizado das automações Hinova
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {totalPending > 0 && (
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleExecutarTodosPendentes} 
                disabled={executingAllPending || cobrancaLoading || eventosLoading || mgfLoading}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {executingAllPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Executar Todos ({totalPending})
              </Button>
            )}
            {totalWithErrors > 0 && totalPending === 0 && (
              <Badge variant="destructive" className="text-sm py-1 px-3">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {totalWithErrors} com erro
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as RobotType)}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="cobranca" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Cobrança
              {cobrancaPendingCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {cobrancaPendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="eventos" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Eventos
              {eventosPendingCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {eventosPendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="mgf" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              MGF
              {mgfPendingCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {mgfPendingCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="cobranca">
            {renderConfigList(cobrancaConfigs, "cobranca", cobrancaLoading, cobrancaPendingCount)}
          </TabsContent>
          
          <TabsContent value="eventos">
            {renderConfigList(eventosConfigs, "eventos", eventosLoading, eventosPendingCount)}
          </TabsContent>
          
          <TabsContent value="mgf">
            {renderConfigList(mgfConfigs, "mgf", mgfLoading, mgfPendingCount)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
