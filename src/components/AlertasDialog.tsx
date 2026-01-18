import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, Clock, MapPin, Check, Users, CheckCircle2, Car, Building2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { usePendingUsers } from '@/hooks/usePendingUsers';
import { OverdueAtendimento } from '@/hooks/useOverdueAtendimentos';

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

  const totalNotifications = unreadMessages + pendingUsers + overdueCount;

  useEffect(() => {
    const loadCompromissos = async () => {
      if (!user) return;

      const hoje = new Date();
      const inicioDia = startOfDay(hoje).toISOString();
      const fimDia = endOfDay(hoje).toISOString();

      const { data: eventosData } = await supabase
        .from('eventos')
        .select('*')
        .eq('user_id', user.id)
        .gte('data_inicio', inicioDia)
        .lte('data_inicio', fimDia);

      const { data: atendimentosData } = await supabase
        .from('atendimentos')
        .select('*')
        .eq('user_id', user.id)
        .gte('data_retorno', inicioDia)
        .lte('data_retorno', fimDia)
        .neq('status', 'concluido');

      const items: CompromissoItem[] = [];

      if (eventosData) {
        eventosData.forEach((evento) => {
          items.push({
            id: `evento-${evento.id}`,
            titulo: evento.titulo,
            descricao: evento.descricao,
            horario: format(parseISO(evento.data_inicio), 'HH:mm', { locale: ptBR }),
            local: evento.local,
            tipo: 'evento',
            cor: evento.cor || '#3b82f6',
            originalData: evento
          });
        });
      }

      if (atendimentosData) {
        atendimentosData.forEach((atendimento) => {
          items.push({
            id: `atendimento-${atendimento.id}`,
            titulo: atendimento.assunto,
            descricao: atendimento.observacoes,
            horario: format(parseISO(atendimento.data_retorno!), 'HH:mm', { locale: ptBR }),
            tipo: 'atendimento',
            cor: atendimento.prioridade === 'Alta' ? '#ef4444' : atendimento.prioridade === 'Média' ? '#f59e0b' : '#10b981',
            prioridade: atendimento.prioridade,
            status: atendimento.status,
            originalData: atendimento
          });
        });
      }

      items.sort((a, b) => a.horario.localeCompare(b.horario));
      setCompromissos(items);
    };

    loadCompromissos();
    if (open) loadCompromissos();
  }, [open, user]);

  const getTipoLabel = (tipo: string) => {
    const tipos: Record<string, string> = {
      'reuniao': 'Reunião',
      'follow-up': 'Follow-up',
      'ligacao': 'Ligação',
      'tarefa': 'Tarefa',
      'outro': 'Outro'
    };
    return tipos[tipo] || tipo;
  };

  const handleConcluir = async (compromisso: CompromissoItem) => {
    if (compromisso.tipo === 'evento') {
      const evento = compromisso.originalData as Evento;
      await supabase.from('eventos').delete().eq('id', evento.id);
    } else {
      const atendimento = compromisso.originalData as Atendimento;
      await supabase
        .from('atendimentos')
        .update({ status: 'concluido', data_concluido: new Date().toISOString() })
        .eq('id', atendimento.id);
    }
    setCompromissos(compromissos.filter(c => c.id !== compromisso.id));
    toast.success('Compromisso concluído!');
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalNotifications > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {totalNotifications}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {unreadMessages > 0 && (
            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Mensagens não lidas</p>
                    <p className="text-sm text-muted-foreground">
                      Você tem {unreadMessages} mensagem{unreadMessages !== 1 ? 's' : ''} não lida{unreadMessages !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="/mensagens">Ver</a>
                </Button>
              </div>
            </div>
          )}

          {overdueCount > 0 && (
            <div className="space-y-3">
              <div className="p-4 border rounded-lg bg-destructive/5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="font-medium text-destructive">Atendimentos com prazo vencido</p>
                    <p className="text-sm text-muted-foreground">
                      {overdueCount} atendimento{overdueCount !== 1 ? 's' : ''} com prazo excedido
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Lista resumida dos atendimentos vencidos */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {(showAllOverdue ? overdueList : overdueList.slice(0, 10)).map((item) => (
                  <div 
                    key={item.id} 
                    className="p-3 border rounded-lg bg-destructive/5 border-destructive/20 hover:bg-destructive/10 transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/atendimentos?id=${item.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {item.corretoraNome && (
                            <Badge variant="outline" className="text-xs flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {item.corretoraNome}
                            </Badge>
                          )}
                          {item.tipoAtendimento && (
                            <Badge variant="secondary" className="text-xs">
                              {item.tipoAtendimento}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.placa && (
                            <span className="text-sm font-mono font-medium flex items-center gap-1">
                              <Car className="h-3 w-3" />
                              {item.placa}
                            </span>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {item.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs text-destructive font-medium flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {item.horasVencidas}h atraso
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {overdueList.length > 10 && !showAllOverdue && (
                  <button 
                    onClick={() => setShowAllOverdue(true)}
                    className="w-full text-xs text-primary hover:text-primary/80 text-center py-2 hover:bg-muted/50 rounded transition-colors"
                  >
                    + {overdueList.length - 10} outros atendimentos vencidos (clique para ver)
                  </button>
                )}
                {showAllOverdue && overdueList.length > 10 && (
                  <button 
                    onClick={() => setShowAllOverdue(false)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-2 hover:bg-muted/50 rounded transition-colors"
                  >
                    Mostrar menos
                  </button>
                )}
              </div>
            </div>
          )}

          {(userRole === 'admin' || userRole === 'superintendente' || userRole === 'administrativo') && pendingUsers > 0 && (
            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Usuários pendentes</p>
                    <p className="text-sm text-muted-foreground">
                      {pendingUsers} usuário{pendingUsers !== 1 ? 's' : ''} aguardando aprovação
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="/usuarios">Aprovar</a>
                </Button>
              </div>
            </div>
          )}

          {compromissos.length === 0 && unreadMessages === 0 && overdueCount === 0 && (!(userRole === 'admin' || userRole === 'superintendente' || userRole === 'administrativo') || pendingUsers === 0) ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma notificação</p>
          ) : null}
          
          {compromissos.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4" />
                Compromissos de Hoje
              </div>
              {compromissos.map((compromisso) => (
                <div 
                  key={compromisso.id} 
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  style={{ borderLeftWidth: '4px', borderLeftColor: compromisso.cor }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{compromisso.horario}</span>
                        <Badge variant={compromisso.tipo === 'evento' ? 'default' : 'secondary'}>
                          {compromisso.tipo === 'evento' ? getTipoLabel((compromisso.originalData as Evento).tipo) : 'Follow-up'}
                        </Badge>
                        {compromisso.prioridade && (
                          <Badge variant="outline">
                            {compromisso.prioridade}
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-semibold">{compromisso.titulo}</h4>
                      {compromisso.descricao && (
                        <p className="text-sm text-muted-foreground">{compromisso.descricao}</p>
                      )}
                      {compromisso.local && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          {compromisso.local}
                        </div>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="default"
                      onClick={() => handleConcluir(compromisso)}
                      className="h-8 w-8"
                      title="Concluir"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
