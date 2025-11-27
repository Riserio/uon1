import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { toUTC, toDateTimeLocal } from "@/utils/dateUtils";

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

interface Lembrete {
  id: string;
  evento_id: string;
  evento: Evento;
  visualizado: boolean;
  disparado_em: string;
}

const tiposEvento = [
  { value: "reuniao", label: "Reunião", icon: "👥" },
  { value: "tarefa", label: "Tarefa", icon: "✓" },
  { value: "compromisso", label: "Compromisso", icon: "📅" },
  { value: "lembrete", label: "Lembrete", icon: "🔔" },
];

const coresEvento = [
  { value: "#3b82f6", label: "Azul" },
  { value: "#10b981", label: "Verde" },
  { value: "#f59e0b", label: "Laranja" },
  { value: "#ef4444", label: "Vermelho" },
  { value: "#8b5cf6", label: "Roxo" },
  { value: "#ec4899", label: "Rosa" },
];

export default function Agenda() {
  const { user } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvento, setEditingEvento] = useState<Evento | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [formData, setFormData] = useState<Partial<Evento>>({
    tipo: "reuniao",
    cor: "#3b82f6",
    lembrete_minutos: [15, 30],
  });
  const [lembreteFrequencia, setLembreteFrequencia] = useState(60000);
  const calendarRef = useRef<FullCalendar>(null);

  useEffect(() => {
    if (user) {
      fetchEventos();
      fetchLembretes();
      checkGoogleConnection();

      const interval = setInterval(() => {
        verificarLembretes();
      }, lembreteFrequencia);

      return () => clearInterval(interval);
    }
  }, [user, lembreteFrequencia]);

  const checkGoogleConnection = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("google_calendar_integrations")
      .select("id")
      .eq("user_id", user.id)
      .single();

    setGoogleConnected(!error && !!data);
  };

  const connectGoogleCalendar = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();

      if (!session?.session) {
        toast.error("Você precisa estar autenticado");
        return;
      }

      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        "about:blank",
        "google_oauth",
        `width=${width},height=${height},left=${left},top=${top}`,
      );

      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "authorize" },
      });

      if (error) {
        if (popup) popup.close();
        console.error("Erro ao autorizar:", error);
        toast.error("Erro ao conectar com Google Calendar");
        return;
      }

      if (data?.authUrl) {
        if (popup && !popup.closed) {
          popup.location.href = data.authUrl;
        }

        const checkPopup = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkPopup);
            checkGoogleConnection();
            toast.success("Google Calendar conectado!");
          }
        }, 1000);
      }
    } catch (error) {
      console.error("Erro ao conectar Google Calendar:", error);
      toast.error("Erro ao conectar com Google Calendar");
    }
  };

  const syncWithGoogle = async () => {
    if (!googleConnected) {
      toast.error("Conecte o Google Calendar antes de sincronizar.");
      return;
    }

    setSyncing(true);
    try {
      const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionResult?.session) {
        toast.error("Você precisa estar autenticado");
        return;
      }

      // Invoca a Edge Function de sync
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "sync" },
        // Não precisa setar Authorization manualmente:
        // o supabase client já envia o JWT do usuário logado.
      });

      if (error) {
        console.error("Erro ao chamar google-calendar-sync:", error);
        throw error;
      }

      if (data && (data as any).error) {
        console.error("Erro retornado pela função google-calendar-sync:", (data as any).error);
        throw new Error((data as any).error);
      }

      toast.success("Sincronização concluída!");
      await fetchEventos();
    } catch (error) {
      console.error("Erro ao sincronizar com Google Calendar:", error);
      toast.error("Erro ao sincronizar com Google Calendar");
    } finally {
      setSyncing(false);
    }
  };

  const fetchEventos = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("eventos")
      .select("*")
      .eq("user_id", user.id)
      .order("data_inicio", { ascending: true });

    if (error) {
      console.error("Erro ao carregar eventos:", error);
      toast.error("Erro ao carregar eventos");
      return;
    }

    setEventos(data || []);
  };

  const fetchLembretes = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("lembretes_disparados")
      .select(
        `
        *,
        evento:eventos(*)
      `,
      )
      .eq("user_id", user.id)
      .eq("visualizado", false)
      .order("disparado_em", { ascending: false });

    if (error) {
      console.error("Erro ao carregar lembretes:", error);
      return;
    }

    setLembretes(data || []);
  };

  const verificarLembretes = async () => {
    if (!user?.id) return;

    const agora = new Date();

    for (const evento of eventos) {
      if (!evento.lembrete_minutos || evento.lembrete_minutos.length === 0) continue;

      const dataEvento = new Date(evento.data_inicio);
      const diffMinutos = Math.floor((dataEvento.getTime() - agora.getTime()) / 60000);

      for (const minutos of evento.lembrete_minutos) {
        if (Math.abs(diffMinutos - minutos) <= 1) {
          const { data: existente } = await supabase
            .from("lembretes_disparados")
            .select("id")
            .eq("evento_id", evento.id)
            .eq("user_id", user.id)
            .gte("disparado_em", new Date(agora.getTime() - 5 * 60000).toISOString());

          if (!existente || existente.length === 0) {
            const { error } = await supabase.from("lembretes_disparados").insert({
              evento_id: evento.id,
              user_id: user.id,
              disparado_em: new Date().toISOString(),
            });

            if (!error) {
              toast(`🔔 Lembrete: ${evento.titulo}`, {
                description: `Evento em ${minutos} minutos às ${new Date(evento.data_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
              });
            }
          }
        }
      }
    }

    fetchLembretes();
  };

  const marcarLembreteVisualizado = async (lembreteId: string) => {
    const { error } = await supabase.from("lembretes_disparados").update({ visualizado: true }).eq("id", lembreteId);

    if (!error) {
      fetchLembretes();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.titulo || !formData.data_inicio || !formData.data_fim) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      const eventoData = {
        titulo: formData.titulo,
        descricao: formData.descricao,
        local: formData.local,
        tipo: formData.tipo || "reuniao",
        cor: formData.cor || "#3b82f6",
        lembrete_minutos: formData.lembrete_minutos || [],
        data_inicio: toUTC(formData.data_inicio),
        data_fim: toUTC(formData.data_fim),
        user_id: user?.id!,
      };

      if (editingEvento) {
        const { error } = await supabase.from("eventos").update(eventoData).eq("id", editingEvento.id);

        if (error) throw error;
        toast.success("Evento atualizado!");
      } else {
        const { error } = await supabase.from("eventos").insert([eventoData]);

        if (error) throw error;
        toast.success("Evento criado!");
      }

      setDialogOpen(false);
      setEditingEvento(null);
      setFormData({
        tipo: "reuniao",
        cor: "#3b82f6",
        lembrete_minutos: [15, 30],
      });
      fetchEventos();
    } catch (error) {
      console.error("Erro ao salvar evento:", error);
      toast.error("Erro ao salvar evento");
    }
  };

  const handleDelete = async () => {
    if (!editingEvento) return;

    try {
      const { error } = await supabase.from("eventos").delete().eq("id", editingEvento.id);

      if (error) throw error;

      toast.success("Evento excluído!");
      setDialogOpen(false);
      setEditingEvento(null);
      fetchEventos();
    } catch (error) {
      console.error("Erro ao excluir evento:", error);
      toast.error("Erro ao excluir evento");
    }
  };

  const calendarEvents = eventos.map((evento) => ({
    id: evento.id,
    title: evento.titulo,
    start: evento.data_inicio,
    end: evento.data_fim,
    backgroundColor: evento.cor,
    borderColor: evento.cor,
    extendedProps: {
      descricao: evento.descricao,
      local: evento.local,
      tipo: evento.tipo,
    },
  }));

  const hoje = new Date();
  const eventosHoje = eventos.filter((e) => {
    const dataEvento = new Date(e.data_inicio);
    return dataEvento.toDateString() === hoje.toDateString();
  }).length;

  const eventosProximos = eventos.filter((e) => {
    const dataEvento = new Date(e.data_inicio);
    return dataEvento > hoje && dataEvento < new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
  }).length;

  const lembretesAtivos = eventos.reduce((total, evento) => {
    if (!evento.lembrete_minutos || evento.lembrete_minutos.length === 0) return total;
    const dataEvento = new Date(evento.data_inicio);
    if (dataEvento > hoje) {
      return total + evento.lembrete_minutos.length;
    }
    return total;
  }, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CalendarDays className="h-7 w-7 text-primary" />
              </div>
              Agenda
            </h1>
            <p className="text-muted-foreground mt-1">Gerencie seus eventos e compromissos</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => {
                setEditingEvento(null);
                setFormData({
                  tipo: "reuniao",
                  cor: "#3b82f6",
                  lembrete_minutos: [15, 30],
                });
                setDialogOpen(true);
              }}
              size="lg"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Novo Evento
            </Button>

            {googleConnected ? (
              <Button variant="outline" onClick={syncWithGoogle} disabled={syncing} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Sincronizando..." : "Sincronizar"}
              </Button>
            ) : (
              <Button variant="outline" onClick={connectGoogleCalendar} className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                Conectar Google
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Eventos Hoje</CardTitle>
                <div className="p-1.5 rounded-full bg-primary/10">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
              <div className="text-xl font-bold">{eventosHoje}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Próximos 7 Dias</CardTitle>
                <div className="p-1.5 rounded-full bg-blue-500/10">
                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                </div>
              </div>
              <div className="text-xl font-bold">{eventosProximos}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Lembretes Ativos</CardTitle>
                <div className="p-1.5 rounded-full bg-amber-500/10">
                  <Bell className="h-3.5 w-3.5 text-amber-500" />
                </div>
              </div>
              <div className="text-xl font-bold">{lembretesAtivos}</div>
            </CardContent>
          </Card>
        </div>

        {lembretes.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Lembretes Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {lembretes.map((lembrete) => (
                <div
                  key={lembrete.id}
                  className="flex items-center justify-between p-3 bg-background rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-amber-500/10">
                      <Bell className="h-4 w-4 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{lembrete.evento.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(lembrete.evento.data_inicio).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => marcarLembreteVisualizado(lembrete.id)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-6">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale="pt-br"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay",
              }}
              buttonText={{
                today: "Hoje",
                month: "Mês",
                week: "Semana",
                day: "Dia",
              }}
              events={calendarEvents}
              editable={true}
              selectable={true}
              selectMirror={true}
              dayMaxEvents={true}
              weekends={true}
              eventClick={(info) => {
                const evento = eventos.find((e) => e.id === info.event.id);
                if (evento) {
                  setEditingEvento(evento);
                  setFormData(evento);
                  setDialogOpen(true);
                }
              }}
              select={(info) => {
                setEditingEvento(null);
                setFormData({
                  tipo: "reuniao",
                  cor: "#3b82f6",
                  lembrete_minutos: [15, 30],
                  data_inicio: info.startStr,
                  data_fim: info.endStr,
                });
                setDialogOpen(true);
              }}
              height="auto"
              contentHeight={600}
            />
          </CardContent>
        </Card>

        <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <CalendarIcon className="h-5 w-5 text-primary" />
                  </div>
                  <DialogTitle className="text-xl">{editingEvento ? "Editar Evento" : "Novo Evento"}</DialogTitle>
                </div>
                {editingEvento && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDelete}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6 pt-4">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="titulo" className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Título *
                  </Label>
                  <Input
                    id="titulo"
                    value={formData.titulo || ""}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    placeholder="Ex: Reunião com cliente"
                    required
                    className="h-11"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea
                    id="descricao"
                    value={formData.descricao || ""}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    rows={3}
                    placeholder="Adicione detalhes sobre o evento..."
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="tipo">Tipo</Label>
                    <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposEvento.map((tipo) => (
                          <SelectItem key={tipo.value} value={tipo.value}>
                            <span className="flex items-center gap-2">
                              <span>{tipo.icon}</span>
                              {tipo.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="cor" className="flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      Cor
                    </Label>
                    <Select value={formData.cor} onValueChange={(value) => setFormData({ ...formData, cor: value })}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {coresEvento.map((cor) => (
                          <SelectItem key={cor.value} value={cor.value}>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: cor.value }} />
                              {cor.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="data_inicio" className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Data/Hora Início *
                    </Label>
                    <Input
                      id="data_inicio"
                      type="datetime-local"
                      value={toDateTimeLocal(formData.data_inicio || "")}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          data_inicio: e.target.value,
                        })
                      }
                      required
                      className="h-11"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="data_fim" className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Data/Hora Fim *
                    </Label>
                    <Input
                      id="data_fim"
                      type="datetime-local"
                      value={toDateTimeLocal(formData.data_fim || "")}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          data_fim: e.target.value,
                        })
                      }
                      required
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="local" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Local
                  </Label>
                  <Input
                    id="local"
                    value={formData.local || ""}
                    onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                    placeholder="Ex: Sala de reuniões, endereço..."
                    className="h-11"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Lembretes
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {[5, 15, 30, 60].map((minutos) => (
                      <Badge
                        key={minutos}
                        variant={formData.lembrete_minutos?.includes(minutos) ? "default" : "outline"}
                        className="cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => {
                          const lembretes = formData.lembrete_minutos || [];
                          if (lembretes.includes(minutos)) {
                            setFormData({
                              ...formData,
                              lembrete_minutos: lembretes.filter((m) => m !== minutos),
                            });
                          } else {
                            setFormData({
                              ...formData,
                              lembrete_minutos: [...lembretes, minutos],
                            });
                          }
                        }}
                      >
                        {minutos} min antes
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="lg">
                  {editingEvento ? "Salvar Alterações" : "Criar Evento"}
                </Button>
              </div>
            </form>
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </div>
    </div>
  );
}
