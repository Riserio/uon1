import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Play, Loader2, CheckCircle, XCircle, Clock, 
  Settings, Eye, EyeOff, Save,
  Zap, AlertTriangle, ExternalLink, Square,
  Download, LogIn, Filter, Send, Timer, HardDrive,
  ChevronRight, RefreshCw, Wifi, WifiOff
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

const MODULE_COLORS: Record<ModuleType, { bg: string; icon: string }> = {
  cobranca: { bg: "bg-emerald-500/10", icon: "text-emerald-600 dark:text-emerald-400" },
  eventos: { bg: "bg-blue-500/10", icon: "text-blue-600 dark:text-blue-400" },
  mgf: { bg: "bg-purple-500/10", icon: "text-purple-600 dark:text-purple-400" },
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
  const [activeView, setActiveView] = useState<"modules" | "config" | "history">("modules");
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
  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadCredenciais = useCallback(async () => {
    if (!corretoraId || corretoraId === "__admin__") return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("hinova_credenciais").select("*").eq("corretora_id", corretoraId).maybeSingle();
      if (error) throw error;
      if (data) {
        setCreds({
          id: data.id, corretora_id: data.corretora_id,
          hinova_url: data.hinova_url || "", hinova_user: data.hinova_user || "",
          hinova_pass: data.hinova_pass || "", hinova_codigo_cliente: data.hinova_codigo_cliente || "",
          layout_cobranca: data.layout_cobranca || "", layout_eventos: data.layout_eventos || "",
          layout_mgf: data.layout_mgf || "", url_cobranca: data.url_cobranca || "",
          url_eventos: data.url_eventos || "", url_mgf: data.url_mgf || "",
          hora_agendada: data.hora_agendada || "09:00", dias_agendados: data.dias_agendados || null,
          ativo_cobranca: data.ativo_cobranca || false, ativo_eventos: data.ativo_eventos || false,
          ativo_mgf: data.ativo_mgf || false,
        });
      }
    } catch (e) { console.error("Erro ao carregar credenciais:", e); }
    finally { setLoading(false); }
  }, [corretoraId]);

  const loadActiveExecutions = useCallback(async () => {
    if (!corretoraId || corretoraId === "__admin__") return;
    const modules: ModuleType[] = ["cobranca", "eventos", "mgf"];
    const results: Partial<Record<ModuleType, Pick<ModuleStatus, "isExecuting" | "activeExecution" | "lastStatus">>> = {};
    await Promise.all(modules.map(async (mod) => {
      try {
        const { data } = await supabase.from(EXEC_TABLES[mod] as any)
          .select("id, created_at, etapa_atual, bytes_baixados, bytes_total, progresso_download, github_run_url")
          .eq("corretora_id", corretoraId).eq("status", "executando")
          .order("created_at", { ascending: false }).limit(1) as any;
        const activeRow = data?.[0] ?? null;
        results[mod] = { isExecuting: !!activeRow, activeExecution: activeRow ? { ...activeRow, module: mod } : null, lastStatus: activeRow ? "executando" : undefined };
      } catch (e) { console.error(`Erro ao carregar execução ativa ${mod}:`, e); }
    }));
    setModuleStatuses(prev => {
      const next = { ...prev };
      for (const mod of modules) {
        const r = results[mod];
        if (r) {
          next[mod] = { ...prev[mod], isExecuting: r.isExecuting, activeExecution: r.activeExecution ?? null,
            lastStatus: r.isExecuting ? "executando" : prev[mod].isExecuting ? prev[mod].lastStatus : prev[mod].lastStatus };
        }
      }
      return next;
    });
  }, [corretoraId]);

  const loadModuleStatuses = useCallback(async () => {
    if (!corretoraId || corretoraId === "__admin__") return;
    const modules: ModuleType[] = ["cobranca", "eventos", "mgf"];
    const results: Partial<Record<ModuleType, ModuleStatus>> = {};
    await Promise.all(modules.map(async (mod) => {
      try {
        const [configRes, activeExecRes] = await Promise.all([
          supabase.from(CONFIG_TABLES[mod] as any).select("ultima_execucao, ultimo_status, ultimo_erro").eq("corretora_id", corretoraId).maybeSingle() as any,
          supabase.from(EXEC_TABLES[mod] as any).select("id, created_at, etapa_atual, bytes_baixados, bytes_total, progresso_download, github_run_url")
            .eq("corretora_id", corretoraId).eq("status", "executando").order("created_at", { ascending: false }).limit(1) as any,
        ]);
        const data = configRes.data;
        const activeRow = activeExecRes.data?.[0] ?? null;
        const activeExecution: ActiveExecution | null = activeRow ? { ...activeRow, module: mod } : null;
        const isExecuting = !!activeRow;
        if (data) {
          results[mod] = { lastExecution: data.ultima_execucao, lastStatus: isExecuting ? "executando" : data.ultimo_status,
            lastError: isExecuting ? null : data.ultimo_erro, isExecuting, activeExecution };
        } else if (isExecuting) {
          results[mod] = { lastExecution: null, lastStatus: "executando", lastError: null, isExecuting: true, activeExecution };
        }
      } catch (e) { console.error(`Erro ao carregar status ${mod}:`, e); }
    }));
    setModuleStatuses(prev => ({ ...prev, ...results }));
  }, [corretoraId]);

  useEffect(() => { if (open && corretoraId) { loadCredenciais(); loadModuleStatuses(); } }, [open, corretoraId, loadCredenciais, loadModuleStatuses]);
  useEffect(() => { if (!open) return; tickRef.current = setInterval(() => setTick(t => t + 1), 1000); return () => { if (tickRef.current) clearInterval(tickRef.current); }; }, [open]);
  useEffect(() => {
    if (!open || !corretoraId) return;
    const channels = (["cobranca", "eventos", "mgf"] as ModuleType[]).map(mod =>
      supabase.channel(`sync-btn-${mod}-${corretoraId}-${Date.now()}`).on('postgres_changes',
        { event: '*', schema: 'public', table: EXEC_TABLES[mod], filter: `corretora_id=eq.${corretoraId}` },
        () => { loadActiveExecutions(); loadModuleStatuses(); }).subscribe()
    );
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [open, corretoraId, loadActiveExecutions, loadModuleStatuses]);
  useEffect(() => {
    if (!open || !corretoraId) return;
    pollRef.current = setInterval(() => { loadActiveExecutions(); }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, corretoraId, loadActiveExecutions]);

  const generateLayoutName = (moduleSuffix: string) => {
    const nome = corretoraNome || "";
    return nome ? `Resumo VANGARD da sua operação - ${nome}` : `BI VANGARD ${moduleSuffix}`;
  };

  const handleSave = async () => {
    if (!creds.hinova_url || !creds.hinova_user || !creds.hinova_pass) { toast.error("URL, usuário e senha são obrigatórios"); return; }
    setSaving(true);
    try {
      const layoutCobranca = creds.layout_cobranca || generateLayoutName("COBRANÇA");
      const layoutEventos = creds.layout_eventos || generateLayoutName("EVENTOS");
      const layoutMgf = creds.layout_mgf || generateLayoutName("FINANCEIROS EVENTOS");
      const dataToSave = {
        corretora_id: corretoraId, hinova_url: creds.hinova_url, hinova_user: creds.hinova_user,
        hinova_pass: creds.hinova_pass, hinova_codigo_cliente: creds.hinova_codigo_cliente,
        layout_cobranca: layoutCobranca, layout_eventos: layoutEventos, layout_mgf: layoutMgf,
        url_cobranca: creds.url_cobranca, url_eventos: creds.url_eventos, url_mgf: creds.url_mgf,
        hora_agendada: creds.hora_agendada, dias_agendados: creds.dias_agendados,
        ativo_cobranca: creds.ativo_cobranca, ativo_eventos: creds.ativo_eventos, ativo_mgf: creds.ativo_mgf,
      };
      if (creds.id) {
        const { error } = await supabase.from("hinova_credenciais").update(dataToSave).eq("id", creds.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("hinova_credenciais").insert(dataToSave).select().single();
        if (error) throw error;
        setCreds(prev => ({ ...prev, id: data.id }));
      }
      setCreds(prev => ({ ...prev, layout_cobranca: layoutCobranca, layout_eventos: layoutEventos, layout_mgf: layoutMgf }));
      await syncToConfigTables();
      toast.success("Configuração salva!");
    } catch (e: any) { toast.error("Erro ao salvar: " + (e.message || "desconhecido")); }
    finally { setSaving(false); }
  };

  const syncToConfigTables = async () => {
    const baseData = { hinova_url: creds.hinova_url, hinova_user: creds.hinova_user, hinova_pass: creds.hinova_pass, hinova_codigo_cliente: creds.hinova_codigo_cliente, hora_agendada: creds.hora_agendada };
    const { data: existingCob } = await supabase.from("cobranca_automacao_config").select("id").eq("corretora_id", corretoraId).maybeSingle();
    if (existingCob) { await supabase.from("cobranca_automacao_config").update({ ...baseData, layout_relatorio: creds.layout_cobranca, ativo: creds.ativo_cobranca }).eq("id", existingCob.id); }
    else { await supabase.from("cobranca_automacao_config").insert({ ...baseData, corretora_id: corretoraId, layout_relatorio: creds.layout_cobranca, ativo: creds.ativo_cobranca }); }
    const { data: existingSga } = await supabase.from("sga_automacao_config").select("id").eq("corretora_id", corretoraId).maybeSingle();
    if (existingSga) { await supabase.from("sga_automacao_config").update({ ...baseData, ativo: creds.ativo_eventos }).eq("id", existingSga.id); }
    else { await supabase.from("sga_automacao_config").insert({ ...baseData, corretora_id: corretoraId, ativo: creds.ativo_eventos }); }
    const { data: existingMgf } = await supabase.from("mgf_automacao_config").select("id").eq("corretora_id", corretoraId).maybeSingle();
    if (existingMgf) { await supabase.from("mgf_automacao_config").update({ ...baseData, layout_relatorio: creds.layout_mgf, ativo: creds.ativo_mgf }).eq("id", existingMgf.id); }
    else { await supabase.from("mgf_automacao_config").insert({ ...baseData, corretora_id: corretoraId, layout_relatorio: creds.layout_mgf, ativo: creds.ativo_mgf }); }
  };

  const isDuplicateError = (msg: string) => msg.includes("Já houve") || msg.includes("Já existe") || msg.includes("uma por dia") || msg.includes("já integrado");

  const handleExecuteModule = async (mod: ModuleType) => {
    if (!creds.hinova_url || !creds.hinova_user || !creds.hinova_pass) { toast.error("Configure as credenciais primeiro"); setActiveView("config"); return; }
    setExecutingModule(mod);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(`${supabaseUrl}/functions/v1/${DISPATCH_FUNCTIONS[mod]}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || supabaseKey}`, 'apikey': supabaseKey },
        body: JSON.stringify({ action: "dispatch", corretora_id: corretoraId }),
      });
      const responseData = await response.json().catch(() => null);
      if (!response.ok) {
        const msg = responseData?.message || `Erro ${response.status}`;
        if (isDuplicateError(msg)) { toast.info(`${MODULE_LABELS[mod]}: Já importado hoje. Próxima importação amanhã às ${creds.hora_agendada || "08:30"}.`, { duration: 6000 }); }
        else { toast.error(msg); }
      } else if (responseData?.success) {
        toast.success(`${MODULE_LABELS[mod]} sincronização iniciada!`);
        setModuleStatuses(prev => ({ ...prev, [mod]: { ...prev[mod], isExecuting: true, lastStatus: "executando" } }));
      } else { toast.error(responseData?.message || "Erro ao iniciar"); }
    } catch (e: any) { toast.error(e.message || "Erro ao iniciar sincronização"); }
    finally { setExecutingModule(null); }
  };

  const handleStopModule = async (mod: ModuleType) => {
    setStoppingModule(mod);
    try {
      const { data: executions } = await supabase.from(EXEC_TABLES[mod] as any).select("id, github_run_id")
        .eq("corretora_id", corretoraId).eq("status", "executando").order("created_at", { ascending: false }).limit(1) as any;
      const runId = executions?.[0]?.github_run_id;
      const execId = executions?.[0]?.id;
      if (runId) { await supabase.functions.invoke(DISPATCH_FUNCTIONS[mod], { body: { action: "cancel", run_id: runId } }); }
      if (execId) {
        await supabase.from(EXEC_TABLES[mod] as any).update({ status: "parado", erro: "Interrompido pelo usuário", finalizado_at: new Date().toISOString() } as any).eq("id", execId);
        await supabase.from(CONFIG_TABLES[mod] as any).update({ ultimo_status: "parado", ultimo_erro: "Interrompido pelo usuário" } as any).eq("corretora_id", corretoraId);
      }
      toast.success(`${MODULE_LABELS[mod]} parado!`);
      loadModuleStatuses();
    } catch (e: any) { toast.error(e.message || "Erro ao parar"); }
    finally { setStoppingModule(null); }
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
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || supabaseKey}`, 'apikey': supabaseKey },
          body: JSON.stringify({ action: "dispatch", corretora_id: corretoraId }),
        });
        const responseData = await response.json().catch(() => null);
        if (!response.ok) { isDuplicateError(responseData?.message || '') ? skipped++ : errors++; }
        else if (responseData?.success) { success++; } else { errors++; }
      } catch { errors++; }
    }
    if (success > 0) toast.success(`${success} módulo(s) iniciado(s)`);
    if (skipped > 0) toast.info(`${skipped} módulo(s) já importado(s) hoje.`, { duration: 6000 });
    if (errors > 0) toast.error(`${errors} erro(s)`);
    loadModuleStatuses();
    setExecutingModule(null);
  };

  const loadHistory = async (mod: ModuleType) => {
    setHistoryLoading(true); setHistoryModule(mod);
    try {
      const fields = "id, status, erro, mensagem, created_at, finalizado_at, registros_processados, github_run_url, github_run_id, etapa_atual";
      const [successRes, errorRes, runningRes] = await Promise.all([
        supabase.from(EXEC_TABLES[mod] as any).select(fields).eq("corretora_id", corretoraId).eq("status", "sucesso").order("created_at", { ascending: false }).limit(1),
        supabase.from(EXEC_TABLES[mod] as any).select(fields).eq("corretora_id", corretoraId).eq("status", "erro").order("created_at", { ascending: false }).limit(1),
        supabase.from(EXEC_TABLES[mod] as any).select(fields).eq("corretora_id", corretoraId).eq("status", "executando").order("created_at", { ascending: false }).limit(1),
      ]);
      const logs: any[] = [...(runningRes.data || []), ...(errorRes.data || []), ...(successRes.data || [])];
      const unique = Array.from(new Map(logs.map(l => [l.id, l])).values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setHistoryLogs(unique);
    } catch (e) { console.error("Erro ao carregar histórico:", e); }
    finally { setHistoryLoading(false); }
  };

  const formatElapsed = (startIso: string) => {
    const secs = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
    if (secs < 0) return "00:00";
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const formatBytes = (bytes: number | null | undefined): string => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024, sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const STEP_INFO: Record<string, { label: string; icon: React.ReactNode }> = {
    LOGIN: { label: "Login", icon: <LogIn className="h-3 w-3" /> },
    NAVEGACAO: { label: "Navegação", icon: <Filter className="h-3 w-3" /> },
    NAVEGACAO_RELATORIO: { label: "Relatório", icon: <Filter className="h-3 w-3" /> },
    FILTROS: { label: "Filtros", icon: <Filter className="h-3 w-3" /> },
    DOWNLOAD: { label: "Download", icon: <Download className="h-3 w-3" /> },
    PROCESSANDO: { label: "Processando", icon: <Timer className="h-3 w-3" /> },
    ENVIANDO: { label: "Enviando", icon: <Send className="h-3 w-3" /> },
    CONCLUIDO: { label: "Concluído", icon: <CheckCircle className="h-3 w-3" /> },
  };

  const estimateCompletion = (exec: ActiveExecution): string | null => {
    if (!exec.bytes_baixados || !exec.bytes_total || exec.bytes_baixados === 0) return null;
    const ratio = exec.bytes_baixados / exec.bytes_total;
    if (ratio <= 0 || ratio >= 1) return null;
    const elapsed = (Date.now() - new Date(exec.created_at).getTime()) / 1000;
    const remaining = Math.max(0, (elapsed / ratio) - elapsed);
    if (remaining > 3600) return null;
    const m = Math.floor(remaining / 60);
    return m > 0 ? `~${m}min` : `~${Math.floor(remaining)}s`;
  };

  const anyExecuting = Object.values(moduleStatuses).some(s => s.isExecuting);
  const hasCredentials = !!(creds.hinova_url && creds.hinova_user && creds.hinova_pass);

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "sucesso": return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0">OK</Badge>;
      case "erro": return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] px-1.5 py-0">Erro</Badge>;
      case "executando": return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0 animate-pulse">Sync</Badge>;
      default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0">—</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-2 relative rounded-xl border transition-all duration-300 ${anyExecuting ? 'border-primary/60 bg-primary/10 text-primary shadow-md' : 'hover:border-primary/50 hover:bg-primary/5'}`}
        >
          {anyExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          <span className="hidden sm:inline font-medium">Sincronizar</span>
          {anyExecuting && <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-primary animate-pulse ring-2 ring-background" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-0 gap-0 rounded-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="border-b px-5 py-4 bg-muted/20 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Sincronização</h2>
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{corretoraNome}</p>
            </div>
            <div className="flex items-center gap-2">
              {hasCredentials && (
                <Button 
                  size="sm" variant="default"
                  onClick={handleExecuteAll}
                  disabled={executingModule !== null || anyExecuting}
                  className="gap-1.5 h-8 text-xs rounded-xl"
                >
                  {executingModule === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  Executar Todos
                </Button>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 mt-3">
            {[
              { id: "modules" as const, label: "Módulos", icon: Zap },
              { id: "config" as const, label: "Configuração", icon: Settings },
              { id: "history" as const, label: "Histórico", icon: RefreshCw },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => { setActiveView(v.id); if (v.id === "history") loadHistory(historyModule); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeView === v.id 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <v.icon className="h-3 w-3" />
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {activeView === "modules" && (
            <div className="p-4 space-y-2">
              {!hasCredentials ? (
                <div className="text-center py-8 space-y-3">
                  <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto">
                    <WifiOff className="h-6 w-6 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Credenciais não configuradas</p>
                    <p className="text-xs text-muted-foreground mt-1">Configure o acesso ao Hinova para iniciar</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setActiveView("config")} className="rounded-xl">
                    <Settings className="h-3.5 w-3.5 mr-1.5" />
                    Configurar agora
                  </Button>
                </div>
              ) : (
                (["cobranca", "eventos", "mgf"] as ModuleType[]).map((mod) => {
                  const status = moduleStatuses[mod];
                  const exec = status.activeExecution;
                  const colors = MODULE_COLORS[mod];
                  const downloadPct = exec?.progresso_download ?? 
                    (exec?.bytes_baixados && exec?.bytes_total && exec.bytes_total > 0
                      ? Math.round((exec.bytes_baixados / exec.bytes_total) * 100) : null);

                  return (
                    <div key={mod} className="rounded-2xl border bg-card overflow-hidden transition-all hover:shadow-sm">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className={`h-10 w-10 rounded-xl ${colors.bg} flex items-center justify-center shrink-0`}>
                          <Wifi className={`h-5 w-5 ${colors.icon}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{MODULE_LABELS[mod]}</span>
                            {getStatusBadge(status.lastStatus)}
                            {status.isExecuting && exec && (
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {formatElapsed(exec.created_at)}
                              </span>
                            )}
                          </div>
                          {status.isExecuting && exec?.etapa_atual ? (
                            <div className="flex items-center gap-1 text-[11px] text-primary mt-0.5">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>{STEP_INFO[exec.etapa_atual.toUpperCase()]?.label || exec.etapa_atual}</span>
                              {exec.bytes_baixados != null && exec.bytes_baixados > 0 && (
                                <span className="text-muted-foreground ml-1">· {formatBytes(exec.bytes_baixados)}</span>
                              )}
                            </div>
                          ) : status.lastExecution ? (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Última: {format(new Date(status.lastExecution), "dd/MM HH:mm", { locale: ptBR })}
                            </p>
                          ) : (
                            <p className="text-[11px] text-muted-foreground mt-0.5">Nunca executado</p>
                          )}
                          {status.lastStatus === "erro" && status.lastError && !status.isExecuting && (
                            <p className="text-[10px] text-destructive truncate max-w-[250px] mt-0.5">{status.lastError}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {status.isExecuting && exec?.github_run_url && (
                            <a href={exec.github_run_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground p-1">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {status.isExecuting ? (
                            <Button size="icon" variant="ghost" onClick={() => handleStopModule(mod)} disabled={stoppingModule === mod}
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg">
                              {stoppingModule === mod ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 fill-current" />}
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" onClick={() => handleExecuteModule(mod)} disabled={executingModule !== null}
                              className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary">
                              {executingModule === mod ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                      </div>

                      {status.isExecuting && exec && (
                        <div className="border-t bg-muted/20 px-4 py-2.5 space-y-2">
                          {exec.etapa_atual?.toUpperCase() === "DOWNLOAD" && downloadPct != null && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1"><Download className="h-3 w-3" />Download</span>
                                <span className="font-medium text-primary">{downloadPct}%</span>
                              </div>
                              <Progress value={downloadPct} className="h-1.5" />
                              {estimateCompletion(exec) && (
                                <p className="text-[10px] text-muted-foreground text-right">{estimateCompletion(exec)}</p>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            {(["LOGIN", "FILTROS", "DOWNLOAD", "ENVIANDO"] as const).map((step) => {
                              const currentStep = exec.etapa_atual?.toUpperCase() || "";
                              const steps = ["LOGIN", "NAVEGACAO", "NAVEGACAO_RELATORIO", "FILTROS", "DOWNLOAD", "PROCESSANDO", "ENVIANDO", "CONCLUIDO"];
                              const currentIdx = steps.indexOf(currentStep);
                              const stepIdx = steps.indexOf(step);
                              const isPast = currentIdx > stepIdx;
                              const isCurrent = step === "FILTROS"
                                ? ["FILTROS", "NAVEGACAO", "NAVEGACAO_RELATORIO"].includes(currentStep)
                                : currentStep === step || (step === "DOWNLOAD" && currentStep === "PROCESSANDO");
                              return (
                                <div key={step} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] border flex-1 justify-center transition-all ${
                                  isCurrent ? "bg-primary/15 border-primary/40 text-primary font-medium" :
                                  isPast ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" :
                                  "bg-muted/50 border-border/50 text-muted-foreground/40"
                                }`}>
                                  {isCurrent ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : isPast ? <CheckCircle className="h-2.5 w-2.5" /> : null}
                                  <span>{step === "LOGIN" ? "Login" : step === "FILTROS" ? "Filtros" : step === "DOWNLOAD" ? "Download" : "Envio"}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeView === "config" && (
            <div className="p-4">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credenciais de Acesso</p>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-xs">URL de Login</Label>
                        <Input value={creds.hinova_url} onChange={e => setCreds(p => ({...p, hinova_url: e.target.value}))} placeholder="https://sga.hinova.com.br/..." className="h-9 text-sm rounded-xl" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Usuário</Label>
                          <Input value={creds.hinova_user} onChange={e => setCreds(p => ({...p, hinova_user: e.target.value}))} className="h-9 text-sm rounded-xl" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Senha</Label>
                          <div className="flex gap-1">
                            <Input type={showPassword ? "text" : "password"} value={creds.hinova_pass} onChange={e => setCreds(p => ({...p, hinova_pass: e.target.value}))} className="h-9 text-sm rounded-xl" />
                            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-xl" onClick={() => setShowPassword(!showPassword)}>
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Código Cliente</Label>
                          <Input value={creds.hinova_codigo_cliente} onChange={e => setCreds(p => ({...p, hinova_codigo_cliente: e.target.value}))} className="h-9 text-sm rounded-xl" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Horário Sync</Label>
                          <Input type="time" value={creds.hora_agendada} onChange={e => setCreds(p => ({...p, hora_agendada: e.target.value}))} className="h-9 text-sm rounded-xl" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Dias da Semana</Label>
                    <div className="flex gap-1">
                      {[{ label: "D", value: 0 }, { label: "S", value: 1 }, { label: "T", value: 2 }, { label: "Q", value: 3 }, { label: "Q", value: 4 }, { label: "S", value: 5 }, { label: "S", value: 6 }].map((dia) => {
                        const isSelected = !creds.dias_agendados || creds.dias_agendados.includes(dia.value);
                        return (
                          <button key={dia.value} type="button"
                            onClick={() => {
                              setCreds(prev => {
                                const current = prev.dias_agendados ?? [0,1,2,3,4,5,6];
                                const next = current.includes(dia.value) ? current.filter(d => d !== dia.value) : [...current, dia.value].sort();
                                return { ...prev, dias_agendados: next.length === 7 ? null : next.length === 0 ? [dia.value] : next };
                              });
                            }}
                            className={`h-8 w-8 rounded-lg text-xs font-medium border transition-all ${
                              isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                            }`}
                          >{dia.label}</button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{!creds.dias_agendados ? "Todos os dias" : `${creds.dias_agendados.length} dia(s)`}</p>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Módulos & URLs</p>
                    {(["cobranca", "eventos", "mgf"] as ModuleType[]).map((mod) => {
                      const urlKey = `url_${mod}` as keyof HinovaCredenciais;
                      const ativoKey = `ativo_${mod}` as keyof HinovaCredenciais;
                      return (
                        <div key={mod} className="rounded-xl border p-3 space-y-2 bg-muted/10">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{MODULE_LABELS[mod]}</span>
                            <Switch checked={creds[ativoKey] as boolean} onCheckedChange={v => setCreds(p => ({...p, [ativoKey]: v}))} />
                          </div>
                          <Input 
                            value={creds[urlKey] as string} 
                            onChange={e => setCreds(p => ({...p, [urlKey]: e.target.value}))} 
                            placeholder={`URL do relatório ${MODULE_LABELS[mod]}`} 
                            className="h-8 text-xs rounded-lg" 
                          />
                        </div>
                      );
                    })}
                  </div>

                  <Button onClick={handleSave} disabled={saving} className="w-full h-9 text-sm gap-1.5 rounded-xl">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar Configuração
                  </Button>
                </div>
              )}
            </div>
          )}

          {activeView === "history" && (
            <div className="p-4 space-y-3">
              <div className="flex gap-1.5">
                {(["cobranca", "eventos", "mgf"] as ModuleType[]).map(mod => (
                  <button key={mod}
                    onClick={() => loadHistory(mod)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      historyModule === mod 
                        ? "bg-primary text-primary-foreground shadow-sm" 
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >{MODULE_LABELS[mod]}</button>
                ))}
              </div>

              <div className="space-y-2">
                {historyLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : historyLogs.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <RefreshCw className="h-8 w-8 mx-auto text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Nenhum registro encontrado</p>
                  </div>
                ) : (
                  historyLogs.map(log => (
                    <div key={log.id} className={`rounded-xl border p-3 transition-all ${
                      log.status === "sucesso" ? "border-emerald-500/20 bg-emerald-500/5" :
                      log.status === "erro" ? "border-destructive/20 bg-destructive/5" :
                      log.status === "executando" ? "border-primary/20 bg-primary/5" :
                      "border-border bg-muted/20"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          {log.status === "sucesso" ? <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" /> :
                           log.status === "erro" ? <XCircle className="h-4 w-4 text-destructive shrink-0" /> :
                           log.status === "executando" ? <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" /> :
                           <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium capitalize">{log.status}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            {log.status === "sucesso" && log.registros_processados && (
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                {log.registros_processados.toLocaleString('pt-BR')} registros
                              </p>
                            )}
                            {log.status === "erro" && log.erro && (
                              <p className="text-[10px] text-destructive truncate max-w-[260px]">{log.erro}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {log.status === "executando" && (
                            <Button size="icon" variant="ghost"
                              onClick={async () => {
                                if (log.github_run_id) {
                                  setStoppingModule(historyModule);
                                  try {
                                    await supabase.functions.invoke(DISPATCH_FUNCTIONS[historyModule], { body: { action: "cancel", run_id: log.github_run_id } });
                                    await supabase.from(EXEC_TABLES[historyModule] as any).update({ status: "parado", erro: "Interrompido pelo usuário", finalizado_at: new Date().toISOString() } as any).eq("id", log.id);
                                    await supabase.from(CONFIG_TABLES[historyModule] as any).update({ ultimo_status: "parado", ultimo_erro: "Interrompido pelo usuário" } as any).eq("corretora_id", corretoraId);
                                    toast.success("Parado!"); loadHistory(historyModule); loadModuleStatuses();
                                  } catch (e: any) { toast.error(e.message || "Erro"); }
                                  finally { setStoppingModule(null); }
                                }
                              }}
                              disabled={stoppingModule === historyModule}
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                            >
                              {stoppingModule === historyModule ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current" />}
                            </Button>
                          )}
                          {log.github_run_url && (
                            <a href={log.github_run_url} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-foreground">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
