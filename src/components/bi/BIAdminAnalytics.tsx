import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Users, Eye, Clock, Monitor, Smartphone, Tablet, Globe, Activity, TrendingUp, Crown, Medal, Database, FileText, BarChart3 } from "lucide-react";
import { format, subDays, eachDayOfInterval, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

interface VisitorLog {
  id: string;
  session_id: string;
  user_id: string;
  page: string;
  referrer: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  screen_width: number | null;
  screen_height: number | null;
  language: string | null;
  timezone: string | null;
  created_at: string;
  duration_seconds: number | null;
}

interface UserProfile {
  id: string;
  nome: string;
  email: string;
  avatar_url?: string | null;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(210, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(35, 85%, 55%)",
  "hsl(0, 65%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(180, 50%, 45%)",
  "hsl(60, 70%, 45%)",
];

const TZ_COUNTRY_MAP: Record<string, string> = {
  "America/Sao_Paulo": "Brasil", "America/Fortaleza": "Brasil", "America/Recife": "Brasil",
  "America/Bahia": "Brasil", "America/Belem": "Brasil", "America/Manaus": "Brasil",
  "America/Cuiaba": "Brasil", "America/Campo_Grande": "Brasil", "America/Araguaina": "Brasil",
  "America/Maceio": "Brasil", "America/New_York": "EUA", "America/Chicago": "EUA",
  "America/Denver": "EUA", "America/Los_Angeles": "EUA", "America/Phoenix": "EUA",
  "Europe/London": "Reino Unido", "Europe/Lisbon": "Portugal", "Europe/Paris": "França",
  "Europe/Berlin": "Alemanha", "Europe/Madrid": "Espanha", "Asia/Tokyo": "Japão",
  "Australia/Sydney": "Austrália", "America/Buenos_Aires": "Argentina",
  "America/Bogota": "Colômbia", "America/Mexico_City": "México",
  "America/Santiago": "Chile", "America/Lima": "Peru",
};

function getCountryFromTZ(tz: string | null): string {
  if (!tz) return "Desconhecido";
  if (TZ_COUNTRY_MAP[tz]) return TZ_COUNTRY_MAP[tz];
  if (tz.startsWith("America/")) {
    const brTZs = ["Sao_Paulo", "Fortaleza", "Recife", "Bahia", "Belem", "Manaus", "Cuiaba", "Campo_Grande", "Araguaina", "Maceio", "Porto_Velho", "Boa_Vista", "Noronha", "Rio_Branco"];
    const city = tz.split("/")[1];
    if (brTZs.includes(city)) return "Brasil";
    return "Américas";
  }
  if (tz.startsWith("Europe/")) return "Europa";
  if (tz.startsWith("Asia/")) return "Ásia";
  if (tz.startsWith("Africa/")) return "África";
  return "Outro";
}

function DeviceIcon({ type }: { type: string | null }) {
  if (type === "mobile") return <Smartphone className="h-3.5 w-3.5" />;
  if (type === "tablet") return <Tablet className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function RankMedal({ position }: { position: number }) {
  if (position === 0) return <Crown className="h-4 w-4 text-yellow-500" />;
  if (position === 1) return <Medal className="h-4 w-4 text-gray-400" />;
  if (position === 2) return <Medal className="h-4 w-4 text-amber-700" />;
  return <span className="text-xs text-muted-foreground font-medium w-4 text-center">{position + 1}</span>;
}

export default function BIAdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("7");
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [realtimeLogs, setRealtimeLogs] = useState<VisitorLog[]>([]);
  const [activityTotals, setActivityTotals] = useState({ cobranca: 0, eventos: 0, mgf: 0 });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load profiles for user names
  const loadProfiles = useCallback(async (userIds: string[]) => {
    if (userIds.length === 0) return;
    const uniqueIds = [...new Set(userIds)].filter(id => !profiles.has(id));
    if (uniqueIds.length === 0) return;

    // Fetch in batches of 50
    const newProfiles = new Map(profiles);
    for (let i = 0; i < uniqueIds.length; i += 50) {
      const batch = uniqueIds.slice(i, i + 50);
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, email, avatar_url")
        .in("id", batch);
      data?.forEach(p => newProfiles.set(p.id, p));
    }
    setProfiles(newProfiles);
  }, [profiles]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const days = parseInt(period);
      const startDate = subDays(new Date(), days);
      const startStr = startDate.toISOString();

      const allLogs: VisitorLog[] = [];
      const CHUNK = 1000;
      const MAX = 100000;
      let offset = 0;
      let hasMore = true;

      while (hasMore && offset < MAX) {
        const { data, error } = await supabase
          .from("visitor_logs")
          .select("*")
          .gte("created_at", startStr)
          .order("created_at", { ascending: false })
          .range(offset, offset + CHUNK - 1);

        if (error) throw error;
        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allLogs.push(...(data as VisitorLog[]));
          if (data.length < CHUNK) hasMore = false;
          offset += CHUNK;
        }
      }

      setLogs(allLogs);

      // Load profiles for all user_ids
      const userIds = [...new Set(allLogs.map(l => l.user_id))];
      if (userIds.length > 0) {
        const profileMap = new Map<string, UserProfile>();
        for (let i = 0; i < userIds.length; i += 50) {
          const batch = userIds.slice(i, i + 50);
          const { data } = await supabase.from("profiles").select("id, nome, email, avatar_url").in("id", batch);
          data?.forEach(p => profileMap.set(p.id, p));
        }
        setProfiles(profileMap);
      }

      // Load activity totals (importações e atividades)
      const [cobCount, sgaCount, mgfCount] = await Promise.all([
        supabase.from("cobranca_importacoes").select("id", { count: "exact", head: true }),
        supabase.from("sga_importacoes").select("id", { count: "exact", head: true }),
        supabase.from("mgf_importacoes").select("id", { count: "exact", head: true }),
      ]);
      setActivityTotals({
        cobranca: cobCount.count || 0,
        eventos: sgaCount.count || 0,
        mgf: mgfCount.count || 0,
      });
    } catch (e) {
      console.error("Erro ao carregar analytics:", e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  // Realtime subscription
  useEffect(() => {
    channelRef.current = supabase
      .channel("visitor-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "visitor_logs" },
        async (payload) => {
          const newLog = payload.new as VisitorLog;
          setRealtimeLogs(prev => [newLog, ...prev].slice(0, 50));
          // Load profile if unknown
          if (!profiles.has(newLog.user_id)) {
            const { data } = await supabase.from("profiles").select("id, nome, email, avatar_url").eq("id", newLog.user_id).single();
            if (data) setProfiles(prev => new Map(prev).set(data.id, data));
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Merge realtime logs with loaded logs (deduplicate)
  const allLogs = [...realtimeLogs, ...logs];
  const seenIds = new Set<string>();
  const mergedLogs = allLogs.filter(l => {
    if (seenIds.has(l.id)) return false;
    seenIds.add(l.id);
    return true;
  });

  // === Compute metrics ===
  const days = parseInt(period);
  const uniqueSessions = new Set(mergedLogs.map(l => l.session_id)).size;
  const uniqueUsers = new Set(mergedLogs.map(l => l.user_id)).size;
  const totalPageViews = mergedLogs.length;
  const totalDuration = mergedLogs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
  const avgDuration = uniqueSessions > 0 ? Math.round(totalDuration / uniqueSessions) : 0;

  // Online now (active in last 5 min)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const onlineUserIds = [...new Set(mergedLogs.filter(l => new Date(l.created_at) > fiveMinAgo).map(l => l.user_id))];
  const onlineNow = onlineUserIds.length;

  // Daily data
  const startDate = subDays(new Date(), days);
  const allDays = eachDayOfInterval({ start: startDate, end: new Date() });
  const dayMap = new Map<string, { visitors: Set<string>; views: number }>();
  mergedLogs.forEach(l => {
    const day = format(new Date(l.created_at), "yyyy-MM-dd");
    const existing = dayMap.get(day) || { visitors: new Set<string>(), views: 0 };
    existing.visitors.add(l.session_id);
    existing.views++;
    dayMap.set(day, existing);
  });
  const dailyData = allDays.map(d => {
    const key = format(d, "yyyy-MM-dd");
    const data = dayMap.get(key);
    return { date: key, label: format(d, "dd MMM", { locale: ptBR }), visitantes: data?.visitors.size || 0, pageviews: data?.views || 0 };
  });

  // Top pages
  const pageMap = new Map<string, number>();
  mergedLogs.forEach(l => pageMap.set(l.page, (pageMap.get(l.page) || 0) + 1));
  const topPages = Array.from(pageMap.entries()).map(([page, count]) => ({ page, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  // Devices
  const deviceMap = new Map<string, number>();
  mergedLogs.forEach(l => deviceMap.set(l.device_type || "desktop", (deviceMap.get(l.device_type || "desktop") || 0) + 1));
  const devices = Array.from(deviceMap.entries()).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value })).sort((a, b) => b.value - a.value);

  // Browsers
  const browserMap = new Map<string, number>();
  mergedLogs.forEach(l => browserMap.set(l.browser || "Outro", (browserMap.get(l.browser || "Outro") || 0) + 1));
  const browsers = Array.from(browserMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  // Countries
  const countryMap = new Map<string, number>();
  mergedLogs.forEach(l => { const c = getCountryFromTZ(l.timezone); countryMap.set(c, (countryMap.get(c) || 0) + 1); });
  const countries = Array.from(countryMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  // OS
  const osMap = new Map<string, number>();
  mergedLogs.forEach(l => osMap.set(l.os || "Outro", (osMap.get(l.os || "Outro") || 0) + 1));
  const osList = Array.from(osMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // === USER RANKING ===
  const userStatsMap = new Map<string, { views: number; sessions: Set<string>; totalDuration: number; lastSeen: string; lastPage: string }>();
  mergedLogs.forEach(l => {
    const existing = userStatsMap.get(l.user_id) || { views: 0, sessions: new Set<string>(), totalDuration: 0, lastSeen: "", lastPage: "" };
    existing.views++;
    existing.sessions.add(l.session_id);
    existing.totalDuration += l.duration_seconds || 0;
    if (!existing.lastSeen || l.created_at > existing.lastSeen) {
      existing.lastSeen = l.created_at;
      existing.lastPage = l.page;
    }
    userStatsMap.set(l.user_id, existing);
  });
  const userRanking = Array.from(userStatsMap.entries())
    .map(([userId, stats]) => ({
      userId,
      nome: profiles.get(userId)?.nome || profiles.get(userId)?.email || userId.slice(0, 8),
      views: stats.views,
      sessions: stats.sessions.size,
      totalDuration: stats.totalDuration,
      lastSeen: stats.lastSeen,
      lastPage: stats.lastPage,
      isOnline: onlineUserIds.includes(userId),
    }))
    .sort((a, b) => b.views - a.views);

  // Recent visits with user names
  const seenSessions = new Set<string>();
  const recentVisits: VisitorLog[] = [];
  for (const l of mergedLogs) {
    if (!seenSessions.has(l.session_id)) {
      seenSessions.add(l.session_id);
      recentVisits.push(l);
      if (recentVisits.length >= 20) break;
    }
  }

  const getUserName = (userId: string) => {
    const p = profiles.get(userId);
    return p?.nome || p?.email || userId.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      {/* Period selector + Online */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onlineNow > 0 && (
            <Badge variant="outline" className="gap-1.5 text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              {onlineNow} online agora
            </Badge>
          )}
          {onlineNow > 0 && (
            <div className="flex items-center gap-1 ml-1">
              {onlineUserIds.slice(0, 5).map(uid => (
                <Badge key={uid} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {getUserName(uid)}
                </Badge>
              ))}
              {onlineUserIds.length > 5 && <span className="text-xs text-muted-foreground">+{onlineUserIds.length - 5}</span>}
            </div>
          )}
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Hoje</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="14">Últimos 14 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="60">Últimos 60 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards - Visitantes */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard icon={<Users className="h-5 w-5 text-primary" />} label="Visitantes" value={uniqueUsers.toString()} bgClass="bg-primary/10" />
        <KPICard icon={<Eye className="h-5 w-5 text-blue-600" />} label="Pageviews" value={totalPageViews.toLocaleString("pt-BR")} bgClass="bg-blue-500/10" />
        <KPICard icon={<Activity className="h-5 w-5 text-green-600" />} label="Sessões" value={uniqueSessions.toString()} bgClass="bg-green-500/10" />
        <KPICard icon={<Clock className="h-5 w-5 text-amber-600" />} label="Tempo Médio" value={formatDuration(avgDuration)} bgClass="bg-amber-500/10" />
        <KPICard icon={<TrendingUp className="h-5 w-5 text-purple-600" />} label="Págs/Sessão" value={uniqueSessions > 0 ? (totalPageViews / uniqueSessions).toFixed(1) : "0"} bgClass="bg-purple-500/10" />
      </div>

      {/* KPI Cards - Importações */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPICard icon={<Database className="h-5 w-5 text-red-600" />} label="Importações Cobrança" value={activityTotals.cobranca.toLocaleString("pt-BR")} bgClass="bg-red-500/10" />
        <KPICard icon={<Database className="h-5 w-5 text-orange-600" />} label="Importações Eventos" value={activityTotals.eventos.toLocaleString("pt-BR")} bgClass="bg-orange-500/10" />
        <KPICard icon={<Database className="h-5 w-5 text-teal-600" />} label="Importações MGF" value={activityTotals.mgf.toLocaleString("pt-BR")} bgClass="bg-teal-500/10" />
      </div>

      {/* Activity Chart */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Visitantes e Pageviews</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVisitantes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPageviews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(210, 70%, 55%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(210, 70%, 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: 12, fontSize: 12 }} labelStyle={{ fontWeight: 600 }} />
                <Area type="monotone" dataKey="visitantes" name="Visitantes" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#colorVisitantes)" dot={{ r: 3, fill: "hsl(var(--primary))" }} />
                <Area type="monotone" dataKey="pageviews" name="Pageviews" stroke="hsl(210, 70%, 55%)" strokeWidth={2} fill="url(#colorPageviews)" dot={{ r: 2, fill: "hsl(210, 70%, 55%)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Ranking + Online Users */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* User Ranking */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Crown className="h-4 w-4 text-yellow-500" />
              Ranking de Acessos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[350px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead className="text-center">Views</TableHead>
                    <TableHead className="text-center">Sessões</TableHead>
                    <TableHead className="text-right">Tempo Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userRanking.map((u, i) => (
                    <TableRow key={u.userId} className={u.isOnline ? "bg-green-50/50 dark:bg-green-950/20" : ""}>
                      <TableCell className="py-2">
                        <RankMedal position={i} />
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          {u.isOnline && (
                            <span className="relative flex h-2 w-2 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                            </span>
                          )}
                          <div>
                            <span className="text-sm font-medium">{u.nome}</span>
                            {u.isOnline && <span className="text-[10px] text-green-600 ml-1.5">online</span>}
                            <p className="text-[10px] text-muted-foreground font-mono">{u.lastPage}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">{u.views}</TableCell>
                      <TableCell className="text-center text-sm tabular-nums">{u.sessions}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatDuration(u.totalDuration)}</TableCell>
                    </TableRow>
                  ))}
                  {userRanking.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">Sem dados</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Visits with User Names */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Últimas Visitas (tempo real)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[350px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Página</TableHead>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead className="text-right">Duração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentVisits.map(v => {
                    const mins = differenceInMinutes(new Date(), new Date(v.created_at));
                    const isRecent = mins < 5;
                    return (
                      <TableRow key={v.id} className={isRecent ? "bg-green-50/50 dark:bg-green-950/20" : ""}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {mins < 1 ? (
                            <Badge variant="outline" className="text-[10px] text-green-600 border-green-300 px-1.5 py-0">Agora</Badge>
                          ) : mins < 60 ? `${mins}min` : mins < 1440 ? `${Math.floor(mins / 60)}h` : format(new Date(v.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{getUserName(v.user_id)}</TableCell>
                        <TableCell className="font-mono text-xs">{v.page}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <DeviceIcon type={v.device_type} />
                            <span className="text-[10px] capitalize">{v.device_type || "desktop"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{v.duration_seconds ? formatDuration(v.duration_seconds) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {recentVisits.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">Nenhuma visita registrada ainda.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Pages + Devices + Countries */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Top Pages */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Páginas Mais Visitadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topPages.map((p, i) => {
                const pct = totalPageViews > 0 ? (p.count / totalPageViews) * 100 : 0;
                return (
                  <div key={p.page} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-[120px] truncate font-mono" title={p.page}>{p.page}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                    <span className="text-xs font-medium tabular-nums w-8 text-right">{p.count}</span>
                  </div>
                );
              })}
              {topPages.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
            </div>
          </CardContent>
        </Card>

        {/* Devices + Browsers + OS */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Dispositivos & Navegadores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">Dispositivos</p>
              <div className="flex gap-3">
                {devices.map(d => {
                  const pct = totalPageViews > 0 ? Math.round((d.value / totalPageViews) * 100) : 0;
                  return (
                    <div key={d.name} className="flex flex-col items-center gap-1 flex-1 p-2 rounded-lg bg-muted/50">
                      <DeviceIcon type={d.name.toLowerCase()} />
                      <span className="text-lg font-bold">{pct}%</span>
                      <span className="text-[10px] text-muted-foreground">{d.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">Navegadores</p>
              <div className="space-y-1.5">
                {browsers.map((b, i) => {
                  const pct = totalPageViews > 0 ? (b.value / totalPageViews) * 100 : 0;
                  return (
                    <div key={b.name} className="flex items-center gap-2">
                      <span className="text-xs w-16 truncate">{b.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                      <span className="text-[10px] font-medium tabular-nums w-6 text-right">{b.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">Sist. Operacional</p>
              <div className="flex flex-wrap gap-1.5">
                {osList.map(o => <Badge key={o.name} variant="outline" className="text-[10px]">{o.name} ({o.value})</Badge>)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Countries */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Globe className="h-4 w-4" />Países / Regiões</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={countries} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [v, "Visitas"]} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {countries.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, bgClass }: { icon: React.ReactNode; label: string; value: string; bgClass: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${bgClass}`}>{icon}</div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
