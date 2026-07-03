import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { lk } from "@/features/talk/livekit";
import { useMeetingConnection } from "@/features/talk/hooks/useMeetingConnection";
import { useUnreadChat } from "@/features/talk/hooks/useChat";
import { LayoutSettingsProvider } from "@/features/talk/context/LayoutSettingsContext";
import PreJoinScreen from "@/features/talk/components/PreJoinScreen";
import WaitingRoom from "@/features/talk/components/WaitingRoom";
import ReliabilityLayer from "@/features/talk/components/ReliabilityLayer";
import RoomHeader from "@/features/talk/components/RoomHeader";
import MeetingTimer from "@/features/talk/components/MeetingTimer";
import VideoGrid from "@/features/talk/components/VideoGrid";
import ChatPanel from "@/features/talk/components/ChatPanel";
import ParticipantsPanel from "@/features/talk/components/ParticipantsPanel";
import PendingRequestsPanel from "@/features/talk/components/PendingRequestsPanel";
import ControlBar from "@/features/talk/components/ControlBar";
import type { MediaChoice } from "@/features/talk/types";

type SidePanel = "chat" | "participants" | null;

/** Página da sala de reunião — orquestra conexão, pré-join, sala de espera e a chamada em si */
export default function MeetingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const conn = useMeetingConnection(roomId, Boolean(user));

  const [joined, setJoined] = useState(false);
  const [initialMedia, setInitialMedia] = useState<MediaChoice>({ video: true, audio: true });
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);

  const unreadChat = useUnreadChat(roomId, user?.id, sidePanel === "chat");
  const togglePanel = (panel: Exclude<SidePanel, null>) =>
    setSidePanel((current) => (current === panel ? null : panel));

  // ── Estados de carregamento e erro ──
  if (conn.loading || !conn.livekitReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">
            {conn.livekitError ? "Erro ao carregar" : "Conectando à sala..."}
          </p>
          {conn.livekitError && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{conn.livekitError}</p>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Tentar novamente
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!conn.token || !conn.livekitUrl || !conn.room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Sala não encontrada</p>
      </div>
    );
  }

  // ── Sala de espera (aguardando aprovação do moderador) ──
  if (conn.participantStatus === "pending" && !conn.isHost) {
    return (
      <WaitingRoom
        room={conn.room}
        roomId={roomId!}
        onApproved={(t) => {
          conn.setToken(t);
          conn.setParticipantStatus("approved");
        }}
        onDenied={() => navigate("/video")}
      />
    );
  }

  // ── Pré-join (padrão Meet): escolher mídia antes de conectar ──
  if (!joined) {
    return (
      <PreJoinScreen
        room={conn.room}
        onJoin={(media) => {
          setInitialMedia(media);
          setJoined(true);
        }}
        onCancel={() => navigate("/video")}
      />
    );
  }

  // ── Conexão perdida: oferecer reentrada em vez de expulsar ──
  if (conn.connectionLost) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4 shadow-lg border-border/50">
          <CardContent className="p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <Phone className="h-8 w-8 text-destructive rotate-[135deg]" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Conexão perdida</h2>
            <p className="text-muted-foreground text-sm">
              Sua conexão com a reunião <strong className="text-foreground">{conn.room.nome}</strong> caiu. Verifique
              sua internet e reentre.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={conn.rejoin} disabled={conn.rejoining}>
                {conn.rejoining ? "Reconectando..." : "Reentrar na reunião"}
              </Button>
              <Button variant="outline" onClick={() => navigate("/video")}>
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { LiveKitRoom } = lk;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      <LayoutSettingsProvider>
        <LiveKitRoom
          key={conn.token}
          serverUrl={conn.livekitUrl}
          token={conn.token}
          connect
          video={initialMedia.video}
          audio={initialMedia.audio}
          options={{ adaptiveStream: true, dynacast: true }}
          onDisconnected={conn.handleDisconnected}
          onMediaDeviceFailure={() =>
            toast.error("Falha ao acessar câmera/microfone. Verifique as permissões do navegador.")
          }
          className="flex flex-col flex-1"
        >
          <ReliabilityLayer />
          <RoomHeader room={conn.room} isHost={conn.isHost} roomId={roomId!} />
          <MeetingTimer
            room={conn.room}
            isHost={conn.isHost}
            roomId={roomId!}
            onEndForAll={conn.endForAll}
            onExtend={conn.extendRoom}
          />

          <div className="flex flex-1 overflow-hidden relative">
            <VideoGrid />
            {sidePanel === "chat" && (
              <ChatPanel
                roomId={roomId!}
                userId={user?.id || ""}
                userName={user?.user_metadata?.nome || user?.email || "Eu"}
                onClose={() => setSidePanel(null)}
              />
            )}
            {sidePanel === "participants" && (
              <ParticipantsPanel hostIdentity={conn.room.host_id} onClose={() => setSidePanel(null)} />
            )}
            {conn.isHost && <PendingRequestsPanel roomId={roomId!} />}
          </div>

          <ControlBar
            isHost={conn.isHost}
            onLeave={conn.leave}
            onEndForAll={conn.endForAll}
            chatOpen={sidePanel === "chat"}
            onToggleChat={() => togglePanel("chat")}
            participantsOpen={sidePanel === "participants"}
            onToggleParticipants={() => togglePanel("participants")}
            unreadCount={unreadChat}
          />
        </LiveKitRoom>
      </LayoutSettingsProvider>
    </div>
  );
}
