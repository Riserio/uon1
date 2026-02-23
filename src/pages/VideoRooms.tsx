import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Video, Plus, Copy, Trash2, Calendar, Users, Clock, Link2, MessageSquare, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import CriarReuniaoDialog from "@/components/CriarReuniaoDialog";
import EditarReuniaoDialog from "@/components/EditarReuniaoDialog";

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

  useEffect(() => {
    if (user) fetchRooms();
  }, [user]);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      // Use direct Supabase query for reliability instead of edge function
      const { data, error } = await supabase
        .from("meeting_rooms")
        .select("*, meeting_participants(id, display_name, status, is_host)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRooms((data || []) as unknown as MeetingRoom[]);
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
                          {room.agendado_para && (
                            <span className="flex items-center gap-1 text-primary font-medium">
                              <Calendar className="h-3 w-3" />
                              {new Date(room.agendado_para).toLocaleDateString("pt-BR")} às {new Date(room.agendado_para).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
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
                          <Button size="sm" variant="ghost" onClick={() => handleEndRoom(room.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
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
        {finalizadas.length > 0 && (
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
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(room.created_at).toLocaleDateString("pt-BR")}
                        </p>
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
        )}
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
