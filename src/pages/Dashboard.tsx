import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from
"recharts";
import {
  TrendingUp, Clock, CheckCircle2, Megaphone, ExternalLink, Plus, Mail, Users, Check,
  Calendar, Target, BarChart3, Workflow, FileText, MessageSquare, Shield, Building2, UserCheck,
  Video, AlertTriangle, ChevronLeft, ChevronRight, FileSignature, Link as LinkIcon } from
"lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Atendimento } from "@/types/atendimento";
import { Comunicado } from "@/types/comunicado";
import { AlertasDialog } from "@/components/AlertasDialog";
import { UserProfile } from "@/components/UserProfile";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  format, parseISO, formatDistanceToNow, startOfDay, endOfDay,
  startOfWeek, endOfWeek, addDays, isSameDay, addWeeks, subWeeks, isAfter, isBefore } from
"date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { usePendingUsers } from "@/hooks/usePendingUsers";
import { useOverdueAtendimentos } from "@/hooks/useOverdueAtendimentos";
import { useWhatsAppUnread } from "@/hooks/useWhatsAppUnread";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
const ttStyle = { borderRadius: 10, fontSize: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" };
const JITSI_DOMAIN = "talk.uon1.com.br";

// ── Mini Components ─────────────────────────────────────────

function MiniDonut({ data, total }: {data: {name: string;value: number;}[];total: number;}) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>;
  const top = data.slice(0, 5);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={80} height={80}>
        <PieChart>
          <Pie data={top} dataKey="value" innerRadius={22} outerRadius={38} paddingAngle={2} startAngle={90} endAngle={-270}>
            {top.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1 min-w-0">
        {top.map((item, i) =>
        <div key={item.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-xs text-muted-foreground truncate flex-1">{item.name}</span>
            <span className="text-xs font-bold tabular-nums">{item.value}</span>
          </div>
        )}
      </div>
    </div>);

}

function BarWidget({ data, total }: {data: {name: string;value: number;}[];total: number;}) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>;
  return (
    <div className="space-y-2">
      {data.map((item, i) => {
        const pct = total > 0 ? item.value / total * 100 : 0;
        return (
          <div key={item.name} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate w-24 shrink-0">{item.name}</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
            </div>
            <span className="text-xs font-bold tabular-nums w-8 text-right">{item.value}</span>
          </div>);

      })}
    </div>);

}

// ── Interfaces ──────────────────────────────────────────────

interface CompromissoItem {
  id: string;titulo: string;descricao?: string;horario_inicio: string;
  horario_fim?: string;local?: string;tipo: "evento" | "atendimento";
  cor: string;prioridade?: string;status?: string;originalId: string;
}

interface ContratoResumo {
  id: string;numero: string;titulo: string;status: string;
  data_fim: string | null;contratante_nome: string | null;
}

interface ReuniaoResumo {
  id: string;titulo: string;data_inicio: string;data_fim: string;
  sala_id: string;status: string;
}

// ── Main Dashboard ──────────────────────────────────────────

