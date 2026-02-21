import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Info, TrendingUp, TrendingDown, MessageCircle, AlertTriangle, DollarSign, Building2, FileText } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
  Tooltip as RechartsTooltip,
} from 'recharts';

interface LocalStats {
  sent: number; delivered: number; read: number; failed: number;
  received: number; templates: number; freeWindow: number; automated: number;
}

interface ConvDataPoint {
  start: number; end: number; conversation: number; cost: number;
  conversation_category?: string; conversation_type?: string;
}

interface MetaAnalytics {
  conversation_analytics: { data: Array<{ data_points: ConvDataPoint[] }> } | null;
  analytics: { phone_numbers: string[]; data_points: Array<{ start: number; end: number; sent: number; delivered: number }> } | null;
}

interface TemplateCount { name: string; value: number }
interface AssocCount { name: string; total: number; cobranca: number; eventos: number; mgf: number; manual: number }

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '14', label: 'Últimos 14 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
];

const PIE_COLORS = ['#8b5cf6', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
const BAR_COLORS = ['#8b5cf6', '#22c55e', '#3b82f6', '#f59e0b'];

// Estimated costs per category (USD) – Meta pricing Q1 2026 BR
const COST_PER_CATEGORY: Record<string, number> = {
  SERVICE: 0,
  MARKETING: 0.0625,
  UTILITY: 0.0080,
  AUTHENTICATION: 0.0315,
  AUTHENTICATION_INTERNATIONAL: 0.0630,
  MARKETING_LITE: 0.0350,
};

export default function WhatsAppDashboard() {
  const [period, setPeriod] = useState('7');
  const [loading, setLoading] = useState(true);
  const [localStats, setLocalStats] = useState<LocalStats>({ sent: 0, delivered: 0, read: 0, failed: 0, received: 0, templates: 0, freeWindow: 0, automated: 0 });
  const [historicoStats, setHistoricoStats] = useState({ total: 0, cobranca: 0, eventos: 0, mgf: 0, manual: 0 });
  const [metaData, setMetaData] = useState<MetaAnalytics | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [dailyData, setDailyData] = useState<Array<{ date: string; enviadas: number; entregues: number; lidas: number; recebidas: number; falhas: number }>>([]);
  const [templateStats, setTemplateStats] = useState<TemplateCount[]>([]);
  const [assocStats, setAssocStats] = useState<AssocCount[]>([]);

  const dateRange = useMemo(() => {
    const end = endOfDay(new Date());
    const start = startOfDay(subDays(new Date(), parseInt(period)));
    return { start: start.toISOString(), end: end.toISOString(), startTs: Math.floor(start.getTime() / 1000), endTs: Math.floor(end.getTime() / 1000) };
  }, [period]);

  const periodLabel = useMemo(() => {
    const end = new Date();
    const start = subDays(end, parseInt(period));
    return `${format(start, "dd MMM", { locale: ptBR })} – ${format(end, "dd MMM yyyy", { locale: ptBR })}`;
  }, [period]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setMetaError(null);

      const [msgsRes, histRes] = await Promise.all([
        supabase.from('whatsapp_messages').select('direction, status, type, sent_by, created_at, template_name')
          .gte('created_at', dateRange.start).lte('created_at', dateRange.end),
        supabase.from('whatsapp_historico').select('tipo, status, created_at, template_id, corretora_id, corretoras:corretora_id(nome), whatsapp_templates:template_id(nome)')
          .gte('created_at', dateRange.start).lte('created_at', dateRange.end),
      ]);

      const msgs = msgsRes.data || [];
      const hist = histRes.data as any[] || [];

      const outbound = msgs.filter(m => m.direction === 'out');
      const inbound = msgs.filter(m => m.direction === 'in');

      setLocalStats({
        sent: outbound.length, delivered: outbound.filter(m => m.status === 'delivered' || m.status === 'read').length,
        read: outbound.filter(m => m.status === 'read').length, failed: outbound.filter(m => m.status === 'failed').length,
        received: inbound.length, templates: outbound.filter(m => m.type === 'template').length,
        freeWindow: outbound.filter(m => m.type === 'text').length, automated: outbound.filter(m => !m.sent_by).length,
      });

      setHistoricoStats({
        total: hist.length, cobranca: hist.filter(h => h.tipo === 'cobranca').length,
        eventos: hist.filter(h => h.tipo === 'eventos').length, mgf: hist.filter(h => h.tipo === 'mgf').length,
        manual: hist.filter(h => h.tipo === 'manual').length,
      });

      // Template stats from whatsapp_messages (template_name) + historico
      const tplMap: Record<string, number> = {};
      outbound.filter(m => m.type === 'template' && m.template_name).forEach(m => {
        const n = m.template_name!;
        tplMap[n] = (tplMap[n] || 0) + 1;
      });
      hist.filter(h => h.whatsapp_templates?.nome).forEach((h: any) => {
        const n = h.whatsapp_templates.nome;
        tplMap[n] = (tplMap[n] || 0) + 1;
      });
      setTemplateStats(Object.entries(tplMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));

      // Association stats
      const assocMap: Record<string, AssocCount> = {};
      hist.forEach((h: any) => {
        const cName = h.corretoras?.nome || 'Sem associação';
        if (!assocMap[cName]) assocMap[cName] = { name: cName, total: 0, cobranca: 0, eventos: 0, mgf: 0, manual: 0 };
        assocMap[cName].total++;
        if (h.tipo === 'cobranca') assocMap[cName].cobranca++;
        else if (h.tipo === 'eventos') assocMap[cName].eventos++;
        else if (h.tipo === 'mgf') assocMap[cName].mgf++;
        else assocMap[cName].manual++;
      });
      setAssocStats(Object.values(assocMap).sort((a, b) => b.total - a.total));

      // Daily chart
      const dayMap: Record<string, { enviadas: number; entregues: number; lidas: number; recebidas: number; falhas: number }> = {};
      msgs.forEach(m => {
        const day = format(new Date(m.created_at), 'dd/MM');
        if (!dayMap[day]) dayMap[day] = { enviadas: 0, entregues: 0, lidas: 0, recebidas: 0, falhas: 0 };
        if (m.direction === 'out') {
          dayMap[day].enviadas++;
          if (m.status === 'delivered' || m.status === 'read') dayMap[day].entregues++;
          if (m.status === 'read') dayMap[day].lidas++;
          if (m.status === 'failed') dayMap[day].falhas++;
        } else { dayMap[day].recebidas++; }
      });
      setDailyData(Object.entries(dayMap).map(([date, vals]) => ({ date, ...vals })));

      // Meta API
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/whatsapp-analytics?start=${dateRange.startTs}&end=${dateRange.endTs}&granularity=DAILY`,
            { headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
          );
          if (res.ok) { setMetaData(await res.json()); }
          else { const err = await res.json().catch(() => ({})); setMetaError(err.error || `Erro ${res.status}`); }
        }
      } catch { setMetaError('Erro ao conectar com Meta API'); }

      setLoading(false);
    };
    fetchAll();
  }, [dateRange]);

  // Conversation categories from Meta
  const convByCategory = useMemo(() => {
    if (!metaData?.conversation_analytics?.data?.[0]?.data_points) return [];
    const catMap: Record<string, { count: number; cost: number }> = {};
    metaData.conversation_analytics.data[0].data_points.forEach(dp => {
      const cat = dp.conversation_category || 'Outros';
      if (!catMap[cat]) catMap[cat] = { count: 0, cost: 0 };
      catMap[cat].count += dp.conversation || 0;
      catMap[cat].cost += dp.cost || 0;
    });
    return Object.entries(catMap).map(([name, { count, cost }]) => ({ name: translateCategory(name), rawName: name, value: count, cost })).filter(c => c.value > 0);
  }, [metaData]);

  const totalConversations = convByCategory.reduce((s, c) => s + c.value, 0);
  const totalCostMeta = convByCategory.reduce((s, c) => s + c.cost, 0);

  // Estimated cost from local data (fallback)
  const estimatedCost = useMemo(() => {
    const templateCost = localStats.templates * COST_PER_CATEGORY.UTILITY;
    return templateCost;
  }, [localStats]);

  const totalMessages = localStats.sent + localStats.received;
  const deliveryRate = localStats.sent > 0 ? Math.round((localStats.delivered / localStats.sent) * 100) : 0;
  const readRate = localStats.sent > 0 ? Math.round((localStats.read / localStats.sent) * 100) : 0;
  const displayCost = totalCostMeta > 0 ? totalCostMeta : estimatedCost;

  const modulePieData = [
    { name: 'Cobrança', value: historicoStats.cobranca },
    { name: 'Eventos', value: historicoStats.eventos },
    { name: 'MGF', value: historicoStats.mgf },
    { name: 'Manual', value: historicoStats.manual },
  ].filter(d => d.value > 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Dashboard WhatsApp</h3>
            <p className="text-xs text-muted-foreground">{periodLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {metaData && <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300"><span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />Meta API</Badge>}
            {metaError && <Badge variant="outline" className="text-xs gap-1 text-yellow-600 border-yellow-300"><AlertTriangle className="h-3 w-3" />Dados locais</Badge>}
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPICard label="Total mensagens" value={totalMessages} icon={<MessageCircle className="h-4 w-4" />} />
          <KPICard label="Taxa entrega" value={`${deliveryRate}%`} icon={<TrendingUp className="h-4 w-4" />} color={deliveryRate >= 90 ? 'text-green-600' : 'text-yellow-600'} />
          <KPICard label="Taxa leitura" value={`${readRate}%`} icon={<TrendingUp className="h-4 w-4" />} color={readRate >= 50 ? 'text-green-600' : 'text-muted-foreground'} />
          <KPICard label="Falhas" value={localStats.failed} icon={<TrendingDown className="h-4 w-4" />} color={localStats.failed > 0 ? 'text-destructive' : 'text-green-600'} />
          <KPICard label="Custo estimado" value={`$${displayCost.toFixed(2)}`} icon={<DollarSign className="h-4 w-4" />} subtitle={totalCostMeta > 0 ? 'via Meta API' : 'estimativa local'} />
        </div>

        {/* Row 1: Area chart + Module pie */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="rounded-2xl lg:col-span-2">
            <CardContent className="p-5">
              <h4 className="text-sm font-semibold text-foreground mb-4">Volume diário</h4>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData}>
                    <defs>
                      <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gRecv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }} />
                    <Legend />
                    <Area type="monotone" dataKey="enviadas" name="Enviadas" stroke="hsl(var(--primary))" fill="url(#gSent)" strokeWidth={2} />
                    <Area type="monotone" dataKey="recebidas" name="Recebidas" stroke="#22c55e" fill="url(#gRecv)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <h4 className="text-sm font-semibold text-foreground mb-4">Envios por módulo</h4>
              {modulePieData.length > 0 ? (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={modulePieData} cx="50%" cy="45%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {modulePieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState text="Nenhum envio no período" />}
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Bar chart + Template breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="rounded-2xl lg:col-span-2">
            <CardContent className="p-5">
              <h4 className="text-sm font-semibold text-foreground mb-4">Status de entrega por dia</h4>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }} />
                    <Legend />
                    <Bar dataKey="entregues" name="Entregues" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lidas" name="Lidas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="falhas" name="Falhas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Template breakdown */}
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-foreground">Envios por template</h4>
              </div>
              {templateStats.length > 0 ? (
                <div className="space-y-2.5">
                  {templateStats.map((t, i) => (
                    <div key={t.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate max-w-[180px]" title={t.name}>{t.name}</span>
                        <span className="font-medium text-foreground">{t.value}</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(5, (t.value / Math.max(...templateStats.map(s => s.value))) * 100)}%`,
                            background: PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState text="Nenhum template usado no período" />}
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Association breakdown + Costs + Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Association bar chart */}
          <Card className="rounded-2xl lg:col-span-2">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-foreground">Envios por associação</h4>
              </div>
              {assocStats.length > 0 ? (
                <div className="h-[Math.max(200, assocStats.length * 40)]" style={{ height: Math.max(200, assocStats.length * 45) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={assocStats} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }} />
                      <Legend />
                      <Bar dataKey="cobranca" name="Cobrança" stackId="a" fill={BAR_COLORS[0]} radius={0} />
                      <Bar dataKey="eventos" name="Eventos" stackId="a" fill={BAR_COLORS[1]} radius={0} />
                      <Bar dataKey="mgf" name="MGF" stackId="a" fill={BAR_COLORS[2]} radius={0} />
                      <Bar dataKey="manual" name="Manual" stackId="a" fill={BAR_COLORS[3]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState text="Nenhum envio por associação no período" />}
            </CardContent>
          </Card>

          {/* Cost card */}
          <Card className="rounded-2xl">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-foreground">Cobrança estimada</h4>
              </div>

              {convByCategory.length > 0 ? (
                <>
                  <div className="h-[130px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={convByCategory} cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={3} dataKey="value">
                          {convByCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5">
                    {convByCategory.map((cat, i) => (
                      <div key={cat.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-muted-foreground">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-foreground">{cat.value}</span>
                          <span className="text-muted-foreground">${cat.cost.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="border-t pt-1.5 flex justify-between text-xs font-semibold">
                      <span className="text-foreground">Total</span>
                      <span className="text-foreground">{totalConversations} conv · ${totalCostMeta.toFixed(2)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <MetricRow color="bg-green-500" label="Janela 24h (grátis)" value={localStats.freeWindow} tooltip="Mensagens de texto dentro da janela" />
                    <MetricRow color="bg-orange-500" label="Templates (cobrados)" value={localStats.templates} tooltip="Templates fora da janela de 24h" />
                  </div>
                  <div className="border-t pt-3 space-y-1.5">
                    <p className="text-xs text-muted-foreground font-medium">Custo estimado (tabela Meta BR):</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Utilidade × {localStats.templates}</span>
                      <span className="font-medium text-foreground">${(localStats.templates * COST_PER_CATEGORY.UTILITY).toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Serviço (janela 24h)</span>
                      <span className="font-medium text-green-600">Grátis</span>
                    </div>
                    <div className="border-t pt-1.5 flex justify-between text-xs font-semibold">
                      <span className="text-foreground">Total estimado</span>
                      <span className="text-foreground">${estimatedCost.toFixed(4)}</span>
                    </div>
                  </div>
                  {metaError && <p className="text-xs text-yellow-600"><AlertTriangle className="h-3 w-3 inline mr-1" />{metaError}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard title="Todas as mensagens" total={totalMessages}>
            <MetricRow color="bg-primary" label="Enviadas" value={localStats.sent} tooltip="Total enviadas" />
            <MetricRow color="bg-green-500" label="Entregues" value={localStats.delivered} tooltip="Confirmadas" />
            <MetricRow color="bg-blue-500" label="Lidas" value={localStats.read} tooltip="Lidas" />
            <MetricRow color="bg-muted-foreground" label="Recebidas" value={localStats.received} tooltip="Recebidas" />
          </MetricCard>
          <MetricCard title="Mensagens entregues" total={localStats.delivered}>
            <MetricRow color="bg-green-500" label="Serviço (janela 24h)" value={localStats.freeWindow} tooltip="Gratuitas" />
            <MetricRow color="bg-orange-500" label="Templates" value={localStats.templates} tooltip="Cobrados" />
          </MetricCard>
          <MetricCard title="Automação vs Manual" total={localStats.sent}>
            <MetricRow color="bg-violet-500" label="Automatizadas" value={localStats.automated} tooltip="Sem operador" />
            <MetricRow color="bg-sky-500" label="Manuais" value={localStats.sent - localStats.automated} tooltip="Por operador" />
            <MetricRow color="bg-destructive" label="Falhas" value={localStats.failed} tooltip="Erros" />
          </MetricCard>
        </div>
      </div>
    </TooltipProvider>
  );
}

function KPICard({ label, value, icon, color, subtitle }: { label: string; value: number | string; icon: React.ReactNode; color?: string; subtitle?: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}<span className="text-xs">{label}</span>
        </div>
        <span className={`text-2xl font-bold ${color || 'text-foreground'}`}>{value}</span>
        {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
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
        <div className="space-y-2">{children}</div>
      </CardContent>
    </Card>
  );
}

function MetricRow({ color, label, value, tooltip }: { color: string; label: string; value: number; tooltip: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block`} />
        <span className="text-muted-foreground">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/60 cursor-help" /></TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] text-xs">{tooltip}</TooltipContent>
        </Tooltip>
      </div>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">{text}</div>;
}

function translateCategory(cat: string): string {
  const map: Record<string, string> = {
    MARKETING: 'Marketing', UTILITY: 'Utilidade', AUTHENTICATION: 'Autenticação',
    SERVICE: 'Serviço', AUTHENTICATION_INTERNATIONAL: 'Autenticação Int.', MARKETING_LITE: 'Marketing Lite',
  };
  return map[cat] || cat;
}
