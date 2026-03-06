import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Clock, AlertTriangle, TrendingUp, Building2, BarChart3 } from "lucide-react";

const STATUS_ACCENT_COLORS: Record<string, string> = {
  "Recebimento": "#3b82f6",
  "Levantamento": "#eab308",
  "Acionamento Setor": "#f97316",
  "Contato Associado": "#a855f7",
  "Monitoramento": "#06b6d4",
  "Resolvido": "#22c55e",
  "Sem Resolução": "#ef4444",
};

const TIPO_LABELS: Record<string, string> = {
  reclamacao: "Reclamação",
  sugestao: "Sugestão",
  elogio: "Elogio",
  denuncia: "Denúncia",
};

const TIPO_ICONS: Record<string, string> = {
  reclamacao: "🔴",
  sugestao: "🟡",
  elogio: "🟢",
  denuncia: "🟣",
};

type Registro = {
  id: string;
  tipo: string;
  status: string;
  urgencia: string | null;
  status_changed_at: string | null;
  created_at: string;
  corretora_id: string;
  [key: string]: any;
};

type CorretoraMini = { id: string; nome: string };

interface OuvidoriaWidgetsProps {
  registros: Registro[];
  statuses: string[];
  slaHours?: Record<string, number | null>;
  corretoras?: CorretoraMini[];
  showAssociacoes?: boolean;
}

function getSlaVencido(registro: Registro, slaHours: Record<string, number | null>): boolean {
  const slaH = slaHours[registro.status];
  if (!slaH) return false;
  const changedAt = registro.status_changed_at || registro.created_at;
  const diffMs = new Date().getTime() - new Date(changedAt).getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours > slaH;
}

export function OuvidoriaWidgets({ registros, statuses, slaHours = {}, corretoras = [], showAssociacoes = false }: OuvidoriaWidgetsProps) {
  const total = registros.length;
  const resolvidos = registros.filter(r => r.status === "Resolvido").length;
  const semResolucao = registros.filter(r => r.status === "Sem Resolução").length;
  const emAndamento = registros.filter(r => !["Resolvido", "Sem Resolução"].includes(r.status)).length;
  const totalFinalizados = resolvidos + semResolucao;
  const taxaResolucao = totalFinalizados > 0 ? Math.round((resolvidos / totalFinalizados) * 100) : 0;

  const vencidosPorEtapa = statuses
    .filter(s => !["Resolvido", "Sem Resolução"].includes(s))
    .map(status => {
      const cards = registros.filter(r => r.status === status);
      const vencidos = cards.filter(r => getSlaVencido(r, slaHours)).length;
      return { status, total: cards.length, vencidos };
    });
  
  const totalVencidos = vencidosPorEtapa.reduce((sum, e) => sum + e.vencidos, 0);

  const tipoCounts = Object.keys(TIPO_LABELS).map(key => ({
    key,
    label: TIPO_LABELS[key],
    icon: TIPO_ICONS[key],
    count: registros.filter(r => r.tipo === key).length,
  }));

  const statusCounts = statuses.map(s => ({
    status: s,
    count: registros.filter(r => r.status === s).length,
    color: STATUS_ACCENT_COLORS[s],
  }));

  const maxStatusCount = Math.max(...statusCounts.map(s => s.count), 1);

  return (
    <div className="space-y-6">
      {/* Row 1: Taxa de Resolução + SLAs Vencidos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Taxa de Resolução */}
        <Card className="rounded-2xl border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-5 pt-5 pb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Taxa de Resolução</h3>
            </div>
            <div className="px-5 pb-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-xl bg-green-50 dark:bg-green-950/30">
                  <p className="text-3xl font-bold text-green-600">{resolvidos}</p>
                  <p className="text-xs text-muted-foreground mt-1">Resolvidos</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-red-50 dark:bg-red-950/30">
                  <p className="text-3xl font-bold text-red-600">{semResolucao}</p>
                  <p className="text-xs text-muted-foreground mt-1">Sem Resolução</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-muted/50">
                  <p className="text-3xl font-bold text-foreground">{emAndamento}</p>
                  <p className="text-xs text-muted-foreground mt-1">Em Andamento</p>
                </div>
              </div>
              {totalFinalizados > 0 && (
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Índice de resolução</span>
                    <span className="font-semibold text-foreground">{taxaResolucao}%</span>
                  </div>
                  <Progress value={taxaResolucao} className="h-2" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* SLAs Vencidos */}
        <Card className="rounded-2xl border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="font-semibold text-sm">SLAs Vencidos por Etapa</h3>
              </div>
              {totalVencidos > 0 && (
                <Badge variant="destructive" className="text-xs">{totalVencidos} vencido{totalVencidos > 1 ? 's' : ''}</Badge>
              )}
            </div>
            <div className="px-5 pb-5 space-y-2.5">
              {vencidosPorEtapa.map(item => (
                <div key={item.status} className="flex items-center justify-between group">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_ACCENT_COLORS[item.status] }} />
                    <span className="text-sm">{item.status}</span>
                  </div>
                  <span className={`rounded-full px-3 py-0.5 text-sm font-semibold min-w-[36px] text-center transition-colors ${
                    item.vencidos > 0 ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' : 'bg-muted text-muted-foreground'
                  }`}>
                    {item.vencidos}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Por Tipo + Por Etapa */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribuição por Tipo */}
        <Card className="rounded-2xl border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-5 pt-5 pb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Distribuição por Tipo</h3>
            </div>
            <div className="px-5 pb-5 space-y-3">
              {tipoCounts.map(item => {
                const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                return (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{item.icon}</span>
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                        <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-semibold min-w-[28px] text-center">{item.count}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Manifestações por Etapa */}
        <Card className="rounded-2xl border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-5 pt-5 pb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Manifestações por Etapa</h3>
            </div>
            <div className="px-5 pb-5 space-y-2.5">
              {statusCounts.map(item => {
                const pct = maxStatusCount > 0 ? (item.count / maxStatusCount) * 100 : 0;
                return (
                  <div key={item.status} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm">{item.status}</span>
                      </div>
                      <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-semibold min-w-[28px] text-center">{item.count}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Por Associação (only backoffice) */}
      {showAssociacoes && corretoras.length > 0 && (
        <Card className="rounded-2xl border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="px-5 pt-5 pb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Manifestações por Associação</h3>
            </div>
            <div className="px-5 pb-5">
              <div className="space-y-2.5">
                {corretoras.map(c => {
                  const count = registros.filter(r => r.corretora_id === c.id).length;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={c.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{c.nome}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                          <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-semibold min-w-[28px] text-center">{count}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                }).filter(Boolean)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
