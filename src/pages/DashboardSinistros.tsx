import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  ArrowLeft,
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  XCircle,
  Building2,
  BarChart3,
  Calendar
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SinistroStats {
  total: number;
  abertos: number;
  emAndamento: number;
  concluidos: number;
  cancelados: number;
  hoje: number;
  semana: number;
  mes: number;
  mediaTempoHoras: number;
}

export default function DashboardSinistros() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SinistroStats>({
    total: 0,
    abertos: 0,
    emAndamento: 0,
    concluidos: 0,
    cancelados: 0,
    hoje: 0,
    semana: 0,
    mes: 0,
    mediaTempoHoras: 0
  });
  const [sinistrosPorTipo, setSinistrosPorTipo] = useState<any[]>([]);
  const [sinistrosPorDia, setSinistrosPorDia] = useState<any[]>([]);
  const [sinistrosPorCorretora, setSinistrosPorCorretora] = useState<any[]>([]);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroPeriodo, setFiltroPeriodo] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [filtroPeriodo]);

  const loadDashboardData = async () => {
    try {
      const diasAtras = parseInt(filtroPeriodo);
      const dataInicio = subDays(startOfDay(new Date()), diasAtras);

      // Carregar atendimentos que são sinistros
      const { data: atendimentos, error } = await supabase
        .from('atendimentos')
        .select('*, corretoras(nome)')
        .contains('tags', ['sinistro'])
        .gte('created_at', dataInicio.toISOString());

      if (error) throw error;

      const hoje = startOfDay(new Date());
      const seteDiasAtras = subDays(hoje, 7);

      // Calcular estatísticas
      const newStats: SinistroStats = {
        total: atendimentos?.length || 0,
        abertos: atendimentos?.filter(a => a.status === 'novo').length || 0,
        emAndamento: atendimentos?.filter(a => !['novo', 'concluido'].includes(a.status)).length || 0,
        concluidos: atendimentos?.filter(a => a.data_concluido).length || 0,
        cancelados: atendimentos?.filter(a => a.arquivado).length || 0,
        hoje: atendimentos?.filter(a => new Date(a.created_at) >= hoje).length || 0,
        semana: atendimentos?.filter(a => new Date(a.created_at) >= seteDiasAtras).length || 0,
        mes: atendimentos?.length || 0,
        mediaTempoHoras: 0
      };

      // Calcular média de tempo
      const atendimentosConcluidos = atendimentos?.filter(a => a.data_concluido && a.created_at) || [];
      if (atendimentosConcluidos.length > 0) {
        const totalHoras = atendimentosConcluidos.reduce((acc, a) => {
          const inicio = new Date(a.created_at);
          const fim = new Date(a.data_concluido!);
          const horas = (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60);
          return acc + horas;
        }, 0);
        newStats.mediaTempoHoras = Math.round(totalHoras / atendimentosConcluidos.length);
      }

      setStats(newStats);

      // Calcular por tipo
      const tiposMap = new Map();
      atendimentos?.forEach(a => {
        const tipo = a.tags?.find((t: string) => ['casco', 'terceiros', 'roubo'].includes(t)) || 'outros';
        tiposMap.set(tipo, (tiposMap.get(tipo) || 0) + 1);
      });

      const tiposData = [
        { name: 'Casco', value: tiposMap.get('casco') || 0, color: '#3b82f6' },
        { name: 'Terceiros', value: tiposMap.get('terceiros') || 0, color: '#eab308' },
        { name: 'Roubo/Furto', value: tiposMap.get('roubo') || 0, color: '#ef4444' },
        { name: 'Outros', value: tiposMap.get('outros') || 0, color: '#6b7280' }
      ].filter(t => t.value > 0);
      setSinistrosPorTipo(tiposData);

      // Calcular por dia (últimos 7 dias)
      const diasData = [];
      for (let i = 6; i >= 0; i--) {
        const dia = subDays(hoje, i);
        const diaSinistros = atendimentos?.filter(a => {
          const atendimentoDate = startOfDay(new Date(a.created_at));
          return atendimentoDate.getTime() === dia.getTime();
        }) || [];

        diasData.push({
          dia: format(dia, 'dd/MM', { locale: ptBR }),
          total: diaSinistros.length,
          concluidos: diaSinistros.filter(a => a.data_concluido).length
        });
      }
      setSinistrosPorDia(diasData);

      // Calcular por corretora
      const corretorasMap = new Map();
      atendimentos?.forEach(a => {
        const corretoraId = a.corretora_id || 'Sem Corretora';
        const corretoraNome = a.corretoras?.nome || 'Sem Corretora';
        
        if (!corretorasMap.has(corretoraId)) {
          corretorasMap.set(corretoraId, {
            nome: corretoraNome,
            total: 0,
            concluidos: 0
          });
        }
        
        const corretora = corretorasMap.get(corretoraId);
        corretora.total += 1;
        if (a.data_concluido) corretora.concluidos += 1;
      });

      const corretorasArray = Array.from(corretorasMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
      setSinistrosPorCorretora(corretorasArray);

    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  };

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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-destructive/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <Button
              variant="ghost"
              onClick={() => navigate('/atendimentos')}
              className="gap-2 mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-destructive to-destructive/60 bg-clip-text text-transparent">
              Dashboard de Sinistros
            </h1>
            <p className="text-muted-foreground mt-1">
              Análise completa de sinistros e indicadores
            </p>
          </div>
          <div className="flex gap-3">
            <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="15">Últimos 15 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Total de Sinistros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.hoje} hoje • {stats.semana} esta semana
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Concluídos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.concluidos}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.total > 0 ? Math.round((stats.concluidos / stats.total) * 100) : 0}% do total
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Tempo Médio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{stats.mediaTempoHoras}h</div>
              <p className="text-xs text-muted-foreground mt-1">
                Tempo médio de resolução
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Em Andamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{stats.emAndamento}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.abertos} aguardando início
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Distribuição por Tipo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={sinistrosPorTipo}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {sinistrosPorTipo.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Tendência (Últimos 7 Dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={sinistrosPorDia}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dia" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} name="Total" />
                  <Line type="monotone" dataKey="concluidos" stroke="#22c55e" strokeWidth={2} name="Concluídos" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Sinistros por Corretora */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Sinistros por Corretora (Top 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={sinistrosPorCorretora}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="#3b82f6" name="Total" />
                <Bar dataKey="concluidos" fill="#22c55e" name="Concluídos" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardHeader>
            <CardTitle>Detalhamento por Corretora</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold">Corretora</th>
                    <th className="text-center p-3 font-semibold">Total</th>
                    <th className="text-center p-3 font-semibold">Concluídos</th>
                    <th className="text-center p-3 font-semibold">Em Andamento</th>
                    <th className="text-center p-3 font-semibold">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {sinistrosPorCorretora.map((corretora, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50">
                      <td className="p-3">{corretora.nome}</td>
                      <td className="text-center p-3 font-semibold">{corretora.total}</td>
                      <td className="text-center p-3 text-green-600">{corretora.concluidos}</td>
                      <td className="text-center p-3 text-yellow-600">{corretora.total - corretora.concluidos}</td>
                      <td className="text-center p-3">
                        {Math.round((corretora.concluidos / corretora.total) * 100)}%
                      </td>
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
