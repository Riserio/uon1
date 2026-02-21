import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, subDays, startOfDay, endOfDay, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Info, MessageCircle, Send, CheckCheck, Eye, XCircle, Clock, Bot } from 'lucide-react';

interface Stats {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  received: number;
  templates: number;
  freeWindow: number;
  automated: number;
}

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '14', label: 'Últimos 14 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
];

export default function WhatsAppDashboard() {
  const [period, setPeriod] = useState('7');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ sent: 0, delivered: 0, read: 0, failed: 0, received: 0, templates: 0, freeWindow: 0, automated: 0 });
  const [historicoStats, setHistoricoStats] = useState({ total: 0, cobranca: 0, eventos: 0, mgf: 0, manual: 0 });

  const dateRange = useMemo(() => {
    const end = endOfDay(new Date());
    const start = startOfDay(subDays(new Date(), parseInt(period)));
    return { start: start.toISOString(), end: end.toISOString() };
  }, [period]);

  const periodLabel = useMemo(() => {
    const end = new Date();
    const start = subDays(end, parseInt(period));
    return `${format(start, "dd MMM", { locale: ptBR })} – ${format(end, "dd MMM yyyy", { locale: ptBR })}`;
  }, [period]);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);

      // Fetch whatsapp_messages stats
      const { data: msgs } = await supabase
        .from('whatsapp_messages')
        .select('direction, status, type, sent_by, created_at')
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end);

      // Fetch whatsapp_historico stats
      const { data: hist } = await supabase
        .from('whatsapp_historico')
        .select('tipo, status, created_at')
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end);

      if (msgs) {
        const outbound = msgs.filter(m => m.direction === 'out');
        const inbound = msgs.filter(m => m.direction === 'in');

        setStats({
          sent: outbound.length,
          delivered: outbound.filter(m => m.status === 'delivered' || m.status === 'read').length,
          read: outbound.filter(m => m.status === 'read').length,
          failed: outbound.filter(m => m.status === 'failed').length,
          received: inbound.length,
          templates: outbound.filter(m => m.type === 'template').length,
          freeWindow: outbound.filter(m => m.type === 'text').length,
          automated: outbound.filter(m => !m.sent_by).length,
        });
      }

      if (hist) {
        setHistoricoStats({
          total: hist.length,
          cobranca: hist.filter(h => h.tipo === 'cobranca').length,
          eventos: hist.filter(h => h.tipo === 'eventos').length,
          mgf: hist.filter(h => h.tipo === 'mgf').length,
          manual: hist.filter(h => h.tipo === 'manual').length,
        });
      }

      setLoading(false);
    };

    fetchStats();
  }, [dateRange]);

  const totalMessages = stats.sent + stats.received;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* Period Selector */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Insights de Mensagens</h3>
            <p className="text-xs text-muted-foreground">{periodLabel}</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">
          <strong>Observação:</strong> os dados são calculados com base nos registros armazenados localmente.
        </p>

        {/* Row 1 – Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* All messages */}
          <MetricCard title="Todas as mensagens" total={totalMessages}>
            <MetricRow color="bg-primary" label="Mensagens enviadas" value={stats.sent} tooltip="Total de mensagens enviadas via API" />
            <MetricRow color="bg-green-500" label="Mensagens entregues" value={stats.delivered} tooltip="Confirmadas como entregues pelo WhatsApp" />
            <MetricRow color="bg-blue-500" label="Mensagens lidas" value={stats.read} tooltip="Confirmadas como lidas pelo destinatário" />
            <MetricRow color="bg-muted-foreground" label="Mensagens recebidas" value={stats.received} tooltip="Mensagens recebidas de contatos" />
          </MetricCard>

          {/* Delivery */}
          <MetricCard title="Status de entrega" total={stats.sent}>
            <MetricRow color="bg-green-500" label="Entregues" value={stats.delivered} tooltip="Entregues com sucesso" />
            <MetricRow color="bg-blue-500" label="Lidas" value={stats.read} tooltip="Abertas e lidas" />
            <MetricRow color="bg-yellow-500" label="Pendentes" value={stats.sent - stats.delivered - stats.failed} tooltip="Aguardando confirmação" />
            <MetricRow color="bg-destructive" label="Falharam" value={stats.failed} tooltip="Não puderam ser entregues" />
          </MetricCard>

          {/* Free vs Paid */}
          <MetricCard title="Janela de 24h (gratuitas)" total={stats.freeWindow}>
            <MetricRow color="bg-green-500" label="Mensagens na janela" value={stats.freeWindow} tooltip="Enviadas como texto dentro da janela de 24h (gratuitas)" />
            <MetricRow color="bg-orange-500" label="Templates (fora da janela)" value={stats.templates} tooltip="Enviadas como template fora da janela de 24h (cobradas)" />
          </MetricCard>
        </div>

        {/* Row 2 – Operations */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* By type */}
          <MetricCard title="Envios por módulo" total={historicoStats.total}>
            <MetricRow color="bg-red-500" label="Cobrança" value={historicoStats.cobranca} tooltip="Resumos de cobrança enviados" />
            <MetricRow color="bg-emerald-500" label="Eventos (SGA)" value={historicoStats.eventos} tooltip="Resumos de eventos enviados" />
            <MetricRow color="bg-purple-500" label="MGF" value={historicoStats.mgf} tooltip="Resumos MGF enviados" />
            <MetricRow color="bg-sky-500" label="Manual" value={historicoStats.manual} tooltip="Envios manuais" />
          </MetricCard>

          {/* Automated */}
          <MetricCard title="Automação" total={stats.automated + (stats.sent - stats.automated)}>
            <MetricRow color="bg-violet-500" label="Automatizadas" value={stats.automated} tooltip="Enviadas automaticamente pelo sistema (sem operador)" />
            <MetricRow color="bg-sky-500" label="Manuais (operador)" value={stats.sent - stats.automated} tooltip="Enviadas manualmente por um operador" />
          </MetricCard>

          {/* Received */}
          <MetricCard title="Mensagens recebidas" total={stats.received}>
            <MetricRow color="bg-teal-500" label="Recebidas de contatos" value={stats.received} tooltip="Total de mensagens recebidas dos contatos" />
          </MetricCard>
        </div>
      </div>
    </TooltipProvider>
  );
}

function MetricCard({ title, total, children }: { title: string; total: number; children: React.ReactNode }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <span className="text-lg font-bold text-foreground">{total}</span>
        </div>
        <div className="space-y-2">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRow({ color, label, value, tooltip }: { color: string; label: string; value: number; tooltip: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span className={`w-3 h-0.5 ${color} rounded-full inline-block`} style={{ borderTop: '2px dashed' }} />
        <span className="text-muted-foreground">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
