import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { TrendingUp, Clock, AlertCircle, Users, Target, Award, Download, Calendar, TrendingDown, Activity, ClipboardList, UserCheck, Building2, ShieldAlert, CreditCard, DollarSign, FileText, Car, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { PerformanceMetasDialog } from '@/components/PerformanceMetasDialog';
import { HistoricoAlertasCard } from '@/components/HistoricoAlertasCard';
import { toast } from 'sonner';
import { differenceInHours, format, eachDayOfInterval } from 'date-fns';
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
  corretora_id?: string;
  corretora?: { id: string; nome: string } | null;
}
interface ResponsavelStats {
  responsavel: string;
  total: number;
  concluidos: number;
  tempoMedio: number;
  vencidos: number;
  taxaConclusao: number;
}

interface ImportedData {
  eventos: {
    total: number;
    porSituacao: { name: string; value: number }[];
    porMotivo: { name: string; value: number }[];
    porCorretora: { corretora: string; id: string; total: number }[];
    porMes: { mes: string; total: number }[];
    financeiro: { totalCusto: number; totalReparo: number; totalParticipacao: number };
  };
  cobranca: {
    total: number;
    porSituacao: { name: string; value: number }[];
    financeiro: { totalValor: number; totalAberto: number; totalBaixado: number };
  };
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
const SITUACAO_COLORS: Record<string, string> = {
  'FINALIZADO': '#10b981',
  'VEICULO FINALIZADO': '#34d399',
  'EVENTO NEGADO': '#ef4444',
  'NEGADO': '#f87171',
  'EM ANDAMENTO': '#3b82f6',
  'EVENTO FINALIZADO': '#22c55e',
  'ARQUIVADO': '#6b7280',
  'ABERTO': '#f59e0b',
  'VEICULO EM REPARO': '#8b5cf6',
  'PENDENTE PAGAMENTO': '#f97316',
  'VEICULO ENTREGUE': '#14b8a6',
  'CANCELADO INATIVIDADE ASSOCIAD': '#9ca3af',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function DashboardAnalytics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [statusConfigs, setStatusConfigs] = useState<StatusConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingImported, setLoadingImported] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [metasDialogOpen, setMetasDialogOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [activeMainTab, setActiveMainTab] = useState('visao-geral');
  const [importedData, setImportedData] = useState<ImportedData | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedPeriod, customStartDate, customEndDate]);

  useEffect(() => {
    loadImportedData();
  }, []);

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

  const loadImportedData = async () => {
    setLoadingImported(true);
    try {
      const { data, error } = await supabase.functions.invoke('dashboard-analytics-data');
      if (error) throw error;
      setImportedData(data);
    } catch (error) {
      console.error('Erro ao carregar dados importados:', error);
    } finally {
      setLoadingImported(false);
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
      // Batch fetch to avoid 1000 row limit
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.from('atendimentos').select(`
            *,
            responsavel:profiles(nome),
            corretora:corretoras(id, nome)
          `)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        allData = [...allData, ...(data || [])];
        hasMore = (data?.length || 0) === pageSize;
        page++;
      }
      const mapped = allData.map((item: any) => ({
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
      const { data, error } = await supabase.from('status_config').select('*').eq('ativo', true).order('ordem');
      if (error) throw error;
      setStatusConfigs(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar status:', error);
    }
  };

  // ===== ATENDIMENTOS CALCULATIONS =====
  const statusDistribution = statusConfigs.map(config => {
    const count = atendimentos.filter(a => a.status.toLowerCase() === config.nome.toLowerCase()).length;
    return { name: config.nome, value: count, color: config.cor };
  });

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

  // Corretoras data
  const corretorasData = useMemo(() => {
    const corretorasMap = new Map();
    atendimentos.forEach((atendimento: any) => {
      if (!atendimento.corretora_id) return;
      const corretoraId = atendimento.corretora_id;
      const corretoraName = atendimento.corretora?.nome || 'Sem Associação';
      if (!corretorasMap.has(corretoraId)) {
        corretorasMap.set(corretoraId, { id: corretoraId, nome: corretoraName, total: 0, concluidos: 0, vencidos: 0, tempoTotal: 0 });
      }
      const corretora = corretorasMap.get(corretoraId);
      corretora.total++;
      if (atendimento.data_concluido) {
        corretora.concluidos++;
        corretora.tempoTotal += differenceInHours(new Date(atendimento.data_concluido), new Date(atendimento.created_at));
      }
      const statusConfig = statusConfigs.find(c => c.nome.toLowerCase() === atendimento.status.toLowerCase());
      if (statusConfig && statusConfig.prazo_horas > 0) {
        const hours = differenceInHours(new Date(), new Date(atendimento.status_changed_at || atendimento.created_at));
        if (hours > statusConfig.prazo_horas) corretora.vencidos++;
      }
    });
    return Array.from(corretorasMap.values()).map(c => ({
      ...c,
      tempoMedio: c.concluidos > 0 ? Math.round(c.tempoTotal / c.concluidos) : 0,
      taxaConclusao: c.total > 0 ? Math.round(c.concluidos / c.total * 100) : 0,
    }));
  }, [atendimentos, statusConfigs]);

  // Rankings
  const responsavelRanking: ResponsavelStats[] = useMemo(() => {
    return Object.values(atendimentos.reduce((acc, a) => {
      const key = a.responsavel_id || 'sem-responsavel';
      if (!acc[key]) {
        acc[key] = { responsavel: a.responsavel_nome, total: 0, concluidos: 0, tempoMedio: 0, vencidos: 0, taxaConclusao: 0 };
      }
      acc[key].total++;
      if (a.data_concluido) {
        acc[key].concluidos++;
        const tempo = differenceInHours(new Date(a.data_concluido), new Date(a.created_at));
        acc[key].tempoMedio = (acc[key].tempoMedio * (acc[key].concluidos - 1) + tempo) / acc[key].concluidos;
      }
      const statusConfig = statusConfigs.find(c => c.nome.toLowerCase() === a.status.toLowerCase());
      if (statusConfig && statusConfig.prazo_horas > 0) {
        const hours = differenceInHours(new Date(), new Date(a.status_changed_at || a.created_at));
        if (hours > statusConfig.prazo_horas) acc[key].vencidos++;
      }
      return acc;
    }, {} as Record<string, ResponsavelStats>)).map(stats => ({
      ...stats,
      tempoMedio: Math.round(stats.tempoMedio),
      taxaConclusao: stats.total > 0 ? Math.round(stats.concluidos / stats.total * 100) : 0
    }));
  }, [atendimentos, statusConfigs]);

  const topByVolume = [...responsavelRanking].sort((a, b) => b.total - a.total).slice(0, 10);
  const topBySpeed = [...responsavelRanking].filter(r => r.concluidos > 0).sort((a, b) => a.tempoMedio - b.tempoMedio).slice(0, 10);
  const topByCompletionRate = [...responsavelRanking].sort((a, b) => b.taxaConclusao - a.taxaConclusao).slice(0, 10);

  // Daily evolution
  const dailyEvolution = useMemo(() => {
    const periodDays = selectedPeriod === 'all' ? 365 : parseInt(selectedPeriod);
    const days = eachDayOfInterval({
      start: new Date(new Date().setDate(new Date().getDate() - Math.min(periodDays, 90))),
      end: new Date()
    });
    return days.map(day => {
      const dayStart = new Date(day.setHours(0, 0, 0, 0));
      const dayEnd = new Date(day.setHours(23, 59, 59, 999));
      return {
        data: format(day, 'dd/MM', { locale: ptBR }),
        criados: atendimentos.filter(a => { const d = new Date(a.created_at); return d >= dayStart && d <= dayEnd; }).length,
        concluidos: atendimentos.filter(a => { if (!a.data_concluido) return false; const d = new Date(a.data_concluido); return d >= dayStart && d <= dayEnd; }).length,
      };
    });
  }, [atendimentos, selectedPeriod]);

  // Avg time by status
  const avgTimeByStatus = statusConfigs.map(config => {
    const statusAtendimentos = atendimentos.filter(a => a.status.toLowerCase() === config.nome.toLowerCase());
    if (statusAtendimentos.length === 0) return { name: config.nome, tempoMedio: 0, color: config.cor };
    const totalHours = statusAtendimentos.reduce((acc, a) => acc + differenceInHours(new Date(), new Date(a.status_changed_at || a.created_at)), 0);
    return { name: config.nome, tempoMedio: Math.round(totalHours / statusAtendimentos.length), color: config.cor };
  });

  // Overdue rate
  const overdueRate = statusConfigs.map(config => {
    if (config.prazo_horas === 0) return null;
    const statusAtendimentos = atendimentos.filter(a => a.status.toLowerCase() === config.nome.toLowerCase());
    const vencidos = statusAtendimentos.filter(a => differenceInHours(new Date(), new Date(a.status_changed_at || a.created_at)) > config.prazo_horas).length;
    return { name: config.nome, vencidos, total: statusAtendimentos.length, taxa: statusAtendimentos.length > 0 ? Math.round(vencidos / statusAtendimentos.length * 100) : 0, color: config.cor };
  }).filter(Boolean);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Dashboard Analítico - UONI', 14, 20);
    doc.setFontSize(11);
    doc.text(`Período: ${selectedPeriod === 'all' ? 'Todo período' : `Últimos ${selectedPeriod} dias`}`, 14, 28);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, 34);

    doc.setFontSize(14);
    doc.text('Atendimentos', 14, 45);
    autoTable(doc, {
      startY: 50,
      head: [['Métrica', 'Valor']],
      body: [
        ['Total de Atendimentos', totalAtendimentos.toString()],
        ['Concluídos', concluidos.toString()],
        ['Taxa de Conclusão', `${taxaConclusao}%`],
        ['Vencidos', vencidosTotal.toString()],
        ['Tempo Médio', `${Math.round(tempoMedioGeral)}h`],
      ]
    });

    if (importedData) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Eventos (Importados das Associações)', 14, 20);
      autoTable(doc, {
        startY: 25,
        head: [['Métrica', 'Valor']],
        body: [
          ['Total de Eventos', importedData.eventos.total.toLocaleString('pt-BR')],
          ['Custo Total', formatCurrency(importedData.eventos.financeiro.totalCusto)],
          ['Valor Reparo', formatCurrency(importedData.eventos.financeiro.totalReparo)],
        ]
      });

      doc.addPage();
      doc.setFontSize(14);
      doc.text('Cobrança', 14, 20);
      autoTable(doc, {
        startY: 25,
        head: [['Métrica', 'Valor']],
        body: [
          ['Total de Boletos', importedData.cobranca.total.toLocaleString('pt-BR')],
          ['Valor Total', formatCurrency(importedData.cobranca.financeiro.totalValor)],
          ['Valor em Aberto', formatCurrency(importedData.cobranca.financeiro.totalAberto)],
          ['Valor Baixado', formatCurrency(importedData.cobranca.financeiro.totalBaixado)],
        ]
      });
    }

    doc.save(`dashboard-analitico-uoni-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('PDF exportado com sucesso!');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
        <div className="text-center">
          <Activity className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-card/95 via-card to-card/95 backdrop-blur-md border-b border-border/50 shadow-lg">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Dashboard Analítico
                </h1>
                <p className="text-sm text-muted-foreground">Visão completa: Atendimentos, Eventos e Cobrança</p>
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
              <select value={selectedPeriod} onChange={e => { setSelectedPeriod(e.target.value); setCustomStartDate(null); setCustomEndDate(null); }} className="px-4 py-2 rounded-lg border bg-background">
                <option value="all">Todo período</option>
                <option value="7">Últimos 7 dias</option>
                <option value="15">Últimos 15 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="60">Últimos 60 dias</option>
                <option value="90">Últimos 90 dias</option>
                <option value="180">Últimos 180 dias</option>
                <option value="365">Último ano</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={customStartDate ? format(customStartDate, 'yyyy-MM-dd') : ''} onChange={e => setCustomStartDate(e.target.value ? new Date(e.target.value) : null)} className="px-4 py-2 rounded-lg border bg-background text-sm" />
              <span className="text-muted-foreground">até</span>
              <input type="date" value={customEndDate ? format(customEndDate, 'yyyy-MM-dd') : ''} onChange={e => setCustomEndDate(e.target.value ? new Date(e.target.value) : null)} className="px-4 py-2 rounded-lg border bg-background text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate('/desempenho-individual')} variant="outline">
              <UserCheck className="h-4 w-4 mr-2" />
              Desempenho
            </Button>
            <Button onClick={handleExportPDF} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
          </div>
        </div>

        {/* MAIN KPI CARDS - Visão Geral Consolidada */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                Atendimentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAtendimentos}</div>
              <p className="text-xs text-muted-foreground mt-1">{concluidos} concluídos</p>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" />
                Eventos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loadingImported ? <Loader2 className="h-5 w-5 animate-spin" /> : (importedData?.eventos.total || 0).toLocaleString('pt-BR')}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Importados</p>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                Boletos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loadingImported ? <Loader2 className="h-5 w-5 animate-spin" /> : (importedData?.cobranca.total || 0).toLocaleString('pt-BR')}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Cobrança</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Custo Eventos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">
                {loadingImported ? <Loader2 className="h-5 w-5 animate-spin" /> : formatCurrency(importedData?.eventos.financeiro.totalCusto || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Total acumulado</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                Vencidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{vencidosTotal}</div>
              <p className="text-xs text-muted-foreground mt-1">Atendimentos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" />
                Conclusão
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{taxaConclusao}%</div>
              <p className="text-xs text-muted-foreground mt-1">Meta: 80%</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 gap-2 h-auto p-2 bg-muted">
            <TabsTrigger value="visao-geral" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Activity className="h-4 w-4 mr-1.5" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="eventos" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ShieldAlert className="h-4 w-4 mr-1.5" />
              Eventos
            </TabsTrigger>
            <TabsTrigger value="cobranca" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CreditCard className="h-4 w-4 mr-1.5" />
              Cobrança
            </TabsTrigger>
            <TabsTrigger value="rankings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Award className="h-4 w-4 mr-1.5" />
              Rankings
            </TabsTrigger>
          </TabsList>

          {/* ===== TAB: VISÃO GERAL ===== */}
          <TabsContent value="visao-geral" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Distribuição de Atendimentos por Status */}
              <Card className="border-border/40 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Activity className="h-4 w-4 text-primary" />
                        </div>
                        Atendimentos por Status
                      </CardTitle>
                      <CardDescription className="mt-1">Distribuição dos atendimentos internos</CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-sm font-semibold px-3 py-1">{totalAtendimentos}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {totalAtendimentos > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={statusDistribution.filter(s => s.value > 0)} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value"
                          label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''} labelLine={false}>
                          {statusDistribution.filter(s => s.value > 0).map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
                                <p className="font-semibold" style={{ color: payload[0].payload.color }}>{payload[0].name}</p>
                                <p className="text-sm text-muted-foreground">{payload[0].value} atendimentos</p>
                              </div>
                            );
                          }
                          return null;
                        }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <p>Nenhum atendimento no período</p>
                    </div>
                  )}
                  <div className="space-y-1.5 mt-4 max-h-[200px] overflow-y-auto">
                    {statusDistribution.filter(s => s.value > 0).sort((a, b) => b.value - a.value).map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="text-sm">{s.name}</span>
                        </div>
                        <span className="text-sm font-semibold">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Eventos por Associação */}
              <Card className="border-border/40 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        Eventos por Associação
                      </CardTitle>
                      <CardDescription className="mt-1">Volume de eventos importados por associação</CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-sm font-semibold px-3 py-1">
                      {loadingImported ? '...' : (importedData?.eventos.total || 0).toLocaleString('pt-BR')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingImported ? (
                    <div className="h-[300px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={(importedData?.eventos.porCorretora || []).slice(0, 8)} margin={{ left: 0, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="corretora" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} angle={-30} textAnchor="end" height={80} />
                          <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                          <Tooltip formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Eventos']} />
                          <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 mt-4 max-h-[200px] overflow-y-auto">
                        {(importedData?.eventos.porCorretora || []).map((c, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                            <span className="text-sm">{c.corretora}</span>
                            <span className="text-sm font-semibold">{c.total.toLocaleString('pt-BR')}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Evolução e Histórico */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Evolução Diária de Atendimentos
                  </CardTitle>
                  <CardDescription>Criados vs Concluídos</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={dailyEvolution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="data" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="criados" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} name="Criados" />
                      <Area type="monotone" dataKey="concluidos" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.4} name="Concluídos" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Eventos por Mês */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Eventos por Mês (Últimos 12 meses)
                  </CardTitle>
                  <CardDescription>Volume mensal de eventos importados</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingImported ? (
                    <div className="h-[300px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={importedData?.eventos.porMes || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Eventos']} />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Eventos" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <HistoricoAlertasCard />
          </TabsContent>

          {/* ===== TAB: EVENTOS ===== */}
          <TabsContent value="eventos" className="space-y-6">
            {loadingImported ? (
              <div className="h-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {/* KPIs de Eventos */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total Eventos</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{(importedData?.eventos.total || 0).toLocaleString('pt-BR')}</div></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Custo Total</CardTitle></CardHeader>
                    <CardContent><div className="text-lg font-bold">{formatCurrency(importedData?.eventos.financeiro.totalCusto || 0)}</div></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Valor Reparo</CardTitle></CardHeader>
                    <CardContent><div className="text-lg font-bold">{formatCurrency(importedData?.eventos.financeiro.totalReparo || 0)}</div></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Participação</CardTitle></CardHeader>
                    <CardContent><div className="text-lg font-bold">{formatCurrency(importedData?.eventos.financeiro.totalParticipacao || 0)}</div></CardContent>
                  </Card>
                </div>

                {/* Eventos por Situação */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Eventos por Situação</CardTitle>
                      <CardDescription>Distribuição dos eventos por status</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={importedData?.eventos.porSituacao || []} layout="vertical" margin={{ left: 120 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={120} />
                          <Tooltip formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Eventos']} />
                          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                            {(importedData?.eventos.porSituacao || []).map((entry, index) => (
                              <Cell key={index} fill={SITUACAO_COLORS[entry.name] || CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Eventos por Motivo */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Eventos por Motivo</CardTitle>
                      <CardDescription>Principais causas dos eventos</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={importedData?.eventos.porMotivo || []} layout="vertical" margin={{ left: 150 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={150} />
                          <Tooltip formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Eventos']} />
                          <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]}>
                            {(importedData?.eventos.porMotivo || []).map((_, index) => (
                              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Evolução mensal */}
                <Card>
                  <CardHeader>
                    <CardTitle>Evolução Mensal de Eventos</CardTitle>
                    <CardDescription>Últimos 12 meses</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={importedData?.eventos.porMes || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Eventos']} />
                        <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} name="Eventos" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Tabela Resumo Associações */}
                <Card>
                  <CardHeader>
                    <CardTitle>Resumo por Associação</CardTitle>
                    <CardDescription>Volume de eventos por associação</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">#</th>
                            <th className="text-left p-2">Associação</th>
                            <th className="text-right p-2">Total Eventos</th>
                            <th className="text-right p-2">% do Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(importedData?.eventos.porCorretora || []).map((c, index) => (
                            <tr key={c.id} className="border-b hover:bg-muted/50">
                              <td className="p-2 text-muted-foreground">{index + 1}</td>
                              <td className="p-2 font-medium">{c.corretora}</td>
                              <td className="text-right p-2">{c.total.toLocaleString('pt-BR')}</td>
                              <td className="text-right p-2">
                                <Badge variant="secondary">
                                  {importedData?.eventos.total ? ((c.total / importedData.eventos.total) * 100).toFixed(1) : 0}%
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ===== TAB: COBRANÇA ===== */}
          <TabsContent value="cobranca" className="space-y-6">
            {loadingImported ? (
              <div className="h-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total Boletos</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{(importedData?.cobranca.total || 0).toLocaleString('pt-BR')}</div></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Valor Total</CardTitle></CardHeader>
                    <CardContent><div className="text-lg font-bold">{formatCurrency(importedData?.cobranca.financeiro.totalValor || 0)}</div></CardContent>
                  </Card>
                  <Card className="border-amber-500/20">
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Em Aberto</CardTitle></CardHeader>
                    <CardContent><div className="text-lg font-bold text-amber-600">{formatCurrency(importedData?.cobranca.financeiro.totalAberto || 0)}</div></CardContent>
                  </Card>
                  <Card className="border-emerald-500/20">
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Baixados</CardTitle></CardHeader>
                    <CardContent><div className="text-lg font-bold text-emerald-600">{formatCurrency(importedData?.cobranca.financeiro.totalBaixado || 0)}</div></CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Boletos por Situação</CardTitle>
                      <CardDescription>Distribuição dos boletos</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={(importedData?.cobranca.porSituacao || []).filter(s => s.value > 0)} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                            {(importedData?.cobranca.porSituacao || []).filter(s => s.value > 0).map((entry, index) => {
                              const colors: Record<string, string> = { 'ABERTO': '#f59e0b', 'BAIXADO': '#10b981', 'CANCELADO': '#6b7280' };
                              return <Cell key={index} fill={colors[entry.name] || CHART_COLORS[index]} />;
                            })}
                          </Pie>
                          <Tooltip formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Boletos']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Detalhamento</CardTitle>
                      <CardDescription>Valores por situação</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {(importedData?.cobranca.porSituacao || []).filter(s => s.value > 0).map((s, i) => {
                          const colors: Record<string, string> = { 'ABERTO': 'bg-amber-500', 'BAIXADO': 'bg-emerald-500', 'CANCELADO': 'bg-muted-foreground' };
                          const pct = importedData?.cobranca.total ? ((s.value / importedData.cobranca.total) * 100).toFixed(1) : '0';
                          return (
                            <div key={i} className="space-y-2">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <div className={`h-3 w-3 rounded-full ${colors[s.name] || 'bg-muted'}`} />
                                  <span className="font-medium">{s.name}</span>
                                </div>
                                <span className="font-semibold">{s.value.toLocaleString('pt-BR')} ({pct}%)</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2">
                                <div className={`h-2 rounded-full ${colors[s.name] || 'bg-primary'}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* ===== TAB: RANKINGS ===== */}
          <TabsContent value="rankings" className="space-y-6">
            {/* Tempo Médio por Status */}
            <Card>
              <CardHeader>
                <CardTitle>Tempo Médio por Status</CardTitle>
                <CardDescription>Horas que os atendimentos permanecem em cada status</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={avgTimeByStatus}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} label={{ value: 'Horas', angle: -90, position: 'insideLeft' }} />
                    <Tooltip formatter={value => [`${value}h`, 'Tempo Médio']} />
                    <Bar dataKey="tempoMedio" name="Tempo Médio (h)" radius={[8, 8, 0, 0]}>
                      {avgTimeByStatus.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Vencimento */}
            <Card>
              <CardHeader>
                <CardTitle>Taxa de Vencimento por Status</CardTitle>
                <CardDescription>Percentual que ultrapassou o prazo</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {overdueRate.map((item: any) => (
                    <div key={item.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-medium">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">{item.vencidos} vencidos de {item.total}</span>
                        <Badge variant={item.taxa > 30 ? 'destructive' : item.taxa > 15 ? 'default' : 'secondary'}>{item.taxa}%</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Performers */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-amber-500" />
                    Top Volume
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {topByVolume.map((resp, index) => (
                      <div key={resp.responsavel} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${index === 0 ? 'bg-amber-500 text-white' : index === 1 ? 'bg-muted-foreground/40 text-white' : index === 2 ? 'bg-amber-700 text-white' : 'bg-muted text-muted-foreground'}`}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{resp.responsavel}</p>
                          <p className="text-xs text-muted-foreground">{resp.taxaConclusao}% concluído</p>
                        </div>
                        <Badge variant="secondary">{resp.total}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                    Mais Rápidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {topBySpeed.map((resp, index) => (
                      <div key={resp.responsavel} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${index < 3 ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{resp.responsavel}</p>
                          <p className="text-xs text-muted-foreground">{resp.concluidos} concluídos</p>
                        </div>
                        <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />{resp.tempoMedio}h</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-blue-500" />
                    Maior Conclusão
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {topByCompletionRate.map((resp, index) => (
                      <div key={resp.responsavel} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${index < 3 ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{resp.responsavel}</p>
                          <p className="text-xs text-muted-foreground">{resp.concluidos}/{resp.total}</p>
                        </div>
                        <Badge variant="secondary">{resp.taxaConclusao}%</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Atendimentos por Associação */}
            {corretorasData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Atendimentos por Associação
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Associação</th>
                          <th className="text-center p-2">Total</th>
                          <th className="text-center p-2">Concluídos</th>
                          <th className="text-center p-2">Taxa</th>
                          <th className="text-center p-2">Vencidos</th>
                          <th className="text-center p-2">Tempo Médio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {corretorasData.sort((a, b) => b.total - a.total).map((c) => (
                          <tr key={c.id} className="border-b hover:bg-muted/50">
                            <td className="p-2">{c.nome}</td>
                            <td className="text-center p-2">{c.total}</td>
                            <td className="text-center p-2">{c.concluidos}</td>
                            <td className="text-center p-2">
                              <Badge variant={c.taxaConclusao >= 80 ? 'default' : 'destructive'}>{c.taxaConclusao}%</Badge>
                            </td>
                            <td className="text-center p-2">
                              <span className={c.vencidos > 0 ? 'text-destructive font-semibold' : ''}>{c.vencidos}</span>
                            </td>
                            <td className="text-center p-2">{c.tempoMedio}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <PerformanceMetasDialog open={metasDialogOpen} onOpenChange={setMetasDialogOpen} />
    </div>
  );
}
