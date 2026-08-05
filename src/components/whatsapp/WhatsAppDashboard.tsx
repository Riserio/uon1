import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Info, TrendingUp, TrendingDown, MessageCircle, AlertTriangle, DollarSign, Building2, Users } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
  Tooltip as RechartsTooltip,
} from 'recharts';

/**
 * Dashboard do WhatsApp.
 *
 * FONTE DOS NÚMEROS: whatsapp_historico, via RPC whatsapp_metricas.
 * Antes os KPIs saíam de whatsapp_messages, que guarda a CONVERSA (quase só
 * mensagens recebidas) — por isso a tela mostrava 6 mensagens e 0% de entrega
 * enquanto havia 43 envios, 86% de entrega e 62% de leitura no mesmo período.
 * whatsapp_messages continua alimentando só o que é de conversa (recebidas).
 */

interface Metricas {
  periodo_dias: number;
  total: number;
  entregues: number;
  lidas: number;
  falhas: number;
  pendentes: number;
  destinatarios: number;
  taxa_entrega: number;
  taxa_leitura: number;
  taxa_falha: number;
  custo_usd: number;
  custo_por_mensagem: number;
  por_modulo: Array<{ modulo: string; total: number; entregues: number; falhas: number }>;
  por_dia: Array<{ dia: string; total: number; entregues: number; falhas: number }>;
  por_associacao: AssocCount[];
  por_status: Record<string, number>;
  top_erros: Array<{ erro: string; total: number }>;
}

interface ConvDataPoint {
  start: number; end: number; conversation: number; cost: number;
  conversation_category?: string; conversation_type?: string;
}

interface MetaAnalytics {
  conversation_analytics: { data: Array<{ data_points: ConvDataPoint[] }> } | null;
  analytics: { phone_numbers: string[]; data_points: Array<{ start: number; end: number; sent: number; delivered: number }> } | null;
}

interface AssocCount { name: string; total: number; cobranca: number; eventos: number; mgf: number; manual: number }

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '14', label: 'Últimos 14 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
];

