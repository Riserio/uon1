import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Timer, TrendingUp, Users, Video } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MeetingRoomSummary } from "../../types";

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--muted-foreground))", "hsl(var(--destructive))"];
const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
};

/** Métricas e gráficos de uso do Talk */
export default function TalkDashboard({ rooms }: { rooms: MeetingRoomSummary[] }) {
  const finalizadas = rooms.filter((r) => r.status !== "ativa");
  const totalParticipantes = rooms.reduce((sum, r) => sum + (r.meeting_participants?.length || 0), 0);
  const totalConvidados = rooms.reduce((sum, r) => sum + (r.convidados?.length || 0), 0);
  const avgDuration =
    finalizadas.length > 0
      ? Math.round(finalizadas.reduce((sum, r) => sum + (r.duracao_minutos || 0), 0) / finalizadas.length)
      : 0;

  const weeklyData = useMemo(() => {
    const weeks: Record<string, number> = {};
    const now = new Date();
    for (let i = 7; i >= 0; i--) weeks[`Sem ${8 - i}`] = 0;
    rooms.forEach((r) => {
      const diffDays = Math.floor((now.getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const key = `Sem ${8 - Math.min(7, Math.floor(diffDays / 7))}`;
      if (weeks[key] !== undefined) weeks[key]++;
    });
    return Object.entries(weeks).map(([name, total]) => ({ name, total }));
  }, [rooms]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    rooms.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name === "ativa" ? "Ativas" : name === "finalizada" ? "Finalizadas" : name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [rooms]);

  const stats = [
    { icon: Video, label: "Total Reuniões", value: rooms.length },
    { icon: Users, label: "Participantes", value: totalParticipantes },
    { icon: Timer, label: "Duração Média", value: `${avgDuration} min` },
    { icon: TrendingUp, label: "Convidados", value: totalConvidados },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((item) => (
          <Card key={item.label} className="rounded-2xl border-border/50">
            <CardContent className="p-4 text-center">
              <item.icon className="h-5 w-5 mx-auto text-primary mb-1.5" />
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-4">Reuniões por Semana</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Reuniões" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-4">Status das Reuniões</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <RechartsTooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3">Últimas Reuniões Finalizadas</h3>
          {finalizadas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma reunião finalizada</p>
          ) : (
            <div className="space-y-1.5">
              {finalizadas.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 text-sm">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{r.nome}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {r.duracao_minutos && <span>{r.duracao_minutos} min</span>}
                    <span>{r.meeting_participants?.length || 0} part.</span>
                    {r.finalizado_em && <span>{new Date(r.finalizado_em).toLocaleDateString("pt-BR")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
