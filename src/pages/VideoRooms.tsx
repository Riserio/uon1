import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Video, Plus, Copy, Trash2, Calendar, Users, Clock, Eye, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

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
  const [form, setForm] = useState({ nome: "", descricao: "", tipo: "privada" });

  useEffect(() => {
    if (user) fetchRooms();
  }, [user]);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=listRooms`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRooms(data.rooms || []);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar salas");
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome da sala"); return; }
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=createRoom`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success("Sala criada!");
      setCreateOpen(false);
      setForm({ nome: "", descricao: "", tipo: "privada" });
      fetchRooms();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar sala");
    }
  };

  const handleDelete = async (roomId: string) => {
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
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(room.created_at).toLocaleDateString("pt-BR")} às {new Date(room.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {room.meeting_participants?.filter(p => p.status === "approved").length || 0} participante(s)
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button size="sm" onClick={() => navigate(`/video/${room.id}`)} className="gap-1.5">
                          <Video className="h-3.5 w-3.5" /> Entrar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleCreateInvite(room.id)} title="Gerar convite">
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                        {room.host_id === user?.id && (
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(room.id)} className="text-destructive hover:text-destructive">
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
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Room Dialog */}
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <ResponsiveDialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Sala</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Sala *</Label>
              <Input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex: Reunião de alinhamento" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} placeholder="Pauta da reunião..." rows={3} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((p) => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="privada">Privada</SelectItem>
                  <SelectItem value="publica">Pública</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate}>Criar Sala</Button>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

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
