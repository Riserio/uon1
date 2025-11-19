import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardList, CheckCircle2, Clock, TrendingUp, Building2, Users, AlertTriangle, Activity, ArrowLeft, LogIn, FolderOpen } from 'lucide-react';
import { differenceInHours, parseISO, format, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import MethodologyConfigDialog from '@/components/MethodologyConfigDialog';
interface UserPerformance {
  userId: string;
  userName: string;
  cardsCreated: number;
  andamentos: number;
  completed: number;
  averageTimeHours: number;
  totalTimeHours: number;
  corretorasLinked: number;
  contactsCreated: number;
  corretorasNoCards: number;
  corretorasNoEvolution: number;
  completionRate: number;
  corretorasWithCards: number;
  timeLogged: number;
  methodology2070_10: {
    strategic: number;
    execution: number;
    innovation: number;
  };
  methodologyScore?: number;
  methodologyTier?: string;
}
interface TimeSeriesData {
  month: string;
  cardsCreated: number;
  completed: number;
  andamentos: number;
}
export default function IndividualPerformance() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');
  const [users, setUsers] = useState<{
    id: string;
    nome: string;
  }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [performance, setPerformance] = useState<UserPerformance | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [loading, setLoading] = useState(false);
  const [methodologyConfig, setMethodologyConfig] = useState<any>(null);
  const [statusFinalizados, setStatusFinalizados] = useState<Set<string>>(new Set());
  const startDate = startDateParam ? new Date(startDateParam) : null;
  const endDate = endDateParam ? new Date(endDateParam) : null;
  useEffect(() => {
    loadUsers();
    loadStatusFinalizados();
  }, []);
  const loadStatusFinalizados = async () => {
    const {
      data
    } = await supabase.from('status_config').select('nome').eq('is_final', true).eq('ativo', true);
    if (data) {
      setStatusFinalizados(new Set(data.map(s => s.nome)));
    }
  };
  useEffect(() => {
    if (selectedUserId) {
      loadUserPerformance();
      loadTimeSeriesData();
      loadMethodologyConfig();
    }
  }, [selectedUserId, startDate, endDate]);
  const loadMethodologyConfig = () => {
    if (!selectedUserId) return;
    const saved = localStorage.getItem(`methodology_config_${selectedUserId}`);
    if (saved) {
      setMethodologyConfig(JSON.parse(saved));
    } else {
      setMethodologyConfig(null);
    }
  };
  const calculateMethodologyScore = (config: any, performanceData?: UserPerformance | null) => {
    if (!config || !config.questions) return null;
    const strategicQuestions = config.questions.filter((q: any) => q.category === 'strategic');
    const executionQuestions = config.questions.filter((q: any) => q.category === 'execution');
    const innovationQuestions = config.questions.filter((q: any) => q.category === 'innovation');
    const strategicScore = strategicQuestions.reduce((sum: number, q: any) => sum + q.weight, 0) / (strategicQuestions.length * 10) * 100;
    const executionScore = executionQuestions.reduce((sum: number, q: any) => sum + q.weight, 0) / (executionQuestions.length * 10) * 100;
    const innovationScore = innovationQuestions.reduce((sum: number, q: any) => sum + q.weight, 0) / (innovationQuestions.length * 10) * 100;
    let baseScore = strategicScore * 0.20 + executionScore * 0.70 + innovationScore * 0.10;

    // Integrar métricas reais de desempenho se disponíveis
    if (performanceData) {
      // Produtividade geral: baseada em cards criados e taxa de conclusão
      const productivityScore = Math.min(100, performanceData.cardsCreated / 50 * 50 + performanceData.completionRate * 0.5);

      // Velocidade de resposta: baseada em tempo médio (menor é melhor)
      const responseSpeed = performanceData.averageTimeHours > 0 ? Math.max(0, 100 - performanceData.averageTimeHours / 48 * 100) : 50;

      // Engajamento com corretoras: baseado em corretoras com cards e sem evolução
      const engagementScore = performanceData.corretorasWithCards > 0 ? Math.min(100, performanceData.corretorasWithCards / Math.max(1, performanceData.corretorasWithCards + performanceData.corretorasNoEvolution) * 100) : 0;

      // Ajuste baseado em métricas reais (peso de 15%)
      const performanceAdjustment = (productivityScore * 0.4 + responseSpeed * 0.3 + engagementScore * 0.3) * 0.15;
      baseScore = baseScore * 0.85 + performanceAdjustment;
    }
    const managerImpact = (config.managerOpinion - 5) / 5 * 10;
    const finalScore = Math.max(0, Math.min(100, baseScore + managerImpact));
    let tier = '';
    let tierColor = '';
    let qualitativeResponse = '';
    if (finalScore >= 85) {
      tier = 'Top 20% - Alto Desempenho';
      tierColor = 'bg-green-500';
      qualitativeResponse = 'Excelente';
    } else if (finalScore >= 70) {
      tier = '70% - Desempenho Consistente';
      tierColor = 'bg-blue-500';
      qualitativeResponse = 'Bom';
    } else if (finalScore >= 50) {
      tier = '70% - Desempenho Adequado';
      tierColor = 'bg-yellow-500';
      qualitativeResponse = 'Pode Melhorar';
    } else if (finalScore >= 30) {
      tier = 'Bottom 10% - Necessita Atenção';
      tierColor = 'bg-orange-500';
      qualitativeResponse = 'Baixo';
    } else {
      tier = 'Bottom 10% - Crítico';
      tierColor = 'bg-red-500';
      qualitativeResponse = 'Muito Baixo';
    }
    return {
      score: finalScore,
      tier,
      tierColor,
      qualitativeResponse,
      strategicScore: strategicScore.toFixed(1),
      executionScore: executionScore.toFixed(1),
      innovationScore: innovationScore.toFixed(1)
    };
  };
  const loadUsers = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('profiles').select('id, nome').eq('ativo', true).order('nome');
      if (error) throw error;
      setUsers(data || []);
      if (data && data.length > 0) {
        setSelectedUserId(data[0].id);
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };
  const loadTimeSeriesData = async () => {
    if (!selectedUserId) return;
    try {
      const startFilterDate = startDate ? startDate.toISOString() : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const endFilterDate = endDate ? endDate.toISOString() : new Date().toISOString();
      const months = eachMonthOfInterval({
        start: new Date(startFilterDate),
        end: new Date(endFilterDate)
      });
      const timeSeriesData: TimeSeriesData[] = await Promise.all(months.map(async month => {
        const monthStart = startOfMonth(month).toISOString();
        const monthEnd = endOfMonth(month).toISOString();
        const [atendimentosRes, andamentosRes] = await Promise.all([supabase.from('atendimentos').select('id, status').eq('user_id', selectedUserId).gte('created_at', monthStart).lte('created_at', monthEnd), supabase.from('andamentos').select('id').eq('created_by', selectedUserId).gte('created_at', monthStart).lte('created_at', monthEnd)]);
        return {
          month: format(month, 'MMM/yy', {
            locale: ptBR
          }),
          cardsCreated: atendimentosRes.data?.length || 0,
          completed: atendimentosRes.data?.filter(a => statusFinalizados.has(a.status)).length || 0,
          andamentos: andamentosRes.data?.length || 0
        };
      }));
      setTimeSeriesData(timeSeriesData);
    } catch (error) {
      console.error('Erro ao carregar dados temporais:', error);
    }
  };
  const loadUserPerformance = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      const startFilterDate = startDate ? startDate.toISOString() : new Date(0).toISOString();
      const endFilterDate = endDate ? endDate.toISOString() : new Date().toISOString();

      // Cards criados
      const {
        data: atendimentos,
        error: atendimentosError
      } = await supabase.from('atendimentos').select('*').eq('user_id', selectedUserId).gte('created_at', startFilterDate).lte('created_at', endFilterDate);
      if (atendimentosError) throw atendimentosError;

      // Andamentos
      const {
        data: andamentos,
        error: andamentosError
      } = await supabase.from('andamentos').select('*').eq('created_by', selectedUserId).gte('created_at', startFilterDate).lte('created_at', endFilterDate);
      if (andamentosError) throw andamentosError;

      // Cards atribuídos ao responsável
      const {
        data: cardsResponsavel,
        error: cardsError
      } = await supabase.from('atendimentos').select('*').eq('responsavel_id', selectedUserId).gte('created_at', startFilterDate).lte('created_at', endFilterDate);
      if (cardsError) throw cardsError;

      // Concluídos - usar status finalizados
      const completed = cardsResponsavel?.filter(a => statusFinalizados.has(a.status)) || [];

      // Tempo médio e total
      let totalHours = 0;
      completed.forEach(atendimento => {
        if (atendimento.data_concluido && atendimento.created_at) {
          const hours = differenceInHours(parseISO(atendimento.data_concluido), parseISO(atendimento.created_at));
          totalHours += hours;
        }
      });
      const averageTime = completed.length > 0 ? totalHours / completed.length : 0;

      // Corretoras vinculadas
      const {
        data: corretorasVinculadas,
        error: corretorasError
      } = await supabase.from('atendimentos').select('corretora_id').eq('user_id', selectedUserId).not('corretora_id', 'is', null).gte('created_at', startFilterDate).lte('created_at', endFilterDate);
      if (corretorasError) throw corretorasError;
      const uniqueCorretoras = new Set(corretorasVinculadas?.map(a => a.corretora_id) || []);

      // Contatos criados
      const {
        data: contatos,
        error: contatosError
      } = await supabase.from('contatos').select('*').eq('created_by', selectedUserId).gte('created_at', startFilterDate).lte('created_at', endFilterDate);
      if (contatosError) throw contatosError;

      // Corretoras sem cards
      const {
        data: todasCorretoras,
        error: todasCorretorasError
      } = await supabase.from('corretoras').select('id');
      if (todasCorretorasError) throw todasCorretorasError;
      const {
        data: corretorasComCards,
        error: corretorasComCardsError
      } = await supabase.from('atendimentos').select('corretora_id').not('corretora_id', 'is', null);
      if (corretorasComCardsError) throw corretorasComCardsError;
      const corretorasComCardsSet = new Set(corretorasComCards?.map(a => a.corretora_id) || []);
      const corretorasSemCards = todasCorretoras?.filter(c => !corretorasComCardsSet.has(c.id)) || [];

      // Corretoras sem evolução
      const {
        data: corretorasSemEvolucao,
        error: semEvolucaoError
      } = await supabase.from('atendimentos').select('corretora_id, status_changed_at, created_at').not('corretora_id', 'is', null);
      if (semEvolucaoError) throw semEvolucaoError;
      const corretorasComUmCard = new Map();
      corretorasSemEvolucao?.forEach(a => {
        if (!corretorasComUmCard.has(a.corretora_id)) {
          corretorasComUmCard.set(a.corretora_id, []);
        }
        corretorasComUmCard.get(a.corretora_id).push(a);
      });
      let semEvoluçãoCount = 0;
      corretorasComUmCard.forEach(cards => {
        if (cards.length === 1) {
          const card = cards[0];
          if (card.status_changed_at === card.created_at || !card.status_changed_at) {
            semEvoluçãoCount++;
          }
        }
      });

      // Metodologia 20-70-10
      // 20% estratégico (planejamento, análise): cards criados e contatos
      // 70% execução (andamentos e conclusões): andamentos e concluídos
      // 10% inovação (exploração): corretoras vinculadas
      const totalActions = (atendimentos?.length || 0) + (andamentos?.length || 0) + completed.length + (contatos?.length || 0) + uniqueCorretoras.size;
      const strategic = ((atendimentos?.length || 0) + (contatos?.length || 0)) / (totalActions || 1) * 100;
      const execution = ((andamentos?.length || 0) + completed.length) / (totalActions || 1) * 100;
      const innovation = uniqueCorretoras.size / (totalActions || 1) * 100;

      // Tempo logado (simulado como tempo total em horas - pode ser integrado com sistema de login real)
      const timeLogged = totalHours;
      const user = users.find(u => u.id === selectedUserId);
      setPerformance({
        userId: selectedUserId,
        userName: user?.nome || 'Usuário',
        cardsCreated: atendimentos?.length || 0,
        andamentos: andamentos?.length || 0,
        completed: completed.length,
        averageTimeHours: Math.round(averageTime),
        totalTimeHours: Math.round(totalHours),
        corretorasLinked: uniqueCorretoras.size,
        contactsCreated: contatos?.length || 0,
        corretorasNoCards: corretorasSemCards.length,
        corretorasNoEvolution: semEvoluçãoCount,
        completionRate: cardsResponsavel && cardsResponsavel.length > 0 ? Math.round(completed.length / cardsResponsavel.length * 100) : 0,
        corretorasWithCards: corretorasComCardsSet.size,
        timeLogged: Math.round(timeLogged),
        methodology2070_10: {
          strategic: Math.round(strategic),
          execution: Math.round(execution),
          innovation: Math.round(innovation)
        }
      });
    } catch (error) {
      console.error('Erro ao carregar performance do usuário:', error);
    } finally {
      setLoading(false);
    }
  };
  const methodologyData = performance ? [{
    name: 'Estratégico (20%)',
    value: performance.methodology2070_10.strategic,
    color: '#3b82f6'
  }, {
    name: 'Execução (70%)',
    value: performance.methodology2070_10.execution,
    color: '#22c55e'
  }, {
    name: 'Inovação (10%)',
    value: performance.methodology2070_10.innovation,
    color: '#f59e0b'
  }] : [];
  return <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard-analytics')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Desempenho Individual</h1>
            <p className="text-muted-foreground">
              Análise detalhada de performance por usuário
            </p>
          </div>
        </div>

        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Selecione um usuário" />
          </SelectTrigger>
          <SelectContent>
            {users.map(user => <SelectItem key={user.id} value={user.id}>
                {user.nome}
              </SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div> : performance ? <>
          {/* Métricas principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Cards Criados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{performance.cardsCreated}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total de atendimentos criados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  Andamentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{performance.andamentos}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Atualizações registradas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Concluídos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{performance.completed}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Atendimentos finalizados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                  Taxa de Conclusão
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{performance.completionRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Eficiência de conclusão
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  Tempo Médio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{performance.averageTimeHours}h</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Por atendimento
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-red-500" />
                  Total Trabalhado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{performance.totalTimeHours}h</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Horas totais
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <LogIn className="h-4 w-4 text-cyan-500" />
                  Tempo Logado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{performance.timeLogged}h</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Tempo de trabalho registrado
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-indigo-500" />
                  Corretoras Vinculadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {performance.corretorasLinked}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Corretoras atendidas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-emerald-500" />
                  Corretoras com Card
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {performance.corretorasWithCards}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Corretoras com atendimentos
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-teal-500" />
                  Contatos Criados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{performance.contactsCreated}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Novos contatos cadastrados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Corretoras Sem Card
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {performance.corretorasNoCards}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Sem atendimentos criados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Sem Evolução
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {performance.corretorasNoEvolution}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Corretoras sem progresso
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de Evolução Temporal */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Evolução Temporal de Produtividade</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="cardsCreated" stroke="#3b82f6" name="Cards Criados" strokeWidth={2} />
                    <Line type="monotone" dataKey="completed" stroke="#22c55e" name="Concluídos" strokeWidth={2} />
                    <Line type="monotone" dataKey="andamentos" stroke="#f59e0b" name="Andamentos" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Metodologia 20-70-10 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Metodologia 20 / 70 / 10</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Estratégico, Execução e Inovação
                    </p>
                  </div>
                  <MethodologyConfigDialog userId={selectedUserId} existingConfig={methodologyConfig} onConfigSaved={config => {
                setMethodologyConfig(config);
                const scoreData = calculateMethodologyScore(config, performance);
                if (scoreData && performance) {
                  setPerformance({
                    ...performance,
                    methodologyScore: scoreData.score,
                    methodologyTier: scoreData.tier
                  });
                }
              }} />
                </div>
              </CardHeader>
              <CardContent>
                {methodologyConfig && methodologyConfig.isConfigured && (() => {
              const scoreData = calculateMethodologyScore(methodologyConfig, performance);
              return scoreData ? <div className="space-y-3 mb-3">
                      <div className="flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                        <div className="text-center space-y-1.5">
                          <div className="text-3xl font-bold text-primary">{scoreData.score.toFixed(1)}</div>
                          <Badge className={scoreData.tierColor + ' text-white'}>
                            {scoreData.qualitativeResponse} - {scoreData.tier}
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Referências Categorizadas */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                        <div className="text-center p-2 bg-strategic/10 rounded">
                          <div className="text-xs font-medium text-muted-foreground">Estratégico</div>
                          <div className="text-lg font-bold text-strategic">{scoreData.strategicScore}</div>
                          <div className="text-xs text-muted-foreground">20% peso</div>
                        </div>
                        <div className="text-center p-2 bg-execution/10 rounded">
                          <div className="text-xs font-medium text-muted-foreground">Execução</div>
                          <div className="text-lg font-bold text-execution">{scoreData.executionScore}</div>
                          <div className="text-xs text-muted-foreground">70% peso</div>
                        </div>
                        <div className="text-center p-2 bg-innovation/10 rounded">
                          <div className="text-xs font-medium text-muted-foreground">Inovação</div>
                          <div className="text-lg font-bold text-innovation">{scoreData.innovationScore}</div>
                          <div className="text-xs text-muted-foreground">10% peso</div>
                        </div>
                      </div>
                    </div> : null;
            })()}
                
                
                
              </CardContent>
            </Card>

            {/* Resumo de Desempenho */}
            <Card>
              <CardHeader>
                <CardTitle>Resumo de Desempenho</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Produtividade Geral
                  </span>
                  <Badge variant={performance.completionRate >= 80 ? 'default' : performance.completionRate >= 60 ? 'secondary' : 'destructive'}>
                    {performance.completionRate >= 80 ? 'Excelente' : performance.completionRate >= 60 ? 'Bom' : 'Precisa Melhorar'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Velocidade de Resposta
                  </span>
                  <Badge variant={performance.averageTimeHours <= 24 ? 'default' : performance.averageTimeHours <= 72 ? 'secondary' : 'destructive'}>
                    {performance.averageTimeHours <= 24 ? 'Rápido' : performance.averageTimeHours <= 72 ? 'Moderado' : 'Lento'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Engajamento com Corretoras
                  </span>
                  <Badge variant={performance.corretorasLinked >= 10 ? 'default' : performance.corretorasLinked >= 5 ? 'secondary' : 'destructive'}>
                    {performance.corretorasLinked >= 10 ? 'Alto' : performance.corretorasLinked >= 5 ? 'Médio' : 'Baixo'}
                  </Badge>
                </div>
                
              </CardContent>
            </Card>
          </div>
        </> : null}
    </div>;
}