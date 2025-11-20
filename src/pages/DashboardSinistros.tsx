import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Calendar,
  FileText,
  Camera,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

interface DashboardStats {
  total: number;
  aguardando: number;
  analise: number;
  concluidas: number;
  canceladas: number;
  mesAtual: number;
  anoAtual: number;
  mediaTempoAnalise: number;
}

interface ChartData {
  name: string;
  value: number;
}

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6'];

export default function DashboardSinistros() {
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    aguardando: 0,
    analise: 0,
    concluidas: 0,
    canceladas: 0,
    mesAtual: 0,
    anoAtual: 0,
    mediaTempoAnalise: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<ChartData[]>([]);
  const [tipoData, setTipoData] = useState<ChartData[]>([]);
  const [timelineData, setTimelineData] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Buscar todas as vistorias
      const { data: vistorias, error } = await supabase
        .from('vistorias')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!vistorias) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const inicioMes = startOfMonth(now);
      const fimMes = endOfMonth(now);
      const inicioAno = startOfYear(now);
      const fimAno = endOfYear(now);

      // Calcular estatísticas
      const aguardando = vistorias.filter(v => v.status === 'aguardando_fotos').length;
      const analise = vistorias.filter(v => v.status === 'em_analise').length;
      const concluidas = vistorias.filter(v => v.status === 'concluida').length;
      const canceladas = vistorias.filter(v => v.status === 'cancelada').length;

      const mesAtual = vistorias.filter(v => {
        const date = new Date(v.created_at);
        return date >= inicioMes && date <= fimMes;
      }).length;

      const anoAtual = vistorias.filter(v => {
        const date = new Date(v.created_at);
        return date >= inicioAno && date <= fimAno;
      }).length;

      // Calcular média de tempo de análise
      const vistoriasConcluidas = vistorias.filter(v => v.status === 'concluida' && v.completed_at);
      let mediaTempoAnalise = 0;
      if (vistoriasConcluidas.length > 0) {
        const tempos = vistoriasConcluidas.map(v => {
          const inicio = new Date(v.created_at);
          const fim = new Date(v.completed_at!);
          return (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60); // em horas
        });
        mediaTempoAnalise = tempos.reduce((a, b) => a + b, 0) / tempos.length;
      }

      setStats({
        total: vistorias.length,
        aguardando,
        analise,
        concluidas,
        canceladas,
        mesAtual,
        anoAtual,
        mediaTempoAnalise,
      });

      // Dados para gráfico de status
      setStatusData([
        { name: 'Aguardando Fotos', value: aguardando },
        { name: 'Em Análise', value: analise },
        { name: 'Concluídas', value: concluidas },
        { name: 'Canceladas', value: canceladas },
      ]);

      // Dados por tipo
      const tipos = vistorias.reduce((acc, v) => {
        acc[v.tipo_vistoria] = (acc[v.tipo_vistoria] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      setTipoData(Object.entries(tipos).map(([name, value]) => ({ name, value })));

      // Timeline dos últimos 6 meses
      const timeline = [];
      for (let i = 5; i >= 0; i--) {
        const mes = new Date();
        mes.setMonth(mes.getMonth() - i);
        const inicioMesLoop = startOfMonth(mes);
        const fimMesLoop = endOfMonth(mes);

        const count = vistorias.filter(v => {
          const date = new Date(v.created_at);
          return date >= inicioMesLoop && date <= fimMesLoop;
        }).length;

        timeline.push({
          mes: format(mes, 'MMM/yy', { locale: ptBR }),
          total: count,
        });
      }
      setTimelineData(timeline);

    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
        <div className="text-center py-12">Carregando dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard de Sinistros</h1>
            <p className="text-muted-foreground mt-1">Visão geral das vistorias e sinistros</p>
          </div>
          <Badge variant="outline" className="text-sm">
            Atualizado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
          </Badge>
        </div>

        {/* Cards de Estatísticas Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-card to-card/50 border-primary/20 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Vistorias
              </CardTitle>
              <FileText className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.mesAtual} este mês
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/10 to-card border-yellow-500/20 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Aguardando Fotos
              </CardTitle>
              <Camera className="h-5 w-5 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{stats.aguardando}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Pendentes de captura
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-card border-blue-500/20 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Em Análise
              </CardTitle>
              <Clock className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.analise}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Sendo processadas
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-card border-green-500/20 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Concluídas
              </CardTitle>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.concluidas}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Taxa: {stats.total > 0 ? ((stats.concluidas / stats.total) * 100).toFixed(1) : 0}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Cards Secundários */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="shadow-lg border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-5 w-5 text-primary" />
                Vistorias no Ano
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stats.anoAtual}</div>
              <p className="text-sm text-muted-foreground mt-1">Janeiro a Dezembro</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-5 w-5 text-primary" />
                Tempo Médio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stats.mediaTempoAnalise.toFixed(1)}h
              </div>
              <p className="text-sm text-muted-foreground mt-1">Análise completa</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-destructive/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Canceladas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.canceladas}</div>
              <p className="text-sm text-muted-foreground mt-1">Total de cancelamentos</p>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Status */}
          <Card className="shadow-lg border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg">Distribuição por Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gráfico de Tipos */}
          <Card className="shadow-lg border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg">Vistorias por Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={tipoData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Timeline */}
        <Card className="shadow-lg border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg">Evolução nos Últimos 6 Meses</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  name="Vistorias"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
