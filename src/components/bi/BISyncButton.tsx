import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw, Play, Loader2, CheckCircle, XCircle, Clock, 
  Settings, Eye, EyeOff, Save, ChevronDown, ChevronUp,
  Zap, AlertTriangle, ExternalLink, History, Square
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ModuleType = "cobranca" | "eventos" | "mgf";

interface HinovaCredenciais {
  id?: string;
  corretora_id: string;
  hinova_url: string;
  hinova_user: string;
  hinova_pass: string;
  hinova_codigo_cliente: string;
  layout_cobranca: string;
  layout_eventos: string;
  layout_mgf: string;
  url_cobranca: string;
  url_eventos: string;
  url_mgf: string;
  hora_agendada: string;
  ativo_cobranca: boolean;
  ativo_eventos: boolean;
  ativo_mgf: boolean;
}

interface ExecutionLog {
  id: string;
  status: string;
  erro: string | null;
  mensagem: string | null;
  created_at: string;
  finalizado_at: string | null;
  registros_processados: number | null;
  github_run_url: string | null;
  github_run_id: string | null;
  etapa_atual: string | null;
}

interface ModuleStatus {
  lastExecution: string | null;
  lastStatus: string | null;
  lastError: string | null;
  isExecuting: boolean;
}

const MODULE_LABELS: Record<ModuleType, string> = {
  cobranca: "Cobrança",
  eventos: "Eventos",
  mgf: "MGF",
};

const DISPATCH_FUNCTIONS: Record<ModuleType, string> = {
  cobranca: "disparar-github-workflow",
  eventos: "disparar-sga-workflow",
  mgf: "disparar-mgf-workflow",
};

const EXEC_TABLES: Record<ModuleType, string> = {
  cobranca: "cobranca_automacao_execucoes",
  eventos: "sga_automacao_execucoes",
  mgf: "mgf_automacao_execucoes",
};

const CONFIG_TABLES: Record<ModuleType, string> = {
  cobranca: "cobranca_automacao_config",
  eventos: "sga_automacao_config",
  mgf: "mgf_automacao_config",
};

interface BISyncButtonProps {
  corretoraId: string;
  corretoraNome?: string;
}

