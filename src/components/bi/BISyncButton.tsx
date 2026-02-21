import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Play, Loader2, CheckCircle, XCircle, Clock, 
  Settings, Eye, EyeOff, Save,
  Zap, AlertTriangle, ExternalLink, History, Square,
  Download, LogIn, Filter, Send, Timer, HardDrive
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
  dias_agendados: number[] | null;
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
  bytes_baixados?: number | null;
  bytes_total?: number | null;
  progresso_download?: number | null;
}

interface ActiveExecution {
  id: string;
  module: ModuleType;
  created_at: string;
  etapa_atual: string | null;
  bytes_baixados: number | null;
  bytes_total: number | null;
  progresso_download: number | null;
  github_run_url: string | null;
}

interface ModuleStatus {
  lastExecution: string | null;
  lastStatus: string | null;
  lastError: string | null;
  isExecuting: boolean;
  activeExecution?: ActiveExecution | null;
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
    dias_agendados: null,
    ativo_cobranca: false, ativo_eventos: false, ativo_mgf: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [executingModule, setExecutingModule] = useState<ModuleType | "all" | null>(null);
  const [stoppingModule, setStoppingModule] = useState<ModuleType | null>(null);
  const [moduleStatuses, setModuleStatuses] = useState<Record<ModuleType, ModuleStatus>>({
    cobranca: { lastExecution: null, lastStatus: null, lastError: null, isExecuting: false, activeExecution: null },
    eventos: { lastExecution: null, lastStatus: null, lastError: null, isExecuting: false, activeExecution: null },
    mgf: { lastExecution: null, lastStatus: null, lastError: null, isExecuting: false, activeExecution: null },
  });
  const [historyModule, setHistoryModule] = useState<ModuleType>("cobranca");
  const [historyLogs, setHistoryLogs] = useState<ExecutionLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Elapsed time ticker — updated every second for active executions
  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const anyRunningRef = useRef(false);

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
          dias_agendados: data.dias_agendados || null,
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

  // Fetch only executing rows — cheap query used by the 3s poll
  const loadActiveExecutions = useCallback(async () => {
    if (!corretoraId || corretoraId === "__admin__") return;
    const modules: ModuleType[] = ["cobranca", "eventos", "mgf"];

    const results: Partial<Record<ModuleType, Pick<ModuleStatus, "isExecuting" | "activeExecution" | "lastStatus">>> = {};

    await Promise.all(modules.map(async (mod) => {
      try {
        const { data } = await supabase
          .from(EXEC_TABLES[mod] as any)
          .select("id, created_at, etapa_atual, bytes_baixados, bytes_total, progresso_download, github_run_url")
          .eq("corretora_id", corretoraId)
          .eq("status", "executando")
          .order("created_at", { ascending: false })
          .limit(1) as any;

        const activeRow = data?.[0] ?? null;
        results[mod] = {
          isExecuting: !!activeRow,
          activeExecution: activeRow ? { ...activeRow, module: mod } : null,
          lastStatus: activeRow ? "executando" : undefined,
        };
      } catch (e) {
        console.error(`Erro ao carregar execução ativa ${mod}:`, e);
      }
    }));

    setModuleStatuses(prev => {
      const next = { ...prev };
      for (const mod of modules) {
        const r = results[mod as ModuleType];
        if (r) {
          next[mod as ModuleType] = {
            ...prev[mod as ModuleType],
            isExecuting: r.isExecuting,
            activeExecution: r.activeExecution ?? null,
            // Only override lastStatus if currently executing or was executing before
            lastStatus: r.isExecuting
              ? "executando"
              : prev[mod as ModuleType].isExecuting
              ? prev[mod as ModuleType].lastStatus  // keep until full reload clears it
              : prev[mod as ModuleType].lastStatus,
          };
        }
      }
      return next;
    });
  }, [corretoraId]);

