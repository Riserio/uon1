import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Video, Users } from "lucide-react";
import { RoomHeader, VideoGridWithReactions, ControlBar, ChatPanel } from "./MeetingRoom";

// Lazy-load LiveKit (only need LiveKitRoom here; shared components handle their own LK hooks)
let LiveKitRoom: any;
let livekitLoaded = false;

const loadLiveKit = async () => {
  if (livekitLoaded) return true;
  try {
    const componentsReact = await import("@livekit/components-react");
    LiveKitRoom = componentsReact.LiveKitRoom;
    await import("@livekit/components-styles");
    livekitLoaded = true;
    return true;
  } catch (e) {
    console.error("Failed to load LiveKit:", e);
    return false;
  }
};

export default function InviteEntry() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const [roomInfo, setRoomInfo] = useState<{ id: string; nome: string; descricao?: string } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Meeting state
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string>("");
  const [participantIdentity, setParticipantIdentity] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  const [approved, setApproved] = useState(false);
  const [livekitReady, setLivekitReady] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    loadLiveKit().then(setLivekitReady);
  }, []);

  useEffect(() => {
    validateInvite();
  }, [inviteId]);

  // Poll for approval (realtime requires auth/RLS which guests don't have)
  useEffect(() => {
    if (!roomId || !participantIdentity || approved) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=checkGuestStatus`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId, identity: participantIdentity }),
          }
        );
        const data = await res.json();
        if (data.error) return;

        if (data.status === "approved") {
          // Fetch new token with canPublish=true
          const tokenRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=getGuestToken`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ roomId, identity: participantIdentity }),
            }
          );
          const tokenData = await tokenRes.json();
          if (tokenData.error) throw new Error(tokenData.error);
          console.log("[Guest] Approved, got new token. livekitUrl:", tokenData.livekitUrl);
          if (!tokenData.token || !tokenData.livekitUrl) {
            console.error("[Guest] Missing token or livekitUrl in response", tokenData);
            toast.error("Erro ao obter credenciais da sala");
            return;
          }
          // Set all together so re-render sees consistent state
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
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [roomId, participantIdentity, approved]);

  const validateInvite = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=validateInvite&inviteId=${inviteId}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRoomInfo(data.room);
    } catch (e: any) {
      setError(e.message || "Convite inválido");
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!displayName.trim()) { toast.error("Informe seu nome"); return; }
    setJoining(true);
    
    // Request media permissions NOW (during user gesture) so they persist after approval
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      // Stop tracks immediately - we just needed the permission grant
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      console.warn("Media permission not granted upfront:", e);
      // Continue anyway - user can enable later
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=joinViaInvite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteId, displayName }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setToken(data.token);
      setLivekitUrl(data.livekitUrl);
      setParticipantIdentity(data.participantIdentity);
      setRoomId(data.room.id);
      toast.success("Conectando... Aguarde aprovação do moderador.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao entrar");
    }
    setJoining(false);
  };

  const LogoBanner = () => (
    <div className="flex items-center justify-center gap-3">
      <img src="/images/logo-full.png" alt="UON1" className="h-8 w-auto" />
      <div className="h-6 w-px bg-border" />
      <img src="/images/logo-vg.png" alt="Vangard" className="h-8 w-auto" />
    </div>
  );

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

  // Approved - show full meeting room
  if (approved && token && livekitUrl) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <LiveKitRoom
          key={token}
          serverUrl={livekitUrl}
          token={token}
          connect={true}
          video={true}
          audio={true}
          onDisconnected={() => { setApproved(false); setToken(null); }}
          className="flex flex-col flex-1"
        >
          {/* Same layout as host: shared header + video grid + control bar */}
          <RoomHeader
            room={{ nome: roomInfo?.nome || "Reunião" }}
            isHost={false}
            roomId={roomId}
            onLeave={() => { setApproved(false); setToken(null); }}
            subtitleOverride={`${displayName} • Convidado`}
          />
          <div className="flex flex-1 overflow-hidden">
            <VideoGridWithReactions />
            {chatOpen && roomId && (
              <ChatPanel roomId={roomId} userId={participantIdentity} userName={displayName} />
            )}
          </div>
          <ControlBar
            onLeave={() => { setApproved(false); setToken(null); }}
            chatOpen={chatOpen}
            onToggleChat={() => setChatOpen(!chatOpen)}
          />
        </LiveKitRoom>
      </div>
    );
  }

  // Waiting for approval
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

  // Join form
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

