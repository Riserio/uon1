import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Activity, Users, BarChart3, TrendingUp } from "lucide-react";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

interface DailyData {
  date: string;
  label: string;
  total: number;
}

interface ModuleBreakdown {
  name: string;
  value: number;
}

interface ActionBreakdown {
  name: string;
  value: number;
}

const MODULE_LABELS: Record<string, string> = {
  cobranca: "Cobrança",
  cobranca_insights: "Cobrança Insights",
  sga_insights: "Eventos",
  mgf_insights: "MGF",
  bi_indicadores: "Indicadores",
  estudo_base: "Estudo de Base",
};

const ACTION_LABELS: Record<string, string> = {
  importacao: "Importação",
  importacao_automatica: "Import. Automática",
  execucao_manual_iniciada: "Execução Manual",
  execucao_automatica_iniciada: "Execução Automática",
  execucao_automatica_erro: "Erro Automático",
  execucao_parada: "Execução Parada",
  github_workflow_disparado: "Workflow Disparado",
  github_workflow_agendado: "Workflow Agendado",
  github_workflow_cancelado: "Workflow Cancelado",
  github_workflow_retry: "Workflow Retry",
  teste_conexao_hinova: "Teste Conexão",
  alteracao: "Alteração",
  exclusao: "Exclusão",
};

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

export default function BIAdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("7");
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [moduleBreakdown, setModuleBreakdown] = useState<ModuleBreakdown[]>([]);
  const [actionBreakdown, setActionBreakdown] = useState<ActionBreakdown[]>([]);
  const [totalActions, setTotalActions] = useState(0);
  const [uniqueUsers, setUniqueUsers] = useState(0);
  const [uniqueAssociacoes, setUniqueAssociacoes] = useState(0);
  const [avgPerDay, setAvgPerDay] = useState(0);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const days = parseInt(period);
      const startDate = subDays(new Date(), days);
      const startStr = startDate.toISOString();

      const { data: logs, error } = await supabase
        .from("bi_audit_logs")
        .select("created_at, acao, modulo, user_id, user_nome, corretora_id")
        .gte("created_at", startStr)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!logs) return;

      // Total actions
      setTotalActions(logs.length);

      // Unique users
      const userSet = new Set(logs.map(l => l.user_id));
      setUniqueUsers(userSet.size);

      // Unique associações
      const assocSet = new Set(logs.filter(l => l.corretora_id).map(l => l.corretora_id));
      setUniqueAssociacoes(assocSet.size);

      // Average per day
      setAvgPerDay(days > 0 ? Math.round(logs.length / days) : logs.length);

      // Daily data
      const allDays = eachDayOfInterval({ start: startDate, end: new Date() });
      const dayCountMap = new Map<string, number>();
      logs.forEach(l => {
        const day = format(new Date(l.created_at!), "yyyy-MM-dd");
        dayCountMap.set(day, (dayCountMap.get(day) || 0) + 1);
      });
      setDailyData(allDays.map(d => {
        const key = format(d, "yyyy-MM-dd");
        return {
          date: key,
          label: format(d, "dd MMM", { locale: ptBR }),
          total: dayCountMap.get(key) || 0,
        };
      }));

      // Module breakdown
      const modMap = new Map<string, number>();
      logs.forEach(l => {
        const mod = l.modulo || "outro";
        modMap.set(mod, (modMap.get(mod) || 0) + 1);
      });
      setModuleBreakdown(
        Array.from(modMap.entries())
          .map(([name, value]) => ({ name: MODULE_LABELS[name] || name, value }))
          .sort((a, b) => b.value - a.value)
      );

      // Action breakdown
      const actMap = new Map<string, number>();
      logs.forEach(l => {
        const act = l.acao || "outro";
        actMap.set(act, (actMap.get(act) || 0) + 1);
      });
      setActionBreakdown(
        Array.from(actMap.entries())
          .map(([name, value]) => ({ name: ACTION_LABELS[name] || name, value }))
          .sort((a, b) => b.value - a.value)
      );
    } catch (e) {
      console.error("Erro ao carregar analytics:", e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex justify-end">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="14">Últimos 14 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="60">Últimos 60 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<Activity className="h-5 w-5 text-primary" />} label="Total de Ações" value={totalActions} bgClass="bg-primary/10" />
        <KPICard icon={<Users className="h-5 w-5 text-blue-600" />} label="Usuários Ativos" value={uniqueUsers} bgClass="bg-blue-500/10" />
        <KPICard icon={<BarChart3 className="h-5 w-5 text-green-600" />} label="Associações" value={uniqueAssociacoes} bgClass="bg-green-500/10" />
        <KPICard icon={<TrendingUp className="h-5 w-5 text-amber-600" />} label="Média/dia" value={avgPerDay} bgClass="bg-amber-500/10" />
      </div>

      {/* Activity Chart */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Atividade no Período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ fontWeight: 600 }}
                  formatter={(value: number) => [value, "Ações"]}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#colorTotal)"
                  dot={{ r: 3, fill: "hsl(var(--primary))" }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Breakdowns */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* By Module */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Por Módulo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moduleBreakdown} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [value, "Ações"]}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {moduleBreakdown.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* By Action Type */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Por Tipo de Ação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {actionBreakdown.slice(0, 8).map((action, i) => {
                const pct = totalActions > 0 ? (action.value / totalActions) * 100 : 0;
                return (
                  <div key={action.name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-[140px] truncate" title={action.name}>{action.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                      />
                    </div>
                    <span className="text-xs font-medium tabular-nums w-10 text-right">{action.value}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, bgClass }: { icon: React.ReactNode; label: string; value: number; bgClass: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${bgClass}`}>{icon}</div>
          <div>
            <p className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
