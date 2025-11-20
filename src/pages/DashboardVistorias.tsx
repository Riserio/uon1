import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Camera, TrendingUp, Clock, CheckCircle, AlertCircle, Building2, BarChart3 } from 'lucide-react';
import { subDays, startOfDay } from 'date-fns';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DashboardStats {
  total: number;
  aguardando: number;
  emAnalise: number;
  concluidas: number;
  hoje: number;
  semana: number;
  mes: number;
  mediaTempoHoras: number;
  taxaConclusao: number;
}

interface VistoriaPorCorretora {
  nome: string;
  total: number;
  concluidas: number;
  pendentes: number;
}

export default function DashboardVistorias() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    total: 0, aguardando: 0, emAnalise: 0, concluidas: 0,
    hoje: 0, semana: 0, mes: 0, mediaTempoHoras: 0, taxaConclusao: 0
  });
  const [vistoriasPorCorretora, setVistoriasPorCorretora] = useState<VistoriaPorCorretora[]>([]);
  const [vistoriasPorDia, setVistoriasPorDia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDashboardData(); }, []);

  const loadDashboardData = async () => {
    try {
      const { data: vistorias, error } = await supabase.from('vistorias').select('*, corretoras(nome)');
      if (error) throw error;

      const hoje = startOfDay(new Date());
      const seteDiasAtras = subDays(hoje, 7);
      const trintaDiasAtras = subDays(hoje, 30);

      const newStats: DashboardStats = {
        total: vistorias?.length || 0,
        aguardando: vistorias?.filter(v => v.status === 'aguardando_fotos').length || 0,
        emAnalise: vistorias?.filter(v => v.status === 'em_analise').length || 0,
        concluidas: vistorias?.filter(v => v.status === 'concluida').length || 0,
        hoje: vistorias?.filter(v => new Date(v.created_at) >= hoje).length || 0,
        semana: vistorias?.filter(v => new Date(v.created_at) >= seteDiasAtras).length || 0,
        mes: vistorias?.filter(v => new Date(v.created_at) >= trintaDiasAtras).length || 0,
        mediaTempoHoras: 0,
        taxaConclusao: 0
      };

      const vistoriasConcluidas = vistorias?.filter(v => v.completed_at && v.created_at) || [];
      if (vistoriasConcluidas.length > 0) {
        const totalHoras = vistoriasConcluidas.reduce((acc, v) => {
          const horas = (new Date(v.completed_at!).getTime() - new Date(v.created_at).getTime()) / (1000 * 60 * 60);
          return acc + horas;
        }, 0);
        newStats.mediaTempoHoras = Math.round(totalHoras / vistoriasConcluidas.length);
      }

      if (newStats.total > 0) newStats.taxaConclusao = Math.round((newStats.concluidas / newStats.total) * 100);
      setStats(newStats);

      const corretorasMap = new Map<string, VistoriaPorCorretora>();
      vistorias?.forEach(v => {
        const corretoraId = v.corretora_id || 'Sem Corretora';
        const corretoraNome = v.corretoras?.nome || 'Sem Corretora';
        if (!corretorasMap.has(corretoraId)) corretorasMap.set(corretoraId, { nome: corretoraNome, total: 0, concluidas: 0, pendentes: 0 });
        const corretora = corretorasMap.get(corretoraId)!;
        corretora.total += 1;
        if (v.status === 'concluida') corretora.concluidas += 1;
        else corretora.pendentes += 1;
      });
      setVistoriasPorCorretora(Array.from(corretorasMap.values()).sort((a, b) => b.total - a.total).slice(0, 10));

      const diasData = [];
      for (let i = 6; i >= 0; i--) {
        const dia = subDays(hoje, i);
        const diaVistorias = vistorias?.filter(v => startOfDay(new Date(v.created_at)).getTime() === dia.getTime()) || [];
        diasData.push({
          dia: format(dia, 'dd/MM', { locale: ptBR }),
          total: diaVistorias.length,
          concluidas: diaVistorias.filter(v => v.status === 'concluida').length,
          pendentes: diaVistorias.filter(v => v.status !== 'concluida').length
        });
      }
      setVistoriasPorDia(diasData);
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  };

  const statusData = [
    { name: 'Concluídas', value: stats.concluidas, color: '#22c55e' },
    { name: 'Em Análise', value: stats.emAnalise, color: '#3b82f6' },
    { name: 'Aguardando', value: stats.aguardando, color: '#eab308' }
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" onClick={() => navigate('/vistorias')} className="gap-2 mb-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Dashboard de Vistorias</h1>
            <p className="text-muted-foreground mt-1">Análise completa e indicadores de performance</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><BarChart3 className="h-4 w-4" />Total de Vistorias</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-blue-600">{stats.total}</div><p className="text-xs text-muted-foreground mt-1">{stats.hoje} hoje • {stats.semana} esta semana</p></CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><CheckCircle className="h-4 w-4" />Taxa de Conclusão</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-green-600">{stats.taxaConclusao}%</div><p className="text-xs text-muted-foreground mt-1">{stats.concluidas} de {stats.total} concluídas</p></CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" />Tempo Médio</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-yellow-600">{stats.mediaTempoHoras}h</div><p className="text-xs text-muted-foreground mt-1">Tempo médio de conclusão</p></CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><AlertCircle className="h-4 w-4" />Pendentes</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-purple-600">{stats.aguardando + stats.emAnalise}</div><p className="text-xs text-muted-foreground mt-1">{stats.aguardando} aguardando • {stats.emAnalise} em análise</p></CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />Distribuição por Status</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`} outerRadius={80} fill="#8884d8" dataKey="value">
                    {statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" />Tendência (Últimos 7 Dias)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={vistoriasPorDia}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dia" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} name="Total" />
                  <Line type="monotone" dataKey="concluidas" stroke="#22c55e" strokeWidth={2} name="Concluídas" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />Vistorias por Corretora (Top 10)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={vistoriasPorCorretora} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="nome" type="category" width={150} />
                <Tooltip />
                <Legend />
                <Bar dataKey="concluidas" fill="#22c55e" name="Concluídas" stackId="a" />
                <Bar dataKey="pendentes" fill="#eab308" name="Pendentes" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Detalhamento por Corretora</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold">Corretora</th>
                    <th className="text-center p-3 font-semibold">Total</th>
                    <th className="text-center p-3 font-semibold">Concluídas</th>
                    <th className="text-center p-3 font-semibold">Pendentes</th>
                    <th className="text-center p-3 font-semibold">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {vistoriasPorCorretora.map((corretora, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50">
                      <td className="p-3">{corretora.nome}</td>
                      <td className="text-center p-3 font-semibold">{corretora.total}</td>
                      <td className="text-center p-3 text-green-600">{corretora.concluidas}</td>
                      <td className="text-center p-3 text-yellow-600">{corretora.pendentes}</td>
                      <td className="text-center p-3">{Math.round((corretora.concluidas / corretora.total) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