export default function BISyncButton({ corretoraId, corretoraNome }: BISyncButtonProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"sync" | "config" | "historico">("sync");
  const [creds, setCreds] = useState<HinovaCredenciais>({
    corretora_id: corretoraId,
    hinova_url: "", hinova_user: "", hinova_pass: "", hinova_codigo_cliente: "",
    layout_cobranca: "", layout_eventos: "", layout_mgf: "",
    url_cobranca: "", url_eventos: "", url_mgf: "",
    hora_agendada: "09:00",
    ativo_cobranca: false, ativo_eventos: false, ativo_mgf: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [executingModule, setExecutingModule] = useState<ModuleType | "all" | null>(null);
  const [stoppingModule, setStoppingModule] = useState<ModuleType | null>(null);
  const [moduleStatuses, setModuleStatuses] = useState<Record<ModuleType, ModuleStatus>>({
    cobranca: { lastExecution: null, lastStatus: null, lastError: null, isExecuting: false },
    eventos: { lastExecution: null, lastStatus: null, lastError: null, isExecuting: false },
    mgf: { lastExecution: null, lastStatus: null, lastError: null, isExecuting: false },
  });
  const [historyModule, setHistoryModule] = useState<ModuleType>("cobranca");
  const [historyLogs, setHistoryLogs] = useState<ExecutionLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadCredenciais = useCallback(async () => {
    if (!corretoraId || corretoraId === "__admin__") return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hinova_credenciais")
        .select("*")
        .eq("corretora_id", corretoraId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setCreds({
          id: data.id,
          corretora_id: data.corretora_id,
          hinova_url: data.hinova_url || "",
          hinova_user: data.hinova_user || "",
          hinova_pass: data.hinova_pass || "",
          hinova_codigo_cliente: data.hinova_codigo_cliente || "",
          layout_cobranca: data.layout_cobranca || "",
          layout_eventos: data.layout_eventos || "",
          layout_mgf: data.layout_mgf || "",
          url_cobranca: data.url_cobranca || "",
          url_eventos: data.url_eventos || "",
          url_mgf: data.url_mgf || "",
          hora_agendada: data.hora_agendada || "09:00",
          ativo_cobranca: data.ativo_cobranca || false,
          ativo_eventos: data.ativo_eventos || false,
          ativo_mgf: data.ativo_mgf || false,
        });
      }
    } catch (e) {
      console.error("Erro ao carregar credenciais:", e);
    } finally {
      setLoading(false);
    }
  }, [corretoraId]);

  const loadModuleStatuses = useCallback(async () => {
    if (!corretoraId || corretoraId === "__admin__") return;
    const modules: ModuleType[] = ["cobranca", "eventos", "mgf"];
    const newStatuses = { ...moduleStatuses };

    for (const mod of modules) {
      try {
        const { data } = await supabase
          .from(CONFIG_TABLES[mod] as any)
          .select("ultima_execucao, ultimo_status, ultimo_erro")
          .eq("corretora_id", corretoraId)
          .maybeSingle() as any;

        if (data) {
          newStatuses[mod] = {
            lastExecution: data.ultima_execucao,
            lastStatus: data.ultimo_status,
            lastError: data.ultimo_erro,
            isExecuting: data.ultimo_status === "executando",
          };
        }
      } catch (e) {
        console.error(`Erro ao carregar status ${mod}:`, e);
      }
    }
    setModuleStatuses(newStatuses);
  }, [corretoraId]);

  useEffect(() => {
    if (open && corretoraId) {
      loadCredenciais();
      loadModuleStatuses();
    }
  }, [open, corretoraId, loadCredenciais, loadModuleStatuses]);

  // Realtime for execution updates
  useEffect(() => {
    if (!open || !corretoraId) return;

    const channels = (["cobranca", "eventos", "mgf"] as ModuleType[]).map(mod => {
      return supabase
        .channel(`sync-btn-${mod}-${corretoraId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: EXEC_TABLES[mod], filter: `corretora_id=eq.${corretoraId}` },
          () => loadModuleStatuses()
        )
        .subscribe();
    });

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [open, corretoraId, loadModuleStatuses]);

  const handleSave = async () => {
    if (!creds.hinova_url || !creds.hinova_user || !creds.hinova_pass) {
      toast.error("URL, usuário e senha são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const dataToSave = {
        corretora_id: corretoraId,
        hinova_url: creds.hinova_url,
        hinova_user: creds.hinova_user,
        hinova_pass: creds.hinova_pass,
        hinova_codigo_cliente: creds.hinova_codigo_cliente,
        layout_cobranca: creds.layout_cobranca,
        layout_eventos: creds.layout_eventos,
        layout_mgf: creds.layout_mgf,
        url_cobranca: creds.url_cobranca,
        url_eventos: creds.url_eventos,
        url_mgf: creds.url_mgf,
        hora_agendada: creds.hora_agendada,
        ativo_cobranca: creds.ativo_cobranca,
        ativo_eventos: creds.ativo_eventos,
        ativo_mgf: creds.ativo_mgf,
      };

      if (creds.id) {
        const { error } = await supabase.from("hinova_credenciais").update(dataToSave).eq("id", creds.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("hinova_credenciais").insert(dataToSave).select().single();
        if (error) throw error;
        setCreds(prev => ({ ...prev, id: data.id }));
      }

      // Sync to individual config tables
      await syncToConfigTables();
      toast.success("Configuração salva!");
    } catch (e: any) {
      console.error("Erro ao salvar:", e);
      toast.error("Erro ao salvar: " + (e.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const syncToConfigTables = async () => {
    const baseData = {
      hinova_url: creds.hinova_url,
      hinova_user: creds.hinova_user,
      hinova_pass: creds.hinova_pass,
      hinova_codigo_cliente: creds.hinova_codigo_cliente,
      hora_agendada: creds.hora_agendada,
    };

    // Sync cobrança
    const { data: existingCob } = await supabase.from("cobranca_automacao_config").select("id").eq("corretora_id", corretoraId).maybeSingle();
    if (existingCob) {
      await supabase.from("cobranca_automacao_config").update({ ...baseData, layout_relatorio: creds.layout_cobranca, ativo: creds.ativo_cobranca }).eq("id", existingCob.id);
    } else {
      await supabase.from("cobranca_automacao_config").insert({ ...baseData, corretora_id: corretoraId, layout_relatorio: creds.layout_cobranca, ativo: creds.ativo_cobranca });
    }

    // Sync eventos
    const { data: existingSga } = await supabase.from("sga_automacao_config").select("id").eq("corretora_id", corretoraId).maybeSingle();
    if (existingSga) {
      await supabase.from("sga_automacao_config").update({ ...baseData, ativo: creds.ativo_eventos }).eq("id", existingSga.id);
    } else {
      await supabase.from("sga_automacao_config").insert({ ...baseData, corretora_id: corretoraId, ativo: creds.ativo_eventos });
    }

    // Sync MGF
    const { data: existingMgf } = await supabase.from("mgf_automacao_config").select("id").eq("corretora_id", corretoraId).maybeSingle();
    if (existingMgf) {
      await supabase.from("mgf_automacao_config").update({ ...baseData, layout_relatorio: creds.layout_mgf, ativo: creds.ativo_mgf }).eq("id", existingMgf.id);
    } else {
      await supabase.from("mgf_automacao_config").insert({ ...baseData, corretora_id: corretoraId, layout_relatorio: creds.layout_mgf, ativo: creds.ativo_mgf });
    }
  };

  const handleExecuteModule = async (mod: ModuleType) => {
    if (!creds.hinova_url || !creds.hinova_user || !creds.hinova_pass) {
      toast.error("Configure as credenciais Hinova primeiro");
      setActiveTab("config");
      return;
    }
    setExecutingModule(mod);
    try {
      const { data, error } = await supabase.functions.invoke(DISPATCH_FUNCTIONS[mod], {
        body: { action: "dispatch", corretora_id: corretoraId },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`${MODULE_LABELS[mod]} sincronização iniciada!`);
        setModuleStatuses(prev => ({
          ...prev,
          [mod]: { ...prev[mod], isExecuting: true, lastStatus: "executando" }
        }));
      } else {
        toast.error(data?.message || "Erro ao iniciar");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao iniciar sincronização");
    } finally {
      setExecutingModule(null);
    }
  };

  const handleStopModule = async (mod: ModuleType) => {
    setStoppingModule(mod);
    try {
      // Find the running execution's github_run_id
      const { data: executions } = await supabase
        .from(EXEC_TABLES[mod] as any)
        .select("id, github_run_id")
        .eq("corretora_id", corretoraId)
        .eq("status", "executando")
        .order("created_at", { ascending: false })
        .limit(1) as any;

      const runId = executions?.[0]?.github_run_id;
      const execId = executions?.[0]?.id;

      if (runId) {
        // Cancel GitHub workflow
        const { data, error } = await supabase.functions.invoke(DISPATCH_FUNCTIONS[mod], {
          body: { action: "cancel", run_id: runId },
        });
        if (error) throw error;
      }

      // Update execution status in DB
      if (execId) {
        await supabase
          .from(EXEC_TABLES[mod] as any)
          .update({ 
            status: "parado", 
            erro: "Execução interrompida pelo usuário",
            finalizado_at: new Date().toISOString() 
          } as any)
          .eq("id", execId);

        await supabase
          .from(CONFIG_TABLES[mod] as any)
          .update({ ultimo_status: "parado", ultimo_erro: "Interrompido pelo usuário" } as any)
          .eq("corretora_id", corretoraId);
      }

      toast.success(`${MODULE_LABELS[mod]} sincronização parada!`);
      loadModuleStatuses();
    } catch (e: any) {
      toast.error(e.message || "Erro ao parar sincronização");
    } finally {
      setStoppingModule(null);
    }
  };

  const handleExecuteAll = async () => {
    setExecutingModule("all");
    const modules: ModuleType[] = ["cobranca", "eventos", "mgf"];
    let success = 0, errors = 0;

    for (const mod of modules) {
      try {
        const { data, error } = await supabase.functions.invoke(DISPATCH_FUNCTIONS[mod], {
          body: { action: "dispatch", corretora_id: corretoraId },
        });
        if (error) throw error;
        if (data?.success) success++;
        else errors++;
      } catch {
        errors++;
      }
    }

    if (success > 0) toast.success(`${success} módulo(s) iniciado(s)`);
    if (errors > 0) toast.error(`${errors} erro(s)`);
    loadModuleStatuses();
    setExecutingModule(null);
  };

  const loadHistory = async (mod: ModuleType) => {
    setHistoryLoading(true);
    setHistoryModule(mod);
    try {
      const { data, error } = await supabase
        .from(EXEC_TABLES[mod] as any)
        .select("id, status, erro, mensagem, created_at, finalizado_at, registros_processados, github_run_url, github_run_id, etapa_atual")
        .eq("corretora_id", corretoraId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      setHistoryLogs((data as any[]) || []);
    } catch (e) {
      console.error("Erro ao carregar histórico:", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "sucesso": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "erro": return <XCircle className="h-4 w-4 text-destructive" />;
      case "executando": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "sucesso": return "bg-green-500/10 border-green-500/30 text-green-700";
      case "erro": return "bg-destructive/10 border-destructive/30 text-destructive";
      case "executando": return "bg-blue-500/10 border-blue-500/30 text-blue-700";
      default: return "bg-muted border-border text-muted-foreground";
    }
  };

  const anyExecuting = Object.values(moduleStatuses).some(s => s.isExecuting);
  const hasCredentials = !!(creds.hinova_url && creds.hinova_user && creds.hinova_pass);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-2 relative rounded-xl border-2 transition-all duration-300 ${anyExecuting ? 'border-blue-400 bg-blue-500/10 text-blue-600 shadow-md shadow-blue-500/20' : 'hover:border-primary/50 hover:bg-primary/5'}`}
        >
          {anyExecuting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          <span className="hidden sm:inline font-medium">Sincronizar</span>
          {anyExecuting && (
            <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-blue-500 animate-pulse ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="end" sideOffset={8}>
        <div className="border-b px-4 py-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Sincronização Hinova</h3>
              <p className="text-xs text-muted-foreground truncate max-w-[250px]">{corretoraNome}</p>
            </div>
            {hasCredentials && (
              <Button 
                size="sm" variant="default"
                onClick={handleExecuteAll}
                disabled={executingModule !== null || anyExecuting}
                className="gap-1.5 h-7 text-xs"
              >
                {executingModule === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Todos
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="w-full rounded-none border-b bg-transparent h-9">
            <TabsTrigger value="sync" className="text-xs flex-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Módulos</TabsTrigger>
            <TabsTrigger value="config" className="text-xs flex-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Credenciais</TabsTrigger>
            <TabsTrigger value="historico" className="text-xs flex-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="sync" className="m-0 p-3 space-y-2">
            {!hasCredentials ? (
              <div className="text-center py-6 space-y-2">
                <AlertTriangle className="h-8 w-8 mx-auto text-amber-500" />
                <p className="text-sm text-muted-foreground">Credenciais não configuradas</p>
                <Button size="sm" variant="outline" onClick={() => setActiveTab("config")}>
                  <Settings className="h-3.5 w-3.5 mr-1.5" />
                  Configurar
                </Button>
              </div>
            ) : (
              (["cobranca", "eventos", "mgf"] as ModuleType[]).map((mod) => {
                const status = moduleStatuses[mod];
                const isActive = mod === "cobranca" ? creds.ativo_cobranca : mod === "eventos" ? creds.ativo_eventos : creds.ativo_mgf;
                return (
                  <div key={mod} className={`rounded-lg border p-3 ${getStatusColor(status.lastStatus)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {getStatusIcon(status.lastStatus)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{MODULE_LABELS[mod]}</span>
                          </div>
                          {status.lastExecution && (
                            <p className="text-[11px] opacity-70">
                              {format(new Date(status.lastExecution), "dd/MM HH:mm", { locale: ptBR })}
                            </p>
                          )}
                          {status.lastStatus === "erro" && status.lastError && (
                            <p className="text-[11px] opacity-80 truncate max-w-[220px]">{status.lastError}</p>
                          )}
                        </div>
                      </div>
                      {status.isExecuting ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStopModule(mod)}
                          disabled={stoppingModule === mod}
                          className="h-7 px-2.5 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Parar sincronização"
                        >
                          {stoppingModule === mod ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Square className="h-3.5 w-3.5 fill-current" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleExecuteModule(mod)}
                          disabled={executingModule !== null}
                          className="h-7 px-2.5 shrink-0"
                        >
                          {executingModule === mod ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="config" className="m-0 p-3">
            <ScrollArea className="max-h-[400px]">
              {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <div className="space-y-3">
                  {/* Credenciais */}
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credenciais</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">URL de Login Hinova</Label>
                    <Input value={creds.hinova_url} onChange={e => setCreds(p => ({...p, hinova_url: e.target.value}))} placeholder="https://sga.hinova.com.br/..." className="h-8 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Código Cliente</Label>
                      <Input value={creds.hinova_codigo_cliente} onChange={e => setCreds(p => ({...p, hinova_codigo_cliente: e.target.value}))} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Horário Sync</Label>
                      <Input type="time" value={creds.hora_agendada} onChange={e => setCreds(p => ({...p, hora_agendada: e.target.value}))} className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Usuário</Label>
                    <Input value={creds.hinova_user} onChange={e => setCreds(p => ({...p, hinova_user: e.target.value}))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Senha</Label>
                    <div className="flex gap-1.5">
                      <Input type={showPassword ? "text" : "password"} value={creds.hinova_pass} onChange={e => setCreds(p => ({...p, hinova_pass: e.target.value}))} className="h-8 text-xs" />
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                  
                  {/* URLs dos relatórios */}
                  <div className="pt-2 border-t space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">URLs dos Relatórios</p>
                    <p className="text-[11px] text-muted-foreground">URLs diretas das páginas de relatório. Após login, o robô navega direto para elas.</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Cobrança</Label>
                      <div className="flex items-center gap-2">
                        <Input value={creds.url_cobranca} onChange={e => setCreds(p => ({...p, url_cobranca: e.target.value}))} placeholder="https://sga.hinova.com.br/.../relatorio/relatorioBoletos.php" className="h-8 text-xs flex-1" />
                        <Switch checked={creds.ativo_cobranca} onCheckedChange={v => setCreds(p => ({...p, ativo_cobranca: v}))} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Eventos</Label>
                      <div className="flex items-center gap-2">
                        <Input value={creds.url_eventos} onChange={e => setCreds(p => ({...p, url_eventos: e.target.value}))} placeholder="https://sga.hinova.com.br/.../relatorio/relatorioEvento.php" className="h-8 text-xs flex-1" />
                        <Switch checked={creds.ativo_eventos} onCheckedChange={v => setCreds(p => ({...p, ativo_eventos: v}))} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">MGF</Label>
                      <div className="flex items-center gap-2">
                        <Input value={creds.url_mgf} onChange={e => setCreds(p => ({...p, url_mgf: e.target.value}))} placeholder="https://sga.hinova.com.br/.../v5/Sgfrelatorio/lancamento" className="h-8 text-xs flex-1" />
                        <Switch checked={creds.ativo_mgf} onCheckedChange={v => setCreds(p => ({...p, ativo_mgf: v}))} />
                      </div>
                    </div>
                  </div>

                  <Button onClick={handleSave} disabled={saving} className="w-full h-8 text-xs gap-1.5 rounded-xl">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar Configuração
                  </Button>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="historico" className="m-0 p-3 space-y-2">
            <div className="flex gap-1">
              {(["cobranca", "eventos", "mgf"] as ModuleType[]).map(mod => (
                <Button
                  key={mod}
                  variant={historyModule === mod ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={() => loadHistory(mod)}
                >
                  {MODULE_LABELS[mod]}
                </Button>
              ))}
            </div>
            <ScrollArea className="h-[300px]">
              {historyLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : historyLogs.length === 0 ? (
                <p className="text-xs text-center text-muted-foreground py-6">Selecione um módulo acima</p>
              ) : (
                <div className="space-y-1.5">
                  {historyLogs.map(log => (
                    <div key={log.id} className={`rounded-md border-l-4 p-2.5 text-xs ${
                      log.status === "sucesso" ? "border-l-green-500 bg-green-50 dark:bg-green-900/20" :
                      log.status === "erro" ? "border-l-red-500 bg-red-50 dark:bg-red-900/20" :
                      log.status === "executando" ? "border-l-blue-500 bg-blue-50 dark:bg-blue-900/20" :
                      "border-l-gray-300 bg-muted/30"
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {getStatusIcon(log.status)}
                            <span className="font-medium capitalize">{log.status}</span>
                            <span className="text-muted-foreground">
                              {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          {log.status === "sucesso" && log.registros_processados && (
                            <p className="text-green-700 mt-0.5">✓ {log.registros_processados.toLocaleString('pt-BR')} registros</p>
                          )}
                          {log.status === "erro" && log.erro && (
                            <p className="text-destructive mt-0.5 line-clamp-2">{log.erro}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {log.status === "executando" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                if (log.github_run_id) {
                                  setStoppingModule(historyModule);
                                  try {
                                    await supabase.functions.invoke(DISPATCH_FUNCTIONS[historyModule], {
                                      body: { action: "cancel", run_id: log.github_run_id },
                                    });
                                    await supabase
                                      .from(EXEC_TABLES[historyModule] as any)
                                      .update({ status: "parado", erro: "Execução interrompida pelo usuário", finalizado_at: new Date().toISOString() } as any)
                                      .eq("id", log.id);
                                    await supabase
                                      .from(CONFIG_TABLES[historyModule] as any)
                                      .update({ ultimo_status: "parado", ultimo_erro: "Interrompido pelo usuário" } as any)
                                      .eq("corretora_id", corretoraId);
                                    toast.success("Sincronização parada!");
                                    loadHistory(historyModule);
                                    loadModuleStatuses();
                                  } catch (e: any) {
                                    toast.error(e.message || "Erro ao parar");
                                  } finally {
                                    setStoppingModule(null);
                                  }
                                }
                              }}
                              disabled={stoppingModule === historyModule}
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Parar execução"
                            >
                              {stoppingModule === historyModule ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Square className="h-3 w-3 fill-current" />
                              )}
                            </Button>
                          )}
                          {log.github_run_url && (
                            <a href={log.github_run_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
