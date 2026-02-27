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
import { Video, Plus, Copy, Trash2, Calendar, Users, Clock, Link2, MessageSquare, Pencil, BarChart3, Timer, TrendingUp, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import CriarReuniaoDialog from "@/components/CriarReuniaoDialog";
import EditarReuniaoDialog from "@/components/EditarReuniaoDialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

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
        .select("id, agendado_para, duracao_minutos, host_id")
        .eq("status", "ativa");

      if (activeRooms && activeRooms.length > 0) {
        const now = new Date();
        for (const room of activeRooms) {
          if (room.agendado_para && room.duracao_minutos) {
            const endTime = new Date(new Date(room.agendado_para).getTime() + room.duracao_minutos * 60000);
            if (now > endTime) {
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

      // Fetch RSVP statuses for all rooms
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

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      ativa: { label: "Ativa", variant: "default" },
      finalizada: { label: "Finalizada", variant: "secondary" },
      cancelada: { label: "Cancelada", variant: "destructive" },
    };
    const info = map[status] || map.ativa;
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const formatDateRange = (room: MeetingRoom) => {
    if (!room.agendado_para) return null;
    const start = new Date(room.agendado_para);
    const end = room.duracao_minutos ? new Date(start.getTime() + room.duracao_minutos * 60000) : null;
    return (
      <span className="flex items-center gap-1 text-primary font-medium">
        <Calendar className="h-3 w-3" />
        {start.toLocaleDateString("pt-BR")} {start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        {end && ` – ${end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
        {room.duracao_minutos && (
          <span className="text-muted-foreground font-normal ml-1">({room.duracao_minutos}min)</span>
        )}
      </span>
    );
  };

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
            <p className="text-muted-foreground mt-1">Videoconferências com LiveKit</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="lg" className="gap-2">
            <Plus className="h-4 w-4" /> Nova Sala
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="salas" className="gap-1.5"><Video className="h-4 w-4" /> Salas</TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="salas" className="space-y-6 mt-4">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Salas Ativas</p>
                      <p className="text-2xl font-bold">{ativas.length}</p>
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
                      <p className="text-xs text-muted-foreground">Total de Salas</p>
                      <p className="text-2xl font-bold">{rooms.length}</p>
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
                      <p className="text-xs text-muted-foreground">Participantes Conectados</p>
                      <p className="text-2xl font-bold">
                        {ativas.reduce((sum, r) => sum + (r.meeting_participants?.filter(p => p.status === "approved").length || 0), 0)}
                      </p>
                    </div>
                    <div className="p-2 rounded-full bg-accent">
                      <Users className="h-5 w-5 text-accent-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Active Rooms */}
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-5 w-5" /> Salas Ativas
              </h2>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : ativas.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground">Nenhuma sala ativa</p>
                    <Button onClick={() => setCreateOpen(true)} variant="outline" className="mt-4 gap-2">
                      <Plus className="h-4 w-4" /> Criar Sala
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {ativas.map((room) => (
                    <Card key={room.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold truncate">{room.nome}</h3>
                              {getStatusBadge(room.status)}
                              <Badge variant="outline">{room.tipo}</Badge>
                            </div>
                            {room.descricao && <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{room.descricao}</p>}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                              {formatDateRange(room)}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Criada em {new Date(room.created_at).toLocaleDateString("pt-BR")}
                              </span>
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
                                <span className="flex items-center gap-2">
                                  <CheckCircle2 className="h-3 w-3" />
                                  <span className="text-emerald-600">✓{rsvpMap[room.id].sim}</span>
                                  {rsvpMap[room.id].talvez > 0 && <span className="text-amber-600">?{rsvpMap[room.id].talvez}</span>}
                                  {rsvpMap[room.id].nao > 0 && <span className="text-red-600">✕{rsvpMap[room.id].nao}</span>}
                                  {rsvpMap[room.id].pendente > 0 && <span>⏳{rsvpMap[room.id].pendente}</span>}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Button size="sm" onClick={() => navigate(`/video/${room.id}`)} className="gap-1.5">
                              <Video className="h-3.5 w-3.5" /> Entrar
                            </Button>
                            {room.host_id === user?.id && (
                              <Button size="sm" variant="outline" onClick={() => setEditRoom(room)} title="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => handleCreateInvite(room.id)} title="Gerar convite">
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                            {room.host_id === user?.id && (
                              <Button size="sm" variant="ghost" onClick={() => handleEndRoom(room.id)} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" title="Concluir reunião">
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
            {finalizadas.length > 0 ? (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-5 w-5" /> Histórico
                </h2>
                <div className="grid gap-3">
                  {finalizadas.map((room) => (
                    <Card key={room.id} className="opacity-70">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{room.nome}</h3>
                              {getStatusBadge(room.status)}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                              {formatDateRange(room)}
                              {room.finalizado_em && (
                                <span>Finalizada em {new Date(room.finalizado_em).toLocaleDateString("pt-BR")} às {new Date(room.finalizado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                              )}
                              <span>{room.meeting_participants?.length || 0} participante(s)</span>
                            </div>
                          </div>
                          {room.host_id === user?.id && (
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteRoom(room.id)} className="text-destructive hover:text-destructive" title="Apagar do histórico">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-5 w-5" /> Histórico
                </h2>
                <Card>
                  <CardContent className="py-8 text-center">
                    <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-muted-foreground text-sm">Nenhuma reunião finalizada ainda</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            <TalkDashboard rooms={rooms} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Room Dialog */}
      <CriarReuniaoDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchRooms} />

      {/* Edit Room Dialog */}
      {editRoom && (
        <EditarReuniaoDialog room={editRoom} open={!!editRoom} onOpenChange={(v) => !v && setEditRoom(null)} onUpdated={fetchRooms} />
      )}

      {/* Invite Link Dialog */}
      <ResponsiveDialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <ResponsiveDialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link de Convite</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Compartilhe este link para convidar participantes. O convidado entrará em uma sala de espera até ser aprovado.</p>
            <div className="flex gap-2">
              <Input value={inviteLink} readOnly className="flex-1" />
              <Button onClick={copyInviteLink} variant="outline">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => setInviteOpen(false)} className="w-full">Fechar</Button>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}

// ── Talk Dashboard ──
function TalkDashboard({ rooms }: { rooms: MeetingRoom[] }) {
  const finalizadas = rooms.filter(r => r.status !== "ativa");
  const ativas = rooms.filter(r => r.status === "ativa");

  const totalParticipantes = rooms.reduce((sum, r) => sum + (r.meeting_participants?.length || 0), 0);
  const avgDuration = finalizadas.length > 0
    ? Math.round(finalizadas.reduce((sum, r) => sum + (r.duracao_minutos || 0), 0) / finalizadas.length)
    : 0;
  const totalConvidados = rooms.reduce((sum, r) => sum + ((r.convidados as any[])?.length || 0), 0);

  // Meetings per week (last 8 weeks)
  const weeklyData = useMemo(() => {
    const weeks: Record<string, number> = {};
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
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

  // Status distribution
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
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Video className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{rooms.length}</p>
            <p className="text-xs text-muted-foreground">Total Reuniões</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{totalParticipantes}</p>
            <p className="text-xs text-muted-foreground">Total Participantes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Timer className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{avgDuration} min</p>
            <p className="text-xs text-muted-foreground">Duração Média</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{totalConvidados}</p>
            <p className="text-xs text-muted-foreground">Total Convidados</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-4">Reuniões por Semana</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Reuniões" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
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
                <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent finalized */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3">Últimas Reuniões Finalizadas</h3>
          {finalizadas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma reunião finalizada ainda</p>
          ) : (
            <div className="space-y-2">
              {finalizadas.slice(0, 10).map(r => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{r.nome}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {r.duracao_minutos && <span>{r.duracao_minutos} min</span>}
                    <span>{r.meeting_participants?.length || 0} participantes</span>
                    {r.finalizado_em && (
                      <span>{new Date(r.finalizado_em).toLocaleDateString("pt-BR")}</span>
                    )}
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
