import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Video, Plus, Copy, ExternalLink, Trash2, Calendar, Users, Clock, Phone, X, CalendarPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toUTC, toDateTimeLocal } from "@/utils/dateUtils";

interface Reuniao {
  id: string;
  titulo: string;
  descricao?: string;
  data_inicio: string;
  data_fim: string;
  sala_id: string;
  status: string;
  participantes: { nome: string; email: string }[];
  google_event_id?: string;
  link_convite?: string;
  max_participantes: number;
  created_at: string;
}

const JITSI_DOMAIN = "talk.uon1.com.br";

export default function Talk() {
  const { user } = useAuth();
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [salaAtiva, setSalaAtiva] = useState<Reuniao | null>(null);
  const [editingReuniao, setEditingReuniao] = useState<Reuniao | null>(null);
  const [participanteNome, setParticipanteNome] = useState("");
  const [participanteEmail, setParticipanteEmail] = useState("");
  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
    data_inicio: "",
    data_fim: "",
    participantes: [] as { nome: string; email: string }[],
  });

  useEffect(() => {
    if (user) fetchReunioes();
  }, [user]);

  const fetchReunioes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reunioes")
      .select("*")
      .eq("user_id", user?.id)
      .order("data_inicio", { ascending: false });

    if (error) {
      console.error("Erro ao carregar reuniões:", error);
      toast.error("Erro ao carregar reuniões");
    } else {
      setReunioes((data as unknown as Reuniao[]) || []);
    }
    setLoading(false);
  };

  const openNewDialog = () => {
    setEditingReuniao(null);
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    setFormData({
      titulo: "",
      descricao: "",
      data_inicio: toDateTimeLocal(now),
      data_fim: toDateTimeLocal(end),
      participantes: [],
    });
    setDialogOpen(true);
  };

  const openEditDialog = (reuniao: Reuniao) => {
    setEditingReuniao(reuniao);
    setFormData({
      titulo: reuniao.titulo,
      descricao: reuniao.descricao || "",
      data_inicio: toDateTimeLocal(reuniao.data_inicio),
      data_fim: toDateTimeLocal(reuniao.data_fim),
      participantes: (reuniao.participantes as { nome: string; email: string }[]) || [],
    });
    setDialogOpen(true);
  };

  const addParticipante = () => {
    if (!participanteNome || !participanteEmail) return;
    setFormData((prev) => ({
      ...prev,
      participantes: [...prev.participantes, { nome: participanteNome, email: participanteEmail }],
    }));
    setParticipanteNome("");
    setParticipanteEmail("");
  };

  const removeParticipante = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      participantes: prev.participantes.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titulo || !formData.data_inicio || !formData.data_fim) {
      toast.error("Preencha título e datas");
      return;
    }

    try {
      const payload = {
        titulo: formData.titulo,
        descricao: formData.descricao || null,
        data_inicio: toUTC(formData.data_inicio),
        data_fim: toUTC(formData.data_fim),
        participantes: formData.participantes,
        user_id: user?.id!,
      };

      if (editingReuniao) {
        const { error } = await supabase.from("reunioes").update(payload).eq("id", editingReuniao.id);
        if (error) throw error;
        toast.success("Reunião atualizada!");
      } else {
        const { error } = await supabase.from("reunioes").insert([payload]);
        if (error) throw error;
        toast.success("Reunião criada!");
      }

      setDialogOpen(false);
      fetchReunioes();
    } catch (error) {
      console.error("Erro ao salvar reunião:", error);
      toast.error("Erro ao salvar reunião");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta reunião?")) return;
    const { error } = await supabase.from("reunioes").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Reunião excluída");
      fetchReunioes();
    }
  };

  const iniciarReuniao = (reuniao: Reuniao) => {
    setSalaAtiva(reuniao);
    // Atualizar status
    supabase.from("reunioes").update({ status: "em_andamento" }).eq("id", reuniao.id).then();
  };

  const encerrarReuniao = () => {
    if (salaAtiva) {
      supabase.from("reunioes").update({ status: "finalizada" }).eq("id", salaAtiva.id).then();
    }
    setSalaAtiva(null);
    fetchReunioes();
  };

  const copiarLink = (reuniao: Reuniao) => {
    const link = `https://${JITSI_DOMAIN}/uon1-talk-${reuniao.sala_id}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
  };

  const salvarNoGoogle = async (reuniao: Reuniao) => {
    try {
      // Verificar se Google Calendar está conectado
      const { data: integration } = await supabase
        .from("google_calendar_integrations")
        .select("id")
        .eq("user_id", user?.id)
        .single();

      if (!integration) {
        toast.error("Conecte o Google Calendar primeiro na Agenda");
        return;
      }

      // Criar evento na tabela eventos (que sincroniza com Google)
      const { error } = await supabase.from("eventos").insert([
        {
          user_id: user?.id,
          titulo: `🎥 ${reuniao.titulo}`,
          descricao: `Reunião UON1 Talk\n\nLink: https://${JITSI_DOMAIN}/uon1-talk-${reuniao.sala_id}\n\n${reuniao.descricao || ""}`,
          data_inicio: reuniao.data_inicio,
          data_fim: reuniao.data_fim,
          local: `https://${JITSI_DOMAIN}/uon1-talk-${reuniao.sala_id}`,
          tipo: "reuniao",
          cor: "#8b5cf6",
          lembrete_minutos: [15, 5],
        },
      ]);

      if (error) throw error;
      toast.success("Evento salvo na agenda! Sincronize com o Google Calendar na página de Agenda.");
    } catch (error) {
      console.error("Erro ao salvar no Google:", error);
      toast.error("Erro ao salvar na agenda");
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      agendada: { label: "Agendada", variant: "outline" },
      em_andamento: { label: "Em andamento", variant: "default" },
      finalizada: { label: "Finalizada", variant: "secondary" },
      cancelada: { label: "Cancelada", variant: "destructive" },
    };
    const info = map[status] || map.agendada;
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const reunioesAgendadas = reunioes.filter((r) => r.status === "agendada" || r.status === "em_andamento");
  const reunioesPassadas = reunioes.filter((r) => r.status === "finalizada" || r.status === "cancelada");

  // ============= SALA JITSI ATIVA =============
  if (salaAtiva) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-card border-b">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Video className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">{salaAtiva.titulo}</h2>
              <p className="text-xs text-muted-foreground">Talk by UON1</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => copiarLink(salaAtiva)}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar Link
            </Button>
            <Button size="sm" variant="destructive" onClick={encerrarReuniao}>
              <Phone className="h-3.5 w-3.5 mr-1" /> Encerrar
            </Button>
          </div>
        </div>
        <iframe
          src={`https://${JITSI_DOMAIN}/uon1-talk-${salaAtiva.sala_id}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.SHOW_WATERMARK_FOR_GUESTS=false&interfaceConfig.DEFAULT_BACKGROUND='#1a1a2e'`}
          allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
          className="flex-1 w-full border-0"
          title="UON1 Talk - Videoconferência"
        />
      </div>
    );
  }

  // ============= PÁGINA PRINCIPAL =============
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Video className="h-7 w-7 text-primary" />
              </div>
              Uon1 Talk
            </h1>
            <p className="text-muted-foreground mt-1">Videoconferências e reuniões online</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={openNewDialog} size="lg" className="gap-2">
              <Plus className="h-4 w-4" /> Nova Reunião
            </Button>

            {/* ✅ ALTERADO: Reunião Instantânea abre no talk.uon1.com.br também */}
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                // Reunião instantânea
                const instantId = crypto.randomUUID().substring(0, 8);
                const reuniaoInstantanea: Reuniao = {
                  id: "instant",
                  titulo: "Reunião Instantânea",
                  data_inicio: new Date().toISOString(),
                  data_fim: new Date(Date.now() + 3600000).toISOString(),
                  sala_id: instantId,
                  status: "em_andamento",
                  participantes: [],
                  max_participantes: 50,
                  created_at: new Date().toISOString(),
                };

                // mantém abertura interna
                setSalaAtiva(reuniaoInstantanea);

                // abre também pelo domínio oficial (igual ao botão Entrar / link)
                const url = `https://${JITSI_DOMAIN}/uon1-talk-${instantId}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              className="gap-2"
            >
              <Phone className="h-4 w-4" /> Reunião Instantânea
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Agendadas</p>
                  <p className="text-2xl font-bold">{reunioesAgendadas.length}</p>
                </div>
                <div className="p-2 rounded-full bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total de Reuniões</p>
                  <p className="text-2xl font-bold">{reunioes.length}</p>
                </div>
                <div className="p-2 rounded-full bg-secondary">
                  <Video className="h-5 w-5 text-secondary-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Participantes Convidados</p>
                  <p className="text-2xl font-bold">
                    {reunioes.reduce((sum, r) => sum + ((r.participantes as any[])?.length || 0), 0)}
                  </p>
                </div>
                <div className="p-2 rounded-full bg-accent">
                  <Users className="h-5 w-5 text-accent-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reuniões Agendadas */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Reuniões Ativas
          </h2>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : reunioesAgendadas.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">Nenhuma reunião agendada</p>
                <Button onClick={openNewDialog} variant="outline" className="mt-4 gap-2">
                  <Plus className="h-4 w-4" /> Agendar Reunião
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {reunioesAgendadas.map((reuniao) => (
                <Card key={reuniao.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{reuniao.titulo}</h3>
                          {getStatusBadge(reuniao.status)}
                        </div>
                        {reuniao.descricao && (
                          <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{reuniao.descricao}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(reuniao.data_inicio).toLocaleDateString("pt-BR")} às{" "}
                            {new Date(reuniao.data_inicio).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {(reuniao.participantes as any[])?.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {(reuniao.participantes as any[]).length} participante(s)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button size="sm" onClick={() => iniciarReuniao(reuniao)} className="gap-1.5">
                          <Video className="h-3.5 w-3.5" /> Entrar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copiarLink(reuniao)} title="Copiar link">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => salvarNoGoogle(reuniao)}
                          title="Salvar na agenda Google"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(reuniao)} title="Editar">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(reuniao.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Reuniões Passadas */}
        {reunioesPassadas.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5" /> Histórico
            </h2>
            <div className="grid gap-3">
              {reunioesPassadas.map((reuniao) => (
                <Card key={reuniao.id} className="opacity-70">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{reuniao.titulo}</h3>
                          {getStatusBadge(reuniao.status)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(reuniao.data_inicio).toLocaleDateString("pt-BR")} às{" "}
                          {new Date(reuniao.data_inicio).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(reuniao.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dialog Nova/Editar Reunião */}
      <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <ResponsiveDialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingReuniao ? "Editar Reunião" : "Nova Reunião"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={formData.titulo}
                onChange={(e) => setFormData((prev) => ({ ...prev, titulo: e.target.value }))}
                placeholder="Ex: Reunião de alinhamento"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.descricao}
                onChange={(e) => setFormData((prev) => ({ ...prev, descricao: e.target.value }))}
                placeholder="Pauta da reunião..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início *</Label>
                <Input
                  type="datetime-local"
                  value={formData.data_inicio}
                  onChange={(e) => setFormData((prev) => ({ ...prev, data_inicio: e.target.value }))}
                />
              </div>
              <div>
                <Label>Fim *</Label>
                <Input
                  type="datetime-local"
                  value={formData.data_fim}
                  onChange={(e) => setFormData((prev) => ({ ...prev, data_fim: e.target.value }))}
                />
              </div>
            </div>

            <Separator />

            {/* Participantes */}
            <div>
              <Label className="mb-2 block">Participantes</Label>
              {formData.participantes.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {formData.participantes.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                      <span>
                        {p.nome} ({p.email})
                      </span>
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeParticipante(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Nome"
                  value={participanteNome}
                  onChange={(e) => setParticipanteNome(e.target.value)}
                  className="flex-1"
                />

                <Input
                  placeholder="Email"
                  type="email"
                  value={participanteEmail}
                  onChange={(e) => setParticipanteEmail(e.target.value)}
                  className="flex-1"
                />

                <Button type="button" variant="outline" onClick={addParticipante} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editingReuniao ? "Salvar" : "Criar Reunião"}</Button>
            </div>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
