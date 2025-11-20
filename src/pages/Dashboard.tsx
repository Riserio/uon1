import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Clock, CheckCircle2, AlertCircle, Megaphone, ExternalLink, Plus, Mail, Users, Check, Calendar, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Atendimento } from "@/types/atendimento";
import { Comunicado } from "@/types/comunicado";
import { AlertasDialog } from "@/components/AlertasDialog";
import { UserProfile } from "@/components/UserProfile";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { format, isToday, parseISO, formatDistanceToNow, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { usePendingUsers } from "@/hooks/usePendingUsers";
import { useOverdueAtendimentos } from "@/hooks/useOverdueAtendimentos";
const COLORS = {
  novo: "hsl(var(--status-novo))",
  andamento: "hsl(var(--status-andamento))",
  aguardo: "hsl(var(--status-aguardo))",
  concluido: "hsl(var(--status-concluido))",
  alta: "hsl(var(--priority-alta))",
  media: "hsl(var(--priority-media))",
  baixa: "hsl(var(--priority-baixa))"
};
interface Evento {
  id: string;
  titulo: string;
  descricao?: string;
  data_inicio: string;
  data_fim: string;
  local?: string;
  tipo: string;
  cor: string;
}
interface CompromissoItem {
  id: string;
  titulo: string;
  descricao?: string;
  horario_inicio: string;
  horario_fim?: string;
  local?: string;
  tipo: 'evento' | 'atendimento';
  cor: string;
  prioridade?: string;
  status?: string;
  originalId: string;
}
export default function Dashboard() {
  const {
    user,
    userRole
  } = useAuth();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [compromissos, setCompromissos] = useState<CompromissoItem[]>([]);
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoUrl] = useLocalStorage<string>('app-logo-url', '');
  const unreadMessages = useUnreadMessages();
  const pendingUsers = usePendingUsers();
  const { overdueCount, overdueList } = useOverdueAtendimentos();
  
  const [statusFinalizados, setStatusFinalizados] = useState<Set<string>>(new Set());
  const [statusBacklog, setStatusBacklog] = useState<Set<string>>(new Set());
  const [statusEmAndamento, setStatusEmAndamento] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    const loadStatusGroups = async () => {
      const { data } = await supabase
        .from('status_config')
        .select('nome, tipo_etapa')
        .eq('ativo', true);
      
      if (data) {
        setStatusFinalizados(new Set(data.filter(s => s.tipo_etapa === 'finalizado').map(s => s.nome)));
        setStatusBacklog(new Set(data.filter(s => s.tipo_etapa === 'backlog').map(s => s.nome)));
        setStatusEmAndamento(new Set(data.filter(s => s.tipo_etapa === 'em_andamento').map(s => s.nome)));
      }
    };
    loadStatusGroups();
  }, []);
  
  // Capitalize user name
  const userName = user?.user_metadata?.nome ? 
    user.user_metadata.nome.charAt(0).toUpperCase() + user.user_metadata.nome.slice(1) 
    : '';
    
  useEffect(() => {
    if (user) {
      loadData();

      // Subscribe to real-time changes for eventos
      const eventosChannel = supabase
        .channel('dashboard_eventos_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'eventos',
          },
          () => {
            loadCompromissos();
          }
        )
        .subscribe();

      // Subscribe to real-time changes for atendimentos (for compromissos)
      const atendimentosChannel = supabase
        .channel('dashboard_atendimentos_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'atendimentos',
          },
          () => {
            loadAtendimentos();
            loadCompromissos();
          }
        )
        .subscribe();

      // Subscribe to real-time changes for comunicados
      const comunicadosChannel = supabase
        .channel('dashboard_comunicados_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'comunicados',
          },
          () => {
            loadComunicados();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(eventosChannel);
        supabase.removeChannel(atendimentosChannel);
        supabase.removeChannel(comunicadosChannel);
      };
    }
  }, [user]);
  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadAtendimentos(), loadCompromissos(), loadComunicados()]);
    setLoading(false);
  };
  const loadAtendimentos = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("atendimentos").select("*").order("created_at", {
        ascending: false
      });
      if (error) throw error;
      const mapped = data?.map(item => ({
        id: item.id,
        numero: item.numero,
        assunto: item.assunto,
        corretora: item.corretora_id || "",
        contato: item.contato_id || "",
        responsavel: item.responsavel_id || "",
        prioridade: item.prioridade,
        status: item.status,
        tags: item.tags || [],
        observacoes: item.observacoes || "",
        dataRetorno: item.data_retorno,
        dataConcluido: item.data_concluido,
        fluxoConcluido: item.fluxo_concluido_nome,
        fluxoConcluidoId: item.fluxo_concluido_id,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      })) || [];
      setAtendimentos(mapped);
    } catch (error) {
      console.error("Erro ao carregar atendimentos:", error);
    }
  };
  const loadCompromissos = async () => {
    try {
      const hoje = new Date();
      const inicioDia = startOfDay(hoje).toISOString();
      const fimDia = endOfDay(hoje).toISOString();

      // Carregar eventos do dia
      const {
        data: eventosData,
        error: eventosError
      } = await supabase.from("eventos").select("*").eq("user_id", user?.id).gte("data_inicio", inicioDia).lte("data_inicio", fimDia).order("data_inicio", {
        ascending: true
      });
      if (eventosError) throw eventosError;

      // Carregar atendimentos com follow-up para hoje
      const {
        data: atendimentosData,
        error: atendimentosError
      } = await supabase.from("atendimentos").select("*").eq("user_id", user?.id).gte("data_retorno", inicioDia).lte("data_retorno", fimDia).neq("status", "concluido").order("data_retorno", {
        ascending: true
      });
      if (atendimentosError) throw atendimentosError;

      // Combinar e mapear os dados
      const items: CompromissoItem[] = [];

      // Adicionar eventos
      if (eventosData) {
        eventosData.forEach(evento => {
          items.push({
            id: `evento-${evento.id}`,
            originalId: evento.id,
            titulo: evento.titulo,
            descricao: evento.descricao,
            horario_inicio: evento.data_inicio,
            horario_fim: evento.data_fim,
            local: evento.local,
            tipo: 'evento',
            cor: evento.cor || '#3b82f6'
          });
        });
      }

      // Adicionar atendimentos
      if (atendimentosData) {
        atendimentosData.forEach(atendimento => {
          items.push({
            id: `atendimento-${atendimento.id}`,
            originalId: atendimento.id,
            titulo: atendimento.assunto,
            descricao: atendimento.observacoes,
            horario_inicio: atendimento.data_retorno!,
            tipo: 'atendimento',
            cor: atendimento.prioridade === 'Alta' ? '#ef4444' : atendimento.prioridade === 'Média' ? '#f59e0b' : '#10b981',
            prioridade: atendimento.prioridade,
            status: atendimento.status
          });
        });
      }

      // Ordenar por horário
      items.sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
      setCompromissos(items);
    } catch (error) {
      console.error("Erro ao carregar compromissos:", error);
    }
  };
  const loadComunicados = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("comunicados").select("*").eq("ativo", true).order("created_at", {
        ascending: false
      }).limit(3);
      if (error) throw error;
      setComunicados(data || []);
    } catch (error) {
      console.error("Erro ao carregar comunicados:", error);
    }
  };
  const handleConcluirCompromisso = async (compromisso: CompromissoItem) => {
    if (compromisso.tipo === 'evento') {
      const {
        error
      } = await supabase.from("eventos").delete().eq("id", compromisso.originalId);
      if (error) {
        toast({
          title: "Erro ao concluir compromisso",
          variant: "destructive"
        });
        return;
      }
    } else {
      const {
        error
      } = await supabase.from("atendimentos").update({
        status: 'concluido',
        data_concluido: new Date().toISOString()
      }).eq("id", compromisso.originalId);
      if (error) {
        toast({
          title: "Erro ao concluir follow-up",
          variant: "destructive"
        });
        return;
      }
    }
    setCompromissos(compromissos.filter(c => c.id !== compromisso.id));
    toast({
      title: "Compromisso concluído!"
    });
  };

  // Métricas por Status - Agrupados por tipo de etapa
  const statusData = [{
    name: "Backlog",
    value: atendimentos.filter(a => statusBacklog.has(a.status)).length,
    color: COLORS.novo
  }, {
    name: "Em Andamento",
    value: atendimentos.filter(a => statusEmAndamento.has(a.status)).length,
    color: COLORS.andamento
  }, {
    name: "Finalizados",
    value: atendimentos.filter(a => statusFinalizados.has(a.status)).length,
    color: COLORS.concluido
  }];

  // Métricas por Prioridade
  const priorityData = [{
    name: "Alta",
    value: atendimentos.filter(a => a.prioridade === "Alta").length,
    color: COLORS.alta
  }, {
    name: "Média",
    value: atendimentos.filter(a => a.prioridade === "Média").length,
    color: COLORS.media
  }, {
    name: "Baixa",
    value: atendimentos.filter(a => a.prioridade === "Baixa").length,
    color: COLORS.baixa
  }];

  // Atendimentos por Responsável
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  
  useEffect(() => {
    const loadProfiles = async () => {
      const { data } = await supabase.from('profiles').select('id, nome');
      if (data) {
        const profileMap = data.reduce((acc, p) => {
          acc[p.id] = p.nome;
          return acc;
        }, {} as Record<string, string>);
        setProfiles(profileMap);
      }
    };
    loadProfiles();
  }, []);

  const responsavelMap = new Map<string, number>();
  atendimentos.forEach(a => {
    if (a.responsavel) {
      const nomeResponsavel = profiles[a.responsavel] || 'Sem responsável';
      responsavelMap.set(nomeResponsavel, (responsavelMap.get(nomeResponsavel) || 0) + 1);
    }
  });
  const responsavelData = Array.from(responsavelMap.entries()).map(([name, value]) => ({
    name,
    value
  })).sort((a, b) => b.value - a.value).slice(0, 10);

  // Atendimentos concluídos por fluxo
  const fluxoMap = new Map<string, number>();
  atendimentos
    .filter(a => a.dataConcluido && a.fluxoConcluido)
    .forEach(a => {
      const nomeFluxo = a.fluxoConcluido || 'Sem fluxo';
      fluxoMap.set(nomeFluxo, (fluxoMap.get(nomeFluxo) || 0) + 1);
    });
  const fluxosData = Array.from(fluxoMap.entries()).map(([name, value]) => ({
    name,
    value
  })).sort((a, b) => b.value - a.value);

  // Evolução nos últimos 30 dias
  const last30Days = Array.from({
    length: 30
  }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    return date.toISOString().split('T')[0];
  });
  const evolutionData = last30Days.map(date => {
    const created = atendimentos.filter(a => a.createdAt?.startsWith(date)).length;
    const concluded = atendimentos.filter(a => statusFinalizados.has(a.status) && a.updatedAt?.startsWith(date)).length;
    return {
      date: new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit'
      }),
      criados: created,
      concluidos: concluded
    };
  });

  // KPIs - Atualizado para usar is_final em vez de status fixo
  const totalAtendimentos = atendimentos.length;
  const atendimentosConcluidos = atendimentos.filter(a => statusFinalizados.has(a.status)).length;
  const atendimentosAbertos = atendimentos.filter(a => !statusFinalizados.has(a.status)).length;
  const taxaConclusao = totalAtendimentos > 0 ? (atendimentosConcluidos / totalAtendimentos * 100).toFixed(1) : 0;
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };
  const currentDate = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", {
    locale: ptBR
  });
  return <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto p-8 space-y-4 md:space-y-6">
        {/* Header with Welcome */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-primary/10 via-background to-background">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3 md:gap-4">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="h-8 md:h-12 object-contain" />
                  ) : (
                    <div className="h-8 w-8 md:h-12 md:w-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 md:h-6 md:w-6 text-primary" />
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl md:text-3xl font-bold">
                      {getGreeting()}, {userName || 'Usuário'}!
                    </h1>
                    <p className="text-xs md:text-sm text-muted-foreground capitalize">{currentDate}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 md:gap-3">
                <AlertasDialog overdueCount={overdueCount} />
                <UserProfile />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compromissos e Comunicados */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Compromissos do Dia */}
          <Card className="hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-purple-500/5 to-background">
            <CardHeader className="border-b bg-gradient-to-r from-purple-500/10 to-transparent">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center relative">
                      <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      {(unreadMessages > 0 || ((userRole === 'admin' || userRole === 'superintendente' || userRole === 'administrativo') && pendingUsers > 0) || compromissos.length > 0 || overdueCount > 0) && (
                        <div className="absolute -top-1 -right-1 h-4 w-4 bg-destructive rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                          {unreadMessages + ((userRole === 'admin' || userRole === 'superintendente' || userRole === 'administrativo') ? pendingUsers : 0) + compromissos.length + overdueCount}
                        </div>
                      )}
                    </div>
                    <span>Compromissos de Hoje</span>
                  </CardTitle>
                  <CardDescription className="mt-1">Seus compromissos agendados para hoje</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {unreadMessages > 0 && (
                    <Link to="/mensagens">
                      <Badge variant="destructive" className="cursor-pointer hover:bg-destructive/80">
                        <Mail className="h-3 w-3 mr-1" />
                        {unreadMessages}
                      </Badge>
                    </Link>
                  )}
                  {(userRole === 'admin' || userRole === 'superintendente' || userRole === 'administrativo') && pendingUsers > 0 && (
                    <Link to="/usuarios">
                      <Badge variant="destructive" className="cursor-pointer hover:bg-destructive/80">
                        <Users className="h-3 w-3 mr-1" />
                        {pendingUsers}
                      </Badge>
                    </Link>
                  )}
                  {compromissos.length > 0 && (
                    <Badge variant="destructive" className="cursor-pointer hover:bg-destructive/80">
                      <Calendar className="h-3 w-3 mr-1" />
                      {compromissos.length}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {loading ? <div className="space-y-3">
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div> : compromissos.length === 0 ? <div className="text-center py-12">
                  <div className="h-16 w-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-3">
                    <Calendar className="h-8 w-8 text-purple-500/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">Nenhum compromisso para hoje</p>
                </div> : <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                  {compromissos.map(compromisso => {
                    const horarioFormatado = format(parseISO(compromisso.horario_inicio), "HH:mm", { locale: ptBR });
                    const horarioFimFormatado = compromisso.horario_fim 
                      ? format(parseISO(compromisso.horario_fim), "HH:mm", { locale: ptBR })
                      : null;
                    
                    return (
                      <Card key={compromisso.id} className="hover:shadow-md transition-all duration-200 border bg-card/50 backdrop-blur">
                        <CardContent className="p-4">
                          <div className="flex gap-3">
                            <div className="w-1 rounded-full flex-shrink-0" style={{
                              backgroundColor: compromisso.cor
                            }} />
                            <div className="flex-1 space-y-2 min-w-0">
                              <div>
                                <div className="flex items-center gap-2 justify-between">
                                  <h4 className="font-semibold text-sm truncate flex-1">{compromisso.titulo}</h4>
                                  {compromisso.tipo === 'atendimento' && compromisso.prioridade && (
                                    <Badge variant={compromisso.prioridade === 'Alta' ? 'destructive' : compromisso.prioridade === 'Média' ? 'default' : 'secondary'} className="text-xs shrink-0">
                                      {compromisso.prioridade}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                                  <Badge variant="secondary" className="text-xs px-2 py-0">
                                    {horarioFormatado}
                                  </Badge>
                                  {horarioFimFormatado && (
                                    <>
                                      <span>-</span>
                                      <Badge variant="secondary" className="text-xs px-2 py-0">
                                        {horarioFimFormatado}
                                      </Badge>
                                    </>
                                  )}
                                  <Badge variant="outline" className="text-xs px-2 py-0">
                                    {compromisso.tipo === 'evento' ? '📅 Evento' : '📞 Follow-up'}
                                  </Badge>
                                </div>
                              </div>
                              {compromisso.local && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <span className="font-medium">📍</span>
                                  {compromisso.local}
                                </p>
                              )}
                              {compromisso.descricao && (
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {compromisso.descricao}
                                </p>
                              )}
                              <Button 
                                size="icon" 
                                variant="default" 
                                className="h-8 w-8" 
                                onClick={() => handleConcluirCompromisso(compromisso)}
                                title="Concluir"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>}
            </CardContent>
          </Card>

          {/* Comunicados */}
          <Card className="hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-amber-500/5 to-background">
            <CardHeader className="border-b bg-gradient-to-r from-amber-500/10 to-transparent">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Megaphone className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    Comunicados
                  </CardTitle>
                  <CardDescription className="mt-1">Últimos comunicados da equipe</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {comunicados.length}
                  </Badge>
                  {userRole === 'admin' && <Link to="/comunicados">
                      <Button size="sm" variant="outline" className="h-8 text-xs">
                        <Plus className="h-3 w-3 mr-1" />
                        Novo
                      </Button>
                    </Link>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {loading ? <div className="space-y-3">
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div> : comunicados.length === 0 ? <div className="text-center py-12">
                  <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                    <Megaphone className="h-8 w-8 text-amber-500/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">Nenhum comunicado no momento</p>
                </div> : <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                  {comunicados.map(comunicado => <Card key={comunicado.id} className="hover:shadow-md transition-all duration-200 border bg-card/50 backdrop-blur">
                      <CardContent className="p-4">
                        <div className="flex gap-3">
                          {comunicado.imagem_url && <img src={comunicado.imagem_url} alt={comunicado.titulo} className="h-16 w-16 rounded-lg object-cover flex-shrink-0 ring-1 ring-border" />}
                          <div className="flex-1 space-y-1 min-w-0">
                            <h4 className="font-semibold text-sm line-clamp-1">{comunicado.titulo}</h4>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {comunicado.mensagem}
                            </p>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(parseISO(comunicado.created_at), {
                            addSuffix: true,
                            locale: ptBR
                          })}
                              </span>
                              {comunicado.link && <a href={comunicado.link} target="_blank" rel="noopener noreferrer">
                                  <Button size="sm" variant="ghost" className="h-7 text-xs">
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Ver mais
                                  </Button>
                                </a>}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>)}
                </div>}
            </CardContent>
          </Card>
        </div>

        {/* Análises e Métricas */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="h-6 w-6" />
              Atendimentos
            </h2>
            <p className="text-sm text-muted-foreground">Indicadores de desempenho dos atendimentos</p>
          </div>

          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link to="/atendimentos">
            <Card className="hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-primary/10 to-background overflow-hidden relative group cursor-pointer">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
                <CardTitle className="text-sm font-medium text-foreground">Total de Atendimentos</CardTitle>
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="relative">
                <div className="text-3xl font-bold bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">{totalAtendimentos}</div>
                <p className="text-xs text-muted-foreground mt-1">Todos os registros</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/atendimentos">
            <Card className="hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-orange-500/10 to-background overflow-hidden relative group cursor-pointer">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
                <CardTitle className="text-sm font-medium text-foreground">Em Aberto</CardTitle>
                <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-orange-500" />
                </div>
              </CardHeader>
              <CardContent className="relative">
                <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{atendimentosAbertos}</div>
                <p className="text-xs text-muted-foreground mt-1">Aguardando ação</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/atendimentos">
            <Card className="hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-green-500/10 to-background overflow-hidden relative group cursor-pointer">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
                <CardTitle className="text-sm font-medium text-foreground">Concluídos</CardTitle>
                <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
              </CardHeader>
              <CardContent className="relative">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">{atendimentosConcluidos}</div>
                <p className="text-xs text-muted-foreground mt-1">Finalizados</p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/atendimentos">
            <Card className="hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-blue-500/10 to-background overflow-hidden relative group cursor-pointer">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
                <CardTitle className="text-sm font-medium text-foreground">Taxa de Conclusão</CardTitle>
                <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent className="relative">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{taxaConclusao}%</div>
                <p className="text-xs text-muted-foreground mt-1">Do total</p>
              </CardContent>
            </Card>
          </Link>
        </div>
        </div>

        {/* Charts Section */}
        <Card className="border-0 shadow-lg overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b">
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              Gráficos e Visualizações
            </CardTitle>
            <CardDescription>Visualização detalhada dos dados de atendimentos</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Tabs defaultValue="status" className="space-y-6">
              <TabsList className="grid w-full grid-cols-5 bg-muted/50">
                <TabsTrigger value="status" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Status
                </TabsTrigger>
                <TabsTrigger value="priority" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Prioridade
                </TabsTrigger>
                <TabsTrigger value="team" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Equipe
                </TabsTrigger>
                <TabsTrigger value="fluxos" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Fluxos
                </TabsTrigger>
                <TabsTrigger value="evolution" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Evolução
                </TabsTrigger>
              </TabsList>

          <TabsContent value="status" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-0 shadow-lg overflow-hidden">
                <CardHeader className="bg-gradient-to-br from-chart-1/10 to-transparent">
                  <CardTitle className="text-base">Distribuição por Status</CardTitle>
                  <CardDescription>Visão geral em pizza</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px] pt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <defs>
                        {statusData.map((entry, index) => (
                          <linearGradient key={`gradient-${index}`} id={`statusGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={entry.color} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={entry.color} stopOpacity={0.6} />
                          </linearGradient>
                        ))}
                      </defs>
                      <Pie 
                        data={statusData} 
                        cx="50%" 
                        cy="50%" 
                        labelLine={false} 
                        label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={95} 
                        innerRadius={50}
                        fill="#8884d8" 
                        dataKey="value"
                        animationBegin={0}
                        animationDuration={800}
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={`url(#statusGradient${index})`} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          boxShadow: 'var(--shadow-lg)'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg overflow-hidden">
                <CardHeader className="bg-gradient-to-br from-chart-5/10 to-transparent">
                  <CardTitle className="text-base">Distribuição por Fluxos</CardTitle>
                  <CardDescription>Atendimentos por workflow</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px] pt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <defs>
                        {fluxosData.map((entry, index) => (
                          <linearGradient key={`gradient-fluxo-${index}`} id={`fluxoGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={`hsl(var(--chart-${(index % 5) + 1}))`} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={`hsl(var(--chart-${(index % 5) + 1}))`} stopOpacity={0.6} />
                          </linearGradient>
                        ))}
                      </defs>
                      <Pie 
                        data={fluxosData} 
                        cx="50%" 
                        cy="50%" 
                        labelLine={false} 
                        label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={95} 
                        innerRadius={50}
                        fill="#8884d8" 
                        dataKey="value"
                        animationBegin={0}
                        animationDuration={800}
                      >
                        {fluxosData.map((entry, index) => (
                          <Cell key={`cell-fluxo-${index}`} fill={`url(#fluxoGradient${index})`} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          boxShadow: 'var(--shadow-lg)'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg overflow-hidden">
                <CardHeader className="bg-gradient-to-br from-chart-2/10 to-transparent">
                  <CardTitle className="text-base">Atendimentos por Status</CardTitle>
                  <CardDescription>Comparação quantitativa</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px] pt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusData}>
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis 
                        dataKey="name" 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          boxShadow: 'var(--shadow-lg)'
                        }}
                      />
                      <Bar 
                        dataKey="value" 
                        fill="url(#barGradient)"
                        radius={[8, 8, 0, 0]}
                        animationBegin={0}
                        animationDuration={800}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="priority">
            <Card className="border-0 shadow-lg overflow-hidden">
              <CardHeader className="bg-gradient-to-br from-chart-3/10 to-transparent">
                <CardTitle>Distribuição por Prioridade</CardTitle>
                <CardDescription>Análise dos atendimentos por nível de urgência</CardDescription>
              </CardHeader>
              <CardContent className="h-[420px] pt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priorityData} layout="vertical">
                    <defs>
                      {priorityData.map((entry, index) => (
                        <linearGradient key={`priority-gradient-${index}`} id={`priorityGradient${index}`} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={entry.color} stopOpacity={0.9} />
                          <stop offset="100%" stopColor={entry.color} stopOpacity={0.5} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      type="number" 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      width={100}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        boxShadow: 'var(--shadow-lg)'
                      }}
                    />
                    <Bar 
                      dataKey="value"
                      radius={[0, 8, 8, 0]}
                      animationBegin={0}
                      animationDuration={800}
                    >
                      {priorityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`url(#priorityGradient${index})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team">
            <Card className="border-0 shadow-lg overflow-hidden">
              <CardHeader className="bg-gradient-to-br from-chart-4/10 to-transparent">
                <CardTitle>Top 10 Responsáveis</CardTitle>
                <CardDescription>Membros da equipe com mais atendimentos</CardDescription>
              </CardHeader>
              <CardContent className="h-[420px] pt-6">
                {responsavelData.length > 0 ? <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={responsavelData}>
                      <defs>
                        <linearGradient id="teamGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--chart-4))" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="hsl(var(--chart-4))" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis 
                        dataKey="name" 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          boxShadow: 'var(--shadow-lg)'
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ paddingTop: '20px' }}
                        iconType="circle"
                      />
                      <Bar 
                        dataKey="value" 
                        name="Atendimentos" 
                        fill="url(#teamGradient)"
                        radius={[8, 8, 0, 0]}
                        animationBegin={0}
                        animationDuration={800}
                      />
                    </BarChart>
                  </ResponsiveContainer> : <div className="flex items-center justify-center h-full text-muted-foreground">
                    Nenhum responsável atribuído ainda
                  </div>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fluxos">
            <Card className="border-0 shadow-lg overflow-hidden">
              <CardHeader className="bg-gradient-to-br from-green-500/10 to-transparent">
                <CardTitle>Atendimentos Concluídos por Fluxo</CardTitle>
                <CardDescription>Visualização de conclusões em cada fluxo de trabalho</CardDescription>
              </CardHeader>
              <CardContent className="h-[420px] pt-6">
                {fluxosData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fluxosData} layout="vertical">
                      <defs>
                        <linearGradient id="fluxoGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="hsl(var(--status-concluido))" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="hsl(var(--status-concluido))" stopOpacity={0.5} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis 
                        type="number" 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        width={150}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          boxShadow: 'var(--shadow-lg)'
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ paddingTop: '20px' }}
                        iconType="circle"
                      />
                      <Bar 
                        dataKey="value" 
                        name="Concluídos" 
                        fill="url(#fluxoGradient)"
                        radius={[0, 8, 8, 0]}
                        animationBegin={0}
                        animationDuration={800}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Nenhum atendimento concluído em fluxos ainda
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="evolution">
            <Card className="border-0 shadow-lg overflow-hidden">
              <CardHeader className="bg-gradient-to-br from-chart-5/10 to-transparent">
                <CardTitle>Evolução nos Últimos 30 Dias</CardTitle>
                <CardDescription>Acompanhamento de criação e conclusão de atendimentos</CardDescription>
              </CardHeader>
              <CardContent className="h-[420px] pt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evolutionData}>
                    <defs>
                      <linearGradient id="lineGradient1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="lineGradient2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--status-concluido))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--status-concluido))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        boxShadow: 'var(--shadow-lg)'
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="circle"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="criados" 
                      stroke="hsl(var(--chart-1))" 
                      strokeWidth={2.5}
                      name="Criados"
                      dot={{ fill: 'hsl(var(--chart-1))', r: 4 }}
                      activeDot={{ r: 6 }}
                      fill="url(#lineGradient1)"
                      animationBegin={0}
                      animationDuration={1000}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="concluidos" 
                      stroke="hsl(var(--status-concluido))" 
                      strokeWidth={2.5}
                      name="Concluídos"
                      dot={{ fill: 'hsl(var(--status-concluido))', r: 4 }}
                      activeDot={{ r: 6 }}
                      fill="url(#lineGradient2)"
                      animationBegin={200}
                      animationDuration={1000}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>;
}