export default function Dashboard() {
  const { user, userRole } = useAuth();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [compromissos, setCompromissos] = useState<CompromissoItem[]>([]);
  const [weekCompromissos, setWeekCompromissos] = useState<CompromissoItem[]>([]);
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoUrl] = useLocalStorage<string>("app-logo-url", "");
  const unreadMessages = useUnreadMessages();
  const whatsappUnread = useWhatsAppUnread();
  const pendingUsers = usePendingUsers();
  const { overdueCount, overdueList } = useOverdueAtendimentos();
  const [statusFinalizados, setStatusFinalizados] = useState<Set<string>>(new Set());
  const [statusBacklog, setStatusBacklog] = useState<Set<string>>(new Set());
  const [statusEmAndamento, setStatusEmAndamento] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [totalCorretoras, setTotalCorretoras] = useState(0);
  const [contratos, setContratos] = useState<ContratoResumo[]>([]);
  const [reunioes, setReunioes] = useState<ReuniaoResumo[]>([]);
  const [syncErrorCount, setSyncErrorCount] = useState(0);
  const [calWeek, setCalWeek] = useState(new Date());
  const [atendimentoTab, setAtendimentoTab] = useState("administradora");
  const [fluxos, setFluxos] = useState<{id: string;nome: string;}[]>([]);

  // SGA atendimentos (Gestão Associação)
  const [sgaEventos, setSgaEventos] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [statusRes, profilesRes, corretorasRes, contratosRes, reunioesRes, sgaRes, fluxosRes] = await Promise.all([
        supabase.from("status_config").select("nome, tipo_etapa").eq("ativo", true),
        supabase.from("profiles").select("id, nome"),
        supabase.from("corretoras").select("id", { count: "exact", head: true }),
        supabase.from("contratos").select("id, numero, titulo, status, data_fim, contratante_nome").eq("arquivado", false).order("created_at", { ascending: false }).limit(50),
        supabase.from("reunioes").select("id, titulo, data_inicio, data_fim, sala_id, status").in("status", ["agendada", "em_andamento"]).gte("data_inicio", new Date().toISOString()).order("data_inicio", { ascending: true }).limit(5),
        supabase.from("sga_eventos").select("id, protocolo, situacao_evento, data_evento, tipo_evento, associado_nome, corretora_id").order("created_at", { ascending: false }).limit(500),
        supabase.from("fluxos").select("id, nome").eq("ativo", true).order("ordem", { ascending: true })]
        );
        if (statusRes.data) {
          setStatusFinalizados(new Set(statusRes.data.filter((s) => s.tipo_etapa === "finalizado").map((s) => s.nome)));
          setStatusBacklog(new Set(statusRes.data.filter((s) => s.tipo_etapa === "backlog").map((s) => s.nome)));
          setStatusEmAndamento(new Set(statusRes.data.filter((s) => s.tipo_etapa === "em_andamento").map((s) => s.nome)));
        }
        if (profilesRes.data) setProfiles(profilesRes.data.reduce((a, p) => {a[p.id] = p.nome;return a;}, {} as Record<string, string>));
        setTotalCorretoras(corretorasRes.count || 0);
        setContratos((contratosRes.data || []) as ContratoResumo[]);
        setReunioes((reunioesRes.data || []) as ReuniaoResumo[]);
        setSgaEventos(sgaRes.data || []);
        setFluxos((fluxosRes.data || []) as {id: string;nome: string;}[]);

        // Count sync errors (just the total)
        const [cobErr, sgaErr, mgfErr] = await Promise.all([
        supabase.from("cobranca_automacao_execucoes").select("id", { count: "exact", head: true }).eq("status", "erro"),
        supabase.from("sga_automacao_execucoes").select("id", { count: "exact", head: true }).eq("status", "erro"),
        supabase.from("mgf_automacao_execucoes").select("id", { count: "exact", head: true }).eq("status", "erro")]
        );
        setSyncErrorCount((cobErr.count || 0) + (sgaErr.count || 0) + (mgfErr.count || 0));
      } catch (e) {
        console.error("[Dashboard] Error loading data:", e);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
    const ch1 = supabase.channel("dash_ev").on("postgres_changes", { event: "*", schema: "public", table: "eventos" }, () => {loadCompromissos();loadWeekCompromissos();}).subscribe();
    const ch2 = supabase.channel("dash_at").on("postgres_changes", { event: "*", schema: "public", table: "atendimentos" }, () => {loadAtendimentos();loadCompromissos();loadWeekCompromissos();}).subscribe();
    const ch3 = supabase.channel("dash_co").on("postgres_changes", { event: "*", schema: "public", table: "comunicados" }, () => loadComunicados()).subscribe();
    return () => {supabase.removeChannel(ch1);supabase.removeChannel(ch2);supabase.removeChannel(ch3);};
  }, [user]);

  useEffect(() => {if (user) loadWeekCompromissos();}, [calWeek, user]);

  const loadData = async () => {setLoading(true);await Promise.all([loadAtendimentos(), loadCompromissos(), loadWeekCompromissos(), loadComunicados()]);setLoading(false);};

  const loadAtendimentos = async () => {
    try {
      const { data, error } = await supabase.from("atendimentos").select("id, numero, assunto, corretora_id, contato_id, responsavel_id, prioridade, status, tags, observacoes, data_retorno, data_concluido, fluxo_concluido_nome, fluxo_concluido_id, fluxo_id, created_at, updated_at").order("created_at", { ascending: false });
      if (error) throw error;
      setAtendimentos(data?.map((i) => ({ id: i.id, numero: i.numero, assunto: i.assunto, corretora: i.corretora_id || "", corretoraId: i.corretora_id || undefined, contato: i.contato_id || "", responsavel: i.responsavel_id || "", prioridade: i.prioridade, status: i.status, tags: i.tags || [], observacoes: i.observacoes || "", dataRetorno: i.data_retorno, dataConcluido: i.data_concluido, fluxoConcluido: i.fluxo_concluido_nome, fluxoConcluidoId: i.fluxo_concluido_id, fluxoId: i.fluxo_id, createdAt: i.created_at, updatedAt: i.updated_at })) || []);
    } catch (e) {console.error(e);}
  };

  const loadCompromissos = async () => {
    try {
      const hoje = new Date();
      const [evRes, atRes] = await Promise.all([
      supabase.from("eventos").select("id, titulo, descricao, data_inicio, data_fim, local, cor").eq("user_id", user?.id).gte("data_inicio", startOfDay(hoje).toISOString()).lte("data_inicio", endOfDay(hoje).toISOString()).order("data_inicio", { ascending: true }),
      supabase.from("atendimentos").select("id, assunto, observacoes, data_retorno, prioridade, status").eq("user_id", user?.id).gte("data_retorno", startOfDay(hoje).toISOString()).lte("data_retorno", endOfDay(hoje).toISOString()).neq("status", "concluido").order("data_retorno", { ascending: true })]
      );
      const items: CompromissoItem[] = [];
      evRes.data?.forEach((e) => items.push({ id: `ev-${e.id}`, originalId: e.id, titulo: e.titulo, descricao: e.descricao, horario_inicio: e.data_inicio, horario_fim: e.data_fim, local: e.local, tipo: "evento", cor: e.cor || "#3b82f6" }));
      atRes.data?.forEach((a) => items.push({ id: `at-${a.id}`, originalId: a.id, titulo: a.assunto, descricao: a.observacoes, horario_inicio: a.data_retorno!, tipo: "atendimento", cor: a.prioridade === "Alta" ? "#ef4444" : a.prioridade === "Média" ? "#f59e0b" : "#10b981", prioridade: a.prioridade, status: a.status }));
      items.sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
      setCompromissos(items);
    } catch (e) {console.error(e);}
  };

  const loadWeekCompromissos = async () => {
    try {
      const wStart = startOfWeek(calWeek, { locale: ptBR });
      const wEnd = endOfWeek(calWeek, { locale: ptBR });
      const [evRes, atRes] = await Promise.all([
      supabase.from("eventos").select("id, titulo, data_inicio, cor").eq("user_id", user?.id).gte("data_inicio", wStart.toISOString()).lte("data_inicio", wEnd.toISOString()),
      supabase.from("atendimentos").select("id, assunto, data_retorno, prioridade").eq("user_id", user?.id).not("data_retorno", "is", null).gte("data_retorno", wStart.toISOString()).lte("data_retorno", wEnd.toISOString()).neq("status", "concluido")]
      );
      const items: CompromissoItem[] = [];
      evRes.data?.forEach((e) => items.push({ id: `ev-${e.id}`, originalId: e.id, titulo: e.titulo, horario_inicio: e.data_inicio, tipo: "evento", cor: e.cor || "#3b82f6" }));
      atRes.data?.forEach((a) => items.push({ id: `at-${a.id}`, originalId: a.id, titulo: a.assunto, horario_inicio: a.data_retorno!, tipo: "atendimento", cor: a.prioridade === "Alta" ? "#ef4444" : a.prioridade === "Média" ? "#f59e0b" : "#10b981", prioridade: a.prioridade }));
      setWeekCompromissos(items);
    } catch (e) {console.error(e);}
  };

  const loadComunicados = async () => {
    try {
      const { data } = await supabase.from("comunicados").select("*").eq("ativo", true).order("created_at", { ascending: false }).limit(5);
      setComunicados(data || []);
    } catch (e) {console.error(e);}
  };

  const handleConcluir = async (c: CompromissoItem) => {
    const { error } = c.tipo === "evento" ?
    await supabase.from("eventos").delete().eq("id", c.originalId) :
    await supabase.from("atendimentos").update({ status: "concluido", data_concluido: new Date().toISOString() }).eq("id", c.originalId);
    if (error) {toast({ title: "Erro", variant: "destructive" });return;}
    setCompromissos((prev) => prev.filter((x) => x.id !== c.id));
    toast({ title: "Concluído!" });
  };

  // ── Computed ──
  // Fluxos finalizados (cancelado, negado, finalizado or similar)
  const FINALIZED_KEYWORDS = ["finaliz", "cancelad", "negad", "conclui", "encerrad"];
  const isFluxoFinalizado = (nome: string) => FINALIZED_KEYWORDS.some((k) => nome.toLowerCase().includes(k));

  const fluxoFinalizadoIds = useMemo(() => new Set(fluxos.filter((f) => isFluxoFinalizado(f.nome)).map((f) => f.id)), [fluxos]);
  const fluxoNames = useMemo(() => fluxos.reduce((a, f) => {a[f.id] = f.nome;return a;}, {} as Record<string, string>), [fluxos]);

  const total = atendimentos.length;
  const finalizados = atendimentos.filter((a) => a.fluxoId && fluxoFinalizadoIds.has(a.fluxoId)).length;
  const emAndamento = total - finalizados;
  const taxa = total > 0 ? (finalizados / total * 100).toFixed(1) : "0";

  // SGA computed - same logic: finalized situacoes
  const SGA_FINALIZED = ["FINALIZ", "CANCELAD", "NEGAD", "CONCLUI", "ENCERRAD"];
  const isSgaFinalizado = (s: string) => SGA_FINALIZED.some((k) => s.toUpperCase().includes(k));

  const sgaEmAndamento = useMemo(() => sgaEventos.filter((e) => !isSgaFinalizado(e.situacao_evento || "")).length, [sgaEventos]);
  const sgaFinalizados = useMemo(() => sgaEventos.filter((e) => isSgaFinalizado(e.situacao_evento || "")).length, [sgaEventos]);
  const totalSga = sgaEventos.length;
  const sgaTaxa = totalSga > 0 ? (sgaFinalizados / totalSga * 100).toFixed(1) : "0";

  // Group by fluxo for donut
  const fluxoData = useMemo(() => {
    const m = new Map<string, number>();
    atendimentos.forEach((a) => {
      const name = a.fluxoId ? fluxoNames[a.fluxoId] || "Sem fluxo" : "Sem fluxo";
      m.set(name, (m.get(name) || 0) + 1);
    });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [atendimentos, fluxoNames]);

  const priorityData = useMemo(() => [
  { name: "Alta", value: atendimentos.filter((a) => a.prioridade === "Alta").length },
  { name: "Média", value: atendimentos.filter((a) => a.prioridade === "Média").length },
  { name: "Baixa", value: atendimentos.filter((a) => a.prioridade === "Baixa").length }],
  [atendimentos]);

  const sgaSituacaoData = useMemo(() => {
    const m = new Map<string, number>();
    sgaEventos.forEach((e) => {const s = e.situacao_evento || "N/A";m.set(s, (m.get(s) || 0) + 1);});
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [sgaEventos]);

  const sgaTipoData = useMemo(() => {
    const m = new Map<string, number>();
    sgaEventos.forEach((e) => {const t = e.tipo_evento || "N/A";m.set(t, (m.get(t) || 0) + 1);});
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [sgaEventos]);

  const responsavelData = useMemo(() => {
    const m = new Map<string, number>();
    atendimentos.forEach((a) => {if (a.responsavel) {const n = profiles[a.responsavel] || "N/A";m.set(n, (m.get(n) || 0) + 1);}});
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [atendimentos, profiles]);

  const evolutionData = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = new Date();d.setDate(d.getDate() - (29 - i));
    const k = d.toISOString().split("T")[0];
    return { date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), criados: atendimentos.filter((a) => a.createdAt?.startsWith(k)).length, finalizados: atendimentos.filter((a) => a.fluxoId && fluxoFinalizadoIds.has(a.fluxoId) && a.updatedAt?.startsWith(k)).length };
  }), [atendimentos, fluxoFinalizadoIds]);

  // Contratos computed
  const contratosPendentes = contratos.filter((c) => c.status === "aguardando_assinatura");
  const hoje = new Date();
  const em30dias = addDays(hoje, 30);
  const contratosVencer = contratos.filter((c) => c.data_fim && isAfter(parseISO(c.data_fim), hoje) && isBefore(parseISO(c.data_fim), em30dias));

  // Mini calendar week days
  const weekStart = startOfWeek(calWeek, { locale: ptBR });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const userName = useMemo(() => {
    // Try profile name first, then user metadata
    if (user?.id && profiles[user.id]) return profiles[user.id];
    if (user?.user_metadata?.nome) return user.user_metadata.nome.charAt(0).toUpperCase() + user.user_metadata.nome.slice(1);
    return "";
  }, [user, profiles]);
  const greeting = (() => {const h = new Date().getHours();return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";})();
  const currentDate = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      </div>);

  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 md:p-6 space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-12 object-contain" /> : <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center"><Target className="h-6 w-6 text-primary" /></div>}
            <div>
              <h1 className="font-bold text-3xl">{greeting}, {userName || "Usuário"}!</h1>
              <p className="text-sm text-muted-foreground capitalize">{currentDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertasDialog overdueCount={overdueCount} overdueList={overdueList} />
            <UserProfile />
          </div>
        </div>

        {/* ── Row 1: Comunicados + Mini Calendário Semanal ── */}
        <div className="grid gap-4 lg:grid-cols-2 auto-rows-fr">
          {/* Comunicados */}
          <Card className="rounded-2xl border-border/40 shadow-sm flex flex-col">
            <CardHeader className="pb-3 pt-5 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-amber-500" />
                  <CardTitle className="text-base font-semibold">Comunicados</CardTitle>
                </div>
                {userRole === "admin" && <Link to="/comunicados"><Button size="sm" variant="outline" className="h-8 text-sm px-3"><Plus className="h-4 w-4 mr-1" />Novo</Button></Link>}
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5 flex-1">
              {comunicados.length === 0 ?
              <div className="text-center py-10"><Megaphone className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" /><p className="text-sm text-muted-foreground">Nenhum comunicado</p></div> :

              <div className="space-y-3 h-full overflow-y-auto scrollbar-hide">
                  {comunicados.map((c) =>
                <div key={c.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                      {c.imagem_url && <img src={c.imagem_url} alt="" className="h-11 w-11 rounded-lg object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">{c.titulo}</p>
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{c.mensagem}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(c.created_at), { addSuffix: true, locale: ptBR })}</span>
                          {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-0.5"><ExternalLink className="h-3.5 w-3.5" /></a>}
                        </div>
                      </div>
                    </div>
                )}
                </div>
              }
            </CardContent>
          </Card>

          {/* Mini Calendário Semanal */}
          <Card className="rounded-2xl border-border/40 shadow-sm flex flex-col">
            <CardHeader className="pb-3 pt-5 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base font-semibold">Compromissos da Semana</CardTitle>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCalWeek(subWeeks(calWeek, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-sm text-muted-foreground font-medium px-1">{format(weekStart, "dd/MM")} - {format(addDays(weekStart, 6), "dd/MM")}</span>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCalWeek(addWeeks(calWeek, 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5 flex-1">
              <div className="grid grid-cols-7 gap-2 h-full">
                {weekDays.map((day) => {
                  const isToday = isSameDay(day, new Date());
                  const dayItems = weekCompromissos.filter((c) => isSameDay(parseISO(c.horario_inicio), day));
                  return (
                    <div key={day.toISOString()} className={`flex flex-col items-center rounded-xl p-2.5 transition-colors ${isToday ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/30"}`}>
                      <span className="text-xs text-muted-foreground uppercase font-semibold">{format(day, "EEE", { locale: ptBR })}</span>
                      <span className={`text-lg font-bold mt-1 ${isToday ? "text-primary" : ""}`}>{format(day, "dd")}</span>
                      <div className="flex-1 w-full mt-2 space-y-1.5 overflow-hidden">
                        {dayItems.slice(0, 3).map((item) =>
                        <div key={item.id} className="w-full rounded px-1.5 py-1" style={{ backgroundColor: item.cor + "20", borderLeft: `2px solid ${item.cor}` }}>
                            <p className="text-[10px] truncate font-medium" style={{ color: item.cor }}>{format(parseISO(item.horario_inicio), "HH:mm")}</p>
                          </div>
                        )}
                        {dayItems.length > 3 && <span className="text-[10px] text-muted-foreground text-center block">+{dayItems.length - 3}</span>}
                      </div>
                    </div>);

                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Row 2: Atendimentos (com Tabs Admin/Associação) + Compromissos de Hoje ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Atendimentos com Tabs */}
          <Card className="rounded-2xl border-border/40 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3 pt-5 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base font-semibold">Atendimentos</CardTitle>
                </div>
                <Tabs value={atendimentoTab} onValueChange={setAtendimentoTab}>
                  <TabsList className="h-9">
                    <TabsTrigger value="administradora" className="text-sm h-7 px-4">Administradora</TabsTrigger>
                    <TabsTrigger value="associacao" className="text-sm h-7 px-4">Associações</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              {atendimentoTab === "administradora" ?
              <div className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-muted/40 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold">{total}</p>
                      <p className="text-sm text-muted-foreground mt-1">Total</p>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-amber-600">{emAndamento}</p>
                      <p className="text-sm text-muted-foreground mt-1">Em Andamento</p>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-emerald-600">{finalizados}</p>
                      <p className="text-sm text-muted-foreground mt-1">Finalizados</p>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{taxa}%</p>
                      <p className="text-sm text-muted-foreground mt-1">Taxa Conclusão</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-2">Por Fluxo</p>
                      <MiniDonut data={fluxoData} total={total} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-2">Prioridade</p>
                      <MiniDonut data={priorityData} total={total} />
                    </div>
                  </div>
                </div> :

              <div className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-muted/40 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold">{totalSga}</p>
                      <p className="text-sm text-muted-foreground mt-1">Total Eventos</p>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-amber-600">{sgaEmAndamento}</p>
                      <p className="text-sm text-muted-foreground mt-1">Em Andamento</p>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-emerald-600">{sgaFinalizados}</p>
                      <p className="text-sm text-muted-foreground mt-1">Finalizados</p>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{sgaTaxa}%</p>
                      <p className="text-sm text-muted-foreground mt-1">Taxa Conclusão</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-2">Por Situação</p>
                      <MiniDonut data={sgaSituacaoData} total={totalSga} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-2">Por Tipo de Evento</p>
                      <MiniDonut data={sgaTipoData} total={totalSga} />
                    </div>
                  </div>
                </div>
              }
            </CardContent>
          </Card>

          {/* Compromissos de Hoje */}
          <Card className="rounded-2xl border-border/40 shadow-sm">
            <CardHeader className="pb-3 pt-5 px-6">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Hoje</CardTitle>
                <Badge variant="secondary" className="text-sm h-6 px-2.5 ml-auto">{compromissos.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              {compromissos.length === 0 ?
              <div className="text-center py-10"><Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" /><p className="text-sm text-muted-foreground">Nenhum compromisso hoje</p></div> :

              <div className="space-y-2.5 max-h-[320px] overflow-y-auto scrollbar-hide">
                  {compromissos.map((c) =>
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors group">
                      <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.titulo}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs h-5 px-2">{format(parseISO(c.horario_inicio), "HH:mm")}</Badge>
                          <span className="text-sm text-muted-foreground">{c.tipo === "evento" ? "Evento" : "Follow-up"}</span>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={() => handleConcluir(c)}><Check className="h-4 w-4" /></Button>
                    </div>
                )}
                </div>
              }
            </CardContent>
          </Card>
        </div>

        {/* ── Row 3: Contratos + Reuniões + Alertas Operacionais ── */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Contratos Pendentes */}
          <Card className="rounded-2xl border-border/40 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = "/uon1-sign"}>
            <CardHeader className="pb-3 pt-5 px-6">
              <div className="flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-amber-500" />
                <CardTitle className="text-base font-semibold">Pendentes Assinatura</CardTitle>
                <Badge variant="secondary" className="text-sm h-6 px-2.5 ml-auto">{contratosPendentes.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              {contratosPendentes.length === 0 ?
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum contrato pendente</p> :

              <div className="space-y-2.5 max-h-[200px] overflow-y-auto scrollbar-hide">
                  {contratosPendentes.slice(0, 5).map((c) =>
                <Link key={c.id} to="/uon1-sign" className="flex items-center gap-2 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors" onClick={(e) => e.stopPropagation()}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.titulo}</p>
                        <p className="text-xs text-muted-foreground">{c.contratante_nome || c.numero}</p>
                      </div>
                      <Badge className="text-xs h-5 bg-amber-500/20 text-amber-600 border-0">Pendente</Badge>
                    </Link>
                )}
                </div>
              }
            </CardContent>
          </Card>

          {/* Contratos a Vencer */}
          <Card className="rounded-2xl border-border/40 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = "/uon1-sign"}>
            <CardHeader className="pb-3 pt-5 px-6">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-rose-500" />
                <CardTitle className="text-base font-semibold">Vencendo em 30d</CardTitle>
                <Badge variant="secondary" className="text-sm h-6 px-2.5 ml-auto">{contratosVencer.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              {contratosVencer.length === 0 ?
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum contrato a vencer</p> :

              <div className="space-y-2.5 max-h-[200px] overflow-y-auto scrollbar-hide">
                  {contratosVencer.slice(0, 5).map((c) =>
                <Link key={c.id} to="/uon1-sign" className="flex items-center gap-2 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors" onClick={(e) => e.stopPropagation()}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.titulo}</p>
                        <p className="text-xs text-muted-foreground">{c.contratante_nome}</p>
                      </div>
                      <Badge className="text-xs h-5 bg-rose-500/20 text-rose-600 border-0">{format(parseISO(c.data_fim!), "dd/MM")}</Badge>
                    </Link>
                )}
                </div>
              }
            </CardContent>
          </Card>

          {/* Reuniões */}
          <Card className="rounded-2xl border-border/40 shadow-sm">
            <CardHeader className="pb-3 pt-5 px-6">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-violet-500" />
                <CardTitle className="text-base font-semibold">Reuniões</CardTitle>
                <Badge variant="secondary" className="text-sm h-6 px-2.5 ml-auto">{reunioes.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              {reunioes.length === 0 ?
              <div className="text-center py-8">
                  <Video className="h-9 w-9 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma reunião agendada</p>
                  <Link to="/talk"><Button size="sm" variant="outline" className="h-8 text-sm px-4 mt-3"><Plus className="h-4 w-4 mr-1" />Criar</Button></Link>
                </div> :

              <div className="space-y-2.5 max-h-[200px] overflow-y-auto scrollbar-hide">
                  {reunioes.map((r) =>
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.titulo}</p>
                        <p className="text-xs text-muted-foreground">{format(parseISO(r.data_inicio), "dd/MM HH:mm")}</p>
                      </div>
                      <a href={`https://${JITSI_DOMAIN}/uon1-talk-${r.sala_id}`} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="h-8 text-sm px-3 text-violet-600"><LinkIcon className="h-3.5 w-3.5 mr-1" />Entrar</Button>
                      </a>
                    </div>
                )}
                  <Link to="/talk" className="block">
                    <Button size="sm" variant="ghost" className="w-full h-8 text-sm"><Plus className="h-4 w-4 mr-1" />Criar reunião</Button>
                  </Link>
                </div>
              }
            </CardContent>
          </Card>

          {/* Alertas Operacionais */}
          <Card className="rounded-2xl border-border/40 shadow-sm">
            <CardHeader className="pb-3 pt-5 px-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <CardTitle className="text-base font-semibold">Alertas</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              <div className="space-y-3">
                <Link to="/central-atendimento" className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-emerald-500" />
                    <span className="text-sm font-medium">WhatsApp</span>
                  </div>
                  <Badge variant={whatsappUnread > 0 ? "destructive" : "secondary"} className="text-sm h-6 px-2.5 min-w-[30px] justify-center">{whatsappUnread}</Badge>
                </Link>
                <Link to="/mensagens" className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium">Mensagens</span>
                  </div>
                  <Badge variant={unreadMessages > 0 ? "destructive" : "secondary"} className="text-sm h-6 px-2.5 min-w-[30px] justify-center">{unreadMessages}</Badge>
                </Link>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`h-5 w-5 ${syncErrorCount > 0 ? "text-destructive" : "text-emerald-500"}`} />
                    <span className="text-sm font-medium">Sincronização</span>
                  </div>
                  {syncErrorCount > 0 ?
                  <Badge variant="destructive" className="text-sm h-6 px-2.5 min-w-[30px] justify-center">{syncErrorCount}</Badge> :

                  <Badge variant="secondary" className="text-sm h-6 px-2.5 bg-emerald-500/10 text-emerald-600 border-0">OK</Badge>
                  }
                </div>
                {(userRole === "admin" || userRole === "superintendente") && pendingUsers > 0 &&
                <Link to="/usuarios" className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 transition-colors">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-amber-500" />
                      <span className="text-sm font-medium">Usuários pendentes</span>
                    </div>
                    <Badge className="text-sm h-6 px-2.5 min-w-[30px] justify-center bg-amber-500/20 text-amber-600 border-0">{pendingUsers}</Badge>
                  </Link>
                }
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Row 4: Evolução + Associações + Responsáveis ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Evolução 30 dias */}
          <Card className="rounded-2xl border-border/40 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3 pt-5 px-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Evolução 30 Dias</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={evolutionData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={ttStyle} />
                  <Area type="monotone" dataKey="criados" stroke="hsl(var(--primary))" fill="url(#gC)" strokeWidth={2} name="Criados" />
                  <Area type="monotone" dataKey="finalizados" stroke="#10b981" fill="url(#gD)" strokeWidth={2} name="Finalizados" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Associações + Top Responsáveis */}
          <Card className="rounded-2xl border-border/40 shadow-sm">
            <CardHeader className="pb-3 pt-5 px-6">
              <div className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-violet-500" />
                <CardTitle className="text-base font-semibold">Painel Operacional</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5 space-y-3">
              <Link to="/corretoras" className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-violet-500" />
                  <div>
                    <p className="text-sm font-medium">Associações</p>
                    <p className="text-xs text-muted-foreground">Cadastradas</p>
                  </div>
                </div>
                <span className="text-xl font-bold">{totalCorretoras}</span>
              </Link>
              <Link to="/uon1-sign" className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                <div className="flex items-center gap-2">
                  <FileSignature className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Contratos</p>
                    <p className="text-xs text-muted-foreground">Total cadastrados</p>
                  </div>
                </div>
                <span className="text-xl font-bold">{contratos.length}</span>
              </Link>
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">Top Responsáveis</p>
                <BarWidget data={responsavelData} total={total} />
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>);

}