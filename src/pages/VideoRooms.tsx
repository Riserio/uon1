import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRooms } from "@/features/talk/hooks/useRooms";
import { ActiveRoomCard, HistoryRoomCard } from "@/features/talk/components/rooms/RoomCards";
import TalkDashboard from "@/features/talk/components/rooms/TalkDashboard";
import type { MeetingRoomSummary } from "@/features/talk/types";
import CriarReuniaoDialog from "@/components/CriarReuniaoDialog";
import EditarReuniaoDialog from "@/components/EditarReuniaoDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BarChart3, Clock, Copy, Play, Plus, Users, Video } from "lucide-react";
import { toast } from "sonner";

type ConfirmAction = { type: "end" | "reopen" | "delete"; roomId: string } | null;

const CONFIRM_COPY: Record<Exclude<ConfirmAction, null>["type"], { title: string; description: string }> = {
  end: { title: "Encerrar esta sala?", description: "Todos os participantes serão desconectados." },
  reopen: { title: "Reabrir esta sala?", description: "A sala voltará a aceitar participantes." },
  delete: {
    title: "Apagar esta reunião?",
    description: "A reunião será removida permanentemente do histórico. Esta ação não pode ser desfeita.",
  },
};

function StatCard({ label, value, icon, iconBg }: { label: string; value: number; icon: React.ReactNode; iconBg: string }) {
  return (
    <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
          </div>
          <div className={`p-3 rounded-xl ${iconBg}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Página inicial do Uon1 Talk: hero, estatísticas, salas ativas, histórico e dashboard */
export default function VideoRooms() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { rooms, loading, rsvpMap, fetchRooms, endRoom, reopenRoom, deleteRoom, createInvite } = useRooms(Boolean(user));

  const [createOpen, setCreateOpen] = useState(false);
  const [editRoom, setEditRoom] = useState<MeetingRoomSummary | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const ativas = rooms.filter((r) => r.status === "ativa");
  const finalizadas = rooms.filter((r) => r.status !== "ativa");
  const participantesAtivos = ativas.reduce(
    (sum, r) => sum + (r.meeting_participants?.filter((p) => p.status === "approved").length || 0),
    0,
  );

  const handleInvite = async (roomId: string) => {
    const link = await createInvite(roomId);
    if (link) setInviteLink(link);
  };

  const runConfirmedAction = () => {
    if (!confirmAction) return;
    const { type, roomId } = confirmAction;
    if (type === "end") endRoom(roomId);
    else if (type === "reopen") reopenRoom(roomId);
    else deleteRoom(roomId);
    setConfirmAction(null);
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-violet-700 p-6 sm:p-8 text-primary-foreground shadow-lg">
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-black/10 blur-2xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Video className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Uon1 Talk</h1>
                <p className="text-sm text-primary-foreground/80">Videoconferências seguras, direto do navegador</p>
              </div>
            </div>
            <Button
              onClick={() => setCreateOpen(true)}
              size="lg"
              variant="secondary"
              className="gap-2 rounded-2xl shadow-md font-semibold w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" /> Nova reunião
            </Button>
          </div>
        </div>

        <Tabs defaultValue="salas">
          <TabsList className="rounded-xl bg-muted/50 p-1">
            <TabsTrigger value="salas" className="gap-1.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Video className="h-4 w-4" /> Salas
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-1.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BarChart3 className="h-4 w-4" /> Dashboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="salas" className="space-y-6 mt-4">
            {/* Estatísticas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Salas Ativas" value={ativas.length} icon={<Play className="h-5 w-5 text-primary" />} iconBg="bg-primary/10" />
              <StatCard label="Total de Salas" value={rooms.length} icon={<Video className="h-5 w-5 text-secondary-foreground" />} iconBg="bg-secondary" />
              <StatCard label="Participantes" value={participantesAtivos} icon={<Users className="h-5 w-5 text-accent-foreground" />} iconBg="bg-accent" />
            </div>

            {/* Salas ativas */}
            <section>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2 text-foreground">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Salas Ativas
              </h2>
              {loading ? (
                <div className="grid gap-3">
                  {[0, 1].map((i) => (
                    <Card key={i} className="rounded-2xl border-border/50">
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-40" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        <Skeleton className="h-4 w-64" />
                        <Skeleton className="h-4 w-48" />
                      </CardContent>
                    </Card>
                  ))}
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
                    <ActiveRoomCard
                      key={room.id}
                      room={room}
                      rsvp={rsvpMap[room.id]}
                      isOwner={room.host_id === user?.id}
                      onEnter={() => navigate(`/video/${room.id}`)}
                      onEdit={() => setEditRoom(room)}
                      onInvite={() => handleInvite(room.id)}
                      onEnd={() => setConfirmAction({ type: "end", roomId: room.id })}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Histórico */}
            <section>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2 text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" /> Histórico
              </h2>
              {finalizadas.length > 0 ? (
                <div className="grid gap-2">
                  {finalizadas.map((room) => (
                    <HistoryRoomCard
                      key={room.id}
                      room={room}
                      isOwner={room.host_id === user?.id}
                      onReopen={() => setConfirmAction({ type: "reopen", roomId: room.id })}
                      onDelete={() => setConfirmAction({ type: "delete", roomId: room.id })}
                    />
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
            </section>
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            <TalkDashboard rooms={rooms} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Diálogos */}
      <CriarReuniaoDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchRooms} />
      {editRoom && (
        <EditarReuniaoDialog room={editRoom} open={!!editRoom} onOpenChange={(v) => !v && setEditRoom(null)} onUpdated={fetchRooms} />
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction && CONFIRM_COPY[confirmAction.type].title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction && CONFIRM_COPY[confirmAction.type].description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.type === "delete" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}
              onClick={runConfirmedAction}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResponsiveDialog open={!!inviteLink} onOpenChange={(o) => !o && setInviteLink(null)}>
        <ResponsiveDialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link de Convite</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Compartilhe este link para convidar participantes.</p>
            <div className="flex gap-2">
              <Input value={inviteLink ?? ""} readOnly className="flex-1 rounded-xl" />
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink ?? "");
                  toast.success("Link copiado!");
                }}
                variant="outline"
                className="rounded-xl"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => setInviteLink(null)} className="w-full rounded-xl">
              Fechar
            </Button>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