  // Full status load (config + history) — used on open and via realtime
  const loadModuleStatuses = useCallback(async () => {
    if (!corretoraId || corretoraId === "__admin__") return;
    const modules: ModuleType[] = ["cobranca", "eventos", "mgf"];
    const hoje = new Date().toISOString().split('T')[0];

    const results: Partial<Record<ModuleType, ModuleStatus>> = {};

    await Promise.all(modules.map(async (mod) => {
      try {
        const [configRes, activeExecRes] = await Promise.all([
          supabase
            .from(CONFIG_TABLES[mod] as any)
            .select("ultima_execucao, ultimo_status, ultimo_erro")
            .eq("corretora_id", corretoraId)
            .maybeSingle() as any,
          supabase
            .from(EXEC_TABLES[mod] as any)
            .select("id, created_at, etapa_atual, bytes_baixados, bytes_total, progresso_download, github_run_url")
            .eq("corretora_id", corretoraId)
            .eq("status", "executando")
            .order("created_at", { ascending: false })
            .limit(1) as any,
        ]);

        const data = configRes.data;
        const activeRow = activeExecRes.data?.[0] ?? null;
        const activeExecution: ActiveExecution | null = activeRow ? { ...activeRow, module: mod } : null;
        const isExecuting = !!activeRow;

        if (data) {
          results[mod] = {
            lastExecution: data.ultima_execucao,
            lastStatus: isExecuting ? "executando" : data.ultimo_status,
            lastError: isExecuting ? null : data.ultimo_erro,
            isExecuting,
            activeExecution,
          };
        } else if (isExecuting) {
          results[mod] = {
            lastExecution: null,
            lastStatus: "executando",
            lastError: null,
            isExecuting: true,
            activeExecution,
          };
        }
      } catch (e) {
        console.error(`Erro ao carregar status ${mod}:`, e);
      }
    }));

    setModuleStatuses(prev => ({ ...prev, ...results }));
  }, [corretoraId]);

  useEffect(() => {
    if (open && corretoraId) {
      loadCredenciais();
      loadModuleStatuses();
    }
  }, [open, corretoraId, loadCredenciais, loadModuleStatuses]);

