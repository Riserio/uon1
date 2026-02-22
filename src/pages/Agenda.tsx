import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Calendar as CalendarIcon,
  Bell,
  X,
  Plus,
  Clock,
  MapPin,
  Palette,
  Trash2,
  CheckCircle2,
  CalendarDays,
  RefreshCw,
  Settings2,
  Link2,
  Unlink2,
  Mail,
  LayoutGrid,
  List,
  CalendarRange,
  ChevronRight,
  
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { toUTC, toDateTimeLocal } from '@/utils/dateUtils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Evento {
  id: string;
  titulo: string;
  descricao?: string;
  data_inicio: string;
  data_fim: string;
  local?: string;
  tipo: string;
  cor: string;
  google_event_id?: string;
  lembrete_minutos: number[];
}

interface GoogleIntegration {
  id: string;
  google_email: string | null;
  label: string | null;
  ativo: boolean;
  last_sync_at: string | null;
  connected_at: string;
}

interface Lembrete {
  id: string;
  evento_id: string;
  evento: Evento;
  visualizado: boolean;
  disparado_em: string;
}

const tiposEvento = [
  { value: 'reuniao', label: 'Reunião', icon: '👥' },
  { value: 'tarefa', label: 'Tarefa', icon: '✓' },
  { value: 'compromisso', label: 'Compromisso', icon: '📅' },
  { value: 'lembrete', label: 'Lembrete', icon: '🔔' },
  { value: 'outro', label: 'Outro', icon: '📌' },
];

const coresEvento = [
  { value: '#3b82f6', label: 'Azul' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Laranja' },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#8b5cf6', label: 'Roxo' },
  { value: '#ec4899', label: 'Rosa' },
];

type CalendarView = 'month' | 'week' | 'day' | 'list';
type ListTab = 'upcoming' | 'past';

