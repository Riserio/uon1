import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Video, VideoOff, Mic, MicOff, MonitorUp, Phone, Copy, Users, Check, X, ChevronRight
} from "lucide-react";
import {
  LiveKitRoom,
  VideoTrack,
  AudioTrack,
  useRoomContext,
  useTracks,
  useParticipants,
  useLocalParticipant,
  TrackToggle,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent } from "livekit-client";

interface RoomData {
  id: string;
  nome: string;
  descricao: string | null;
  host_id: string;
  livekit_room_name: string;
  status: string;
}

interface PendingParticipant {
  id: string;
  identity: string;
  display_name: string;
  status: string;
  is_host: boolean;
  created_at: string;
}

// ── Main page wrapper ──
export default function MeetingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string>("");
  const [room, setRoom] = useState<RoomData | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [participantStatus, setParticipantStatus] = useState<string>("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && roomId) joinRoom();
  }, [user, roomId]);

  const joinRoom = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=getToken`,
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
      setToken(data.token);
      setLivekitUrl(data.livekitUrl);
      setRoom(data.room);
      setIsHost(data.isHost);
      setParticipantStatus(data.participantStatus);
    } catch (e: any) {
      toast.error(e.message || "Erro ao entrar na sala");
      navigate("/video");
    }
    setLoading(false);
  };

  const handleDisconnect = () => {
    navigate("/video");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Conectando à sala...</p>
        </div>
      </div>
    );
  }

  if (!token || !livekitUrl || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Sala não encontrada</p>
      </div>
    );
  }

  // If pending, show waiting screen
  if (participantStatus === "pending" && !isHost) {
    return <WaitingRoom room={room} roomId={roomId!} onApproved={(t) => { setToken(t); setParticipantStatus("approved"); }} onDenied={() => navigate("/video")} />;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      <LiveKitRoom
        serverUrl={livekitUrl}
        token={token}
        connect={true}
        onDisconnected={handleDisconnect}
        className="flex flex-col flex-1"
      >
        <RoomHeader room={room} isHost={isHost} roomId={roomId!} onLeave={handleDisconnect} />
        <div className="flex flex-1 overflow-hidden">
          <VideoGrid />
          {isHost && <PendingRequestsPanel roomId={roomId!} />}
        </div>
        <ControlBar onLeave={handleDisconnect} />
      </LiveKitRoom>
    </div>
  );
}

// ── Waiting Room for pending participants ──
function WaitingRoom({ room, roomId, onApproved, onDenied }: { room: RoomData; roomId: string; onApproved: (token: string) => void; onDenied: () => void }) {
  useEffect(() => {
    const channel = supabase
      .channel(`meeting-participant-${roomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "meeting_participants", filter: `room_id=eq.${roomId}` }, (payload) => {
        const updated = payload.new as any;
        if (updated.status === "approved") {
          // Re-fetch token
          toast.success("Você foi aprovado! Entrando na sala...");
          // For simplicity, reload
          window.location.reload();
        } else if (updated.status === "denied") {
          toast.error("Sua entrada foi recusada");
          onDenied();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Sala de Espera</h2>
          <p className="text-muted-foreground">
            Aguardando aprovação do moderador para entrar em <strong>{room.nome}</strong>
          </p>
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">O moderador será notificado da sua presença</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Room Header ──
function RoomHeader({ room, isHost, roomId, onLeave }: { room: RoomData; isHost: boolean; roomId: string; onLeave: () => void }) {
  const participants = useParticipants();

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/video/${roomId}`);
    toast.success("Link copiado!");
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-card border-b">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-primary/10">
          <Video className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">{room.nome}</h2>
          <p className="text-xs text-muted-foreground">
            {participants.length} participante(s) • {isHost ? "Moderador" : "Participante"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={copyLink}>
          <Copy className="h-3.5 w-3.5 mr-1" /> Copiar Link
        </Button>
        <Button size="sm" variant="destructive" onClick={onLeave}>
          <Phone className="h-3.5 w-3.5 mr-1" /> Sair
        </Button>
      </div>
    </div>
  );
}

// ── Video Grid ──
function VideoGrid() {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  return (
    <div className="flex-1 p-4 overflow-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr" style={{ minHeight: "100%" }}>
        {tracks.map((trackRef) => {
          const hasTrack = trackRef.publication && trackRef.publication.track;
          const trackRefAny = trackRef as any;
          return (
          <div
            key={trackRef.participant.sid + (trackRef.publication?.trackSid || "placeholder")}
            className="relative bg-muted rounded-lg overflow-hidden aspect-video flex items-center justify-center"
          >
            {hasTrack ? (
              trackRef.source === Track.Source.Camera || trackRef.source === Track.Source.ScreenShare ? (
                <VideoTrack trackRef={trackRefAny} className="w-full h-full object-cover" />
              ) : (
                <AudioTrack trackRef={trackRefAny} />
              )
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <VideoOff className="h-6 w-6 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground">{trackRef.participant.name || trackRef.participant.identity}</span>
              </div>
            )}
            <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-foreground/60 rounded text-xs text-background">
              {trackRef.participant.name || trackRef.participant.identity}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Control Bar ──
function ControlBar({ onLeave }: { onLeave: () => void }) {
  return (
    <div className="flex items-center justify-center gap-3 p-3 bg-card border-t">
      <TrackToggle source={Track.Source.Microphone} className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
        <Mic className="h-5 w-5" />
      </TrackToggle>
      <TrackToggle source={Track.Source.Camera} className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
        <Video className="h-5 w-5" />
      </TrackToggle>
      <TrackToggle source={Track.Source.ScreenShare} className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
        <MonitorUp className="h-5 w-5" />
      </TrackToggle>
      <Button variant="destructive" onClick={onLeave} className="gap-2">
        <Phone className="h-5 w-5" /> Sair
      </Button>
    </div>
  );
}

// ── Pending Requests Panel ──
function PendingRequestsPanel({ roomId }: { roomId: string }) {
  const [pending, setPending] = useState<PendingParticipant[]>([]);

  const fetchPending = async () => {
    const { data } = await supabase
      .from("meeting_participants")
      .select("*")
      .eq("room_id", roomId)
      .eq("status", "pending");
    setPending((data as unknown as PendingParticipant[]) || []);
  };

  useEffect(() => {
    fetchPending();
    const channel = supabase
      .channel(`pending-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_participants", filter: `room_id=eq.${roomId}` }, () => {
        fetchPending();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const handleAction = async (participantId: string, action: "approveParticipant" | "denyParticipant") => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=${action}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomId, participantId }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success(action === "approveParticipant" ? "Participante aprovado" : "Participante recusado");
      fetchPending();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (pending.length === 0) return null;

  return (
    <div className="w-72 border-l bg-card p-4 flex flex-col">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Users className="h-4 w-4" /> Solicitações ({pending.length})
      </h3>
      <ScrollArea className="flex-1">
        <div className="space-y-2">
          {pending.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
              <span className="text-sm truncate flex-1">{p.display_name}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary" onClick={() => handleAction(p.id, "approveParticipant")}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleAction(p.id, "denyParticipant")}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
