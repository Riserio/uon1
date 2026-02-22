import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, Clock, CheckCircle2, Megaphone, ExternalLink, Plus, Mail, Users, Check,
  Calendar, Target, BarChart3, Workflow, FileText, MessageSquare, Shield, Building2, UserCheck,
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

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
const ttStyle = { borderRadius: 10, fontSize: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" };

// ── Compact Widget Components ───────────────────────────────

function BarWidget({ data, total }: { data: { name: string; value: number }[]; total: number }) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-3">Sem dados</p>;
  const maxVal = data[0]?.value || 1;
  return (
    <div className="space-y-1.5">
      {data.map((item, i) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0;
        return (
          <div key={item.name} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground truncate w-24 shrink-0">{item.name}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
            </div>
            <span className="text-[10px] font-bold tabular-nums w-8 text-right">{item.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniDonut({ data, total }: { data: { name: string; value: number }[]; total: number }) {
  if (!data.length) return <p className="text-xs text-muted-foreground text-center py-3">Sem dados</p>;
  const top = data.slice(0, 5);
  return (
    <div className="flex items-center gap-3">
      <ResponsiveContainer width={80} height={80}>
        <PieChart>
          <Pie data={top} dataKey="value" innerRadius={22} outerRadius={38} paddingAngle={2} startAngle={90} endAngle={-270}>
            {top.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1 min-w-0">
        {top.map((item, i) => (
          <div key={item.name} className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-[10px] text-muted-foreground truncate flex-1">{item.name}</span>
            <span className="text-[10px] font-bold tabular-nums">{total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Interfaces ──────────────────────────────────────────────

interface CompromissoItem {
  id: string; titulo: string; descricao?: string; horario_inicio: string;
  horario_fim?: string; local?: string; tipo: "evento" | "atendimento";
  cor: string; prioridade?: string; status?: string; originalId: string;
}

// ── Main Dashboard ──────────────────────────────────────────

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
  const [totalCorretoras, setTotalCorretoras] = useState(0);
  const [totalContatos, setTotalContatos] = useState(0);
  const [totalDocumentos, setTotalDocumentos] = useState(0);
  const [totalContratos, setTotalContratos] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [statusRes, profilesRes, corretorasRes, contatosRes, docsRes, contratosRes] = await Promise.all([
        supabase.from("status_config").select("nome, tipo_etapa").eq("ativo", true),
        supabase.from("profiles").select("id, nome"),
        supabase.from("corretoras").select("id", { count: "exact", head: true }),
        supabase.from("contatos").select("id", { count: "exact", head: true }),
        supabase.from("documentos").select("id", { count: "exact", head: true }),
        supabase.from("contratos").select("id", { count: "exact", head: true }),
      ]);
      if (statusRes.data) {
        setStatusFinalizados(new Set(statusRes.data.filter(s => s.tipo_etapa === "finalizado").map(s => s.nome)));
        setStatusBacklog(new Set(statusRes.data.filter(s => s.tipo_etapa === "backlog").map(s => s.nome)));
        setStatusEmAndamento(new Set(statusRes.data.filter(s => s.tipo_etapa === "em_andamento").map(s => s.nome)));
      }
      if (profilesRes.data) setProfiles(profilesRes.data.reduce((a, p) => { a[p.id] = p.nome; return a; }, {} as Record<string, string>));
      setTotalCorretoras(corretorasRes.count || 0);
      setTotalContatos(contatosRes.count || 0);
      setTotalDocumentos(docsRes.count || 0);
      setTotalContratos(contratosRes.count || 0);
    };
    load();
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
    const ch1 = supabase.channel("dash_ev").on("postgres_changes", { event: "*", schema: "public", table: "eventos" }, () => loadCompromissos()).subscribe();
    const ch2 = supabase.channel("dash_at").on("postgres_changes", { event: "*", schema: "public", table: "atendimentos" }, () => { loadAtendimentos(); loadCompromissos(); }).subscribe();
    const ch3 = supabase.channel("dash_co").on("postgres_changes", { event: "*", schema: "public", table: "comunicados" }, () => loadComunicados()).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); supabase.removeChannel(ch3); };
  }, [user]);

  const loadData = async () => { setLoading(true); await Promise.all([loadAtendimentos(), loadCompromissos(), loadComunicados()]); setLoading(false); };

  const loadAtendimentos = async () => {
    try {
      const { data, error } = await supabase.from("atendimentos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setAtendimentos(data?.map(i => ({ id: i.id, numero: i.numero, assunto: i.assunto, corretora: i.corretora_id || "", contato: i.contato_id || "", responsavel: i.responsavel_id || "", prioridade: i.prioridade, status: i.status, tags: i.tags || [], observacoes: i.observacoes || "", dataRetorno: i.data_retorno, dataConcluido: i.data_concluido, fluxoConcluido: i.fluxo_concluido_nome, fluxoConcluidoId: i.fluxo_concluido_id, fluxoId: i.fluxo_id, createdAt: i.created_at, updatedAt: i.updated_at })) || []);
    } catch (e) { console.error(e); }
  };

  const loadCompromissos = async () => {
    try {
      const hoje = new Date();
      const [evRes, atRes] = await Promise.all([
        supabase.from("eventos").select("*").eq("user_id", user?.id).gte("data_inicio", startOfDay(hoje).toISOString()).lte("data_inicio", endOfDay(hoje).toISOString()).order("data_inicio", { ascending: true }),
        supabase.from("atendimentos").select("*").eq("user_id", user?.id).gte("data_retorno", startOfDay(hoje).toISOString()).lte("data_retorno", endOfDay(hoje).toISOString()).neq("status", "concluido").order("data_retorno", { ascending: true }),
      ]);
      const items: CompromissoItem[] = [];
      evRes.data?.forEach(e => items.push({ id: `ev-${e.id}`, originalId: e.id, titulo: e.titulo, descricao: e.descricao, horario_inicio: e.data_inicio, horario_fim: e.data_fim, local: e.local, tipo: "evento", cor: e.cor || "#3b82f6" }));
      atRes.data?.forEach(a => items.push({ id: `at-${a.id}`, originalId: a.id, titulo: a.assunto, descricao: a.observacoes, horario_inicio: a.data_retorno!, tipo: "atendimento", cor: a.prioridade === "Alta" ? "#ef4444" : a.prioridade === "Média" ? "#f59e0b" : "#10b981", prioridade: a.prioridade, status: a.status }));
      items.sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
      setCompromissos(items);
    } catch (e) { console.error(e); }
  };

  const loadComunicados = async () => {
    try {
      const { data } = await supabase.from("comunicados").select("*").eq("ativo", true).order("created_at", { ascending: false }).limit(5);
      setComunicados(data || []);
    } catch (e) { console.error(e); }
  };

  const handleConcluir = async (c: CompromissoItem) => {
    const { error } = c.tipo === "evento"
      ? await supabase.from("eventos").delete().eq("id", c.originalId)
      : await supabase.from("atendimentos").update({ status: "concluido", data_concluido: new Date().toISOString() }).eq("id", c.originalId);
    if (error) { toast({ title: "Erro", variant: "destructive" }); return; }
    setCompromissos(prev => prev.filter(x => x.id !== c.id));
    toast({ title: "Concluído!" });
  };

  // ── Computed ──
  const total = atendimentos.length;
  const concluidos = atendimentos.filter(a => statusFinalizados.has(a.status)).length;
  const abertos = total - concluidos;
  const emAndamento = atendimentos.filter(a => statusEmAndamento.has(a.status)).length;
  const taxa = total > 0 ? ((concluidos / total) * 100).toFixed(1) : "0";

  const statusData = useMemo(() => [
    { name: "Backlog", value: atendimentos.filter(a => statusBacklog.has(a.status)).length },
    { name: "Em Andamento", value: emAndamento },
    { name: "Finalizados", value: concluidos },
  ], [atendimentos, statusBacklog, statusEmAndamento, statusFinalizados]);

  const priorityData = useMemo(() => [
    { name: "Alta", value: atendimentos.filter(a => a.prioridade === "Alta").length },
    { name: "Média", value: atendimentos.filter(a => a.prioridade === "Média").length },
    { name: "Baixa", value: atendimentos.filter(a => a.prioridade === "Baixa").length },
  ], [atendimentos]);

  const responsavelData = useMemo(() => {
    const m = new Map<string, number>();
    atendimentos.forEach(a => { if (a.responsavel) { const n = profiles[a.responsavel] || "N/A"; m.set(n, (m.get(n) || 0) + 1); } });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [atendimentos, profiles]);

  const fluxosData = useMemo(() => {
    const m = new Map<string, number>();
    atendimentos.filter(a => a.dataConcluido && a.fluxoConcluido).forEach(a => { const n = a.fluxoConcluido!; m.set(n, (m.get(n) || 0) + 1); });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [atendimentos]);

  const evolutionData = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    const k = d.toISOString().split("T")[0];
    return { date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), criados: atendimentos.filter(a => a.createdAt?.startsWith(k)).length, concluidos: atendimentos.filter(a => statusFinalizados.has(a.status) && a.updatedAt?.startsWith(k)).length };
  }), [atendimentos, statusFinalizados]);

  const userName = user?.user_metadata?.nome ? user.user_metadata.nome.charAt(0).toUpperCase() + user.user_metadata.nome.slice(1) : "";
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; })();
  const currentDate = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-3">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-3">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-8 object-contain" /> : <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Target className="h-4 w-4 text-primary" /></div>}
            <div>
              <h1 className="text-lg font-bold">{greeting}, {userName || "Usuário"}!</h1>
              <p className="text-[11px] text-muted-foreground capitalize">{currentDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertasDialog overdueCount={overdueCount} overdueList={overdueList} />
            <UserProfile />
          </div>
        </div>

        {/* ── Quick Stats Row (mixed system info) ── */}
        <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Atendimentos", value: total, icon: BarChart3, to: "/atendimentos", cls: "text-primary" },
            { label: "Em Aberto", value: abertos, icon: Clock, to: "/atendimentos", cls: "text-amber-600" },
            { label: "Concluídos", value: concluidos, icon: CheckCircle2, to: "/atendimentos", cls: "text-emerald-600" },
            { label: "Associações", value: totalCorretoras, icon: Building2, to: "/corretoras", cls: "text-violet-600" },
            { label: "Contatos", value: totalContatos, icon: UserCheck, to: "/contatos", cls: "text-cyan-600" },
            { label: "Contratos", value: totalContratos, icon: Shield, to: "/uon1-sign", cls: "text-rose-600" },
          ].map(({ label, value, icon: Icon, to, cls }) => (
            <Link key={label} to={to}>
              <Card className="rounded-2xl border-border/40 hover:shadow-md transition-all cursor-pointer h-full">
                <CardContent className="p-3">
                  <div className={`flex items-center gap-1 text-[10px] font-medium mb-1 ${cls}`}>
                    <Icon className="h-3 w-3" />{label}
                  </div>
                  <div className="text-lg font-bold tracking-tight">{value.toLocaleString("pt-BR")}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* ── Row 2: Compromissos + Evolução + Comunicados ── */}
        <div className="grid gap-3 lg:grid-cols-3">
          {/* Compromissos */}
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  <CardTitle className="text-xs font-semibold">Compromissos de Hoje</CardTitle>
                </div>
                <div className="flex gap-1">
                  {unreadMessages > 0 && <Link to="/mensagens"><Badge variant="destructive" className="text-[9px] h-4 px-1"><Mail className="h-2 w-2 mr-0.5" />{unreadMessages}</Badge></Link>}
                  {(userRole === "admin" || userRole === "superintendente" || userRole === "administrativo") && pendingUsers > 0 && <Link to="/usuarios"><Badge variant="destructive" className="text-[9px] h-4 px-1"><Users className="h-2 w-2 mr-0.5" />{pendingUsers}</Badge></Link>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {compromissos.length === 0 ? (
                <div className="text-center py-6"><Calendar className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" /><p className="text-[10px] text-muted-foreground">Nenhum compromisso</p></div>
              ) : (
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-hide">
                  {compromissos.map(c => (
                    <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors group">
                      <div className="w-0.5 h-8 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">{c.titulo}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Badge variant="secondary" className="text-[9px] h-3.5 px-1">{format(parseISO(c.horario_inicio), "HH:mm")}</Badge>
                          <span className="text-[9px] text-muted-foreground">{c.tipo === "evento" ? "Evento" : "Follow-up"}</span>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => handleConcluir(c)}><Check className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Evolução 30 dias */}
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <CardTitle className="text-xs font-semibold">Evolução 30 Dias</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={evolutionData} margin={{ top: 8, right: 4, bottom: 0, left: -4 }}>
                  <defs>
                    <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={20} />
                  <Tooltip contentStyle={ttStyle} />
                  <Area type="monotone" dataKey="criados" stroke="hsl(var(--primary))" fill="url(#gC)" strokeWidth={1.5} name="Criados" />
                  <Area type="monotone" dataKey="concluidos" stroke="#10b981" fill="url(#gD)" strokeWidth={1.5} name="Concluídos" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Comunicados */}
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Megaphone className="h-3.5 w-3.5 text-amber-500" />
                  <CardTitle className="text-xs font-semibold">Comunicados</CardTitle>
                </div>
                {userRole === "admin" && <Link to="/comunicados"><Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5"><Plus className="h-2 w-2 mr-0.5" />Novo</Button></Link>}
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {comunicados.length === 0 ? (
                <div className="text-center py-6"><Megaphone className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" /><p className="text-[10px] text-muted-foreground">Nenhum comunicado</p></div>
              ) : (
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-hide">
                  {comunicados.map(c => (
                    <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                      {c.imagem_url && <img src={c.imagem_url} alt="" className="h-8 w-8 rounded object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium line-clamp-1">{c.titulo}</p>
                        <p className="text-[9px] text-muted-foreground line-clamp-1 mt-0.5">{c.mensagem}</p>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[9px] text-muted-foreground">{formatDistanceToNow(parseISO(c.created_at), { addSuffix: true, locale: ptBR })}</span>
                          {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-primary hover:underline"><ExternalLink className="h-2 w-2 inline" /></a>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Row 3: Status + Prioridade + Taxa + Docs ── */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs font-semibold">Status</CardTitle></CardHeader>
            <CardContent className="px-3 pb-3"><MiniDonut data={statusData} total={total} /></CardContent>
          </Card>
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs font-semibold">Prioridade</CardTitle></CardHeader>
            <CardContent className="px-3 pb-3"><MiniDonut data={priorityData} total={total} /></CardContent>
          </Card>
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs font-semibold">Taxa de Conclusão</CardTitle></CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="flex flex-col items-center py-2">
                <div className="relative h-16 w-16">
                  <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeDasharray={`${Number(taxa)} 100`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{taxa}%</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">{concluidos} de {total}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs font-semibold">Resumo Geral</CardTitle></CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="space-y-2 py-1">
                {[
                  { label: "Documentos", value: totalDocumentos, icon: FileText, cls: "text-blue-600" },
                  { label: "Mensagens", value: unreadMessages, icon: MessageSquare, cls: "text-emerald-600" },
                  { label: "Atrasados", value: overdueCount, icon: Clock, cls: "text-red-600" },
                  { label: "Em Andamento", value: emAndamento, icon: TrendingUp, cls: "text-amber-600" },
                ].map(({ label, value, icon: Icon, cls }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className={`flex items-center gap-1.5 text-[10px] ${cls}`}><Icon className="h-3 w-3" />{label}</div>
                    <span className="text-[11px] font-bold">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Row 4: Responsáveis + Fluxos ── */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted-foreground" /><CardTitle className="text-xs font-semibold">Top Responsáveis</CardTitle></div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="max-h-[200px] overflow-y-auto scrollbar-hide"><BarWidget data={responsavelData} total={total} /></div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-3 px-4">
              <div className="flex items-center gap-1.5"><Workflow className="h-3.5 w-3.5 text-muted-foreground" /><CardTitle className="text-xs font-semibold">Concluídos por Fluxo</CardTitle></div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="max-h-[200px] overflow-y-auto scrollbar-hide">
                {fluxosData.length > 0 ? <BarWidget data={fluxosData} total={concluidos} /> : <p className="text-[10px] text-muted-foreground text-center py-6">Nenhum fluxo concluído</p>}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
