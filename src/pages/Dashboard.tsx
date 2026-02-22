import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, Clock, CheckCircle2, Megaphone, ExternalLink, Plus, Mail, Users, Check,
  Calendar, ClipboardList, Target, BarChart3, Layers, Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Atendimento } from "@/types/atendimento";
import { Comunicado } from "@/types/comunicado";
import { AlertasDialog } from "@/components/AlertasDialog";
import { UserProfile } from "@/components/UserProfile";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { format, parseISO, formatDistanceToNow, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { usePendingUsers } from "@/hooks/usePendingUsers";
import { useOverdueAtendimentos } from "@/hooks/useOverdueAtendimentos";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#14b8a6",
];

const ttStyle = {
  borderRadius: 10, fontSize: 12,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
};

// ── Reusable Widget Components ──────────────────────────────────────

function BarWidget({ data, total, isCurrency }: { data: { name: string; value: number }[]; total: number; isCurrency?: boolean }) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>;
  const maxVal = data[0]?.value || 1;
  return (
    <div className="space-y-2 pt-1">
      {data.map((item, i) => {
        const pct = isCurrency ? (item.value / maxVal) * 100 : (total > 0 ? (item.value / total) * 100 : 0);
        const color = COLORS[i % COLORS.length];
        return (
          <div key={item.name} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground truncate w-28 shrink-0" title={item.name}>{item.name}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }} />
            </div>
            <span className="text-[11px] font-bold tabular-nums w-12 text-right">{item.value.toLocaleString("pt-BR")}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniDonut({ data, total }: { data: { name: string; value: number }[]; total: number }) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>;
  const top6 = data.slice(0, 6);
  return (
    <div className="flex items-center gap-4">
      <div className="shrink-0">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie data={top6} dataKey="value" innerRadius={32} outerRadius={54} paddingAngle={2} startAngle={90} endAngle={-270}>
              {top6.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
            </Pie>
            <Tooltip contentStyle={ttStyle} formatter={(v: any, n: string) => [v.toLocaleString("pt-BR"), n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {top6.map((item, i) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={item.name} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-[11px] text-muted-foreground truncate flex-1">{item.name}</span>
              <span className="text-[11px] font-bold tabular-nums">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Interfaces ──────────────────────────────────────────────────────

interface CompromissoItem {
  id: string;
  titulo: string;
  descricao?: string;
  horario_inicio: string;
  horario_fim?: string;
  local?: string;
  tipo: "evento" | "atendimento";
  cor: string;
  prioridade?: string;
  status?: string;
  originalId: string;
}

// ── Main Dashboard ──────────────────────────────────────────────────

export default function Dashboard() {
  const { user, userRole } = useAuth();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [compromissos, setCompromissos] = useState<CompromissoItem[]>([]);
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoUrl] = useLocalStorage<string>("app-logo-url", "");
  const unreadMessages = useUnreadMessages();
  const pendingUsers = usePendingUsers();
  const { overdueCount, overdueList } = useOverdueAtendimentos();
  const [statusFinalizados, setStatusFinalizados] = useState<Set<string>>(new Set());
  const [statusBacklog, setStatusBacklog] = useState<Set<string>>(new Set());
  const [statusEmAndamento, setStatusEmAndamento] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  // ── Load status groups ──
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("status_config").select("nome, tipo_etapa").eq("ativo", true);
      if (data) {
        setStatusFinalizados(new Set(data.filter((s) => s.tipo_etapa === "finalizado").map((s) => s.nome)));
        setStatusBacklog(new Set(data.filter((s) => s.tipo_etapa === "backlog").map((s) => s.nome)));
        setStatusEmAndamento(new Set(data.filter((s) => s.tipo_etapa === "em_andamento").map((s) => s.nome)));
      }
    };
    load();
  }, []);

  // ── Load profiles ──
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("profiles").select("id, nome");
      if (data) {
        setProfiles(data.reduce((acc, p) => { acc[p.id] = p.nome; return acc; }, {} as Record<string, string>));
      }
    };
    load();
  }, []);

  // ── Load data + realtime ──
  useEffect(() => {
    if (!user) return;
    loadData();
    const ch1 = supabase.channel("dash_eventos").on("postgres_changes", { event: "*", schema: "public", table: "eventos" }, () => loadCompromissos()).subscribe();
    const ch2 = supabase.channel("dash_atendimentos").on("postgres_changes", { event: "*", schema: "public", table: "atendimentos" }, () => { loadAtendimentos(); loadCompromissos(); }).subscribe();
    const ch3 = supabase.channel("dash_comunicados").on("postgres_changes", { event: "*", schema: "public", table: "comunicados" }, () => loadComunicados()).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); supabase.removeChannel(ch3); };
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadAtendimentos(), loadCompromissos(), loadComunicados()]);
    setLoading(false);
  };

  const loadAtendimentos = async () => {
    try {
      const { data, error } = await supabase.from("atendimentos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setAtendimentos(
        data?.map((item) => ({
          id: item.id, numero: item.numero, assunto: item.assunto,
          corretora: item.corretora_id || "", contato: item.contato_id || "",
          responsavel: item.responsavel_id || "", prioridade: item.prioridade,
          status: item.status, tags: item.tags || [], observacoes: item.observacoes || "",
          dataRetorno: item.data_retorno, dataConcluido: item.data_concluido,
          fluxoConcluido: item.fluxo_concluido_nome, fluxoConcluidoId: item.fluxo_concluido_id,
          fluxoId: item.fluxo_id, createdAt: item.created_at, updatedAt: item.updated_at,
        })) || []
      );
    } catch (error) { console.error("Erro ao carregar atendimentos:", error); }
  };

  const loadCompromissos = async () => {
    try {
      const hoje = new Date();
      const inicioDia = startOfDay(hoje).toISOString();
      const fimDia = endOfDay(hoje).toISOString();
      const { data: eventosData } = await supabase.from("eventos").select("*").eq("user_id", user?.id).gte("data_inicio", inicioDia).lte("data_inicio", fimDia).order("data_inicio", { ascending: true });
      const { data: atendimentosData } = await supabase.from("atendimentos").select("*").eq("user_id", user?.id).gte("data_retorno", inicioDia).lte("data_retorno", fimDia).neq("status", "concluido").order("data_retorno", { ascending: true });
      const items: CompromissoItem[] = [];
      eventosData?.forEach((e) => items.push({ id: `evento-${e.id}`, originalId: e.id, titulo: e.titulo, descricao: e.descricao, horario_inicio: e.data_inicio, horario_fim: e.data_fim, local: e.local, tipo: "evento", cor: e.cor || "#3b82f6" }));
      atendimentosData?.forEach((a) => items.push({ id: `atend-${a.id}`, originalId: a.id, titulo: a.assunto, descricao: a.observacoes, horario_inicio: a.data_retorno!, tipo: "atendimento", cor: a.prioridade === "Alta" ? "#ef4444" : a.prioridade === "Média" ? "#f59e0b" : "#10b981", prioridade: a.prioridade, status: a.status }));
      items.sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
      setCompromissos(items);
    } catch (error) { console.error("Erro ao carregar compromissos:", error); }
  };

  const loadComunicados = async () => {
    try {
      const { data, error } = await supabase.from("comunicados").select("*").eq("ativo", true).order("created_at", { ascending: false }).limit(3);
      if (error) throw error;
      setComunicados(data || []);
    } catch (error) { console.error("Erro ao carregar comunicados:", error); }
  };

  const handleConcluirCompromisso = async (c: CompromissoItem) => {
    if (c.tipo === "evento") {
      const { error } = await supabase.from("eventos").delete().eq("id", c.originalId);
      if (error) { toast({ title: "Erro ao concluir", variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("atendimentos").update({ status: "concluido", data_concluido: new Date().toISOString() }).eq("id", c.originalId);
      if (error) { toast({ title: "Erro ao concluir", variant: "destructive" }); return; }
    }
    setCompromissos(compromissos.filter((x) => x.id !== c.id));
    toast({ title: "Compromisso concluído!" });
  };

  // ── Computed metrics ──

  const totalAtendimentos = atendimentos.length;
  const atendimentosConcluidos = atendimentos.filter((a) => statusFinalizados.has(a.status)).length;
  const atendimentosAbertos = atendimentos.filter((a) => !statusFinalizados.has(a.status)).length;
  const atendimentosEmAndamento = atendimentos.filter((a) => statusEmAndamento.has(a.status)).length;
  const taxaConclusao = totalAtendimentos > 0 ? (atendimentosConcluidos / totalAtendimentos * 100).toFixed(1) : "0";

  const statusData = useMemo(() => [
    { name: "Backlog", value: atendimentos.filter((a) => statusBacklog.has(a.status)).length },
    { name: "Em Andamento", value: atendimentosEmAndamento },
    { name: "Finalizados", value: atendimentosConcluidos },
  ], [atendimentos, statusBacklog, statusEmAndamento, statusFinalizados]);

  const priorityData = useMemo(() => [
    { name: "Alta", value: atendimentos.filter((a) => a.prioridade === "Alta").length },
    { name: "Média", value: atendimentos.filter((a) => a.prioridade === "Média").length },
    { name: "Baixa", value: atendimentos.filter((a) => a.prioridade === "Baixa").length },
  ], [atendimentos]);

  const responsavelData = useMemo(() => {
    const map = new Map<string, number>();
    atendimentos.forEach((a) => {
      if (a.responsavel) {
        const nome = profiles[a.responsavel] || "Sem responsável";
        map.set(nome, (map.get(nome) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [atendimentos, profiles]);

  const fluxosData = useMemo(() => {
    const map = new Map<string, number>();
    atendimentos.filter((a) => a.dataConcluido && a.fluxoConcluido).forEach((a) => {
      const nome = a.fluxoConcluido || "Sem fluxo";
      map.set(nome, (map.get(nome) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [atendimentos]);

  const evolutionData = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const key = date.toISOString().split("T")[0];
      return {
        date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        criados: atendimentos.filter((a) => a.createdAt?.startsWith(key)).length,
        concluidos: atendimentos.filter((a) => statusFinalizados.has(a.status) && a.updatedAt?.startsWith(key)).length,
      };
    });
  }, [atendimentos, statusFinalizados]);

  // ── Greeting ──
  const userName = user?.user_metadata?.nome ? user.user_metadata.nome.charAt(0).toUpperCase() + user.user_metadata.nome.slice(1) : "";
  const getGreeting = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };
  const currentDate = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  const totalNotifications = unreadMessages + ((userRole === "admin" || userRole === "superintendente" || userRole === "administrativo") ? pendingUsers : 0) + compromissos.length + overdueCount;

  // ── Render ──
  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-10 object-contain" />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-primary" />
              </div>
            )}
            <div>
              <h1 className="text-xl md:text-2xl font-bold">{getGreeting()}, {userName || "Usuário"}!</h1>
              <p className="text-xs text-muted-foreground capitalize">{currentDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertasDialog overdueCount={overdueCount} overdueList={overdueList} />
            <UserProfile />
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[
            { label: "Total", value: totalAtendimentos.toLocaleString("pt-BR"), icon: ClipboardList, cls: "text-primary bg-primary/5 border-primary/20" },
            { label: "Em Aberto", value: atendimentosAbertos.toLocaleString("pt-BR"), icon: Clock, cls: "text-amber-600 bg-amber-500/5 border-amber-500/20" },
            { label: "Concluídos", value: atendimentosConcluidos.toLocaleString("pt-BR"), icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-500/5 border-emerald-500/20" },
            { label: "Taxa Conclusão", value: `${taxaConclusao}%`, icon: TrendingUp, cls: "text-violet-600 bg-violet-500/5 border-violet-500/20" },
          ].map(({ label, value, icon: Icon, cls }) => (
            <Link key={label} to="/atendimentos">
              <Card className={`rounded-2xl border ${cls} hover:shadow-md transition-all cursor-pointer`}>
                <CardContent className="p-4">
                  <div className={`flex items-center gap-1.5 text-[11px] font-medium mb-1.5 ${cls.split(" ")[0]}`}>
                    <Icon className="h-3 w-3" />{label}
                  </div>
                  <div className="text-xl font-bold tracking-tight">{value}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* ── Row: Compromissos + Comunicados ── */}
        <div className="grid gap-3 md:grid-cols-2">
          {/* Compromissos */}
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">Compromissos de Hoje</CardTitle>
                </div>
                <div className="flex items-center gap-1.5">
                  {unreadMessages > 0 && (
                    <Link to="/mensagens">
                      <Badge variant="destructive" className="cursor-pointer text-[10px] h-5 px-1.5">
                        <Mail className="h-2.5 w-2.5 mr-0.5" />{unreadMessages}
                      </Badge>
                    </Link>
                  )}
                  {(userRole === "admin" || userRole === "superintendente" || userRole === "administrativo") && pendingUsers > 0 && (
                    <Link to="/usuarios">
                      <Badge variant="destructive" className="cursor-pointer text-[10px] h-5 px-1.5">
                        <Users className="h-2.5 w-2.5 mr-0.5" />{pendingUsers}
                      </Badge>
                    </Link>
                  )}
                  {totalNotifications > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{totalNotifications}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {compromissos.length === 0 ? (
                <div className="text-center py-10">
                  <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum compromisso para hoje</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-hide">
                  {compromissos.map((c) => {
                    const hora = format(parseISO(c.horario_inicio), "HH:mm", { locale: ptBR });
                    return (
                      <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors group">
                        <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.titulo}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{hora}</Badge>
                            <span className="text-[10px] text-muted-foreground">{c.tipo === "evento" ? "📅 Evento" : "📞 Follow-up"}</span>
                          </div>
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleConcluirCompromisso(c)}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Comunicados */}
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-amber-500" />
                  <CardTitle className="text-sm font-semibold">Comunicados</CardTitle>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{comunicados.length}</Badge>
                  {userRole === "admin" && (
                    <Link to="/comunicados">
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">
                        <Plus className="h-2.5 w-2.5 mr-0.5" />Novo
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {comunicados.length === 0 ? (
                <div className="text-center py-10">
                  <Megaphone className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum comunicado no momento</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-hide">
                  {comunicados.map((c) => (
                    <div key={c.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
                      {c.imagem_url && <img src={c.imagem_url} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">{c.titulo}</p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{c.mensagem}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(parseISO(c.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                          {c.link && (
                            <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                              Ver mais <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Section: Atendimentos Analytics ── */}
        <div className="flex items-center gap-2 pt-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Análise de Atendimentos</h2>
        </div>

        {/* ── Evolução (AreaChart) ── */}
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Evolução - Últimos 30 Dias</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={evolutionData} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                <defs>
                  <linearGradient id="gradCriados" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradConcluidos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={ttStyle} />
                <Area type="monotone" dataKey="criados" stroke="hsl(var(--primary))" fill="url(#gradCriados)" strokeWidth={2} name="Criados" />
                <Area type="monotone" dataKey="concluidos" stroke="#10b981" fill="url(#gradConcluidos)" strokeWidth={2} name="Concluídos" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Status (Donut) + Prioridade (Donut) ── */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <CardTitle className="text-sm font-semibold">Distribuição por Status</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <MiniDonut data={statusData} total={totalAtendimentos} />
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <CardTitle className="text-sm font-semibold">Distribuição por Prioridade</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <MiniDonut data={priorityData} total={totalAtendimentos} />
            </CardContent>
          </Card>
        </div>

        {/* ── Responsáveis (Bars) + Fluxos (Bars) ── */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Top Responsáveis</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="overflow-y-auto max-h-[260px] pr-0.5">
                <BarWidget data={responsavelData} total={totalAtendimentos} />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5">
              <div className="flex items-center gap-2">
                <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Concluídos por Fluxo</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="overflow-y-auto max-h-[260px] pr-0.5">
                {fluxosData.length > 0 ? (
                  <BarWidget data={fluxosData} total={atendimentosConcluidos} />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-8">Nenhum atendimento concluído em fluxos</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
