import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Camera, 
  FileText, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  MapPin,
  Calendar,
  BarChart3
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DashboardStats {
  total: number;
  aguardando: number;
  emAnalise: number;
  concluidas: number;
  hoje: number;
  semana: number;
  mes: number;
  mediaTempoHoras: number;
  regiaoMaisVistorias: string;
}

interface VistoriasPorRegiao {
  estado: string;
  cidade: string;
  total: number;
}

export default function DashboardVistorias() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    aguardando: 0,
    emAnalise: 0,
    concluidas: 0,
    hoje: 0,
    semana: 0,
    mes: 0,
    mediaTempoHoras: 0,
    regiaoMaisVistorias: '-'
  });
  const [regioes, setRegioes] = useState<VistoriasPorRegiao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Carregar todas as vistorias
      const { data: vistorias, error } = await supabase
        .from('vistorias')
        .select('*, corretoras(cidade, estado)');

      if (error) throw error;

      const hoje = startOfDay(new Date());
      const seteDiasAtras = subDays(hoje, 7);
      const trintaDiasAtras = subDays(hoje, 30);

      // Calcular estatísticas
      const newStats: DashboardStats = {
        total: vistorias?.length || 0,
        aguardando: vistorias?.filter(v => v.status === 'aguardando_fotos').length || 0,
        emAnalise: vistorias?.filter(v => v.status === 'em_analise').length || 0,
        concluidas: vistorias?.filter(v => v.status === 'concluida').length || 0,
        hoje: vistorias?.filter(v => new Date(v.created_at) >= hoje).length || 0,
        semana: vistorias?.filter(v => new Date(v.created_at) >= seteDiasAtras).length || 0,
        mes: vistorias?.filter(v => new Date(v.created_at) >= trintaDiasAtras).length || 0,
        mediaTempoHoras: 0,
        regiaoMaisVistorias: '-'
      };

      // Calcular média de tempo de conclusão
      const vistoriasConcluidas = vistorias?.filter(v => v.completed_at && v.created_at) || [];
      if (vistoriasConcluidas.length > 0) {
        const totalHoras = vistoriasConcluidas.reduce((acc, v) => {
          const inicio = new Date(v.created_at);
          const fim = new Date(v.completed_at!);
          const horas = (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60);
          return acc + horas;
        }, 0);
        newStats.mediaTempoHoras = Math.round(totalHoras / vistoriasConcluidas.length);
      }

      // Calcular vistorias por região
      const regioesMap = new Map<string, VistoriasPorRegiao>();
      vistorias?.forEach(v => {
        if (v.corretoras) {
          const key = `${v.corretoras.estado}-${v.corretoras.cidade}`;
          if (!regioesMap.has(key)) {
            regioesMap.set(key, {
              estado: v.corretoras.estado || '-',
              cidade: v.corretoras.cidade || '-',
              total: 0
            });
          }
          const regiao = regioesMap.get(key)!;
          regiao.total += 1;
        }
      });

      const regioesArray = Array.from(regioesMap.values()).sort((a, b) => b.total - a.total);
      setRegioes(regioesArray);

      if (regioesArray.length > 0) {
        newStats.regiaoMaisVistorias = `${regioesArray[0].cidade} - ${regioesArray[0].estado}`;
      }

      setStats(newStats);
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Dashboard de Vistorias
            </h1>
            <p className="text-muted-foreground mt-1">
              Visão completa e análise de todas as vistorias veiculares
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => navigate('/vistorias')}
              variant="outline"
              size="lg"
            >
              <FileText className="h-5 w-5 mr-2" />
              Histórico
            </Button>
            <Button
              onClick={() => navigate('/vistorias/nova/digital')}
              size="lg"
              className="gap-2 bg-gradient-to-r from-primary to-primary/80"
            >
              <Camera className="h-5 w-5" />
              Nova Vistoria
            </Button>
          </div>
        </div>

        {/* KPIs principais - Linha 1 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Total de Vistorias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Todas as vistorias realizadas
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Aguardando Fotos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{stats.aguardando}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Pendentes de captura
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Em Análise
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{stats.emAnalise}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Sendo processadas por IA
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Concluídas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.concluidas}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Análise finalizada
              </p>
            </CardContent>
          </Card>
        </div>

        {/* KPIs de período - Linha 2 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.hoje}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Vistorias de hoje
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Últimos 7 dias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.semana}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Vistorias esta semana
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Últimos 30 dias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.mes}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Vistorias este mês
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Tempo Médio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.mediaTempoHoras}h</div>
              <p className="text-xs text-muted-foreground mt-1">
                Duração média de análise
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Região com mais vistorias e Top 5 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Região com Mais Vistorias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {stats.regiaoMaisVistorias}
              </div>
              {regioes.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  {regioes[0].total} vistorias realizadas
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Top 5 Regiões
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {regioes.slice(0, 5).map((regiao, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0">
                        {index + 1}
                      </Badge>
                      <span className="text-sm font-medium">
                        {regiao.cidade} - {regiao.estado}
                      </span>
                    </div>
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/20">
                      {regiao.total}
                    </Badge>
                  </div>
                ))}
                {regioes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma vistoria registrada ainda
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ações rápidas */}
        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                onClick={() => navigate('/vistorias/nova/digital')}
                className="h-20 bg-gradient-to-r from-primary to-primary/80"
              >
                <div className="flex flex-col items-center gap-2">
                  <Camera className="h-6 w-6" />
                  <span>Nova Vistoria Digital</span>
                </div>
              </Button>
              <Button
                onClick={() => navigate('/vistorias/nova/manual')}
                variant="outline"
                className="h-20"
              >
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-6 w-6" />
                  <span>Nova Vistoria Manual</span>
                </div>
              </Button>
              <Button
                onClick={() => navigate('/vistorias')}
                variant="outline"
                className="h-20"
              >
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-6 w-6" />
                  <span>Ver Histórico Completo</span>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
