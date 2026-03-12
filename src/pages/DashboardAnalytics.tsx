import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { TrendingUp, Clock, AlertCircle, Users, Target, Award, Download, Calendar, TrendingDown, Activity, ClipboardList, UserCheck, Building2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { PerformanceMetasDialog } from '@/components/PerformanceMetasDialog';
import { HistoricoAlertasCard } from '@/components/HistoricoAlertasCard';
import { toast } from 'sonner';
import { differenceInHours, format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UserProfile } from '@/components/UserProfile';
import { useAuth } from '@/hooks/useAuth';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
interface StatusConfig {
  id: string;
  nome: string;
  cor: string;
  prazo_horas: number;
  ordem: number;
  ativo: boolean;
  is_final?: boolean;
}
interface Atendimento {
  id: string;
  assunto: string;
  status: string;
  prioridade: string;
  responsavel_id: string;
  responsavel_nome: string;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
  data_concluido: string | null;
  fluxo_concluido_nome?: string;
  fluxo_concluido_id?: string;
}
interface ResponsavelStats {
  responsavel: string;
  total: number;
  concluidos: number;
  tempoMedio: number;
  vencidos: number;
  taxaConclusao: number;
}
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
export default function DashboardAnalytics() {
  const {
    user
  } = useAuth();
  const navigate = useNavigate();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [statusConfigs, setStatusConfigs] = useState<StatusConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('all'); // days or 'all'
  const [metasDialogOpen, setMetasDialogOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [dashboardMode, setDashboardMode] = useState<'individual'>('individual');
  const userName = user?.user_metadata?.nome ? user.user_metadata.nome.charAt(0).toUpperCase() + user.user_metadata.nome.slice(1) : '';
  useEffect(() => {
    loadData();
  }, [selectedPeriod, customStartDate, customEndDate]);
  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadAtendimentos(), loadStatusConfigs()]);
    } catch (e) {
      console.error("[DashboardAnalytics] loadData error:", e);
    } finally {
      setLoading(false);
    }
  };
  const loadAtendimentos = async () => {
    try {
      let startDate: Date;
      let endDate = new Date();
      if (customStartDate && customEndDate) {
        startDate = customStartDate;
        endDate = customEndDate;
      } else if (selectedPeriod === 'all') {
        startDate = new Date('2020-01-01');
      } else {
        const daysAgo = parseInt(selectedPeriod);
        startDate = new Date();
        startDate.setDate(startDate.getDate() - daysAgo);
      }
      const {
        data,
        error
      } = await supabase.from('atendimentos').select(`
          *,
          responsavel:profiles(nome),
          corretora:corretoras(id, nome)
        `).gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()).order('created_at', {
        ascending: false
      });
      if (error) throw error;
      const mapped = data.map((item: any) => ({
        id: item.id,
        assunto: item.assunto,
        status: item.status,
        prioridade: item.prioridade,
        responsavel_id: item.responsavel_id,
        responsavel_nome: item.responsavel?.nome || 'Sem responsável',
        created_at: item.created_at,
        updated_at: item.updated_at,
        status_changed_at: item.status_changed_at || item.updated_at,
        data_concluido: item.data_concluido,
        fluxo_concluido_nome: item.fluxo_concluido_nome,
        fluxo_concluido_id: item.fluxo_concluido_id,
        corretora_id: item.corretora_id,
        corretora: item.corretora
      }));
      setAtendimentos(mapped);
    } catch (error) {
      console.error('Erro ao carregar atendimentos:', error);
      toast.error('Erro ao carregar dados dos atendimentos');
    }
  };
  const loadStatusConfigs = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('status_config').select('*').eq('ativo', true).order('ordem');
      if (error) throw error;
      setStatusConfigs(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar status:', error);
      toast.error('Erro ao carregar configurações de status');
    }
  };

  // Calcular dados por corretora
  const getCorretorasData = () => {
    const corretorasMap = new Map();
    atendimentos.forEach((atendimento: any) => {
      if (!atendimento.corretora_id) return;
      const corretoraId = atendimento.corretora_id;
      const corretoraName = atendimento.corretora?.nome || 'Sem Corretora';
      if (!corretorasMap.has(corretoraId)) {
        corretorasMap.set(corretoraId, {
          id: corretoraId,
          nome: corretoraName,
          total: 0,
          concluidos: 0,
          vencidos: 0,
          tempoTotal: 0,
          prioridadeAlta: 0,
          prioridadeMedia: 0,
          prioridadeBaixa: 0
        });
      }
      const corretora = corretorasMap.get(corretoraId);
      corretora.total++;
      if (atendimento.data_concluido) {
        corretora.concluidos++;
        const tempo = differenceInHours(new Date(atendimento.data_concluido), new Date(atendimento.created_at));
        corretora.tempoTotal += tempo;
      }

      // Verificar vencidos
      const statusConfig = statusConfigs.find(c => c.nome.toLowerCase() === atendimento.status.toLowerCase());
      if (statusConfig && statusConfig.prazo_horas > 0) {
        const hours = differenceInHours(new Date(), new Date(atendimento.status_changed_at || atendimento.created_at));
        if (hours > statusConfig.prazo_horas) {
          corretora.vencidos++;
        }
      }

      // Contar prioridades
      if (atendimento.prioridade === 'Alta') corretora.prioridadeAlta++;else if (atendimento.prioridade === 'Média') corretora.prioridadeMedia++;else if (atendimento.prioridade === 'Baixa') corretora.prioridadeBaixa++;
    });
    return Array.from(corretorasMap.values()).map(c => ({
      ...c,
      tempoMedio: c.concluidos > 0 ? Math.round(c.tempoTotal / c.concluidos) : 0,
      taxaConclusao: c.total > 0 ? Math.round(c.concluidos / c.total * 100) : 0,
      taxaVencidos: c.total > 0 ? Math.round(c.vencidos / c.total * 100) : 0
    }));
  };
  const corretorasData = getCorretorasData();

  // Distribuição por status
  const statusDistribution = statusConfigs.map(config => {
    const count = atendimentos.filter(a => a.status.toLowerCase() === config.nome.toLowerCase()).length;
    return {
      name: config.nome,
      value: count,
      color: config.cor
    };
  });

  // Tempo médio em cada status
  const avgTimeByStatus = statusConfigs.map(config => {
    const statusAtendimentos = atendimentos.filter(a => a.status.toLowerCase() === config.nome.toLowerCase());
    if (statusAtendimentos.length === 0) {
      return {
        name: config.nome,
        tempoMedio: 0,
        color: config.cor
      };
    }
    const totalHours = statusAtendimentos.reduce((acc, a) => {
      const hours = differenceInHours(new Date(), new Date(a.status_changed_at || a.created_at));
      return acc + hours;
    }, 0);
    return {
      name: config.nome,
      tempoMedio: Math.round(totalHours / statusAtendimentos.length),
      color: config.cor
    };
  });

  // Taxa de vencimento por período
  const overdueRate = statusConfigs.map(config => {
    if (config.prazo_horas === 0) return null;
    const statusAtendimentos = atendimentos.filter(a => a.status.toLowerCase() === config.nome.toLowerCase());
    const vencidos = statusAtendimentos.filter(a => {
      const hours = differenceInHours(new Date(), new Date(a.status_changed_at || a.created_at));
      return hours > config.prazo_horas;
    }).length;
    return {
      name: config.nome,
      vencidos,
      total: statusAtendimentos.length,
      taxa: statusAtendimentos.length > 0 ? Math.round(vencidos / statusAtendimentos.length * 100) : 0,
      color: config.cor
    };
  }).filter(Boolean);

  // Ranking de responsáveis - quem atendeu mais
  const statusFinalizadosSet = new Set(statusConfigs.filter(s => s.is_final).map(s => s.nome.toLowerCase()));
  const responsavelRanking: ResponsavelStats[] = Object.values(atendimentos.reduce((acc, a) => {
    const key = a.responsavel_id || 'sem-responsavel';
    if (!acc[key]) {
      acc[key] = {
        responsavel: a.responsavel_nome,
        total: 0,
        concluidos: 0,
        tempoMedio: 0,
        vencidos: 0,
        taxaConclusao: 0
      };
    }
    acc[key].total++;
    if (a.data_concluido) {
      acc[key].concluidos++;
      const tempo = differenceInHours(new Date(a.data_concluido), new Date(a.created_at));
      acc[key].tempoMedio = (acc[key].tempoMedio * (acc[key].concluidos - 1) + tempo) / acc[key].concluidos;
    }

    // Check if overdue
    const statusConfig = statusConfigs.find(c => c.nome.toLowerCase() === a.status.toLowerCase());
    if (statusConfig && statusConfig.prazo_horas > 0) {
      const hours = differenceInHours(new Date(), new Date(a.status_changed_at || a.created_at));
      if (hours > statusConfig.prazo_horas) {
        acc[key].vencidos++;
      }
    }
    return acc;
  }, {} as Record<string, ResponsavelStats>)).map(stats => ({
    ...stats,
    tempoMedio: Math.round(stats.tempoMedio),
    taxaConclusao: stats.total > 0 ? Math.round(stats.concluidos / stats.total * 100) : 0
  }));

  // Sort rankings
  const topByVolume = [...responsavelRanking].sort((a, b) => b.total - a.total).slice(0, 10);
  const topBySpeed = [...responsavelRanking].filter(r => r.concluidos > 0).sort((a, b) => a.tempoMedio - b.tempoMedio).slice(0, 10);
  const topByCompletionRate = [...responsavelRanking].sort((a, b) => b.taxaConclusao - a.taxaConclusao).slice(0, 10);

  // Worst performers
  const worstByVolume = [...responsavelRanking].sort((a, b) => a.total - b.total).slice(0, 10);
  const worstBySpeed = [...responsavelRanking].filter(r => r.concluidos > 0).sort((a, b) => b.tempoMedio - a.tempoMedio).slice(0, 10);
  const worstByCompletionRate = [...responsavelRanking].sort((a, b) => a.taxaConclusao - b.taxaConclusao).slice(0, 10);

  // Evolução diária
  const dailyEvolution = (() => {
    const days = eachDayOfInterval({
      start: new Date(new Date().setDate(new Date().getDate() - parseInt(selectedPeriod))),
      end: new Date()
    });
    return days.map(day => {
      const dayStart = new Date(day.setHours(0, 0, 0, 0));
      const dayEnd = new Date(day.setHours(23, 59, 59, 999));
      const criados = atendimentos.filter(a => {
        const createdDate = new Date(a.created_at);
        return createdDate >= dayStart && createdDate <= dayEnd;
      }).length;
      const concluidos = atendimentos.filter(a => {
        if (!a.data_concluido) return false;
        const concludedDate = new Date(a.data_concluido);
        return concludedDate >= dayStart && concludedDate <= dayEnd;
      }).length;
      return {
        data: format(day, 'dd/MM', {
          locale: ptBR
        }),
        criados,
        concluidos
      };
    });
  })();

  // KPIs gerais
  const totalAtendimentos = atendimentos.length;
  const concluidos = atendimentos.filter(a => a.data_concluido).length;
  const taxaConclusao = totalAtendimentos > 0 ? Math.round(concluidos / totalAtendimentos * 100) : 0;
  const vencidosTotal = atendimentos.filter(a => {
    const statusConfig = statusConfigs.find(c => c.nome.toLowerCase() === a.status.toLowerCase());
    if (!statusConfig || statusConfig.prazo_horas === 0) return false;
    const hours = differenceInHours(new Date(), new Date(a.status_changed_at || a.created_at));
    return hours > statusConfig.prazo_horas;
  }).length;
  const tempoMedioGeral = atendimentos.filter(a => a.data_concluido).reduce((acc, a) => {
    return acc + differenceInHours(new Date(a.data_concluido!), new Date(a.created_at));
  }, 0) / (concluidos || 1);
  const handleExportPDF = () => {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text('Dashboard de Atendimentos', 14, 20);
    doc.setFontSize(11);
    doc.text(`Período: Últimos ${selectedPeriod} dias`, 14, 28);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", {
      locale: ptBR
    })}`, 14, 34);

    // KPIs
    doc.setFontSize(14);
    doc.text('Indicadores Gerais', 14, 45);
    autoTable(doc, {
      startY: 50,
      head: [['Métrica', 'Valor']],
      body: [['Total de Atendimentos', totalAtendimentos.toString()], ['Atendimentos Concluídos', concluidos.toString()], ['Taxa de Conclusão', `${taxaConclusao}%`], ['Atendimentos Vencidos', vencidosTotal.toString()], ['Tempo Médio de Conclusão', `${Math.round(tempoMedioGeral)}h`]]
    });

    // Status distribution
    doc.addPage();
    doc.setFontSize(14);
    doc.text('Distribuição por Status', 14, 20);
    autoTable(doc, {
      startY: 25,
      head: [['Status', 'Quantidade', '%']],
      body: statusDistribution.map(s => [s.name, s.value.toString(), `${Math.round(s.value / totalAtendimentos * 100)}%`])
    });

    // Top performers
    doc.addPage();
    doc.setFontSize(14);
    doc.text('Top 10 - Maior Volume', 14, 20);
    autoTable(doc, {
      startY: 25,
      head: [['Responsável', 'Total', 'Concluídos', 'Taxa']],
      body: topByVolume.map(r => [r.responsavel, r.total.toString(), r.concluidos.toString(), `${r.taxaConclusao}%`])
    });
    doc.save(`dashboard-atendimentos-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('PDF exportado com sucesso!');
  };
  if (loading) {
    return <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
        <div className="text-center">
          <Activity className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="sticky top-0 z-50 bg-gradient-to-r from-card/95 via-card to-card/95 backdrop-blur-md border-b border-border/50 shadow-lg">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Dashboard Analítico
                </h1>
                <p className="text-sm text-muted-foreground">Métricas e KPIs de Atendimentos</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setMetasDialogOpen(true)}>
                <Target className="h-4 w-4" />
                <span className="hidden sm:inline">Metas</span>
              </Button>
              <Link to="/atendimentos">
                <Button variant="outline" size="sm" className="gap-2">
                  <ClipboardList className="h-4 w-4" />
                  <span className="hidden sm:inline">Atendimentos</span>
                </Button>
              </Link>
              <UserProfile />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <select value={selectedPeriod} onChange={e => {
              setSelectedPeriod(e.target.value);
              setCustomStartDate(null);
              setCustomEndDate(null);
            }} className="px-4 py-2 rounded-lg border bg-background">
                <option value="7">Últimos 7 dias</option>
                <option value="15">Últimos 15 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="60">Últimos 60 dias</option>
                <option value="90">Últimos 90 dias</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <input type="date" value={customStartDate ? format(customStartDate, 'yyyy-MM-dd') : ''} onChange={e => setCustomStartDate(e.target.value ? new Date(e.target.value) : null)} className="px-4 py-2 rounded-lg border bg-background text-sm" placeholder="Data inicial" />
              <span className="text-muted-foreground">até</span>
              <input type="date" value={customEndDate ? format(customEndDate, 'yyyy-MM-dd') : ''} onChange={e => setCustomEndDate(e.target.value ? new Date(e.target.value) : null)} className="px-4 py-2 rounded-lg border bg-background text-sm" placeholder="Data final" />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button onClick={() => {
            const params = new URLSearchParams();
            if (customStartDate) params.set('startDate', customStartDate.toISOString());
            if (customEndDate) params.set('endDate', customEndDate.toISOString());
            navigate(`/desempenho-individual?${params.toString()}`);
          }} variant="outline">
              <UserCheck className="h-4 w-4 mr-2" />
              Desempenho
            </Button>
            <Button onClick={handleExportPDF} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAtendimentos}</div>
              <p className="text-xs text-muted-foreground mt-1">Atendimentos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Concluídos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{concluidos}</div>
              <p className="text-xs text-muted-foreground mt-1">{taxaConclusao}% do total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Vencidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{vencidosTotal}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalAtendimentos > 0 ? Math.round(vencidosTotal / totalAtendimentos * 100) : 0}% do total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Tempo Médio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(tempoMedioGeral)}h</div>
              <p className="text-xs text-muted-foreground mt-1">Para conclusão</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Target className="h-4 w-4" />
                Taxa Conclusão
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{taxaConclusao}%</div>
              <p className="text-xs text-muted-foreground mt-1">Meta: 80%</p>
            </CardContent>
          </Card>
        </div>

        {/* Conteúdo condicional baseado no modo */}
        {dashboardMode === 'individual' ? <>
        {/* Charts */}
        <Tabs defaultValue="distribution" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 h-auto p-2 bg-muted">
            <TabsTrigger value="distribution" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Distribuição
            </TabsTrigger>
            <TabsTrigger value="time" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Tempo Médio
            </TabsTrigger>
            <TabsTrigger value="overdue" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Vencimento
            </TabsTrigger>
            <TabsTrigger value="ranking" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Rankings
            </TabsTrigger>
            <TabsTrigger value="evolution" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Evolução
            </TabsTrigger>
          </TabsList>

          <TabsContent value="distribution" className="space-y-4 animate-fade-in">
            <Card className="border-border/40 shadow-sm overflow-hidden">
              <CardHeader className="pb-3 bg-gradient-to-br from-primary/5 to-primary/10">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Activity className="h-5 w-5 text-primary" />
                      </div>
                      Distribuição de Atendimentos por Status
                    </CardTitle>
                    <CardDescription className="mt-1">Visualização da quantidade de atendimentos em cada status</CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-lg font-semibold px-4 py-2">
                    {totalAtendimentos} Total
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Gráfico de Rosca */}
                  <div className="lg:col-span-2">
                    <ResponsiveContainer width="100%" height={400}>
                      <PieChart>
                        <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={100} outerRadius={150} paddingAngle={4} dataKey="value" label={({
                          name,
                          percent
                        }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''} labelLine={false}>
                          {statusDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} className="transition-all duration-300 hover:opacity-80" />)}
                        </Pie>
                        <Tooltip content={({
                          active,
                          payload
                        }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0];
                            const percent = ((data.value as number) / totalAtendimentos * 100).toFixed(1);
                            return <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
                                  <p className="font-semibold" style={{
                                color: data.payload.color
                              }}>
                                    {data.name}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {data.value} atendimentos ({percent}%)
                                  </p>
                                </div>;
                          }
                          return null;
                        }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legenda e Estatísticas */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">
                      Detalhes por Status
                    </h4>
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-2">
                      {statusDistribution.filter(s => s.value > 0).sort((a, b) => b.value - a.value).map((status, index) => {
                        const percent = (status.value / totalAtendimentos * 100).toFixed(1);
                        return <div key={index} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors duration-200 group">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="h-4 w-4 rounded-full flex-shrink-0 ring-2 ring-offset-2 ring-offset-background group-hover:scale-110 transition-transform" style={{
                              backgroundColor: status.color
                            }} />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{status.name}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                                      <div className="h-full rounded-full transition-all duration-500" style={{
                                    width: `${percent}%`,
                                    backgroundColor: status.color
                                  }} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right ml-3">
                                <p className="font-bold text-lg">{status.value}</p>
                                <p className="text-xs text-muted-foreground">{percent}%</p>
                              </div>
                            </div>;
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold">Comparação por Status</CardTitle>
                <CardDescription>Visualização em barras para comparação rápida</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={statusDistribution} margin={{
                    top: 20,
                    right: 20,
                    left: 0,
                    bottom: 20
                  }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="name" tick={{
                      fill: 'hsl(var(--muted-foreground))'
                    }} axisLine={{
                      stroke: 'hsl(var(--border))'
                    }} />
                    <YAxis tick={{
                      fill: 'hsl(var(--muted-foreground))'
                    }} axisLine={{
                      stroke: 'hsl(var(--border))'
                    }} />
                    <Tooltip cursor={{
                      fill: 'hsl(var(--accent))',
                      opacity: 0.1
                    }} content={({
                      active,
                      payload
                    }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0];
                        return <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
                              <p className="font-semibold" style={{
                            color: data.payload.color
                          }}>
                                {data.payload.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {data.value} atendimentos
                              </p>
                            </div>;
                      }
                      return null;
                    }} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {statusDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} className="transition-all duration-300 hover:opacity-80" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="time" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Tempo Médio por Status</CardTitle>
                <CardDescription>Média de horas que os atendimentos permanecem em cada status</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={avgTimeByStatus}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis label={{
                      value: 'Horas',
                      angle: -90,
                      position: 'insideLeft'
                    }} />
                    <Tooltip formatter={value => [`${value}h`, 'Tempo Médio']} />
                    <Legend />
                    <Bar dataKey="tempoMedio" name="Tempo Médio (h)" radius={[8, 8, 0, 0]}>
                      {avgTimeByStatus.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overdue" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Taxa de Vencimento por Status</CardTitle>
                <CardDescription>Percentual de atendimentos que ultrapassaram o prazo estabelecido</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={overdueRate}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis label={{
                      value: '%',
                      angle: -90,
                      position: 'insideLeft'
                    }} />
                    <Tooltip formatter={value => [`${value}%`, 'Taxa de Vencimento']} />
                    <Legend />
                    <Bar dataKey="taxa" name="Taxa de Vencimento (%)" fill="#ef4444" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-6 space-y-2">
                  {overdueRate.map((item: any) => <div key={item.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{
                        backgroundColor: item.color
                      }} />
                        <span className="font-medium">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">{item.vencidos} vencidos</span>
                        <span className="text-muted-foreground">de {item.total} total</span>
                        <Badge variant={item.taxa > 30 ? 'destructive' : item.taxa > 15 ? 'default' : 'secondary'}>
                          {item.taxa}%
                        </Badge>
                      </div>
                    </div>)}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ranking" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-yellow-500" />
                    Top 10 - Maior Volume
                  </CardTitle>
                  <CardDescription>Responsáveis com mais atendimentos</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topByVolume.map((resp, index) => <div key={resp.responsavel} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${index === 0 ? 'bg-yellow-500 text-white' : index === 1 ? 'bg-gray-400 text-white' : index === 2 ? 'bg-amber-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{resp.responsavel}</p>
                          <p className="text-sm text-muted-foreground">
                            {resp.total} atendimentos • {resp.taxaConclusao}% concluído
                          </p>
                        </div>
                        <Badge variant="secondary">{resp.total}</Badge>
                      </div>)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    Top 10 - Maior Velocidade
                  </CardTitle>
                  <CardDescription>Menor tempo médio de conclusão</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topBySpeed.map((resp, index) => <div key={resp.responsavel} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${index === 0 ? 'bg-green-500 text-white' : index === 1 ? 'bg-emerald-400 text-white' : index === 2 ? 'bg-teal-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{resp.responsavel}</p>
                          <p className="text-sm text-muted-foreground">
                            {resp.concluidos} concluídos
                          </p>
                        </div>
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" />
                          {resp.tempoMedio}h
                        </Badge>
                      </div>)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-blue-500" />
                    Top 10 - Taxa de Conclusão
                  </CardTitle>
                  <CardDescription>Maior percentual de conclusão</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topByCompletionRate.map((resp, index) => <div key={resp.responsavel} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${index === 0 ? 'bg-blue-500 text-white' : index === 1 ? 'bg-sky-400 text-white' : index === 2 ? 'bg-indigo-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{resp.responsavel}</p>
                          <p className="text-sm text-muted-foreground">
                            {resp.concluidos}/{resp.total} atendimentos
                          </p>
                        </div>
                        <Badge variant="secondary">{resp.taxaConclusao}%</Badge>
                      </div>)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Piores Desempenhos */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-destructive" />
                Atenção Necessária - Menores Performances
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="border-destructive/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-5 w-5" />
                      Menor Volume
                    </CardTitle>
                    <CardDescription>Responsáveis com menos atendimentos</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {worstByVolume.map((resp, index) => <div key={resp.responsavel} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors border border-destructive/10">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-destructive/10 text-destructive">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{resp.responsavel}</p>
                            <p className="text-xs text-muted-foreground">
                              {resp.concluidos} concluídos de {resp.total}
                            </p>
                          </div>
                          <Badge variant="destructive">{resp.total}</Badge>
                        </div>)}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-destructive/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <Clock className="h-5 w-5" />
                      Mais Lentos
                    </CardTitle>
                    <CardDescription>Responsáveis com maior tempo médio</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {worstBySpeed.map((resp, index) => <div key={resp.responsavel} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors border border-destructive/10">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-destructive/10 text-destructive">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{resp.responsavel}</p>
                            <p className="text-xs text-muted-foreground">
                              {resp.concluidos} concluídos
                            </p>
                          </div>
                          <Badge variant="destructive">{resp.tempoMedio}h</Badge>
                        </div>)}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-destructive/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <Target className="h-5 w-5" />
                      Menor Taxa de Conclusão
                    </CardTitle>
                    <CardDescription>Responsáveis com menor % de conclusão</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {worstByCompletionRate.map((resp, index) => <div key={resp.responsavel} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors border border-destructive/10">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-destructive/10 text-destructive">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{resp.responsavel}</p>
                            <p className="text-xs text-muted-foreground">
                              {resp.concluidos} de {resp.total}
                            </p>
                          </div>
                          <Badge variant="destructive">{resp.taxaConclusao}%</Badge>
                        </div>)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="evolution" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Evolução Diária</CardTitle>
                  <CardDescription>Atendimentos criados vs concluídos por dia</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={dailyEvolution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="data" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="criados" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Criados" />
                      <Area type="monotone" dataKey="concluidos" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Concluídos" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <HistoricoAlertasCard />
            </div>
          </TabsContent>
        </Tabs>
        </> : (/* Dashboard Global - Desempenho por Corretoras */
      <div className="space-y-6">
            {/* Top Corretoras */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Ranking de Corretoras - Volume
                </CardTitle>
                <CardDescription>Top 10 corretoras por volume de atendimentos</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={corretorasData.sort((a, b) => b.total - a.total).slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nome" angle={-45} textAnchor="end" height={120} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" fill="#3b82f6" name="Total" />
                    <Bar dataKey="concluidos" fill="#10b981" name="Concluídos" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Taxa de Conclusão */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Taxa de Conclusão por Corretora
                </CardTitle>
                <CardDescription>Performance de conclusão de atendimentos</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={corretorasData.sort((a, b) => b.taxaConclusao - a.taxaConclusao).slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nome" angle={-45} textAnchor="end" height={120} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="taxaConclusao" fill="#10b981" name="Taxa de Conclusão (%)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Tempo Médio */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Tempo Médio de Atendimento
                </CardTitle>
                <CardDescription>Tempo médio em horas por corretora</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={corretorasData.filter(c => c.concluidos > 0).sort((a, b) => a.tempoMedio - b.tempoMedio).slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nome" angle={-45} textAnchor="end" height={120} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="tempoMedio" fill="#f59e0b" name="Tempo Médio (horas)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Atendimentos Vencidos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Atendimentos Vencidos por Corretora
                </CardTitle>
                <CardDescription>Distribuição de atendimentos em atraso</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={corretorasData.filter(c => c.vencidos > 0).sort((a, b) => b.vencidos - a.vencidos).slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nome" angle={-45} textAnchor="end" height={120} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="vencidos" fill="#ef4444" name="Vencidos" />
                    <Bar dataKey="taxaVencidos" fill="#f97316" name="Taxa (%)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Distribuição de Prioridades */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Prioridades por Corretora</CardTitle>
                <CardDescription>Prioridades dos atendimentos em cada corretora</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={corretorasData.sort((a, b) => b.total - a.total).slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nome" angle={-45} textAnchor="end" height={120} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="prioridadeAlta" stackId="a" fill="#ef4444" name="Alta" />
                    <Bar dataKey="prioridadeMedia" stackId="a" fill="#f59e0b" name="Média" />
                    <Bar dataKey="prioridadeBaixa" stackId="a" fill="#10b981" name="Baixa" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Tabela Resumo */}
            <Card>
              <CardHeader>
                <CardTitle>Resumo Geral por Corretora</CardTitle>
                <CardDescription>Visão consolidada de todas as métricas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Corretora</th>
                        <th className="text-center p-2">Total</th>
                        <th className="text-center p-2">Concluídos</th>
                        <th className="text-center p-2">Taxa (%)</th>
                        <th className="text-center p-2">Vencidos</th>
                        <th className="text-center p-2">Tempo Médio (h)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {corretorasData.sort((a, b) => b.total - a.total).map((corretora, index) => <tr key={corretora.id} className="border-b hover:bg-muted/50">
                          <td className="p-2">{corretora.nome}</td>
                          <td className="text-center p-2">{corretora.total}</td>
                          <td className="text-center p-2">{corretora.concluidos}</td>
                          <td className="text-center p-2">
                            <Badge variant={corretora.taxaConclusao >= 80 ? 'default' : 'destructive'}>
                              {corretora.taxaConclusao}%
                            </Badge>
                          </td>
                          <td className="text-center p-2">
                            <span className={corretora.vencidos > 0 ? 'text-destructive font-semibold' : ''}>
                              {corretora.vencidos}
                            </span>
                          </td>
                          <td className="text-center p-2">{corretora.tempoMedio}</td>
                        </tr>)}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>)}
      </div>

      <PerformanceMetasDialog open={metasDialogOpen} onOpenChange={setMetasDialogOpen} />
    </div>;
}