const PIE_COLORS = ['#8b5cf6', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
const BAR_COLORS = ['#8b5cf6', '#22c55e', '#3b82f6', '#f59e0b'];

const MODULO_LABEL: Record<string, string> = {
  cobranca: 'Cobrança', eventos: 'Eventos', mgf: 'MGF', manual: 'Manual', geral: 'Resumo geral',
};

export default function WhatsAppDashboard() {
  const [period, setPeriod] = useState('7');
  const [loading, setLoading] = useState(true);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [recebidas, setRecebidas] = useState(0);
  const [metaData, setMetaData] = useState<MetaAnalytics | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [assocStats, setAssocStats] = useState<AssocCount[]>([]);

  const dateRange = useMemo(() => {
    const end = endOfDay(new Date());
    const start = startOfDay(subDays(new Date(), parseInt(period)));
    return { start: start.toISOString(), end: end.toISOString(), startTs: Math.floor(start.getTime() / 1000), endTs: Math.floor(end.getTime() / 1000) };
  }, [period]);

  const periodLabel = useMemo(() => {
    const end = new Date();
    const start = subDays(end, parseInt(period));
    return `${format(start, 'dd MMM', { locale: ptBR })} – ${format(end, 'dd MMM yyyy', { locale: ptBR })}`;
  }, [period]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setMetaError(null);

      // Tudo agregado no banco: o select do Supabase corta em 1.000 linhas por
      // padrão, e era por isso que 90 dias mostravam exatamente 1000 mensagens.
      // Só a contagem de recebidas usa select, e com head:true (sem trazer linha).
      const [rpcRes, recebRes] = await Promise.all([
        supabase.rpc('whatsapp_metricas' as never, { p_dias: parseInt(period), p_corretora_id: null } as never),
        supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true })
          .eq('direction', 'in').gte('created_at', dateRange.start).lte('created_at', dateRange.end),
      ]);

      const dados = rpcRes.error ? null : (rpcRes.data as unknown as Metricas);
      if (dados) setMetricas(dados);
      setRecebidas(recebRes.count || 0);
      setAssocStats(dados?.por_associacao ?? []);

      // Meta API: enriquece com o custo real por conversa quando disponível.
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
  }, [dateRange, period]);

  const convByCategory = useMemo(() => {
    if (!metaData?.conversation_analytics?.data?.[0]?.data_points) return [];
    const catMap: Record<string, { count: number; cost: number }> = {};
    metaData.conversation_analytics.data[0].data_points.forEach(dp => {
      const cat = dp.conversation_category || 'Outros';
      if (!catMap[cat]) catMap[cat] = { count: 0, cost: 0 };
      catMap[cat].count += dp.conversation || 0;
      catMap[cat].cost += dp.cost || 0;
    });
    return Object.entries(catMap)
      .map(([name, { count, cost }]) => ({ name: translateCategory(name), value: count, cost }))
      .filter(c => c.value > 0);
  }, [metaData]);

  const totalCostMeta = convByCategory.reduce((s, c) => s + c.cost, 0);
  const custoExibido = totalCostMeta > 0 ? totalCostMeta : (metricas?.custo_usd ?? 0);
  const custoViaMeta = totalCostMeta > 0;

  const modulePieData = (metricas?.por_modulo ?? [])
    .map(m => ({ name: MODULO_LABEL[m.modulo] || m.modulo, value: m.total }))
    .filter(d => d.value > 0);

  const dailyData = (metricas?.por_dia ?? []).map(d => ({
    date: d.dia, enviadas: d.total, entregues: d.entregues, falhas: d.falhas ?? 0,
  }));

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const m = metricas;

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
            {custoViaMeta && <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300"><span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />Custo via Meta</Badge>}
            {metaError && <Badge variant="outline" className="text-xs gap-1 text-yellow-600 border-yellow-300"><AlertTriangle className="h-3 w-3" />Custo estimado</Badge>}
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KPICard label="Mensagens enviadas" value={m?.total ?? 0} icon={<MessageCircle className="h-4 w-4" />} subtitle={`${recebidas} recebida(s)`} />
          <KPICard label="Taxa entrega" value={`${m?.taxa_entrega ?? 0}%`} icon={<TrendingUp className="h-4 w-4" />} color={(m?.taxa_entrega ?? 0) >= 90 ? 'text-green-600' : 'text-yellow-600'} subtitle={`${m?.entregues ?? 0} entregues`} />
          <KPICard label="Taxa leitura" value={`${m?.taxa_leitura ?? 0}%`} icon={<TrendingUp className="h-4 w-4" />} color={(m?.taxa_leitura ?? 0) >= 50 ? 'text-green-600' : 'text-muted-foreground'} subtitle={`${m?.lidas ?? 0} lidas · sobre as entregues`} />
          <KPICard label="Falhas" value={m?.falhas ?? 0} icon={<TrendingDown className="h-4 w-4" />} color={(m?.falhas ?? 0) > 0 ? 'text-destructive' : 'text-green-600'} subtitle={`${m?.taxa_falha ?? 0}% do total`} />
          <KPICard label="Destinatários" value={m?.destinatarios ?? 0} icon={<Users className="h-4 w-4" />} subtitle="números distintos" />
          <KPICard
            label="Custo do período"
            value={`$${custoExibido.toFixed(2)}`}
            icon={<DollarSign className="h-4 w-4" />}
            subtitle={custoViaMeta ? 'cobrança real da Meta' : `estimado · $${(m?.custo_por_mensagem ?? 0).toFixed(4)}/msg`}
          />
        </div>

        {/* Falhas em destaque: erro recorrente costuma ser bloqueio de conta,
            não problema de número — e isso precisa saltar aos olhos. */}
        {m && m.top_erros.length > 0 && (
          <Card className="rounded-2xl border-destructive/30 bg-destructive/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-destructive">Motivos das falhas no período</h4>
                  <div className="mt-2 space-y-1">
                    {m.top_erros.map((e, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-muted-foreground truncate">{e.erro}</span>
                        <span className="font-semibold text-destructive tabular-nums shrink-0">{e.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Custo por categoria (Meta) */}
        {convByCategory.length > 0 && (
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-foreground">Conversas e custo por categoria (Meta)</h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {convByCategory.map((c) => (
                  <div key={c.name} className="rounded-xl border border-border/50 p-3">
                    <div className="text-[11px] text-muted-foreground">{c.name}</div>
                    <div className="text-lg font-bold tabular-nums">{c.value.toLocaleString('pt-BR')}</div>
                    <div className="text-[10px] text-muted-foreground">conversas · ${c.cost.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
                    <Area type="monotone" dataKey="entregues" name="Entregues" stroke="#22c55e" fill="url(#gRecv)" strokeWidth={2} />
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

        {/* Row 2: entregues por dia */}
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <h4 className="text-sm font-semibold text-foreground mb-4">Enviadas x entregues por dia</h4>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }} />
                  <Legend />
                  <Bar dataKey="enviadas" name="Enviadas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="entregues" name="Entregues" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Row 3: Association breakdown */}
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground">Envios por associação</h4>
            </div>
            {assocStats.length > 0 ? (
              <div style={{ height: Math.max(200, assocStats.length * 45) }}>
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

        {/* Resumo por status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard title="Situação das mensagens" total={m?.total ?? 0}>
            <MetricRow color="bg-green-500" label="Entregues" value={m?.entregues ?? 0} tooltip="Confirmadas pelo WhatsApp (inclui as lidas)" />
            <MetricRow color="bg-blue-500" label="Lidas" value={m?.lidas ?? 0} tooltip="O destinatário abriu a mensagem" />
            <MetricRow color="bg-muted-foreground" label="Aguardando confirmação" value={m?.pendentes ?? 0} tooltip="Enviadas, sem retorno de entrega ainda" />
            <MetricRow color="bg-destructive" label="Falhas" value={m?.falhas ?? 0} tooltip="Rejeitadas pela Meta ou pelo número de destino" />
          </MetricCard>
          <MetricCard title="Custo do período" total={Number(custoExibido.toFixed(2))}>
            <MetricRow color="bg-violet-500" label="Custo médio por mensagem" value={Number((m?.custo_por_mensagem ?? 0).toFixed(4))} tooltip="Custo total dividido pelas mensagens do período" />
            <MetricRow color="bg-sky-500" label="Mensagens cobradas" value={(m?.total ?? 0) - (m?.falhas ?? 0)} tooltip="Falha não é cobrada pela Meta" />
            <MetricRow color="bg-muted-foreground" label="Destinatários distintos" value={m?.destinatarios ?? 0} tooltip="Números diferentes alcançados" />
          </MetricCard>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {custoViaMeta
            ? 'Custo obtido diretamente da API da Meta (cobrança por conversa de 24h).'
            : 'Custo estimado pela tabela de preços da Meta para o Brasil por categoria de mensagem. Quando a API de analytics estiver acessível, o valor real substitui a estimativa automaticamente.'}
        </p>
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
          <TooltipContent side="top" className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
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