  // Elapsed time ticker — 1s interval, only when dialog open and something running
  useEffect(() => {
    if (!open) return;
    tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [open]);

  // Realtime subscriptions — trigger full reload on any change
  useEffect(() => {
    if (!open || !corretoraId) return;
    const channels = (["cobranca", "eventos", "mgf"] as ModuleType[]).map(mod =>
      supabase
        .channel(`sync-btn-${mod}-${corretoraId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: EXEC_TABLES[mod], filter: `corretora_id=eq.${corretoraId}` },
          () => {
            // Light poll first for immediate UI update, then full reload
            loadActiveExecutions();
            loadModuleStatuses();
          }
        )
        .subscribe()
    );
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [open, corretoraId, loadActiveExecutions, loadModuleStatuses]);

  // Fast-poll every 3s using the LIGHTWEIGHT query (only active executions)
  // Always runs while dialog is open — no dependency on anyRunningRef
  useEffect(() => {
    if (!open || !corretoraId) return;
    pollRef.current = setInterval(() => {
      loadActiveExecutions();
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, corretoraId, loadActiveExecutions]);


  // Auto-generate layout name with association name
  const generateLayoutName = (moduleSuffix: string) => {
    const nome = corretoraNome || "";
    return nome ? `Resumo VANGARD da sua operação - ${nome}` : `BI VANGARD ${moduleSuffix}`;
  };

  const handleSave = async () => {
    if (!creds.hinova_url || !creds.hinova_user || !creds.hinova_pass) {
      toast.error("URL, usuário e senha são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      // Auto-populate layout names with association name if empty
      const layoutCobranca = creds.layout_cobranca || generateLayoutName("COBRANÇA");
      const layoutEventos = creds.layout_eventos || generateLayoutName("EVENTOS");
      const layoutMgf = creds.layout_mgf || generateLayoutName("FINANCEIROS EVENTOS");

      const dataToSave = {
        corretora_id: corretoraId,
        hinova_url: creds.hinova_url,
        hinova_user: creds.hinova_user,
        hinova_pass: creds.hinova_pass,
        hinova_codigo_cliente: creds.hinova_codigo_cliente,
        layout_cobranca: layoutCobranca,
        layout_eventos: layoutEventos,
        layout_mgf: layoutMgf,
        url_cobranca: creds.url_cobranca,
        url_eventos: creds.url_eventos,
        url_mgf: creds.url_mgf,
        hora_agendada: creds.hora_agendada,
        dias_agendados: creds.dias_agendados,
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

      // Update local state with generated names
      setCreds(prev => ({
        ...prev,
        layout_cobranca: layoutCobranca,
        layout_eventos: layoutEventos,
        layout_mgf: layoutMgf,
      }));

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

  const parseEdgeFunctionError = (error: any, data: any): string | null => {
    try {
      if (data?.message) return data.message;
      if (typeof data === 'string') {
        try { return JSON.parse(data)?.message || data; } catch { return data; }
      }
      // supabase-js often puts the JSON body in error.message like:
      // "Edge function returned 409: Error, {"success":false,"message":"..."}"
      if (error?.message) {
        const jsonMatch = error.message.match(/\{.*\}/s);
        if (jsonMatch) {
          try { return JSON.parse(jsonMatch[0])?.message || error.message; } catch { /* ignore */ }
        }
        return error.message;
      }
    } catch { /* ignore */ }
    return null;
  };

  const isDuplicateError = (msg: string) => {
    return msg.includes("Já houve") || msg.includes("Já existe") || msg.includes("uma por dia") || msg.includes("já integrado");
  };

  const handleExecuteModule = async (mod: ModuleType) => {
    if (!creds.hinova_url || !creds.hinova_user || !creds.hinova_pass) {
      toast.error("Configure as credenciais Hinova primeiro");
      setActiveTab("config");
      return;
    }
    setExecutingModule(mod);
    try {
      // Use fetch directly to avoid supabase-js throwing on non-2xx
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/${DISPATCH_FUNCTIONS[mod]}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({ action: "dispatch", corretora_id: corretoraId }),
      });

      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        const msg = responseData?.message || `Erro ${response.status}`;
        if (isDuplicateError(msg)) {
          const horaAgendada = creds.hora_agendada || "08:30";
          toast.info(`${MODULE_LABELS[mod]}: Já foi importado hoje com sucesso. A próxima importação está programada para amanhã às ${horaAgendada}.`, { duration: 6000 });
        } else {
          toast.error(msg);
        }
      } else if (responseData?.success) {
        toast.success(`${MODULE_LABELS[mod]} sincronização iniciada!`);
        setModuleStatuses(prev => ({
          ...prev,
          [mod]: { ...prev[mod], isExecuting: true, lastStatus: "executando" }
        }));
      } else {
        toast.error(responseData?.message || "Erro ao iniciar");
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
    let success = 0, errors = 0, skipped = 0;

    for (const mod of modules) {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const session = (await supabase.auth.getSession()).data.session;
        
        const response = await fetch(`${supabaseUrl}/functions/v1/${DISPATCH_FUNCTIONS[mod]}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || supabaseKey}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({ action: "dispatch", corretora_id: corretoraId }),
        });

        const responseData = await response.json().catch(() => null);

        if (!response.ok) {
          const msg = responseData?.message || '';
          if (isDuplicateError(msg)) {
            skipped++;
          } else {
            errors++;
          }
        } else if (responseData?.success) {
          success++;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    if (success > 0) toast.success(`${success} módulo(s) iniciado(s)`);
    if (skipped > 0) {
      const horaAgendada = creds.hora_agendada || "08:30";
      toast.info(`${skipped} módulo(s) já importado(s) hoje. Próxima importação amanhã às ${horaAgendada}.`, { duration: 6000 });
    }
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
      case "sucesso": return <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />;
      case "erro": return <XCircle className="h-4 w-4 text-destructive" />;
      case "executando": return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "sucesso": return "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400";
      case "erro": return "bg-destructive/10 border-destructive/30 text-destructive";
      case "executando": return "bg-primary/10 border-primary/30 text-primary";
      default: return "bg-muted border-border text-muted-foreground";
    }
  };

  // Format elapsed seconds as mm:ss or hh:mm:ss
  const formatElapsed = (startIso: string) => {
    const secs = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
    if (secs < 0) return "00:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  // Format bytes to human readable
  const formatBytes = (bytes: number | null | undefined): string => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Step labels and icons
  const STEP_INFO: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    LOGIN: { label: "Fazendo login", icon: <LogIn className="h-3.5 w-3.5" />, color: "text-amber-500" },
    NAVEGACAO: { label: "Navegando", icon: <Filter className="h-3.5 w-3.5" />, color: "text-amber-500" },
    NAVEGACAO_RELATORIO: { label: "Abrindo relatório", icon: <Filter className="h-3.5 w-3.5" />, color: "text-amber-500" },
    FILTROS: { label: "Preenchendo filtros", icon: <Filter className="h-3.5 w-3.5" />, color: "text-amber-500" },
    DOWNLOAD: { label: "Baixando arquivo", icon: <Download className="h-3.5 w-3.5" />, color: "text-primary" },
    PROCESSANDO: { label: "Processando dados", icon: <Timer className="h-3.5 w-3.5" />, color: "text-primary" },
    ENVIANDO: { label: "Enviando ao sistema", icon: <Send className="h-3.5 w-3.5" />, color: "text-green-500" },
    CONCLUIDO: { label: "Concluído", icon: <CheckCircle className="h-3.5 w-3.5" />, color: "text-green-500" },
  };

  const getStepInfo = (etapa: string | null) => {
    if (!etapa) return null;
    return STEP_INFO[etapa.toUpperCase()] || { label: etapa, icon: <Timer className="h-3.5 w-3.5" />, color: "text-muted-foreground" };
  };

  // Estimate completion based on download progress
  const estimateCompletion = (exec: ActiveExecution): string | null => {
    if (!exec.bytes_baixados || !exec.bytes_total || exec.bytes_baixados === 0) return null;
    const ratio = exec.bytes_baixados / exec.bytes_total;
    if (ratio <= 0 || ratio >= 1) return null;
    const elapsed = (Date.now() - new Date(exec.created_at).getTime()) / 1000;
    const estimated = elapsed / ratio;
    const remaining = Math.max(0, estimated - elapsed);
    if (remaining > 3600) return null;
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    if (m > 0) return `~${m}min restantes`;
    return `~${s}s restantes`;
  };

  const anyExecuting = Object.values(moduleStatuses).some(s => s.isExecuting);
  const hasCredentials = !!(creds.hinova_url && creds.hinova_user && creds.hinova_pass);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-2 relative rounded-xl border-2 transition-all duration-300 ${anyExecuting ? 'border-primary/60 bg-primary/10 text-primary shadow-md' : 'hover:border-primary/50 hover:bg-primary/5'}`}
        >
          {anyExecuting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          <span className="hidden sm:inline font-medium">Sincronizar</span>
          {anyExecuting && (
            <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary animate-pulse ring-2 ring-background" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg p-0 gap-0 rounded-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <DialogHeader className="border-b px-5 py-4 bg-muted/30 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-semibold">Sincronização Hinova</DialogTitle>
              <p className="text-xs text-muted-foreground truncate max-w-[280px] mt-0.5">{corretoraNome}</p>
            </div>
            {hasCredentials && (
              <Button 
                size="sm" variant="default"
                onClick={handleExecuteAll}
                disabled={executingModule !== null || anyExecuting}
                className="gap-1.5 h-8 text-xs rounded-lg"
              >
                {executingModule === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Executar Todos
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="w-full rounded-none border-b bg-transparent h-10 sticky top-0 z-10 bg-background">
            <TabsTrigger value="sync" className="text-xs flex-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none">Módulos</TabsTrigger>
            <TabsTrigger value="config" className="text-xs flex-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none">Credenciais</TabsTrigger>
            <TabsTrigger value="historico" className="text-xs flex-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="sync" className="m-0 p-4 space-y-2.5">
            {!hasCredentials ? (
              <div className="text-center py-6 space-y-2">
                <AlertTriangle className="h-8 w-8 mx-auto text-warning" />
                <p className="text-sm text-muted-foreground">Credenciais não configuradas</p>
                <Button size="sm" variant="outline" onClick={() => setActiveTab("config")}>
                  <Settings className="h-3.5 w-3.5 mr-1.5" />
                  Configurar
                </Button>
              </div>
            ) : (
              (["cobranca", "eventos", "mgf"] as ModuleType[]).map((mod) => {
                const status = moduleStatuses[mod];
                const exec = status.activeExecution;
                const stepInfo = exec ? getStepInfo(exec.etapa_atual) : null;
                const estimation = exec ? estimateCompletion(exec) : null;
                const downloadPct = exec?.progresso_download ?? 
                  (exec?.bytes_baixados && exec?.bytes_total && exec.bytes_total > 0
                    ? Math.round((exec.bytes_baixados / exec.bytes_total) * 100)
                    : null);

                return (
                  <div key={mod} className={`rounded-xl border overflow-hidden transition-all ${getStatusColor(status.lastStatus)}`}>
                    {/* Module header row */}
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {getStatusIcon(status.lastStatus)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{MODULE_LABELS[mod]}</span>
                            {/* Elapsed time badge when executing */}
                            {status.isExecuting && exec && (
                              <span className="flex items-center gap-1 text-[10px] font-mono bg-background/60 border px-1.5 py-0.5 rounded-full">
                                <Timer className="h-2.5 w-2.5" />
                                {formatElapsed(exec.created_at)}
                              </span>
                            )}
                          </div>
                          {status.isExecuting && stepInfo ? (
                            <div className={`flex items-center gap-1 text-[11px] ${stepInfo.color} mt-0.5`}>
                              {stepInfo.icon}
                              <span>{stepInfo.label}</span>
                            </div>
                          ) : status.lastExecution ? (
                            <p className="text-[11px] opacity-70">
                              {format(new Date(status.lastExecution), "dd/MM HH:mm", { locale: ptBR })}
                            </p>
                          ) : null}
                          {status.lastStatus === "erro" && status.lastError && (
                            <p className="text-[11px] opacity-80 truncate max-w-[220px]">{status.lastError}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* GitHub link when executing */}
                        {status.isExecuting && exec?.github_run_url && (
                          <a
                            href={exec.github_run_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Ver no GitHub Actions"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {status.isExecuting ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStopModule(mod)}
                            disabled={stoppingModule === mod}
                            className="h-7 px-2.5 text-destructive hover:text-destructive hover:bg-destructive/10"
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
                            className="h-7 px-2.5"
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

                    {/* Monitoring panel — visible only when executing */}
                    {status.isExecuting && exec && (
                      <div className="border-t bg-background/50 px-3 py-2.5 space-y-2">
                        {/* Download progress bar */}
                        {exec.etapa_atual?.toUpperCase() === "DOWNLOAD" && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Download className="h-3 w-3" />
                                <span>Download</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {exec.bytes_baixados != null && (
                                  <span className="flex items-center gap-0.5">
                                    <HardDrive className="h-2.5 w-2.5" />
                                    {formatBytes(exec.bytes_baixados)}
                                    {exec.bytes_total && exec.bytes_total > 0 && (
                                      <span className="opacity-60"> / {formatBytes(exec.bytes_total)}</span>
                                    )}
                                  </span>
                                )}
                                {downloadPct != null && (
                                  <span className="font-medium text-primary">{downloadPct}%</span>
                                )}
                              </div>
                            </div>
                            <Progress
                              value={downloadPct ?? 0}
                              className="h-1.5"
                            />
                            {estimation && (
                              <p className="text-[10px] text-muted-foreground text-right">{estimation}</p>
                            )}
                          </div>
                        )}

                        {/* Step progress dots */}
                        <div className="flex items-center gap-1.5">
                          {(["LOGIN", "FILTROS", "DOWNLOAD", "ENVIANDO"] as const).map((step) => {
                            const currentStep = exec.etapa_atual?.toUpperCase() || "";
                            const steps = ["LOGIN", "NAVEGACAO", "NAVEGACAO_RELATORIO", "FILTROS", "DOWNLOAD", "PROCESSANDO", "ENVIANDO", "CONCLUIDO"];
                            const currentIdx = steps.indexOf(currentStep);
                            const stepIdx = steps.indexOf(step === "FILTROS" ? "FILTROS" : step === "ENVIANDO" ? "ENVIANDO" : step);
                            const isPast = currentIdx > stepIdx;
                            const isCurrent = step === "FILTROS"
                              ? ["FILTROS", "NAVEGACAO", "NAVEGACAO_RELATORIO"].includes(currentStep)
                              : currentStep === step || (step === "DOWNLOAD" && currentStep === "PROCESSANDO");
                            const info = STEP_INFO[step];
                            return (
                              <div
                                key={step}
                                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border transition-all flex-1 justify-center ${
                                  isCurrent ? "bg-primary/15 border-primary/40 text-primary font-medium" :
                                  isPast ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400" :
                                  "bg-muted/50 border-border/50 text-muted-foreground/50"
                                }`}
                              >
                                {isCurrent ? (
                                  <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />
                                ) : isPast ? (
                                  <CheckCircle className="h-2.5 w-2.5 shrink-0" />
                                ) : (
                                  info?.icon && <span className="opacity-40 shrink-0">{info.icon}</span>
                                )}
                                <span className="hidden sm:inline">{
                                  step === "LOGIN" ? "Login" :
                                  step === "FILTROS" ? "Filtros" :
                                  step === "DOWNLOAD" ? "Download" : "Envio"
                                }</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Bytes received when not in download step */}
                        {exec.etapa_atual?.toUpperCase() !== "DOWNLOAD" && exec.bytes_baixados != null && exec.bytes_baixados > 0 && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <HardDrive className="h-3 w-3" />
                            <span>Dados recebidos: <span className="font-medium text-foreground">{formatBytes(exec.bytes_baixados)}</span></span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>


          <TabsContent value="config" className="m-0 p-4">
              {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <div className="space-y-4">
                  {/* Credenciais */}
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credenciais</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">URL de Login Hinova</Label>
                    <Input value={creds.hinova_url} onChange={e => setCreds(p => ({...p, hinova_url: e.target.value}))} placeholder="https://sga.hinova.com.br/..." className="h-9 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Código Cliente</Label>
                      <Input value={creds.hinova_codigo_cliente} onChange={e => setCreds(p => ({...p, hinova_codigo_cliente: e.target.value}))} className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Horário Sync</Label>
                      <Input type="time" value={creds.hora_agendada} onChange={e => setCreds(p => ({...p, hora_agendada: e.target.value}))} className="h-9 text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Dias da Semana</Label>
                    <div className="flex gap-1">
                      {[
                        { label: "D", value: 0 },
                        { label: "S", value: 1 },
                        { label: "T", value: 2 },
                        { label: "Q", value: 3 },
                        { label: "Q", value: 4 },
                        { label: "S", value: 5 },
                        { label: "S", value: 6 },
                      ].map((dia) => {
                        const isSelected = !creds.dias_agendados || creds.dias_agendados.includes(dia.value);
                        return (
                          <button
                            key={dia.value}
                            type="button"
                            onClick={() => {
                              setCreds(prev => {
                                const current = prev.dias_agendados ?? [0,1,2,3,4,5,6];
                                const next = current.includes(dia.value)
                                  ? current.filter(d => d !== dia.value)
                                  : [...current, dia.value].sort();
                                return { ...prev, dias_agendados: next.length === 7 ? null : next.length === 0 ? [dia.value] : next };
                              });
                            }}
                            className={`h-8 w-8 rounded-lg text-xs font-medium border transition-all ${
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                            }`}
                          >
                            {dia.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {!creds.dias_agendados ? "Todos os dias" : `${creds.dias_agendados.length} dia(s) selecionado(s)`}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Usuário</Label>
                      <Input value={creds.hinova_user} onChange={e => setCreds(p => ({...p, hinova_user: e.target.value}))} className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Senha</Label>
                      <div className="flex gap-1.5">
                        <Input type={showPassword ? "text" : "password"} value={creds.hinova_pass} onChange={e => setCreds(p => ({...p, hinova_pass: e.target.value}))} className="h-9 text-sm" />
                        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* URLs dos relatórios */}
                  <div className="pt-3 border-t space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">URLs dos Relatórios</p>
                    <p className="text-xs text-muted-foreground">URLs diretas das páginas de relatório. Após login, o robô navega direto para elas.</p>
                    <div className="space-y-2.5">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Cobrança</Label>
                        <div className="flex items-center gap-2">
                          <Input value={creds.url_cobranca} onChange={e => setCreds(p => ({...p, url_cobranca: e.target.value}))} placeholder="https://sga.hinova.com.br/.../relatorio/relatorioBoletos.php" className="h-9 text-sm flex-1" />
                          <Switch checked={creds.ativo_cobranca} onCheckedChange={v => setCreds(p => ({...p, ativo_cobranca: v}))} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Eventos</Label>
                        <div className="flex items-center gap-2">
                          <Input value={creds.url_eventos} onChange={e => setCreds(p => ({...p, url_eventos: e.target.value}))} placeholder="https://sga.hinova.com.br/.../relatorio/relatorioEvento.php" className="h-9 text-sm flex-1" />
                          <Switch checked={creds.ativo_eventos} onCheckedChange={v => setCreds(p => ({...p, ativo_eventos: v}))} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">MGF</Label>
                        <div className="flex items-center gap-2">
                          <Input value={creds.url_mgf} onChange={e => setCreds(p => ({...p, url_mgf: e.target.value}))} placeholder="https://sga.hinova.com.br/.../v5/Sgfrelatorio/lancamento" className="h-9 text-sm flex-1" />
                          <Switch checked={creds.ativo_mgf} onCheckedChange={v => setCreds(p => ({...p, ativo_mgf: v}))} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button onClick={handleSave} disabled={saving} className="w-full h-9 text-sm gap-1.5 rounded-xl mt-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar Configuração
                  </Button>
                </div>
              )}
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
            <div className="space-y-1.5">
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
                            <p className="text-green-600 dark:text-green-400 mt-0.5">✓ {log.registros_processados.toLocaleString('pt-BR')} registros</p>
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
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
