import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, Clock, MapPin, Check, Users, Car, Building2, AlertTriangle, MessageSquare, Calendar, ChevronRight, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { usePendingUsers } from '@/hooks/usePendingUsers';
import { OverdueAtendimento } from '@/hooks/useOverdueAtendimentos';
import { Link } from 'react-router-dom';

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

interface Atendimento {
  id: string;
  assunto: string;
  data_retorno: string;
  prioridade: string;
  status: string;
  observacoes?: string;
  contato_id?: string;
  corretora_id?: string;
}

interface CompromissoItem {
  id: string;
  titulo: string;
  descricao?: string;
  horario: string;
  local?: string;
  tipo: 'evento' | 'atendimento';
  cor: string;
  prioridade?: string;
  status?: string;
  originalData: Evento | Atendimento;
}

interface AlertasDialogProps {
  overdueCount?: number;
  overdueList?: OverdueAtendimento[];
}

export function AlertasDialog({ overdueCount = 0, overdueList = [] }: AlertasDialogProps) {
  const { user, userRole } = useAuth();
  const [compromissos, setCompromissos] = useState<CompromissoItem[]>([]);
  const [open, setOpen] = useState(false);
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const unreadMessages = useUnreadMessages();
  const pendingUsers = usePendingUsers();

  const showPending = (userRole === 'admin' || userRole === 'superintendente' || userRole === 'administrativo') && pendingUsers > 0;
  const alertCount = overdueCount + (showPending ? 1 : 0) + (unreadMessages > 0 ? 1 : 0);
  const totalNotifications = unreadMessages + (showPending ? pendingUsers : 0) + overdueCount + compromissos.length;

  useEffect(() => {
    const loadCompromissos = async () => {
      if (!user) return;
      const hoje = new Date();
      const inicioDia = startOfDay(hoje).toISOString();
      const fimDia = endOfDay(hoje).toISOString();

      const [{ data: eventosData }, { data: atendimentosData }] = await Promise.all([
        supabase.from('eventos').select('*').eq('user_id', user.id).gte('data_inicio', inicioDia).lte('data_inicio', fimDia),
        supabase.from('atendimentos').select('*').eq('user_id', user.id).gte('data_retorno', inicioDia).lte('data_retorno', fimDia).neq('status', 'concluido'),
      ]);

      const items: CompromissoItem[] = [];
      eventosData?.forEach((evento) => {
        items.push({
          id: `evento-${evento.id}`, titulo: evento.titulo, descricao: evento.descricao,
          horario: format(parseISO(evento.data_inicio), 'HH:mm', { locale: ptBR }),
          local: evento.local, tipo: 'evento', cor: evento.cor || '#3b82f6', originalData: evento,
        });
      });
      atendimentosData?.forEach((atendimento) => {
        items.push({
          id: `atendimento-${atendimento.id}`, titulo: atendimento.assunto, descricao: atendimento.observacoes,
          horario: format(parseISO(atendimento.data_retorno!), 'HH:mm', { locale: ptBR }),
          tipo: 'atendimento',
          cor: atendimento.prioridade === 'Alta' ? '#ef4444' : atendimento.prioridade === 'Média' ? '#f59e0b' : '#10b981',
          prioridade: atendimento.prioridade, status: atendimento.status, originalData: atendimento,
        });
      });
      items.sort((a, b) => a.horario.localeCompare(b.horario));
      setCompromissos(items);
    };
    loadCompromissos();
    if (open) loadCompromissos();
  }, [open, user]);

  const getTipoLabel = (tipo: string) => {
    const tipos: Record<string, string> = { reuniao: 'Reunião', 'follow-up': 'Follow-up', ligacao: 'Ligação', tarefa: 'Tarefa', outro: 'Outro' };
    return tipos[tipo] || tipo;
  };

  const handleConcluir = async (compromisso: CompromissoItem) => {
    if (compromisso.tipo === 'evento') {
      await supabase.from('eventos').delete().eq('id', (compromisso.originalData as Evento).id);
    } else {
      await supabase.from('atendimentos').update({ status: 'concluido', data_concluido: new Date().toISOString() }).eq('id', (compromisso.originalData as Atendimento).id);
    }
    setCompromissos(compromissos.filter(c => c.id !== compromisso.id));
    toast.success('Compromisso concluído!');
  };

  const defaultTab = overdueCount > 0 ? 'alertas' : compromissos.length > 0 ? 'hoje' : 'alertas';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalNotifications > 0 && (
            <span className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 animate-in zoom-in-50">
              {totalNotifications > 99 ? '99+' : totalNotifications}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl w-[95vw] p-0 gap-0 overflow-hidden rounded-2xl border-border/50 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border/50 bg-gradient-to-b from-muted/40 to-transparent">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              Notificações
              {totalNotifications > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs font-medium tabular-nums">
                  {totalNotifications}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
        </div>

        <Tabs defaultValue={defaultTab} className="flex flex-col">
          <div className="px-5 pt-2 border-b border-border/30">
            <TabsList className="w-full bg-transparent h-auto p-0 gap-4">
              <TabsTrigger
                value="hoje"
                className="relative pb-2.5 pt-1 px-0 rounded-none bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground data-[state=active]:text-foreground font-medium text-sm after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full data-[state=active]:after:bg-primary"
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                Hoje
                {compromissos.length > 0 && (
                  <span className="ml-1.5 h-4.5 min-w-4.5 px-1 flex items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                    {compromissos.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="alertas"
                className="relative pb-2.5 pt-1 px-0 rounded-none bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground data-[state=active]:text-foreground font-medium text-sm after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full data-[state=active]:after:bg-primary"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                Alertas
                {alertCount > 0 && (
                  <span className="ml-1.5 h-4.5 min-w-4.5 px-1 flex items-center justify-center rounded-full bg-destructive/10 text-destructive text-[10px] font-bold">
                    {alertCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Hoje Tab */}
          <TabsContent value="hoje" className="m-0 flex-1">
            <ScrollArea className="h-[60vh]">
              <div className="p-4 space-y-2">
                {compromissos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Calendar className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nenhum compromisso hoje</p>
                    <p className="text-xs mt-1 opacity-70">Seus compromissos do dia aparecerão aqui</p>
                  </div>
                ) : (
                  compromissos.map((compromisso) => (
                    <div
                      key={compromisso.id}
                      className="group relative p-3.5 rounded-xl border border-border/60 bg-card hover:bg-accent/40 transition-all duration-200 hover:shadow-sm"
                    >
                      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-full" style={{ backgroundColor: compromisso.cor }} />
                      <div className="flex items-start gap-3 pl-3">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {compromisso.horario}
                            </span>
                            <Badge
                              variant={compromisso.tipo === 'evento' ? 'default' : 'secondary'}
                              className="text-[10px] px-1.5 py-0 h-5 font-medium"
                            >
                              {compromisso.tipo === 'evento' ? getTipoLabel((compromisso.originalData as Evento).tipo) : 'Follow-up'}
                            </Badge>
                            {compromisso.prioridade && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-5"
                              >
                                {compromisso.prioridade}
                              </Badge>
                            )}
                          </div>
                          <h4 className="font-medium text-sm leading-tight truncate">{compromisso.titulo}</h4>
                          {compromisso.descricao && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{compromisso.descricao}</p>
                          )}
                          {compromisso.local && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{compromisso.local}</span>
                            </div>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleConcluir(compromisso)}
                          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg hover:bg-primary/10 hover:text-primary"
                          title="Concluir"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Alertas Tab */}
          <TabsContent value="alertas" className="m-0 flex-1">
            <ScrollArea className="h-[60vh]">
              <div className="p-4 space-y-3">
                {/* Quick actions */}
                {unreadMessages > 0 && (
                  <Link
                    to="/central-atendimento"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-accent/40 transition-all duration-200 hover:shadow-sm group"
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Mensagens não lidas</p>
                      <p className="text-xs text-muted-foreground">
                        {unreadMessages} mensagem{unreadMessages !== 1 ? 's' : ''} aguardando
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </Link>
                )}

                {showPending && (
                  <Link
                    to="/usuarios"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-accent/40 transition-all duration-200 hover:shadow-sm group"
                  >
                    <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Usuários pendentes</p>
                      <p className="text-xs text-muted-foreground">
                        {pendingUsers} aguardando aprovação
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </Link>
                )}

                {/* Overdue section */}
                {overdueCount > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1 pt-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-destructive">
                        Prazos vencidos
                      </span>
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 ml-auto">
                        {overdueCount}
                      </Badge>
                    </div>
                    {(showAllOverdue ? overdueList : overdueList.slice(0, 8)).map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl border border-destructive/15 bg-destructive/[0.03] hover:bg-destructive/[0.06] transition-all duration-200 cursor-pointer group"
                        onClick={() => { setOpen(false); window.location.href = `/atendimentos?id=${item.id}`; }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.corretoraNome && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-1 font-normal">
                                  <Building2 className="h-2.5 w-2.5" />
                                  {item.corretoraNome}
                                </Badge>
                              )}
                              {item.tipoAtendimento && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                                  {item.tipoAtendimento}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {item.placa && (
                                <span className="text-xs font-mono font-medium flex items-center gap-1">
                                  <Car className="h-3 w-3" />
                                  {item.placa}
                                </span>
                              )}
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                                {item.status}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[11px] text-destructive font-semibold tabular-nums flex items-center gap-1 bg-destructive/10 px-2 py-0.5 rounded-md">
                              <Clock className="h-3 w-3" />
                              {item.horasVencidas}h
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {overdueList.length > 8 && (
                      <button
                        onClick={() => setShowAllOverdue(!showAllOverdue)}
                        className="w-full text-xs text-primary hover:text-primary/80 text-center py-2 hover:bg-muted/30 rounded-lg transition-colors font-medium"
                      >
                        {showAllOverdue ? 'Mostrar menos' : `Ver todos os ${overdueList.length} atendimentos`}
                      </button>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {alertCount === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                      <Check className="h-5 w-5 opacity-40" />
                    </div>
                    <p className="text-sm font-medium">Tudo em dia!</p>
                    <p className="text-xs mt-1 opacity-70">Nenhum alerta pendente</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}