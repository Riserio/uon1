import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Users, Eye, Clock, Monitor, Smartphone, Tablet, Globe, Activity, TrendingUp } from "lucide-react";
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
  "America/Sao_Paulo": "Brasil",
  "America/Fortaleza": "Brasil",
  "America/Recife": "Brasil",
  "America/Bahia": "Brasil",
  "America/Belem": "Brasil",
  "America/Manaus": "Brasil",
  "America/Cuiaba": "Brasil",
  "America/Campo_Grande": "Brasil",
  "America/Araguaina": "Brasil",
  "America/Maceio": "Brasil",
  "America/New_York": "EUA",
  "America/Chicago": "EUA",
  "America/Denver": "EUA",
  "America/Los_Angeles": "EUA",
  "America/Phoenix": "EUA",
  "Europe/London": "Reino Unido",
  "Europe/Lisbon": "Portugal",
  "Europe/Paris": "França",
  "Europe/Berlin": "Alemanha",
  "Europe/Madrid": "Espanha",
  "Asia/Tokyo": "Japão",
  "Australia/Sydney": "Austrália",
  "America/Buenos_Aires": "Argentina",
  "America/Bogota": "Colômbia",
  "America/Mexico_City": "México",
  "America/Santiago": "Chile",
  "America/Lima": "Peru",
};

