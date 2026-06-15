import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Plus, Loader2, CheckCircle2, XCircle, Clock, ExternalLink, X, RefreshCw, AlertTriangle, Trash2, Repeat, Database, Timer, CalendarDays, TrendingUp, Activity, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useBackfillJobs, BackfillModulo, BackfillJob } from "@/hooks/useBackfillJobs";
import { useBackfillRecurrence } from "@/hooks/useBackfillRecurrence";

const MODULES: { id: BackfillModulo; label: string; color: string }[] = [
  { id: "cobranca", label: "Cobrança", color: "emerald" },
  { id: "eventos", label: "Eventos", color: "blue" },
  { id: "mgf", label: "MGF", color: "purple" },
];

function toISO(d: Date): string {
  // YYYY-MM-DD em horário local (sem deslocamento UTC)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtBR(iso: string): string {
  return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
}

function fmtDuration(startISO?: string | null, endISO?: string | null): string | null {
  if (!startISO || !endISO) return null;
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  if (!isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function diasNoPeriodo(ini: string, fim: string): number {
  const a = parseISO(ini).getTime();
  const b = parseISO(fim).getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function presetRanges() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return [
    { label: "Mês anterior", inicio: startOfMonth(prevMonth), fim: endOfMonth(prevMonth) },
    { label: "Mês atual", inicio: startOfMonth(now), fim: today },
    { label: "Últimos 6 meses", inicio: new Date(now.getFullYear(), now.getMonth() - 6, 1), fim: today },
    { label: "Ano anterior", inicio: new Date(now.getFullYear() - 1, 0, 1), fim: new Date(now.getFullYear() - 1, 11, 31) },
    { label: "Ano atual", inicio: new Date(now.getFullYear(), 0, 1), fim: today },
    { label: "Tudo", inicio: new Date(2020, 0, 1), fim: today },
  ];
}

function statusBadge(s: BackfillJob["status"]) {
  switch (s) {
    case "pendente": return <Badge variant="outline" className="text-[10px] gap-1"><Clock className="h-2.5 w-2.5" />Aguardando</Badge>;
    case "executando": return <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30 gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" />Executando</Badge>;
    case "concluido": return <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1"><CheckCircle2 className="h-2.5 w-2.5" />Concluído</Badge>;
    case "falhou": return <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 gap-1"><XCircle className="h-2.5 w-2.5" />Falhou</Badge>;
    case "cancelado": return <Badge variant="outline" className="text-[10px] gap-1">Cancelado</Badge>;
  }
}

interface Props {
  corretoraId: string;
}

export default function BackfillPanel({ corretoraId }: Props) {
  const [modulo, setModulo] = useState<BackfillModulo>("cobranca");
  const [mode, setMode] = useState<"periodo" | "dia">("periodo");
  const [dataInicio, setDataInicio] = useState<Date | undefined>();
  const [dataFim, setDataFim] = useState<Date | undefined>();
  const [diaUnico, setDiaUnico] = useState<Date | undefined>();
  const [adding, setAdding] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const { jobs, loading } = useBackfillJobs(corretoraId, modulo);
  const { rec, horaAgendada, enable, disable } = useBackfillRecurrence(corretoraId, modulo);
  const autoAtivo = !!rec?.ativo;

  const presets = useMemo(presetRanges, []);

  // Métricas de estabilidade do módulo selecionado (calculadas a partir do histórico carregado)
  const stats = useMemo(() => {
    const finalizados = jobs.filter(j => j.status === "concluido" || j.status === "falhou");
    const total = finalizados.length;
    const sucessos = jobs.filter(j => j.status === "concluido").length;
    const falhas = jobs.filter(j => j.status === "falhou").length;
    const taxa = total > 0 ? Math.round((sucessos / total) * 100) : null;

    const duracoes: number[] = [];
    for (const j of jobs) {
      if (j.status !== "concluido" || !j.iniciado_em || !j.concluido_em) continue;
      const ms = new Date(j.concluido_em).getTime() - new Date(j.iniciado_em).getTime();
      if (isFinite(ms) && ms > 0) duracoes.push(ms);
    }
    const tempoMedioMs = duracoes.length
      ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
      : null;

    const totalRegistros = jobs
      .filter(j => j.status === "concluido")
      .reduce((acc, j) => acc + (j.registros_importados ?? 0), 0);

    return { total, sucessos, falhas, taxa, tempoMedioMs, totalRegistros };
  }, [jobs]);

  const fmtMs = (ms: number | null): string => {
    if (ms == null) return "—";
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  const taxaColor =
    stats.taxa == null ? "text-muted-foreground" :
    stats.taxa >= 90 ? "text-emerald-600 dark:text-emerald-400" :
    stats.taxa >= 70 ? "text-amber-600 dark:text-amber-400" :
    "text-destructive";

  // Detecta overlap client-side com jobs existentes (não cancelado/falhou)
  const overlapMessage = useMemo(() => {
    let inicio: Date | undefined, fim: Date | undefined;
    if (mode === "dia" && diaUnico) { inicio = diaUnico; fim = diaUnico; }
    if (mode === "periodo" && dataInicio && dataFim) { inicio = dataInicio; fim = dataFim; }
    if (!inicio || !fim) return null;
    const i = toISO(inicio), f = toISO(fim);
    const conflict = jobs.find(j =>
      ["pendente", "executando", "concluido"].includes(j.status) &&
      !(j.data_fim < i || j.data_inicio > f)
    );
    if (!conflict) return null;
    return `Período conflita com ${fmtBR(conflict.data_inicio)} → ${fmtBR(conflict.data_fim)} (${conflict.status})`;
  }, [mode, diaUnico, dataInicio, dataFim, jobs]);

  const applyPreset = (p: { inicio: Date; fim: Date }) => {
    setMode("periodo");
    setDataInicio(p.inicio);
    setDataFim(p.fim);
  };

  const addJob = async () => {
    let inicio: Date | undefined, fim: Date | undefined;
    if (mode === "dia") { inicio = diaUnico; fim = diaUnico; }
    else { inicio = dataInicio; fim = dataFim; }
    if (!inicio || !fim) { toast.error("Selecione o período"); return; }
    if (inicio > fim) { toast.error("Data inicial maior que a final"); return; }
    if (overlapMessage) { toast.error(overlapMessage); return; }

    setAdding(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("backfill_jobs" as any).insert({
        corretora_id: corretoraId,
        modulo,
        data_inicio: toISO(inicio),
        data_fim: toISO(fim),
        created_by: userRes.user?.id,
      } as any);
      if (error) throw error;
      toast.success("Período adicionado à fila");
      setDataInicio(undefined); setDataFim(undefined); setDiaUnico(undefined);

      // Dispara o worker imediatamente
      supabase.functions.invoke("backfill-worker", { body: {} }).catch(() => {});
    } catch (e: any) {
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("overlap") || msg.includes("exclude")) {
        toast.error("Esse período já está na fila ou foi importado");
      } else {
        toast.error("Erro: " + (e?.message || "desconhecido"));
      }
    } finally { setAdding(false); }
  };

  const cancelJob = async (id: string) => {
    await supabase.from("backfill_jobs" as any).update({ status: "cancelado", concluido_em: new Date().toISOString() } as any).eq("id", id);
    toast.success("Cancelado");
  };

  const retryJob = async (job: BackfillJob) => {
    setAdding(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      // Cancela o anterior pra liberar overlap
      await supabase.from("backfill_jobs" as any).delete().eq("id", job.id);
      const { error } = await supabase.from("backfill_jobs" as any).insert({
        corretora_id: corretoraId, modulo: job.modulo,
        data_inicio: job.data_inicio, data_fim: job.data_fim,
        created_by: userRes.user?.id,
      } as any);
      if (error) throw error;
      toast.success("Reenfileirado");
      supabase.functions.invoke("backfill-worker", { body: {} }).catch(() => {});
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || "desconhecido"));
    } finally { setAdding(false); }
  };

  const runJobNow = async (job: BackfillJob) => {
    if (job.status !== "pendente") return;
    setRunningJobId(job.id);
    try {
      // Dispara o worker para consumir a fila imediatamente
      const { error } = await supabase.functions.invoke("backfill-worker", { body: { force: true, job_id: job.id } });
      if (error) throw error;
      toast.success("Worker disparado — execução iniciada");
    } catch (e: any) {
      toast.error("Erro ao disparar: " + (e?.message || "desconhecido"));
    } finally { setRunningJobId(null); }
  };

  const clearConcluded = async () => {
    const ids = jobs.filter(j => j.status === "concluido" || j.status === "cancelado").map(j => j.id);
    if (!ids.length) return;
    await supabase.from("backfill_jobs" as any).delete().in("id", ids);
    toast.success(`${ids.length} item(ns) limpos`);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Tabs de módulo */}
      <div className="flex items-center gap-1.5">
        {MODULES.map(m => (
          <button
            key={m.id}
            onClick={() => setModulo(m.id)}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              modulo === m.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Métricas de estabilidade do módulo */}
      <div className="rounded-2xl border bg-muted/40 backdrop-blur p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Activity className="h-3 w-3" /> Estabilidade — {MODULES.find(m => m.id === modulo)?.label}
          </Label>
          <span className="text-[10px] text-muted-foreground">últimas {jobs.length} execuções</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg bg-background/60 border p-2">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-2.5 w-2.5" /> Sucesso
            </div>
            <p className={cn("text-base font-bold leading-tight mt-0.5", taxaColor)}>
              {stats.taxa != null ? `${stats.taxa}%` : "—"}
            </p>
            <p className="text-[9px] text-muted-foreground">{stats.sucessos}/{stats.total} ok</p>
          </div>
          <div className="rounded-lg bg-background/60 border p-2">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
              <Timer className="h-2.5 w-2.5" /> Tempo médio
            </div>
            <p className="text-base font-bold leading-tight mt-0.5">{fmtMs(stats.tempoMedioMs)}</p>
            <p className="text-[9px] text-muted-foreground">por execução</p>
          </div>
          <div className="rounded-lg bg-background/60 border p-2">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
              <XCircle className="h-2.5 w-2.5" /> Falhas
            </div>
            <p className={cn("text-base font-bold leading-tight mt-0.5", stats.falhas > 0 ? "text-destructive" : "")}>
              {stats.falhas}
            </p>
            <p className="text-[9px] text-muted-foreground">no período</p>
          </div>
          <div className="rounded-lg bg-background/60 border p-2">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
              <Database className="h-2.5 w-2.5" /> Registros
            </div>
            <p className="text-base font-bold leading-tight mt-0.5">{stats.totalRegistros.toLocaleString("pt-BR")}</p>
            <p className="text-[9px] text-muted-foreground">importados</p>
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="space-y-2">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Presets rápidos</Label>
        <div className="flex flex-wrap gap-1.5">
          {presets.map(p => (
            <Button key={p.label} size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => applyPreset(p)}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Modo + Datas */}
      <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={mode === "periodo"} onChange={() => setMode("periodo")} className="h-3 w-3" />
            Por período
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={mode === "dia"} onChange={() => setMode("dia")} className="h-3 w-3" />
            Por dia
          </label>
        </div>

        {mode === "periodo" ? (
          <div className="grid grid-cols-2 gap-2">
            <DateField label="De" value={dataInicio} onChange={setDataInicio} />
            <DateField label="Até" value={dataFim} onChange={setDataFim} />
          </div>
        ) : (
          <>
            {!autoAtivo && <DateField label="Dia" value={diaUnico} onChange={setDiaUnico} />}
            <div className="rounded-lg border bg-background/60 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Repeat className="h-3.5 w-3.5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium">Repetir todo dia (D-1)</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Usa o horário definido em Configurações{horaAgendada ? ` (${horaAgendada})` : ""}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={autoAtivo}
                  onCheckedChange={async (v) => {
                    const err = v ? await enable(1) : await disable();
                    if (err) toast.error("Erro: " + err.message);
                    else toast.success(v ? "Regra automática ativada" : "Regra desativada");
                  }}
                />
              </div>
              {autoAtivo && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Próxima execução: {horaAgendada || "03:00"} (America/São_Paulo) — busca o dia anterior
                  {rec?.ultima_execucao_em && (
                    <span className="ml-1">· Última: {format(new Date(rec.ultima_execucao_em), "dd/MM HH:mm")}</span>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {overlapMessage && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg p-2">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{overlapMessage}</span>
          </div>
        )}

        <Button size="sm" onClick={addJob} disabled={adding || !!overlapMessage || (mode === "dia" && autoAtivo)} className="w-full h-8 rounded-xl gap-1.5">
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {mode === "dia" && autoAtivo ? "Regra automática ativa" : "Adicionar à fila"}
        </Button>
      </div>

      {/* Fila */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fila ({jobs.length})</Label>
          {jobs.some(j => j.status === "concluido" || j.status === "cancelado") && (
            <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={clearConcluded}>
              <Trash2 className="h-3 w-3" />Limpar concluídos
            </Button>
          )}
        </div>
        {loading ? (
          <div className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">Fila vazia</div>
        ) : (
          <div className="space-y-1.5">
            {jobs.map(job => (
              <div key={job.id} className="rounded-xl border bg-card p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {statusBadge(job.status)}
                    <span className="text-xs font-medium truncate">
                      {job.data_inicio === job.data_fim ? fmtBR(job.data_inicio) : `${fmtBR(job.data_inicio)} → ${fmtBR(job.data_fim)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {job.github_run_url && (
                      <a href={job.github_run_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground p-1">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {job.status === "falhou" && (
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => retryJob(job)} title="Tentar novamente">
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    )}
                    {(job.status === "pendente" || job.status === "executando") && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => cancelJob(job.id)} title="Cancelar">
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                {job.status === "executando" && (
                  <Progress value={job.progresso} className="h-1" />
                )}
                {job.status === "concluido" && (
                  <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                      <CheckCircle2 className="h-3 w-3" /> Resumo da execução
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Database className="h-3 w-3" />
                        <span className="text-foreground font-medium">{(job.registros_importados ?? 0).toLocaleString("pt-BR")}</span> registros
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <CalendarDays className="h-3 w-3" />
                        <span className="text-foreground font-medium">{diasNoPeriodo(job.data_inicio, job.data_fim)}</span> dia(s)
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground col-span-2">
                        <Clock className="h-3 w-3" />
                        Período: <span className="text-foreground font-medium">{fmtBR(job.data_inicio)} → {fmtBR(job.data_fim)}</span>
                      </div>
                      {fmtDuration(job.iniciado_em, job.concluido_em) && (
                        <div className="flex items-center gap-1 text-muted-foreground col-span-2">
                          <Timer className="h-3 w-3" />
                          Duração: <span className="text-foreground font-medium">{fmtDuration(job.iniciado_em, job.concluido_em)}</span>
                          {job.concluido_em && (
                            <span className="ml-auto">{format(new Date(job.concluido_em), "dd/MM HH:mm")}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {job.status === "falhou" && job.erro && (
                  <p className="text-[10px] text-destructive line-clamp-2">{job.erro}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: Date | undefined; onChange: (d: Date | undefined) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("h-8 w-full justify-start text-xs rounded-lg font-normal", !value && "text-muted-foreground")}>
            <CalendarIcon className="h-3 w-3 mr-1.5" />
            {value ? format(value, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={onChange} initialFocus locale={ptBR} className={cn("p-3 pointer-events-auto")} />
        </PopoverContent>
      </Popover>
    </div>
  );
}