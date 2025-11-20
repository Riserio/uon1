import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Building2, TrendingUp, Clock, CheckCircle2, AlertCircle, DollarSign, FileText } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#f59e0b', '#10b981', '#8b5cf6'];

export default function DesempenhoCorretoras() {
  const navigate = useNavigate();
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalAtendimentos: 0,
    concluidos: 0,
    emAndamento: 0,
    atrasados: 0,
    tempoMedioConclusao: 0,
    taxaConclusao: 0,
    totalSinistros: 0,
    totalCustos: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [selectedCorretora]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Carregar corretoras
      const { data: corretorasData, error: corretorasError } = await supabase
        .from('corretoras')
        .select('*')
        .order('nome');

      if (corretorasError) throw corretorasError;
      setCorretoras(corretorasData || []);

      // Construir query de atendimentos
      let query = supabase
        .from('atendimentos')
        .select(`
          *,
          corretoras(nome),
          vistorias(
            custo_oficina,
            custo_reparo,
            custo_acordo,
            custo_perda_total,
            custo_perda_parcial,
            custo_terceiros
          )
        `)
        .eq('tipo_atendimento', 'sinistro');

      if (selectedCorretora !== 'all') {
        query = query.eq('corretora_id', selectedCorretora);
      }

      const { data: atendimentos, error: atendError } = await query;

      if (atendError) throw atendError;

      // Calcular estatísticas
      const total = atendimentos?.length || 0;
      const concluidos = atendimentos?.filter(a => a.data_concluido)?.length || 0;
      const emAndamento = atendimentos?.filter(a => !a.data_concluido && !a.arquivado)?.length || 0;
      
      // Atrasados (sem data de retorno ou data de retorno no passado)
      const now = new Date();
      const atrasados = atendimentos?.filter(a => {
        if (a.data_concluido || a.arquivado) return false;
        if (!a.data_retorno) return false;
        return new Date(a.data_retorno) < now;
      })?.length || 0;

      // Tempo médio de conclusão (em dias)
      const temposColeta: number[] = [];
      atendimentos?.forEach(a => {
        if (a.created_at && a.data_concluido) {
          const inicio = new Date(a.created_at);
          const fim = new Date(a.data_concluido);
          const dias = (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24);
          temposColeta.push(dias);
        }
      });
      const tempoMedio = temposColeta.length > 0 
        ? temposColeta.reduce((sum, t) => sum + t, 0) / temposColeta.length 
        : 0;

      // Taxa de conclusão
      const taxaConclusao = total > 0 ? (concluidos / total) * 100 : 0;

      // Total de custos
      let totalCustos = 0;
      atendimentos?.forEach(a => {
        const vistoria = Array.isArray(a.vistorias) ? a.vistorias[0] : a.vistorias;
        if (vistoria) {
          totalCustos += (vistoria.custo_oficina || 0);
          totalCustos += (vistoria.custo_reparo || 0);
          totalCustos += (vistoria.custo_acordo || 0);
          totalCustos += (vistoria.custo_perda_total || 0);
          totalCustos += (vistoria.custo_perda_parcial || 0);
          totalCustos += (vistoria.custo_terceiros || 0);
        }
      });

      setStats({
        totalAtendimentos: total,
        concluidos,
        emAndamento,
        atrasados,
        tempoMedioConclusao: Math.round(tempoMedio * 10) / 10,
        taxaConclusao: Math.round(taxaConclusao * 10) / 10,
        totalSinistros: total,
        totalCustos,
      });

      // Distribuição por status
      const statusMap = new Map<string, number>();
      atendimentos?.forEach(a => {
        const count = statusMap.get(a.status) || 0;
        statusMap.set(a.status, count + 1);
      });
      const statusDist = Array.from(statusMap.entries()).map(([name, value]) => ({ name, value }));
      setStatusDistribution(statusDist);

      // Dados mensais (últimos 6 meses)
      const monthlyMap = new Map<string, { novos: number; concluidos: number }>();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      atendimentos?.forEach(a => {
        const createdDate = new Date(a.created_at);
        if (createdDate >= sixMonthsAgo) {
          const monthKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
          const current = monthlyMap.get(monthKey) || { novos: 0, concluidos: 0 };
          current.novos += 1;
          monthlyMap.set(monthKey, current);
        }

        if (a.data_concluido) {
          const concluidoDate = new Date(a.data_concluido);
          if (concluidoDate >= sixMonthsAgo) {
            const monthKey = `${concluidoDate.getFullYear()}-${String(concluidoDate.getMonth() + 1).padStart(2, '0')}`;
            const current = monthlyMap.get(monthKey) || { novos: 0, concluidos: 0 };
            current.concluidos += 1;
            monthlyMap.set(monthKey, current);
          }
        }
      });

      const monthlyDataArray = Array.from(monthlyMap.entries())
        .map(([mes, data]) => ({
          mes,
          novos: data.novos,
          concluidos: data.concluidos,
        }))
        .sort((a, b) => a.mes.localeCompare(b.mes));

      setMonthlyData(monthlyDataArray);

      // Gráfico de corretoras (top 10 por atendimentos)
      if (selectedCorretora === 'all') {
        const corretoraMap = new Map<string, number>();
        atendimentos?.forEach(a => {
          if (a.corretoras?.nome) {
            const count = corretoraMap.get(a.corretoras.nome) || 0;
            corretoraMap.set(a.corretoras.nome, count + 1);
          }
        });
        const chartDataArray = Array.from(corretoraMap.entries())
          .map(([nome, total]) => ({ nome, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);
        setChartData(chartDataArray);
      } else {
        setChartData([]);
      }

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados de desempenho');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="h-8 w-8" />
              Desempenho por Corretoras
            </h1>
            <p className="text-muted-foreground mt-1">
              Análise de desempenho e estatísticas por corretora
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Selecione a corretora" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Corretoras</SelectItem>
                {corretoras.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => navigate('/')}>
              Voltar
            </Button>
          </div>
        </div>

        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Sinistros</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSinistros}</div>
              <p className="text-xs text-muted-foreground">
                Atendimentos de sinistro
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Conclusão</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.taxaConclusao}%</div>
              <p className="text-xs text-muted-foreground">
                {stats.concluidos} de {stats.totalAtendimentos} concluídos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.tempoMedioConclusao} dias</div>
              <p className="text-xs text-muted-foreground">
                Para conclusão
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Custos Totais</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalCustos)}</div>
              <p className="text-xs text-muted-foreground">
                Valor total processado
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Cards de Métricas Adicionais */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.emAndamento}</div>
              <p className="text-xs text-muted-foreground">
                Atendimentos ativos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Atrasados</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.atrasados}</div>
              <p className="text-xs text-muted-foreground">
                Necessitam atenção
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Concluídos</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.concluidos}</div>
              <p className="text-xs text-muted-foreground">
                Atendimentos finalizados
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Corretoras (apenas quando 'Todas' está selecionado) */}
          {selectedCorretora === 'all' && chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Corretoras</CardTitle>
                <CardDescription>Por quantidade de atendimentos</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nome" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Distribuição por Status */}
          {statusDistribution.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Distribuição por Status</CardTitle>
                <CardDescription>Status dos atendimentos</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => entry.name}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Evolução Mensal */}
          {monthlyData.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Evolução Mensal</CardTitle>
                <CardDescription>Novos atendimentos vs. concluídos</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="novos" stroke="hsl(var(--primary))" name="Novos" />
                    <Line type="monotone" dataKey="concluidos" stroke="hsl(var(--chart-2))" name="Concluídos" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
