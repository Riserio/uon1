import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  TrendingUp,
  Building2,
  Users,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { differenceInHours, parseISO } from 'date-fns';

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
}

interface IndividualPerformanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate?: Date | null;
  endDate?: Date | null;
}

export function IndividualPerformanceDialog({
  open,
  onOpenChange,
  startDate,
  endDate,
}: IndividualPerformanceDialogProps) {
  const [users, setUsers] = useState<{ id: string; nome: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [performance, setPerformance] = useState<UserPerformance | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadUsers();
    }
  }, [open]);

  useEffect(() => {
    if (selectedUserId) {
      loadUserPerformance();
    }
  }, [selectedUserId, startDate, endDate]);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      setUsers(data || []);
      if (data && data.length > 0) {
        setSelectedUserId(data[0].id);
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const loadUserPerformance = async () => {
    if (!selectedUserId) return;

    setLoading(true);
    try {
      const startFilterDate = startDate ? startDate.toISOString() : new Date(0).toISOString();
      const endFilterDate = endDate ? endDate.toISOString() : new Date().toISOString();

      // Cards criados
      const { data: atendimentos, error: atendimentosError } = await supabase
        .from('atendimentos')
        .select('*')
        .eq('user_id', selectedUserId)
        .gte('created_at', startFilterDate)
        .lte('created_at', endFilterDate);

      if (atendimentosError) throw atendimentosError;

      // Andamentos
      const { data: andamentos, error: andamentosError } = await supabase
        .from('andamentos')
        .select('*')
        .eq('created_by', selectedUserId)
        .gte('created_at', startFilterDate)
        .lte('created_at', endFilterDate);

      if (andamentosError) throw andamentosError;

      // Cards atribuídos ao responsável
      const { data: cardsResponsavel, error: cardsError } = await supabase
        .from('atendimentos')
        .select('*')
        .eq('responsavel_id', selectedUserId)
        .gte('created_at', startFilterDate)
        .lte('created_at', endFilterDate);

      if (cardsError) throw cardsError;

      // Concluídos
      const completed = cardsResponsavel?.filter((a) => a.status === 'concluido') || [];

      // Tempo médio e total
      let totalHours = 0;
      completed.forEach((atendimento) => {
        if (atendimento.data_concluido && atendimento.created_at) {
          const hours = differenceInHours(
            parseISO(atendimento.data_concluido),
            parseISO(atendimento.created_at)
          );
          totalHours += hours;
        }
      });

      const averageTime = completed.length > 0 ? totalHours / completed.length : 0;

      // Corretoras vinculadas
      const { data: corretorasVinculadas, error: corretorasError } = await supabase
        .from('atendimentos')
        .select('corretora_id')
        .eq('user_id', selectedUserId)
        .not('corretora_id', 'is', null)
        .gte('created_at', startFilterDate)
        .lte('created_at', endFilterDate);

      if (corretorasError) throw corretorasError;

      const uniqueCorretoras = new Set(
        corretorasVinculadas?.map((a) => a.corretora_id) || []
      );

      // Contatos criados
      const { data: contatos, error: contatosError } = await supabase
        .from('contatos')
        .select('*')
        .eq('created_by', selectedUserId)
        .gte('created_at', startFilterDate)
        .lte('created_at', endFilterDate);

      if (contatosError) throw contatosError;

      // Corretoras sem cards
      const { data: todasCorretoras, error: todasCorretorasError } = await supabase
        .from('corretoras')
        .select('id');

      if (todasCorretorasError) throw todasCorretorasError;

      const { data: corretorasComCards, error: corretorasComCardsError } = await supabase
        .from('atendimentos')
        .select('corretora_id')
        .not('corretora_id', 'is', null);

      if (corretorasComCardsError) throw corretorasComCardsError;

      const corretorasComCardsSet = new Set(
        corretorasComCards?.map((a) => a.corretora_id) || []
      );
      const corretorasSemCards =
        todasCorretoras?.filter((c) => !corretorasComCardsSet.has(c.id)) || [];

      // Corretoras sem evolução (apenas 1 card e nunca mudou de status)
      const { data: corretorasSemEvolucao, error: semEvolucaoError } = await supabase
        .from('atendimentos')
        .select('corretora_id, status_changed_at, created_at')
        .not('corretora_id', 'is', null);

      if (semEvolucaoError) throw semEvolucaoError;

      const corretorasComUmCard = new Map();
      corretorasSemEvolucao?.forEach((a) => {
        if (!corretorasComUmCard.has(a.corretora_id)) {
          corretorasComUmCard.set(a.corretora_id, []);
        }
        corretorasComUmCard.get(a.corretora_id).push(a);
      });

      let semEvoluçãoCount = 0;
      corretorasComUmCard.forEach((cards) => {
        if (cards.length === 1) {
          const card = cards[0];
          if (
            card.status_changed_at === card.created_at ||
            !card.status_changed_at
          ) {
            semEvoluçãoCount++;
          }
        }
      });

      const user = users.find((u) => u.id === selectedUserId);

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
        completionRate:
          cardsResponsavel && cardsResponsavel.length > 0
            ? Math.round((completed.length / cardsResponsavel.length) * 100)
            : 0,
      });
    } catch (error) {
      console.error('Erro ao carregar performance do usuário:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Desempenho Individual</DialogTitle>
          <DialogDescription>
            Visualize métricas detalhadas de desempenho por usuário
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Usuário:</label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : performance ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resumo de Desempenho</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Produtividade Geral
                    </span>
                    <Badge
                      variant={
                        performance.completionRate >= 80
                          ? 'default'
                          : performance.completionRate >= 60
                          ? 'secondary'
                          : 'destructive'
                      }
                    >
                      {performance.completionRate >= 80
                        ? 'Excelente'
                        : performance.completionRate >= 60
                        ? 'Bom'
                        : 'Precisa Melhorar'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Velocidade de Resposta
                    </span>
                    <Badge
                      variant={
                        performance.averageTimeHours <= 24
                          ? 'default'
                          : performance.averageTimeHours <= 72
                          ? 'secondary'
                          : 'destructive'
                      }
                    >
                      {performance.averageTimeHours <= 24
                        ? 'Rápido'
                        : performance.averageTimeHours <= 72
                        ? 'Moderado'
                        : 'Lento'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
