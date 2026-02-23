import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Video, VideoOff, Mic, MicOff, MonitorUp, Phone, Copy, Users, Check, X, ChevronRight, ChevronUp, MessageCircle, Send
} from "lucide-react";

// Lazy-load LiveKit to avoid module import crashes
let LiveKitRoom: any;
let VideoTrack: any;
let AudioTrack: any;
let useTracks: any;
let useParticipants: any;
let TrackToggle: any;
let Track: any;
let livekitLoaded = false;
let livekitLoadError: string | null = null;

const loadLiveKit = async () => {
  if (livekitLoaded) return true;
  try {
    const [componentsReact, livekitClient] = await Promise.all([
      import("@livekit/components-react"),
      import("livekit-client"),
    ]);
    LiveKitRoom = componentsReact.LiveKitRoom;
    VideoTrack = componentsReact.VideoTrack;
    AudioTrack = componentsReact.AudioTrack;
    useTracks = componentsReact.useTracks;
    useParticipants = componentsReact.useParticipants;
    TrackToggle = componentsReact.TrackToggle;
    Track = livekitClient.Track;
    // Load styles
    await import("@livekit/components-styles");
    livekitLoaded = true;
    return true;
  } catch (e: any) {
    console.error("Failed to load LiveKit modules:", e);
    livekitLoadError = e.message || "Falha ao carregar módulos de vídeo";
    return false;
  }
};

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

  const [livekitReady, setLivekitReady] = useState(false);
  const [livekitError, setLivekitError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    loadLiveKit().then((ok) => {
      if (ok) setLivekitReady(true);
      else setLivekitError(livekitLoadError || "Falha ao carregar módulos de vídeo");
    });
  }, []);

  useEffect(() => {
    if (user && roomId && livekitReady) joinRoom();
  }, [user, roomId, livekitReady]);

  const joinRoom = async () => {
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

  if (loading || !livekitReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">{livekitError ? "Erro ao carregar" : "Conectando à sala..."}</p>
          {livekitError && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{livekitError}</p>
              <Button variant="outline" onClick={() => window.location.reload()}>Tentar novamente</Button>
            </div>
          )}
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
          {chatOpen && <ChatPanel roomId={roomId!} userId={user?.id || ""} userName={user?.user_metadata?.nome || user?.email || "Eu"} />}
          {isHost && <PendingRequestsPanel roomId={roomId!} />}
        </div>
        <ControlBar onLeave={handleDisconnect} chatOpen={chatOpen} onToggleChat={() => setChatOpen(!chatOpen)} />
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
        <img src="/images/logo-full.png" alt="UON1" className="h-8 w-auto" />
        <div className="h-6 w-px bg-border" />
        <img src="/images/logo-vg.png" alt="Vangard" className="h-8 w-auto" />
        <div className="h-6 w-px bg-border" />
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-1.5">
            <span className="text-primary">Talk</span>
            <span className="text-[10px] text-muted-foreground font-normal">by Uon1</span>
            <span className="mx-1 text-muted-foreground">•</span>
            {room.nome}
          </h2>
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

// ── Control Bar (Google Meet style) ──
function ControlBar({ onLeave, chatOpen, onToggleChat }: { onLeave: () => void; chatOpen: boolean; onToggleChat: () => void }) {
  const meetBtnBase = "h-12 w-12 rounded-full flex items-center justify-center transition-colors border-0 outline-none focus:outline-none";
  const meetBtnDark = `${meetBtnBase} bg-[#3c4043] hover:bg-[#4a4d51] text-white`;

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 bg-[#202124]">
      {/* Mic with caret */}
      <div className="flex items-center gap-0.5">
        <button className="h-10 w-10 rounded-full bg-[#3c4043] hover:bg-[#4a4d51] text-white flex items-center justify-center transition-colors">
          <ChevronUp className="h-4 w-4 opacity-70" />
        </button>
        <TrackToggle
          source={Track.Source.Microphone}
          className={meetBtnDark}
        >
          <Mic className="h-5 w-5" />
        </TrackToggle>
      </div>

      {/* Camera with caret */}
      <div className="flex items-center gap-0.5">
        <button className="h-10 w-10 rounded-full bg-[#3c4043] hover:bg-[#4a4d51] text-white flex items-center justify-center transition-colors">
          <ChevronUp className="h-4 w-4 opacity-70" />
        </button>
        <TrackToggle
          source={Track.Source.Camera}
          className={meetBtnDark}
        >
          <Video className="h-5 w-5" />
        </TrackToggle>
      </div>

      {/* Screen share */}
      <TrackToggle
        source={Track.Source.ScreenShare}
        className={meetBtnDark}
      >
        <MonitorUp className="h-5 w-5" />
      </TrackToggle>

      {/* Chat */}
      <button
        onClick={onToggleChat}
        className={`${meetBtnBase} ${
          chatOpen
            ? "bg-[#8ab4f8] text-[#202124] hover:bg-[#aecbfa]"
            : "bg-[#3c4043] text-white hover:bg-[#4a4d51]"
        }`}
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {/* Leave – pill shaped like Google Meet */}
      <button
        onClick={onLeave}
        className="h-12 px-5 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white transition-colors flex items-center justify-center ml-2"
      >
        <Phone className="h-5 w-5 rotate-[135deg]" />
      </button>
    </div>
  );
}

// ── Chat Panel ──
function ChatPanel({ roomId, userId, userName }: { roomId: string; userId: string; userName: string }) {
  const [messages, setMessages] = useState<{ id: string; sender_name: string; sender_id: string; message: string; created_at: string }[]>([]);
  const [text, setText] = useState("");
  const scrollRef = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    // Load existing messages
    const load = async () => {
      const { data } = await supabase
        .from("meeting_messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(200);
      setMessages((data as any[]) || []);
    };
    load();

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat-${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "meeting_messages", filter: `room_id=eq.${roomId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as any]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const sendMessage = async () => {
    if (!text.trim()) return;
    const msg = text.trim();
    setText("");
    await supabase.from("meeting_messages").insert({
      room_id: roomId,
      sender_id: userId,
      sender_name: userName,
      message: msg,
    });
  };

  return (
    <div className="w-72 border-l bg-card flex flex-col">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4" /> Chat
        </h3>
      </div>
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-2">
          {messages.map((m) => (
            <div key={m.id} className={`text-xs ${m.sender_id === userId ? "text-right" : ""}`}>
              <span className="font-semibold text-primary">{m.sender_id === userId ? "Eu" : m.sender_name}</span>
              <p className={`mt-0.5 p-2 rounded-lg inline-block max-w-[90%] ${m.sender_id === userId ? "bg-primary/10 text-foreground" : "bg-muted text-foreground"}`}>
                {m.message}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-2 border-t flex gap-1.5">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mensagem..."
          className="text-xs h-8"
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <Button size="sm" className="h-8 w-8 p-0" onClick={sendMessage}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
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
