import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Video } from "lucide-react";
import { toast } from "sonner";
import { callLivekitFn } from "@/lib/livekitApi";
import { lk, loadLiveKit } from "@/features/talk/livekit";
import { LayoutSettingsProvider } from "@/features/talk/context/LayoutSettingsContext";
import ReliabilityLayer from "@/features/talk/components/ReliabilityLayer";
import RoomHeader from "@/features/talk/components/RoomHeader";
import VideoGrid from "@/features/talk/components/VideoGrid";
import ChatPanel from "@/features/talk/components/ChatPanel";
import ControlBar from "@/features/talk/components/ControlBar";

interface RoomInfo {
  id: string;
  nome: string;
  descricao?: string;
}

function LogoBanner() {
  return (
    <div className="flex items-center justify-center gap-3">
      <img src="/images/logo-full.png" alt="UON1" className="h-8 w-auto" />
      <div className="h-6 w-px bg-border" />
      <img src="/images/logo-vg.png" alt="Vangard" className="h-8 w-auto" />
    </div>
  );
}

/** Entrada de convidados via link de convite (sem autenticação) */
export default function InviteEntry() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState("");
  const [participantIdentity, setParticipantIdentity] = useState("");
  const [roomId, setRoomId] = useState("");
  const [approved, setApproved] = useState(false);
  const [livekitReady, setLivekitReady] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    loadLiveKit().then(setLivekitReady);
  }, []);

  const validateInvite = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=validateInvite&inviteId=${inviteId}`,
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) throw new Error(data?.error || "Convite inválido");
      setRoomInfo(data.room);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Convite inválido");
    }
    setLoading(false);
  }, [inviteId]);

  useEffect(() => {
    validateInvite();
  }, [validateInvite]);

  // Polling de aprovação (convidados não têm realtime autenticado)
  useEffect(() => {
    if (!roomId || !participantIdentity || approved) return;

    const poll = setInterval(async () => {
      try {
        const data = await callLivekitFn("checkGuestStatus", { roomId, identity: participantIdentity });
        if (data.status === "approved") {
          const tokenData = await callLivekitFn("getGuestToken", { roomId, identity: participantIdentity });
          if (!tokenData.token || !tokenData.livekitUrl) {
            toast.error("Erro ao obter credenciais da sala");
            return;
          }
          setLivekitUrl(tokenData.livekitUrl);
          setToken(tokenData.token);
          setApproved(true);
          toast.success("Aprovado! Entrando na sala...");
        } else if (data.status === "denied") {
          toast.error("Sua entrada foi recusada pelo moderador");
          setToken(null);
          setError("Entrada recusada pelo moderador");
        }
      } catch (e) {
        console.warn("Poll error:", e);
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [roomId, participantIdentity, approved]);

  const handleJoin = async () => {
    if (!displayName.trim()) {
      toast.error("Informe seu nome");
      return;
    }
    setJoining(true);

    // Solicita permissões de mídia durante o gesto do usuário (persistem após aprovação)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      console.warn("Permissão de mídia não concedida:", e);
    }

    try {
      const data = await callLivekitFn("joinViaInvite", { inviteId, displayName });
      setToken(data.token);
      setLivekitUrl(data.livekitUrl);
      setParticipantIdentity(data.participantIdentity);
      setRoomId(data.room.id);
      toast.success("Conectando... Aguarde aprovação do moderador.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao entrar");
    }
    setJoining(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center space-y-4">
            <LogoBanner />
            <Video className="h-10 w-10 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">Convite Inválido</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Aprovado — sala completa (mesmos componentes do host)
  if (approved && token && livekitUrl) {
    const { LiveKitRoom } = lk;
    const leave = () => {
      setApproved(false);
      setToken(null);
    };
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <LayoutSettingsProvider>
          <LiveKitRoom
            key={token}
            serverUrl={livekitUrl}
            token={token}
            connect
            video
            audio
            options={{ adaptiveStream: true, dynacast: true }}
            onDisconnected={leave}
            className="flex flex-col flex-1"
          >
            <ReliabilityLayer />
            <RoomHeader
              room={{ nome: roomInfo?.nome || "Reunião" }}
              isHost={false}
              roomId={roomId}
              subtitleOverride={`${displayName} • Convidado`}
            />
            <div className="flex flex-1 overflow-hidden relative">
              <VideoGrid />
              {chatOpen && roomId && (
                <ChatPanel roomId={roomId} userId={participantIdentity} userName={displayName} onClose={() => setChatOpen(false)} />
              )}
            </div>
            <ControlBar onLeave={leave} chatOpen={chatOpen} onToggleChat={() => setChatOpen(!chatOpen)} />
          </LiveKitRoom>
        </LayoutSettingsProvider>
      </div>
    );
  }

  // Aguardando aprovação
  if (token && !approved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center space-y-4">
            <LogoBanner />
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Sala de Espera</h2>
            <p className="text-muted-foreground">
              Aguardando aprovação do moderador para entrar em <strong>{roomInfo?.nome}</strong>
            </p>
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">Você será conectado automaticamente quando aprovado</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Formulário de entrada
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-3">
            <LogoBanner />
            <div className="pt-1">
              <h2 className="text-lg font-semibold flex items-center justify-center gap-1.5">
                <span className="text-primary">Talk</span>
                <span className="text-xs text-muted-foreground font-normal">by Uon1</span>
              </h2>
              <p className="text-muted-foreground mt-1">
                Você foi convidado para: <strong>{roomInfo?.nome}</strong>
              </p>
              {roomInfo?.descricao && <p className="text-sm text-muted-foreground">{roomInfo.descricao}</p>}
            </div>
          </div>
          <div>
            <Label>Seu nome</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como deseja ser identificado?"
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
          </div>
          <Button onClick={handleJoin} disabled={joining || !livekitReady} className="w-full gap-2" size="lg">
            <Video className="h-5 w-5" />
            {joining ? "Conectando..." : "Entrar na Sala"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