export default function Agenda() {
  const { user } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvento, setEditingEvento] = useState<Evento | null>(null);
  const [integrations, setIntegrations] = useState<GoogleIntegration[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [activeView, setActiveView] = useState<CalendarView>('list');
  const [syncPopoverOpen, setSyncPopoverOpen] = useState(false);
  const [listTab, setListTab] = useState<ListTab>('upcoming');
  const [formData, setFormData] = useState<Partial<Evento>>({
    tipo: 'reuniao',
    cor: '#3b82f6',
    lembrete_minutos: [15, 30]
  });
  const calendarRef = useRef<FullCalendar>(null);

  const fetchEventos = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('eventos')
      .select('*')
      .eq('user_id', user.id)
      .order('data_inicio', { ascending: true });
    setEventos(data || []);
  }, [user]);

  const fetchIntegrations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('google_calendar_integrations')
      .select('id, google_email, label, ativo, last_sync_at, connected_at')
      .eq('user_id', user.id)
      .order('connected_at', { ascending: true });
    setIntegrations(data || []);
  }, [user]);

  const fetchLembretes = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('lembretes_disparados')
      .select('*, evento:eventos(*)')
      .eq('user_id', user.id)
      .eq('visualizado', false)
      .order('disparado_em', { ascending: false });
    setLembretes(data || []);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchEventos();
      fetchLembretes();
      fetchIntegrations();
      const interval = setInterval(() => verificarLembretes(), 60000);
      return () => clearInterval(interval);
    }
  }, [user, fetchEventos, fetchLembretes, fetchIntegrations]);

  const verificarLembretes = async () => {
    const agora = new Date();
    for (const evento of eventos) {
      if (!evento.lembrete_minutos || evento.lembrete_minutos.length === 0) continue;
      const dataEvento = new Date(evento.data_inicio);
      const diffMinutos = Math.floor((dataEvento.getTime() - agora.getTime()) / 60000);
      for (const minutos of evento.lembrete_minutos) {
        if (Math.abs(diffMinutos - minutos) <= 1) {
          const { data: existente } = await supabase
            .from('lembretes_disparados')
            .select('id')
            .eq('evento_id', evento.id)
            .eq('user_id', user?.id)
            .gte('disparado_em', new Date(agora.getTime() - 5 * 60000).toISOString());
          if (!existente || existente.length === 0) {
            const { error } = await supabase.from('lembretes_disparados').insert({
              evento_id: evento.id, user_id: user?.id, disparado_em: new Date().toISOString()
            });
            if (!error) {
              toast(`🔔 Lembrete: ${evento.titulo}`, {
                description: `Evento em ${minutos} minutos`
              });
            }
          }
        }
      }
    }
    fetchLembretes();
  };

  const connectGoogleCalendar = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { toast.error('Você precisa estar autenticado'); return; }
      const w = 600, h = 700;
      const popup = window.open('about:blank', 'google_oauth', `width=${w},height=${h},left=${(screen.width - w) / 2},top=${(screen.height - h) / 2}`);
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', { body: { action: 'authorize' } });
      if (error) { popup?.close(); toast.error('Erro ao conectar'); return; }
      if (data?.authUrl && popup && !popup.closed) {
        popup.location.href = data.authUrl;
        const check = setInterval(async () => {
          if (popup?.closed) {
            clearInterval(check);
            await fetchIntegrations();
            toast.success('Google Calendar conectado!');
            syncWithGoogle();
          }
        }, 1000);
      }
    } catch { toast.error('Erro ao conectar com Google Calendar'); }
  };

  const syncWithGoogle = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-sync');
      if (error) throw error;
      toast.success(`Sincronizado! ${data?.imported || 0} importados, ${data?.synced || 0} exportados (${data?.accounts_synced || 0} contas)`);
      fetchEventos();
      fetchIntegrations();
    } catch { toast.error('Erro ao sincronizar'); } finally { setSyncing(false); }
  };

  const disconnectAccount = async (integrationId: string) => {
    try {
      const { error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'disconnect', integration_id: integrationId }
      });
      if (error) throw error;
      toast.success('Conta desconectada');
      fetchIntegrations();
    } catch { toast.error('Erro ao desconectar'); }
  };

  const toggleAccount = async (integrationId: string, ativo: boolean) => {
    try {
      const { error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'toggle', integration_id: integrationId, ativo }
      });
      if (error) throw error;
      fetchIntegrations();
      toast.success(ativo ? 'Sincronização ativada' : 'Sincronização pausada');
    } catch { toast.error('Erro ao alterar'); }
  };

  const marcarLembreteVisualizado = async (lembreteId: string) => {
    await supabase.from('lembretes_disparados').update({ visualizado: true }).eq('id', lembreteId);
    fetchLembretes();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titulo || !formData.data_inicio || !formData.data_fim) { toast.error('Preencha os campos obrigatórios'); return; }
    try {
      const eventoData = {
        titulo: formData.titulo, descricao: formData.descricao, local: formData.local,
        tipo: formData.tipo || 'reuniao', cor: formData.cor || '#3b82f6',
        lembrete_minutos: formData.lembrete_minutos || [],
        data_inicio: toUTC(formData.data_inicio), data_fim: toUTC(formData.data_fim),
        user_id: user?.id!
      };
      if (editingEvento) {
        const { error } = await supabase.from('eventos').update(eventoData).eq('id', editingEvento.id);
        if (error) throw error;
        toast.success('Evento atualizado!');
      } else {
        const { error } = await supabase.from('eventos').insert([eventoData]);
        if (error) throw error;
        toast.success('Evento criado!');
      }
      setDialogOpen(false); setEditingEvento(null);
      setFormData({ tipo: 'reuniao', cor: '#3b82f6', lembrete_minutos: [15, 30] });
      fetchEventos();
    } catch { toast.error('Erro ao salvar evento'); }
  };

  const handleDelete = async () => {
    if (!editingEvento) return;
    try {
      const { error } = await supabase.from('eventos').delete().eq('id', editingEvento.id);
      if (error) throw error;
      toast.success('Evento excluído!');
      setDialogOpen(false); setEditingEvento(null); fetchEventos();
    } catch { toast.error('Erro ao excluir evento'); }
  };

  const changeView = (view: CalendarView) => {
    setActiveView(view);
    const api = calendarRef.current?.getApi();
    if (!api) return;
    const map: Record<CalendarView, string> = { month: 'dayGridMonth', week: 'timeGridWeek', day: 'timeGridDay', list: 'dayGridMonth' };
    api.changeView(map[view]);
  };

  const calendarEvents = eventos.map(evento => ({
    id: evento.id,
    title: evento.titulo,
    start: evento.data_inicio,
    end: evento.data_fim,
    backgroundColor: evento.cor,
    borderColor: evento.cor,
    extendedProps: { descricao: evento.descricao, local: evento.local, tipo: evento.tipo }
  }));

  const hoje = new Date();
  const eventosHoje = eventos.filter(e => new Date(e.data_inicio).toDateString() === hoje.toDateString());
  const eventosProximos = eventos.filter(e => {
    const d = new Date(e.data_inicio);
    return d > hoje && d < new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
  });
  const lembretesAtivos = eventos.reduce((total, evento) => {
    if (!evento.lembrete_minutos?.length) return total;
    return new Date(evento.data_inicio) > hoje ? total + evento.lembrete_minutos.length : total;
  }, 0);

  const viewButtons: { value: CalendarView; icon: React.ReactNode; label: string }[] = [
    { value: 'list', icon: <List className="h-4 w-4" />, label: 'Lista' },
    { value: 'month', icon: <LayoutGrid className="h-4 w-4" />, label: 'Mês' },
    { value: 'week', icon: <CalendarRange className="h-4 w-4" />, label: 'Semana' },
    { value: 'day', icon: <CalendarDays className="h-4 w-4" />, label: 'Dia' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              Agenda
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Eventos e compromissos</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Switcher */}
            <div className="flex items-center rounded-xl border bg-card p-0.5 gap-0.5">
              {viewButtons.map(v => (
                <button
                  key={v.value}
                  onClick={() => changeView(v.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeView === v.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {v.icon}
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
            </div>

            {/* Sync Management */}
            <Popover open={syncPopoverOpen} onOpenChange={setSyncPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 rounded-xl">
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Google</span>
                  {integrations.length > 0 && (
                    <Badge variant="secondary" className="h-5 min-w-5 px-1 rounded-full text-[10px]">
                      {integrations.filter(i => i.ativo).length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 rounded-2xl" align="end">
                <div className="p-4 border-b">
                  <h3 className="font-semibold text-sm">Contas Google Calendar</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Gerencie suas sincronizações</p>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {integrations.length === 0 ? (
                    <div className="p-6 text-center">
                      <CalendarIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">Nenhuma conta conectada</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {integrations.map(integration => (
                        <div key={integration.id} className="p-3 flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg ${integration.ativo ? 'bg-primary/10' : 'bg-muted'}`}>
                            <Mail className={`h-3.5 w-3.5 ${integration.ativo ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {integration.google_email || 'Conta Google'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {integration.last_sync_at
                                ? `Sync: ${new Date(integration.last_sync_at).toLocaleDateString('pt-BR')}`
                                : 'Nunca sincronizado'}
                            </p>
                          </div>
                          <Switch
                            checked={integration.ativo}
                            onCheckedChange={(checked) => toggleAccount(integration.id, checked)}
                            className="scale-75"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Desconectar"
                            onClick={() => disconnectAccount(integration.id)}
                          >
                            <Unlink2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 border-t space-y-2">
                  <Button
                    onClick={connectGoogleCalendar}
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 rounded-xl"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Conectar nova conta
                  </Button>
                  {integrations.some(i => i.ativo) && (
                    <Button
                      onClick={() => { setSyncPopoverOpen(false); syncWithGoogle(); }}
                      size="sm"
                      disabled={syncing}
                      className="w-full gap-2 rounded-xl"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                      Sincronizar tudo
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <Button
              onClick={() => {
                setEditingEvento(null);
                setFormData({ tipo: 'reuniao', cor: '#3b82f6', lembrete_minutos: [15, 30] });
                setDialogOpen(true);
              }}
              size="sm"
              className="gap-2 rounded-xl"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Evento</span>
            </Button>
          </div>
        </div>

        {/* Stats Widgets */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="rounded-2xl border-0 shadow-sm bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <CalendarDays className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{eventosHoje.length}</p>
                  <p className="text-[11px] text-muted-foreground">Hoje</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 shadow-sm bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/10">
                  <Clock className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{eventosProximos.length}</p>
                  <p className="text-[11px] text-muted-foreground">Próx. 7 dias</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 shadow-sm bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/10">
                  <Bell className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{lembretesAtivos}</p>
                  <p className="text-[11px] text-muted-foreground">Lembretes</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 shadow-sm bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-green-500/10">
                  <RefreshCw className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{integrations.filter(i => i.ativo).length}</p>
                  <p className="text-[11px] text-muted-foreground">Contas sync</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Reminders */}
        {lembretes.length > 0 && (
          <Card className="rounded-2xl border-amber-200/50 bg-amber-50/30 dark:bg-amber-950/10">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Lembretes Pendentes</span>
              </div>
              <div className="space-y-1.5">
                {lembretes.slice(0, 3).map(lembrete => (
                  <div key={lembrete.id} className="flex items-center justify-between p-2.5 bg-card rounded-xl border">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-1.5 h-8 rounded-full bg-amber-400" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{lembrete.evento.titulo}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(lembrete.evento.data_inicio).toLocaleString('pt-BR', {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => marcarLembreteVisualizado(lembrete.id)} className="h-7 w-7 shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Calendar */}
          <Card className={`rounded-2xl border-0 shadow-sm ${activeView === 'list' ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
            <CardContent className="p-4">
              {activeView === 'list' ? (() => {
                const eventosUpcoming = eventos
                  .filter(e => new Date(e.data_inicio) >= hoje)
                  .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
                const eventosPast = eventos
                  .filter(e => new Date(e.data_inicio) < hoje)
                  .sort((a, b) => new Date(b.data_inicio).getTime() - new Date(a.data_inicio).getTime());
                const listaAtual = listTab === 'upcoming' ? eventosUpcoming : eventosPast;

                return (
                <div className="space-y-3">
                  <div className="flex items-center gap-1 rounded-xl border bg-muted/30 p-0.5 w-fit">
                    <button
                      onClick={() => setListTab('upcoming')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        listTab === 'upcoming'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Próximos ({eventosUpcoming.length})
                    </button>
                    <button
                      onClick={() => setListTab('past')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        listTab === 'past'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Passados ({eventosPast.length})
                    </button>
                  </div>

                  {listaAtual.length === 0 ? (
                    <div className="py-12 text-center">
                      <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {listTab === 'upcoming' ? 'Nenhum evento futuro' : 'Nenhum evento passado'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                    {listaAtual.map(evento => {
                      const d = new Date(evento.data_inicio);
                      const isPast = d < hoje;
                      return (
                        <button
                          key={evento.id}
                          onClick={() => { setEditingEvento(evento); setFormData(evento); setDialogOpen(true); }}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/50 transition-colors text-left ${isPast ? 'opacity-50' : ''}`}
                        >
                          <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: evento.cor }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{evento.titulo}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span>{d.toLocaleDateString('pt-BR')} • {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                              {evento.local && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{evento.local}</span>}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {tiposEvento.find(t => t.value === evento.tipo)?.icon} {tiposEvento.find(t => t.value === evento.tipo)?.label}
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                    </div>
                  )}
                </div>
                )
              })() : (
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  locale="pt-br"
                  headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: ''
                  }}
                  buttonText={{ today: 'Hoje' }}
                  events={calendarEvents}
                  editable={true}
                  selectable={true}
                  selectMirror={true}
                  dayMaxEvents={true}
                  weekends={true}
                  eventClick={(info) => {
                    const evento = eventos.find(e => e.id === info.event.id);
                    if (evento) { setEditingEvento(evento); setFormData(evento); setDialogOpen(true); }
                  }}
                  select={(info) => {
                    setEditingEvento(null);
                    setFormData({ tipo: 'reuniao', cor: '#3b82f6', lembrete_minutos: [15, 30], data_inicio: info.startStr, data_fim: info.endStr });
                    setDialogOpen(true);
                  }}
                  height="auto"
                  contentHeight={560}
                />
              )}
            </CardContent>
          </Card>

          {/* Side Panel - Today's events (list view only) */}
          {activeView === 'list' && (
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Hoje
                </h3>
                {eventosHoje.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Sem eventos hoje</p>
                ) : (
                  <div className="space-y-2">
                    {eventosHoje.map(evento => (
                      <button
                        key={evento.id}
                        onClick={() => { setEditingEvento(evento); setFormData(evento); setDialogOpen(true); }}
                        className="w-full p-2.5 rounded-xl border hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-6 rounded-full" style={{ backgroundColor: evento.cor }} />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{evento.titulo}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(evento.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Event Dialog */}
        <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
            <DialogHeader className="border-b pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10">
                    <CalendarIcon className="h-5 w-5 text-primary" />
                  </div>
                  <DialogTitle className="text-lg">
                    {editingEvento ? 'Editar Evento' : 'Novo Evento'}
                  </DialogTitle>
                </div>
                {editingEvento && (
                  <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:text-destructive h-8 w-8">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-5 pt-4">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="titulo" className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Título *
                  </Label>
                  <Input id="titulo" value={formData.titulo || ''} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} placeholder="Ex: Reunião com cliente" required className="h-10 rounded-xl" />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="descricao" className="text-xs">Descrição</Label>
                  <Textarea id="descricao" value={formData.descricao || ''} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} rows={2} placeholder="Detalhes do evento..." className="rounded-xl" />
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                      <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {tiposEvento.map(t => (
                          <SelectItem key={t.value} value={t.value}>
                            <span className="flex items-center gap-2"><span>{t.icon}</span>{t.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="flex items-center gap-2 text-xs"><Palette className="h-3.5 w-3.5" /> Cor</Label>
                    <div className="flex gap-1.5 mt-1">
                      {coresEvento.map(cor => (
                        <button
                          key={cor.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, cor: cor.value })}
                          className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${formData.cor === cor.value ? 'border-foreground scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: cor.value }}
                          title={cor.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label className="flex items-center gap-2 text-xs"><Clock className="h-3.5 w-3.5" /> Início *</Label>
                    <Input type="datetime-local" value={toDateTimeLocal(formData.data_inicio || '')} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} required className="h-10 rounded-xl" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="flex items-center gap-2 text-xs"><Clock className="h-3.5 w-3.5" /> Fim *</Label>
                    <Input type="datetime-local" value={toDateTimeLocal(formData.data_fim || '')} onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })} required className="h-10 rounded-xl" />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label className="flex items-center gap-2 text-xs"><MapPin className="h-3.5 w-3.5" /> Local</Label>
                  <Input value={formData.local || ''} onChange={(e) => setFormData({ ...formData, local: e.target.value })} placeholder="Sala de reuniões, endereço..." className="h-10 rounded-xl" />
                </div>

                <div className="grid gap-2">
                  <Label className="flex items-center gap-2 text-xs"><Bell className="h-3.5 w-3.5" /> Lembretes</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {[5, 15, 30, 60].map(minutos => (
                      <Badge
                        key={minutos}
                        variant={formData.lembrete_minutos?.includes(minutos) ? "default" : "outline"}
                        className="cursor-pointer hover:scale-105 transition-transform text-xs rounded-lg"
                        onClick={() => {
                          const l = formData.lembrete_minutos || [];
                          setFormData({ ...formData, lembrete_minutos: l.includes(minutos) ? l.filter(m => m !== minutos) : [...l, minutos] });
                        }}
                      >
                        {minutos}min
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Cancelar</Button>
                <Button type="submit" className="rounded-xl">{editingEvento ? 'Salvar' : 'Criar Evento'}</Button>
              </div>
            </form>
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </div>
    </div>
  );
}
