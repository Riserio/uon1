import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Video, VideoOff, Mic, MicOff, MonitorUp, Phone, Copy, Users, Check, X, MessageCircle, Send
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

  const handleDisconnect = () => navigate("/video");

  if (loading || !livekitReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">{livekitError ? "Erro ao carregar" : "Conectando à sala..."}</p>
          {livekitError && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{livekitError}</p>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Tentar novamente</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!token || !livekitUrl || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Sala não encontrada</p>
      </div>
    );
  }

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

// ── Waiting Room ──
function WaitingRoom({ room, roomId, onApproved, onDenied }: { room: RoomData; roomId: string; onApproved: (token: string) => void; onDenied: () => void }) {
  const { user } = useAuth();

  const fetchNewToken = useCallback(async () => {
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
      toast.success("Você foi aprovado! Entrando na sala...");
      onApproved(data.token);
    } catch (e: any) {
      console.error("[WaitingRoom] Error fetching new token:", e);
      toast.error("Erro ao entrar na sala após aprovação");
    }
  }, [roomId, onApproved]);

  useEffect(() => {
    const channel = supabase
      .channel(`meeting-participant-${roomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "meeting_participants", filter: `room_id=eq.${roomId}` }, (payload) => {
        const updated = payload.new as any;
        if (updated.user_id !== user?.id) return;
        if (updated.status === "approved") {
          fetchNewToken();
        } else if (updated.status === "denied") {
          toast.error("Sua entrada foi recusada");
          onDenied();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, user?.id, fetchNewToken, onDenied]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="max-w-md w-full mx-4 shadow-lg border-border/50">
        <CardContent className="p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Sala de Espera</h2>
          <p className="text-muted-foreground text-sm">
            Aguardando aprovação do moderador para entrar em <strong className="text-foreground">{room.nome}</strong>
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
    <div className="flex items-center justify-between px-4 py-2.5 bg-card border-b border-border/50 shadow-sm">
      <div className="flex items-center gap-3">
        <img src="/images/logo-full.png" alt="UON1" className="h-7 w-auto" />
        <div className="h-5 w-px bg-border/50" />
        <img src="/images/logo-vg.png" alt="Vangard" className="h-7 w-auto" />
        <div className="h-5 w-px bg-border/50" />
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-1.5">
            <span className="text-primary">Talk</span>
            <span className="text-[10px] text-muted-foreground font-normal">by Uon1</span>
            <span className="mx-1 text-muted-foreground">•</span>
            <span className="text-foreground">{room.nome}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {participants.length} participante(s) • {isHost ? "Moderador" : "Participante"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={copyLink} className="h-8 text-xs rounded-lg">
          <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar Link
        </Button>
      </div>
    </div>
  );
}

// ── Video Grid ──
function VideoGrid() {
  const participants = useParticipants();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  // Deduplicate: show one tile per participant (camera), plus screen shares
  const seen = new Set<string>();
  const dedupedTracks = tracks.filter((trackRef) => {
    if (trackRef.source === Track.Source.ScreenShare) return true;
    const pid = trackRef.participant.sid;
    if (seen.has(pid)) return false;
    seen.add(pid);
    return true;
  });

  const count = dedupedTracks.length;
  const gridClass = count <= 1
    ? "grid-cols-1 max-w-3xl mx-auto"
    : count <= 2
      ? "grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto"
      : count <= 4
        ? "grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto"
        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="flex-1 p-3 overflow-auto flex items-center">
      <div className={`grid ${gridClass} gap-3 w-full`}>
        {dedupedTracks.map((trackRef) => {
          const hasTrack = trackRef.publication && trackRef.publication.track;
          const trackRefAny = trackRef as any;
          return (
            <div
              key={trackRef.participant.sid + (trackRef.publication?.trackSid || "placeholder")}
              className="relative bg-muted/50 rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-border/30"
            >
              {hasTrack ? (
                trackRef.source === Track.Source.Camera || trackRef.source === Track.Source.ScreenShare ? (
                  <VideoTrack trackRef={trackRefAny} className="w-full h-full object-cover" />
                ) : (
                  <AudioTrack trackRef={trackRefAny} />
                )
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
                    <VideoOff className="h-6 w-6 text-primary/70" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{trackRef.participant.name || trackRef.participant.identity}</span>
                </div>
              )}
              <div className="absolute bottom-2 left-2 px-2.5 py-1 bg-background/80 backdrop-blur-sm rounded-md text-xs text-foreground font-medium border border-border/20">
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
function ControlBar({ onLeave, chatOpen, onToggleChat }: { onLeave: () => void; chatOpen: boolean; onToggleChat: () => void }) {
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Individual rounded buttons matching system design (reference image)
  const btnBase = "h-11 w-11 rounded-full flex items-center justify-center transition-all duration-200 border";
  const btnOff = "bg-card border-border/50 text-muted-foreground hover:bg-accent";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-center gap-3 px-6 py-3 border-t border-border/50 bg-card">
        {/* Control buttons in a grouped container */}
        <div className="flex items-center gap-2 bg-muted/20 rounded-full px-2 py-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <TrackToggle
                source={Track.Source.Microphone}
                showIcon={true}
                className={`${btnBase} ${btnOff} data-[lk-muted=false]:bg-primary data-[lk-muted=false]:border-primary data-[lk-muted=false]:text-primary-foreground data-[lk-muted=false]:shadow-sm`}
              />
            </TooltipTrigger>
            <TooltipContent side="top"><p>Microfone</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <TrackToggle
                source={Track.Source.Camera}
                showIcon={true}
                className={`${btnBase} ${btnOff} data-[lk-muted=false]:bg-primary data-[lk-muted=false]:border-primary data-[lk-muted=false]:text-primary-foreground data-[lk-muted=false]:shadow-sm`}
              />
            </TooltipTrigger>
            <TooltipContent side="top"><p>Câmera</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <TrackToggle
                source={Track.Source.ScreenShare}
                showIcon={true}
                className={`${btnBase} ${btnOff} data-[lk-muted=false]:bg-primary data-[lk-muted=false]:border-primary data-[lk-muted=false]:text-primary-foreground data-[lk-muted=false]:shadow-sm`}
              />
            </TooltipTrigger>
            <TooltipContent side="top"><p>Compartilhar Tela</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleChat}
                className={`${btnBase} ${chatOpen ? "bg-primary border-primary text-primary-foreground shadow-sm hover:bg-primary/90" : btnOff}`}
              >
                <MessageCircle className="h-4.5 w-4.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Chat</p></TooltipContent>
          </Tooltip>
        </div>

        {/* Leave button */}
        {confirmLeave ? (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
            <span className="text-sm text-muted-foreground">Tem certeza?</span>
            <Button size="sm" variant="destructive" onClick={onLeave} className="rounded-full h-9 px-4 text-xs">
              Sim, finalizar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmLeave(false)} className="rounded-full h-9 px-4 text-xs">
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            variant="destructive"
            onClick={() => setConfirmLeave(true)}
            className="rounded-full h-11 px-6 text-sm font-medium gap-2"
          >
            <Phone className="h-4 w-4 rotate-[135deg]" />
            Finalizar
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}

// ── Chat Panel ──
function ChatPanel({ roomId, userId, userName }: { roomId: string; userId: string; userName: string }) {
  const [messages, setMessages] = useState<{ id: string; sender_name: string; sender_id: string; message: string; created_at: string }[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
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
    <div className="w-72 border-l border-border/50 bg-card flex flex-col">
      <div className="p-3 border-b border-border/50">
        <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
          <MessageCircle className="h-4 w-4 text-primary" /> Chat
        </h3>
      </div>
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`text-xs ${m.sender_id === userId ? "text-right" : ""}`}>
              <span className="font-semibold text-primary text-[11px]">{m.sender_id === userId ? "Eu" : m.sender_name}</span>
              <p className={`mt-0.5 p-2 rounded-lg inline-block max-w-[90%] text-foreground ${m.sender_id === userId ? "bg-primary/10" : "bg-muted"}`}>
                {m.message}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-2 border-t border-border/50 flex gap-1.5">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mensagem..."
          className="text-xs h-8"
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <Button size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={sendMessage}>
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
    <div className="w-72 border-l border-border/50 bg-card p-4 flex flex-col">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-foreground">
        <Users className="h-4 w-4 text-primary" /> Solicitações ({pending.length})
      </h3>
      <ScrollArea className="flex-1">
        <div className="space-y-2">
          {pending.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg border border-border/30">
              <span className="text-sm truncate flex-1 text-foreground">{p.display_name}</span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0 rounded-full border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                  onClick={() => handleAction(p.id, "approveParticipant")}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0 rounded-full border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => handleAction(p.id, "denyParticipant")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