function getCountryFromTZ(tz: string | null): string {
  if (!tz) return "Desconhecido";
  if (TZ_COUNTRY_MAP[tz]) return TZ_COUNTRY_MAP[tz];
  // Try partial matches
  if (tz.startsWith("America/")) {
    // Check if it's a Brazilian timezone
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

export default function BIAdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("7");
  const [logs, setLogs] = useState<VisitorLog[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const days = parseInt(period);
      const startDate = subDays(new Date(), days);
      const startStr = startDate.toISOString();

      // Batch fetch up to 100k records in chunks of 1000
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
    } catch (e) {
      console.error("Erro ao carregar analytics:", e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // === Compute metrics ===
  const days = parseInt(period);
  const uniqueSessions = new Set(logs.map(l => l.session_id)).size;
  const uniqueUsers = new Set(logs.map(l => l.user_id)).size;
  const totalPageViews = logs.length;
  const totalDuration = logs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
  const avgDuration = uniqueSessions > 0 ? Math.round(totalDuration / uniqueSessions) : 0;

  // Online now (active in last 5 min)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const onlineNow = new Set(logs.filter(l => new Date(l.created_at) > fiveMinAgo).map(l => l.user_id)).size;

  // Daily data
  const startDate = subDays(new Date(), days);
  const allDays = eachDayOfInterval({ start: startDate, end: new Date() });
  const dayMap = new Map<string, { visitors: Set<string>; views: number }>();
  logs.forEach(l => {
    const day = format(new Date(l.created_at), "yyyy-MM-dd");
    const existing = dayMap.get(day) || { visitors: new Set<string>(), views: 0 };
    existing.visitors.add(l.session_id);
    existing.views++;
    dayMap.set(day, existing);
  });
  const dailyData = allDays.map(d => {
    const key = format(d, "yyyy-MM-dd");
    const data = dayMap.get(key);
    return {
      date: key,
      label: format(d, "dd MMM", { locale: ptBR }),
      visitantes: data?.visitors.size || 0,
      pageviews: data?.views || 0,
    };
  });

  // Top pages
  const pageMap = new Map<string, number>();
  logs.forEach(l => pageMap.set(l.page, (pageMap.get(l.page) || 0) + 1));
  const topPages = Array.from(pageMap.entries())
    .map(([page, count]) => ({ page, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Devices
  const deviceMap = new Map<string, number>();
  logs.forEach(l => {
    const dt = l.device_type || "desktop";
    deviceMap.set(dt, (deviceMap.get(dt) || 0) + 1);
  });
  const devices = Array.from(deviceMap.entries())
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
    .sort((a, b) => b.value - a.value);

  // Browsers
  const browserMap = new Map<string, number>();
  logs.forEach(l => {
    const b = l.browser || "Outro";
    browserMap.set(b, (browserMap.get(b) || 0) + 1);
  });
  const browsers = Array.from(browserMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Countries from timezone
  const countryMap = new Map<string, number>();
  logs.forEach(l => {
    const country = getCountryFromTZ(l.timezone);
    countryMap.set(country, (countryMap.get(country) || 0) + 1);
  });
  const countries = Array.from(countryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // OS
  const osMap = new Map<string, number>();
  logs.forEach(l => {
    const o = l.os || "Outro";
    osMap.set(o, (osMap.get(o) || 0) + 1);
  });
  const osList = Array.from(osMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Recent visits (last 20 unique sessions)
  const seenSessions = new Set<string>();
  const recentVisits: VisitorLog[] = [];
  for (const l of logs) {
    if (!seenSessions.has(l.session_id)) {
      seenSessions.add(l.session_id);
      recentVisits.push(l);
      if (recentVisits.length >= 15) break;
    }
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onlineNow > 0 && (
            <Badge variant="outline" className="gap-1.5 text-green-600 border-green-300 bg-green-50">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              {onlineNow} online agora
            </Badge>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard icon={<Users className="h-5 w-5 text-primary" />} label="Visitantes" value={uniqueUsers.toString()} bgClass="bg-primary/10" />
        <KPICard icon={<Eye className="h-5 w-5 text-blue-600" />} label="Pageviews" value={totalPageViews.toLocaleString("pt-BR")} bgClass="bg-blue-500/10" />
        <KPICard icon={<Activity className="h-5 w-5 text-green-600" />} label="Sessões" value={uniqueSessions.toString()} bgClass="bg-green-500/10" />
        <KPICard icon={<Clock className="h-5 w-5 text-amber-600" />} label="Tempo Médio" value={formatDuration(avgDuration)} bgClass="bg-amber-500/10" />
        <KPICard icon={<TrendingUp className="h-5 w-5 text-purple-600" />} label="Págs/Sessão" value={uniqueSessions > 0 ? (totalPageViews / uniqueSessions).toFixed(1) : "0"} bgClass="bg-purple-500/10" />
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
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="visitantes" name="Visitantes" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#colorVisitantes)" dot={{ r: 3, fill: "hsl(var(--primary))" }} />
                <Area type="monotone" dataKey="pageviews" name="Pageviews" stroke="hsl(210, 70%, 55%)" strokeWidth={2} fill="url(#colorPageviews)" dot={{ r: 2, fill: "hsl(210, 70%, 55%)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

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

        {/* Devices + OS */}
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
                {osList.map(o => (
                  <Badge key={o.name} variant="outline" className="text-[10px]">{o.name} ({o.value})</Badge>
                ))}
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

      {/* Recent Visits */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Últimas Visitas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[350px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Página</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Navegador</TableHead>
                  <TableHead>Região</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentVisits.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {(() => {
                        const mins = differenceInMinutes(new Date(), new Date(v.created_at));
                        if (mins < 1) return "Agora";
                        if (mins < 60) return `${mins}min atrás`;
                        if (mins < 1440) return `${Math.floor(mins / 60)}h atrás`;
                        return format(new Date(v.created_at), "dd/MM HH:mm", { locale: ptBR });
                      })()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{v.page}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <DeviceIcon type={v.device_type} />
                        <span className="text-xs capitalize">{v.device_type || "desktop"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{v.browser || "—"}</TableCell>
                    <TableCell className="text-xs">{getCountryFromTZ(v.timezone)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{v.duration_seconds ? formatDuration(v.duration_seconds) : "—"}</TableCell>
                  </TableRow>
                ))}
                {recentVisits.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      Nenhuma visita registrada ainda. Os dados aparecerão conforme os usuários navegam pelo sistema.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
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
