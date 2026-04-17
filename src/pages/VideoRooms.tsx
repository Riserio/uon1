import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Video, Plus, Copy, Trash2, Calendar, Users, Clock, Link2, MessageSquare, Pencil, BarChart3, Timer, TrendingUp, CheckCircle2, RotateCcw, Play } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import CriarReuniaoDialog from "@/components/CriarReuniaoDialog";
import EditarReuniaoDialog from "@/components/EditarReuniaoDialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { PageHeader } from "@/components/ui/page-header";

interface MeetingRoom {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string;
  status: string;
  host_id: string;
  livekit_room_name: string;
  max_participantes: number;
  created_at: string;
  agendado_para: string | null;
  duracao_minutos: number | null;
  finalizado_em: string | null;
  convidados: any[] | null;
  meeting_participants?: { id: string; display_name: string; status: string; is_host: boolean }[];
}

export default function VideoRooms() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [editRoom, setEditRoom] = useState<MeetingRoom | null>(null);
  const [activeTab, setActiveTab] = useState("salas");
  const [rsvpMap, setRsvpMap] = useState<Record<string, { sim: number; nao: number; talvez: number; pendente: number }>>({});

  // Auto-finalize expired rooms then fetch
  const autoFinalizeExpired = async () => {
    try {
      const { data: activeRooms } = await supabase
        .from("meeting_rooms")
        .select("id, agendado_para, duracao_minutos, host_id, created_at")
        .eq("status", "ativa");

      if (activeRooms && activeRooms.length > 0) {
        const now = new Date();
        const session = (await supabase.auth.getSession()).data.session;
        
        for (const room of activeRooms) {
          let shouldFinalize = false;
          
          if (room.agendado_para && room.duracao_minutos) {
            // Has schedule + duration: finalize when end time passed
            const endTime = new Date(new Date(room.agendado_para).getTime() + room.duracao_minutos * 60000);
            shouldFinalize = now > endTime;
          } else if (room.agendado_para && !room.duracao_minutos) {
            // Has schedule but no duration: finalize if scheduled time was > 2 hours ago
            const scheduledTime = new Date(room.agendado_para);
            shouldFinalize = now.getTime() - scheduledTime.getTime() > 2 * 60 * 60 * 1000;
          } else if (!room.agendado_para) {
            // No schedule at all: finalize if created > 4 hours ago
            const createdTime = new Date(room.created_at);
            shouldFinalize = now.getTime() - createdTime.getTime() > 4 * 60 * 60 * 1000;
          }

          if (shouldFinalize) {
            try {
              await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=endRoom`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${session?.access_token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ roomId: room.id }),
                }
              );
            } catch {
              await supabase
                .from("meeting_rooms")
                .update({ status: "finalizada", finalizado_em: now.toISOString() })
                .eq("id", room.id);
            }
          }
        }
      }
    } catch (e) {
      console.error("Erro ao auto-finalizar salas:", e);
    }
  };

  useEffect(() => {
    if (user) {
      autoFinalizeExpired().then(() => fetchRooms());
    }
  }, [user]);

  // Poll for auto-finalization every 60 seconds
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      autoFinalizeExpired().then(() => fetchRooms());
    }, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("meeting_rooms")
        .select("*, meeting_participants(id, display_name, status, is_host)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const roomsList = (data || []) as unknown as MeetingRoom[];
      setRooms(roomsList);

      const roomIds = roomsList.map(r => r.id);
      if (roomIds.length > 0) {
        const { data: rsvpData } = await supabase
          .from("meeting_rsvp")
          .select("room_id, resposta")
          .in("room_id", roomIds);
        const map: Record<string, { sim: number; nao: number; talvez: number; pendente: number }> = {};
        for (const r of roomsList) {
          const rsvps = (rsvpData || []).filter(rv => rv.room_id === r.id);
          const totalConvidados = (r.convidados as any[])?.length || 0;
          const sim = rsvps.filter(rv => rv.resposta === 'sim').length;
          const nao = rsvps.filter(rv => rv.resposta === 'nao').length;
          const talvez = rsvps.filter(rv => rv.resposta === 'talvez').length;
          const respondidos = sim + nao + talvez;
          map[r.id] = { sim, nao, talvez, pendente: Math.max(0, totalConvidados - respondidos) };
        }
        setRsvpMap(map);
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar salas");
    }
    setLoading(false);
  };

  const handleEndRoom = async (roomId: string) => {
    if (!confirm("Encerrar esta sala?")) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=endRoom`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomId }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success("Sala encerrada");
      fetchRooms();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReopenRoom = async (roomId: string) => {
    if (!confirm("Reabrir esta sala?")) return;
    try {
      const { error } = await supabase
        .from("meeting_rooms")
        .update({ status: "ativa", finalizado_em: null })
        .eq("id", roomId);
      if (error) throw error;
      toast.success("Sala reaberta com sucesso!");
      fetchRooms();
    } catch (e: any) {
      toast.error(e.message || "Erro ao reabrir sala");
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm("Apagar permanentemente esta reunião do histórico?")) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=deleteRoom`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomId }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success("Reunião apagada");
      fetchRooms();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCreateInvite = async (roomId: string) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=createInvite`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomId }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const link = `${window.location.origin}/invite/${data.invite.id}`;
      setInviteLink(link);
      setSelectedRoomId(roomId);
      setInviteOpen(true);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success("Link copiado!");
  };

  const ativas = rooms.filter((r) => r.status === "ativa");
  const finalizadas = rooms.filter((r) => r.status !== "ativa");

  const formatDateRange = (room: MeetingRoom) => {
    if (!room.agendado_para) return null;
    const start = new Date(room.agendado_para);
    const end = room.duracao_minutos ? new Date(start.getTime() + room.duracao_minutos * 60000) : null;
    return (
      <span className="flex items-center gap-1.5 text-xs">
        <Calendar className="h-3 w-3 text-primary" />
        <span className="font-medium text-foreground">
          {start.toLocaleDateString("pt-BR")} {start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          {end && ` – ${end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
        </span>
        {room.duracao_minutos && (
          <span className="text-muted-foreground">({room.duracao_minutos}min)</span>
        )}
      </span>
    );
  };

  const getRemainingTime = (room: MeetingRoom) => {
    if (!room.agendado_para || !room.duracao_minutos) return null;
    const endTime = new Date(new Date(room.agendado_para).getTime() + room.duracao_minutos * 60000);
    const now = new Date();
    const diff = endTime.getTime() - now.getTime();
    if (diff <= 0) return <Badge variant="destructive" className="text-[10px] h-5">Expirada</Badge>;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return <Badge variant="outline" className="text-[10px] h-5 border-primary/30 text-primary">{mins}min restante(s)</Badge>;
    const hours = Math.floor(mins / 60);
    return <Badge variant="outline" className="text-[10px] h-5 border-primary/30 text-primary">{hours}h{mins % 60}min</Badge>;
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        <PageHeader
          icon={Video}
          title="Uon1 Talk"
          subtitle="Videoconferências"
          actions={
            <Button onClick={() => setCreateOpen(true)} size="lg" className="gap-2 rounded-xl shadow-sm">
              <Plus className="h-4 w-4" /> Nova Sala
            </Button>
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="rounded-xl bg-muted/50 p-1">
            <TabsTrigger value="salas" className="gap-1.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Video className="h-4 w-4" /> Salas
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-1.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BarChart3 className="h-4 w-4" /> Dashboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="salas" className="space-y-6 mt-4">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Salas Ativas</p>
                      <p className="text-3xl font-bold mt-1">{ativas.length}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-primary/10">
                      <Play className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Total de Salas</p>
                      <p className="text-3xl font-bold mt-1">{rooms.length}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary">
                      <Video className="h-5 w-5 text-secondary-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Participantes</p>
                      <p className="text-3xl font-bold mt-1">
                        {ativas.reduce((sum, r) => sum + (r.meeting_participants?.filter(p => p.status === "approved").length || 0), 0)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-accent">
                      <Users className="h-5 w-5 text-accent-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Active Rooms */}
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2 text-foreground">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Salas Ativas
              </h2>
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary mx-auto" />
                  <p className="text-sm text-muted-foreground mt-3">Carregando...</p>
                </div>
              ) : ativas.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-2 border-border/60">
                  <CardContent className="py-12 text-center">
                    <div className="p-4 rounded-2xl bg-muted/50 w-fit mx-auto mb-4">
                      <Video className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-muted-foreground mb-1">Nenhuma sala ativa</p>
                    <p className="text-xs text-muted-foreground/70 mb-4">Crie uma nova sala para começar</p>
                    <Button onClick={() => setCreateOpen(true)} variant="outline" className="gap-2 rounded-xl">
                      <Plus className="h-4 w-4" /> Criar Sala
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {ativas.map((room) => (
                    <Card key={room.id} className="rounded-2xl hover:shadow-md transition-all border-border/50 group">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="font-semibold text-base truncate">{room.nome}</h3>
                              <Badge className="bg-primary/15 text-primary border-0 text-[11px] font-medium">Ativa</Badge>
                              <Badge variant="outline" className="text-[11px]">{room.tipo}</Badge>
                              {getRemainingTime(room)}
                            </div>
                            {room.descricao && <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{room.descricao}</p>}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              {formatDateRange(room)}
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {room.meeting_participants?.filter(p => p.status === "approved").length || 0} participante(s)
                              </span>
                              {room.convidados && (room.convidados as any[]).length > 0 && (
                                <span className="flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3" />
                                  {(room.convidados as any[]).length} convidado(s)
                                </span>
                              )}
                              {rsvpMap[room.id] && (rsvpMap[room.id].sim > 0 || rsvpMap[room.id].nao > 0 || rsvpMap[room.id].talvez > 0) && (
                                <span className="flex items-center gap-1.5">
                                  <span className="text-primary font-medium">✓{rsvpMap[room.id].sim}</span>
                                  {rsvpMap[room.id].talvez > 0 && <span className="text-muted-foreground">?{rsvpMap[room.id].talvez}</span>}
                                  {rsvpMap[room.id].nao > 0 && <span className="text-destructive">✕{rsvpMap[room.id].nao}</span>}
                                  {rsvpMap[room.id].pendente > 0 && <span>⏳{rsvpMap[room.id].pendente}</span>}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Button size="sm" onClick={() => navigate(`/video/${room.id}`)} className="gap-1.5 rounded-xl shadow-sm">
                              <Video className="h-3.5 w-3.5" /> Entrar
                            </Button>
                            {room.host_id === user?.id && (
                              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditRoom(room)} title="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => handleCreateInvite(room.id)} title="Gerar convite">
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                            {room.host_id === user?.id && (
                              <Button size="sm" variant="ghost" onClick={() => handleEndRoom(room.id)} className="text-primary hover:text-primary/80 hover:bg-primary/10 rounded-xl" title="Finalizar reunião">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* History */}
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2 text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" /> Histórico
              </h2>
              {finalizadas.length > 0 ? (
                <div className="grid gap-2">
                  {finalizadas.map((room) => (
                    <Card key={room.id} className="rounded-2xl border-border/40 bg-card/80">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium text-sm truncate">{room.nome}</h3>
                              <Badge variant="secondary" className="text-[10px] h-5">
                                {room.status === "finalizada" ? "Finalizada" : room.status === "cancelada" ? "Cancelada" : room.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                              {formatDateRange(room)}
                              {room.finalizado_em && (
                                <span>Encerrada em {new Date(room.finalizado_em).toLocaleDateString("pt-BR")} às {new Date(room.finalizado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                              )}
                              <span>{room.meeting_participants?.length || 0} participante(s)</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {room.host_id === user?.id && room.status === "finalizada" && (
                              <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={() => handleReopenRoom(room.id)} title="Reabrir sala">
                                <RotateCcw className="h-3 w-3" />
                                <span className="hidden sm:inline">Reabrir</span>
                              </Button>
                            )}
                            {room.host_id === user?.id && (
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteRoom(room.id)} className="text-destructive hover:text-destructive rounded-xl" title="Apagar">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="rounded-2xl border-dashed border-2 border-border/40">
                  <CardContent className="py-8 text-center">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Nenhuma reunião finalizada ainda</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            <TalkDashboard rooms={rooms} />
          </TabsContent>
        </Tabs>
      </div>

      <CriarReuniaoDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchRooms} />
      {editRoom && (
        <EditarReuniaoDialog room={editRoom} open={!!editRoom} onOpenChange={(v) => !v && setEditRoom(null)} onUpdated={fetchRooms} />
      )}

      <ResponsiveDialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <ResponsiveDialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link de Convite</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Compartilhe este link para convidar participantes.</p>
            <div className="flex gap-2">
              <Input value={inviteLink} readOnly className="flex-1 rounded-xl" />
              <Button onClick={copyInviteLink} variant="outline" className="rounded-xl">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => setInviteOpen(false)} className="w-full rounded-xl">Fechar</Button>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}

// ── Talk Dashboard ──
function TalkDashboard({ rooms }: { rooms: MeetingRoom[] }) {
  const finalizadas = rooms.filter(r => r.status !== "ativa");
  const totalParticipantes = rooms.reduce((sum, r) => sum + (r.meeting_participants?.length || 0), 0);
  const avgDuration = finalizadas.length > 0
    ? Math.round(finalizadas.reduce((sum, r) => sum + (r.duracao_minutos || 0), 0) / finalizadas.length)
    : 0;
  const totalConvidados = rooms.reduce((sum, r) => sum + ((r.convidados as any[])?.length || 0), 0);

  const weeklyData = useMemo(() => {
    const weeks: Record<string, number> = {};
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const key = `Sem ${8 - i}`;
      weeks[key] = 0;
    }
    rooms.forEach(r => {
      const created = new Date(r.created_at);
      const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      const weekIndex = Math.min(7, Math.floor(diffDays / 7));
      const key = `Sem ${8 - weekIndex}`;
      if (weeks[key] !== undefined) weeks[key]++;
    });
    return Object.entries(weeks).map(([name, total]) => ({ name, total }));
  }, [rooms]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    rooms.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({
      name: name === "ativa" ? "Ativas" : name === "finalizada" ? "Finalizadas" : name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [rooms]);

  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--muted-foreground))", "hsl(var(--destructive))"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Video, label: "Total Reuniões", value: rooms.length },
          { icon: Users, label: "Participantes", value: totalParticipantes },
          { icon: Timer, label: "Duração Média", value: `${avgDuration} min` },
          { icon: TrendingUp, label: "Convidados", value: totalConvidados },
        ].map((item, i) => (
          <Card key={i} className="rounded-2xl border-border/50">
            <CardContent className="p-4 text-center">
              <item.icon className="h-5 w-5 mx-auto text-primary mb-1.5" />
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-4">Reuniões por Semana</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Reuniões" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-4">Status das Reuniões</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3">Últimas Reuniões Finalizadas</h3>
          {finalizadas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma reunião finalizada</p>
          ) : (
            <div className="space-y-1.5">
              {finalizadas.slice(0, 10).map(r => (
                <div key={r.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 text-sm">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{r.nome}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {r.duracao_minutos && <span>{r.duracao_minutos} min</span>}
                    <span>{r.meeting_participants?.length || 0} part.</span>
                    {r.finalizado_em && <span>{new Date(r.finalizado_em).toLocaleDateString("pt-BR")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
