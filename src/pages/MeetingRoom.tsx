import { useState, useEffect, useCallback, useRef } from "react";
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
  Video, VideoOff, Mic, MicOff, MonitorUp, Phone, Copy, Users, Check, X, MessageCircle, Send,
  Maximize2, Minimize2, PictureInPicture2, LayoutGrid, Settings2, Hand, Smile, PersonStanding, Clock, Calendar, Timer, Expand, Shrink, Pin, PinOff, Film, PanelBottom, PanelRight
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

// Lazy-load LiveKit to avoid module import crashes
let LiveKitRoom: any;
let VideoTrack: any;
let AudioTrack: any;
let useTracks: any;
let useParticipants: any;
let TrackToggle: any;
let Track: any;
let useDataChannel: any;
let useLocalParticipant: any;
let useRoomContext: any;
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
    useDataChannel = componentsReact.useDataChannel;
    useLocalParticipant = componentsReact.useLocalParticipant;
    useRoomContext = componentsReact.useRoomContext;
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
  agendado_para: string | null;
  duracao_minutos: number | null;
  finalizado_em: string | null;
}

interface PendingParticipant {
  id: string;
  identity: string;
  display_name: string;
  status: string;
  is_host: boolean;
  created_at: string;
}

// Reaction/hand raise data types
interface DataMessage {
  type: "reaction" | "hand_raise" | "hand_lower";
  emoji?: string;
  senderName?: string;
  senderId?: string;
}

const REACTION_EMOJIS = ["👍", "👏", "😂", "❤️", "🎉", "🔥", "😮", "🤔"];

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

  const handleEndRoom = async () => {
    if (isHost && roomId) {
      try {
        const session = (await supabase.auth.getSession()).data.session;
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=endRoom`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ roomId }),
          }
        );
        toast.success("Reunião finalizada");
      } catch {
        // silently fail, still navigate
      }
    }
    navigate("/video");
  };

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
        key={token}
        serverUrl={livekitUrl}
        token={token}
        connect={true}
        video={true}
        audio={true}
        onDisconnected={handleDisconnect}
        className="flex flex-col flex-1"
      >
        <RoomHeader room={room} isHost={isHost} roomId={roomId!} onLeave={handleEndRoom} />
        <MeetingTimer room={room} isHost={isHost} roomId={roomId!} onTimeUp={async () => {
          toast.info("Reunião finalizada automaticamente (tempo esgotado)");
          await handleEndRoom();
        }} onExtend={(mins) => {
          setRoom(prev => prev ? { ...prev, duracao_minutos: (prev.duracao_minutos || 60) + mins } : prev);
        }} />
        <div className="flex flex-1 overflow-hidden">
          <VideoGridWithReactions />
          {chatOpen && <ChatPanel roomId={roomId!} userId={user?.id || ""} userName={user?.user_metadata?.nome || user?.email || "Eu"} />}
          {isHost && <PendingRequestsPanel roomId={roomId!} />}
        </div>
        <ControlBar onLeave={handleEndRoom} chatOpen={chatOpen} onToggleChat={() => setChatOpen(!chatOpen)} />
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

// ── Meeting Timer ──
function MeetingTimer({ room, isHost, roomId, onTimeUp, onExtend }: { 
  room: RoomData; isHost: boolean; roomId: string; 
  onTimeUp: () => void; onExtend: (mins: number) => void;
}) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [warned, setWarned] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    if (!room.agendado_para || !room.duracao_minutos) return;
    const startMs = new Date(room.agendado_para).getTime();
    const endMs = startMs + room.duracao_minutos * 60 * 1000;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endMs - now) / 1000));
      setRemainingSeconds(remaining);

      // Warning at 5 minutes
      if (remaining <= 300 && remaining > 0 && !warned) {
        setWarned(true);
        toast.warning("⏰ Faltam 5 minutos para o fim da reunião!", { duration: 8000 });
        if (isHost) setShowExtend(true);
      }

      // Time's up
      if (remaining <= 0) {
        clearInterval(interval);
        onTimeUp();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room.agendado_para, room.duracao_minutos, warned, isHost]);

  const handleExtend = async (mins: number) => {
    setExtending(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=extendRoom`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomId, extraMinutes: mins }),
        }
      );
      onExtend(mins);
      setShowExtend(false);
      setWarned(false);
      toast.success(`Reunião estendida em ${mins} minutos`);
    } catch {
      toast.error("Erro ao estender reunião");
    }
    setExtending(false);
  };

  if (remainingSeconds === null) return null;

  const hrs = Math.floor(remainingSeconds / 3600);
  const mins = Math.floor((remainingSeconds % 3600) / 60);
  const secs = remainingSeconds % 60;
  const isUrgent = remainingSeconds <= 300;

  return (
    <>
      {/* Timer badge in header */}
      <div className={`flex items-center justify-center gap-2 py-1 text-xs font-mono ${
        isUrgent ? "bg-destructive/10 text-destructive animate-pulse" : "bg-muted/50 text-muted-foreground"
      }`}>
        <Clock className="h-3 w-3" />
        <span>Tempo restante: {hrs > 0 ? `${hrs}h ` : ""}{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</span>
        {room.agendado_para && (
          <span className="ml-2 opacity-70">
            • Início: {new Date(room.agendado_para).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {room.duracao_minutos && ` • Fim: ${new Date(new Date(room.agendado_para).getTime() + room.duracao_minutos * 60000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </span>
        )}
      </div>

      {/* Extend dialog for host */}
      {showExtend && isHost && (
        <div className="flex items-center justify-center gap-3 py-2 bg-yellow-500/10 border-b border-yellow-500/30 px-4">
          <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">⏰ Tempo acabando! Estender reunião?</span>
          {[15, 30, 60].map(m => (
            <Button key={m} size="sm" variant="outline" className="h-7 text-xs" disabled={extending} onClick={() => handleExtend(m)}>
              +{m} min
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowExtend(false)}>Ignorar</Button>
        </div>
      )}
    </>
  );
}

// ── Room Header ──
function RoomHeader({ room, isHost, roomId, onLeave }: { room: RoomData; isHost: boolean; roomId: string; onLeave: () => void }) {
  const participants = useParticipants();

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/video/${roomId}`);
    toast.success("Link copiado!");
  };

  const startTime = room.agendado_para ? new Date(room.agendado_para) : null;
  const endTime = startTime && room.duracao_minutos ? new Date(startTime.getTime() + room.duracao_minutos * 60000) : null;

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
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            {participants.length} participante(s) • {isHost ? "Moderador" : "Participante"}
            {startTime && (
              <span className="flex items-center gap-1">
                • <Calendar className="h-3 w-3" />
                {startTime.toLocaleDateString("pt-BR")} {startTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                {endTime && ` – ${endTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
              </span>
            )}
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

type LayoutMode = "auto" | "mosaic" | "spotlight" | "sidebar";

// ── Floating Reactions Display ──
function FloatingReactions({ reactions }: { reactions: { id: string; emoji: string; senderName: string }[] }) {
  return (
    <div className="absolute bottom-20 left-4 z-20 pointer-events-none space-y-2">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg border border-border/30"
        >
          <span className="text-xl">{r.emoji}</span>
          <span className="text-xs text-foreground font-medium">{r.senderName}</span>
        </div>
      ))}
    </div>
  );
}

// ── Hand Raise Indicators ──
function HandRaiseIndicators({ raisedHands }: { raisedHands: Map<string, string> }) {
  if (raisedHands.size === 0) return null;
  return (
    <div className="absolute top-16 left-4 z-20 space-y-1.5">
      {Array.from(raisedHands.entries()).map(([id, name]) => (
        <div
          key={id}
          className="flex items-center gap-2 bg-purple-600 text-white rounded-full px-3 py-1 shadow-lg animate-in fade-in slide-in-from-left-4 duration-300"
        >
          <Hand className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">{name} levantou a mão</span>
        </div>
      ))}
    </div>
  );
}

// ── Video Grid with Reactions wrapper ──
function VideoGridWithReactions() {
  const [reactions, setReactions] = useState<{ id: string; emoji: string; senderName: string }[]>([]);
  const [raisedHands, setRaisedHands] = useState<Map<string, string>>(new Map());

  const encoder = useRef(new TextEncoder());
  const decoder = useRef(new TextDecoder());

  const onDataReceived = useCallback((payload: any) => {
    try {
      const strData = typeof payload === "string"
        ? payload
        : payload?.payload
          ? decoder.current.decode(payload.payload)
          : null;
      if (!strData) return;
      const msg: DataMessage = JSON.parse(strData);

      if (msg.type === "reaction" && msg.emoji && msg.senderName) {
        const id = crypto.randomUUID();
        setReactions((prev) => [...prev.slice(-4), { id, emoji: msg.emoji!, senderName: msg.senderName! }]);
        setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 4000);
      } else if (msg.type === "hand_raise" && msg.senderId && msg.senderName) {
        setRaisedHands((prev) => new Map(prev).set(msg.senderId!, msg.senderName!));
      } else if (msg.type === "hand_lower" && msg.senderId) {
        setRaisedHands((prev) => {
          const next = new Map(prev);
          next.delete(msg.senderId!);
          return next;
        });
      }
    } catch {
      // ignore malformed data
    }
  }, []);

  // Use LiveKit data channel - called unconditionally at top level
  const dataChannelResult = useDataChannel?.("reactions", onDataReceived) || null;
  const sendData = dataChannelResult?.send || null;

  return (
    <div className="flex-1 relative overflow-hidden">
      <FloatingReactions reactions={reactions} />
      <HandRaiseIndicators raisedHands={raisedHands} />
      <VideoGrid sendData={sendData} raisedHands={raisedHands} setRaisedHands={setRaisedHands} />
    </div>
  );
}

// ── Video Grid ──
function VideoGrid({ sendData, raisedHands, setRaisedHands }: { 
  sendData: ((data: Uint8Array) => void) | null;
  raisedHands: Map<string, string>;
  setRaisedHands: React.Dispatch<React.SetStateAction<Map<string, string>>>;
}) {
  const participants = useParticipants();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.Microphone, withPlaceholder: false },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  const [enlargedSid, setEnlargedSid] = useState<string | null>(null);
  const [pipSid, setPipSid] = useState<string | null>(null);
  const [fullscreenSid, setFullscreenSid] = useState<string | null>(null);
  const [pinnedSid, setPinnedSid] = useState<string | null>(null);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [presentationLayout, setPresentationLayout] = useState<"strip" | "sidebar">(
    () => "sidebar"
  );
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => (localStorage.getItem("uon1-video-layout") as LayoutMode) || "auto");
  const [maxTiles, setMaxTiles] = useState<number>(() => parseInt(localStorage.getItem("uon1-video-max-tiles") || "50", 10));
  const [hideNoVideo, setHideNoVideo] = useState<boolean>(() => localStorage.getItem("uon1-video-hide-novideo") === "true");

  // Sync with ControlBar layout changes via storage event
  useEffect(() => {
    const handler = () => {
      setLayoutMode((localStorage.getItem("uon1-video-layout") as LayoutMode) || "auto");
      setMaxTiles(parseInt(localStorage.getItem("uon1-video-max-tiles") || "16", 10));
      setHideNoVideo(localStorage.getItem("uon1-video-hide-novideo") === "true");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const audioTracks = tracks.filter((t) => t.source === Track.Source.Microphone);
  const visualTracks = tracks.filter((t) => t.source !== Track.Source.Microphone);

  const seen = new Set<string>();
  let dedupedTracks = visualTracks.filter((trackRef) => {
    if (trackRef.source === Track.Source.ScreenShare) return true;
    const pid = trackRef.participant.sid;
    if (seen.has(pid)) return false;
    seen.add(pid);
    return true;
  });

  // Filter no-video if enabled
  if (hideNoVideo) {
    dedupedTracks = dedupedTracks.filter(t => t.publication?.track || t.source === Track.Source.ScreenShare);
  }

  // Apply max tiles limit
  const limitedTracks = dedupedTracks.slice(0, maxTiles);

  // Auto-detect screen share to switch into spotlight/sidebar layout (Meet/Zoom behavior)
  const screenShareTrack = limitedTracks.find(t => t.source === Track.Source.ScreenShare) || null;
  const hasScreenShare = !!screenShareTrack;

  // Effective layout: if screen share is active and user is in "auto", force sidebar
  const effectiveLayout: LayoutMode = hasScreenShare && layoutMode === "auto" ? "sidebar" : layoutMode;

  let spotlightTrack: any = null;
  // Pin has highest precedence: if user explicitly pinned someone, show them as spotlight
  const pinnedTrack = pinnedSid ? limitedTracks.find(t => t.participant.sid === pinnedSid && t.source !== Track.Source.ScreenShare) : null;
  const enlargedTrack = enlargedSid ? limitedTracks.find(t => t.participant.sid === enlargedSid) : null;
  if (pinnedTrack && !hasScreenShare) {
    spotlightTrack = pinnedTrack;
  } else if (hasScreenShare) {
    spotlightTrack = screenShareTrack;
  } else if (enlargedTrack) {
    spotlightTrack = enlargedTrack;
  } else if (effectiveLayout === "spotlight" || effectiveLayout === "sidebar") {
    spotlightTrack = pinnedTrack || limitedTracks[0] || null;
  }
  
  const gridTracks = spotlightTrack 
    ? limitedTracks.filter(t => t !== spotlightTrack) 
    : limitedTracks;
  const gridCount = gridTracks.length;

  // Dynamic grid class based on layout mode
  const getGridClass = () => {
    if (effectiveLayout === "mosaic") {
      if (gridCount <= 1) return "grid-cols-1";
      if (gridCount <= 4) return "grid-cols-2";
      if (gridCount <= 9) return "grid-cols-3";
      if (gridCount <= 16) return "grid-cols-4";
      if (gridCount <= 25) return "grid-cols-5";
      if (gridCount <= 36) return "grid-cols-6";
      return "grid-cols-7";
    }
    if (spotlightTrack) {
      if (effectiveLayout === "sidebar") return "grid-cols-1";
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
    }
    // auto - Google Meet style
    if (gridCount <= 1) return "grid-cols-1";
    if (gridCount === 2) return "grid-cols-1 sm:grid-cols-2";
    if (gridCount <= 4) return "grid-cols-2";
    if (gridCount <= 6) return "grid-cols-2 lg:grid-cols-3";
    if (gridCount <= 9) return "grid-cols-3";
    if (gridCount <= 16) return "grid-cols-3 lg:grid-cols-4";
    if (gridCount <= 25) return "grid-cols-4 lg:grid-cols-5";
    if (gridCount <= 36) return "grid-cols-5 lg:grid-cols-6";
    return "grid-cols-6 lg:grid-cols-7";
  };

  const handlePip = async (trackRef: any) => {
    const videoEl = document.querySelector(`[data-participant-sid="${trackRef.participant.sid}"] video`) as HTMLVideoElement | null;
    if (videoEl && document.pictureInPictureEnabled) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          setPipSid(null);
        } else {
          await videoEl.requestPictureInPicture();
          setPipSid(trackRef.participant.sid);
          videoEl.addEventListener('leavepictureinpicture', () => setPipSid(null), { once: true });
        }
      } catch { /* ignore */ }
    } else {
      toast.error("PIP não suportado neste navegador");
    }
  };

  const handleFullscreen = async (trackRef: any) => {
    const tileEl = document.querySelector(`[data-participant-sid="${trackRef.participant.sid}"]`) as HTMLElement | null;
    if (!tileEl) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFullscreenSid(null);
      } else {
        await tileEl.requestFullscreen();
        setFullscreenSid(trackRef.participant.sid);
        const onExit = () => {
          if (!document.fullscreenElement) {
            setFullscreenSid(null);
            document.removeEventListener('fullscreenchange', onExit);
          }
        };
        document.addEventListener('fullscreenchange', onExit);
      }
    } catch {
      toast.error("Tela cheia não suportada");
    }
  };

  const renderTile = (trackRef: any, isEnlarged = false) => {
    const hasTrack = trackRef.publication && trackRef.publication.track;
    const trackRefAny = trackRef as any;
    const sid = trackRef.participant.sid;
    const name = trackRef.participant.name || trackRef.participant.identity;
    const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
    const hasHandRaised = raisedHands.has(trackRef.participant.identity) || raisedHands.has(sid);
    const isScreen = trackRef.source === Track.Source.ScreenShare;
    const isFullscreen = fullscreenSid === sid;
    const isPinned = pinnedSid === sid && !isScreen;
    const canPin = !isScreen; // can't pin a screen share (it's auto-spotlighted)

    // Click-to-pin behavior on small tiles (strip): single click pins/unpins
    const handleTileClick = () => {
      if (isEnlarged || !canPin) return;
      setPinnedSid(prev => (prev === sid ? null : sid));
    };

    return (
      <div
        key={sid + (trackRef.publication?.trackSid || "placeholder")}
        data-participant-sid={sid}
        onClick={handleTileClick}
        className={`relative rounded-2xl overflow-hidden flex items-center justify-center group/tile transition-shadow duration-300 ${
          isEnlarged ? "w-full h-full" : "h-full aspect-video shrink-0"
        } ${hasTrack ? "bg-muted" : "bg-muted/50"} ${hasHandRaised ? "ring-2 ring-yellow-500" : ""} ${
          isPinned ? "ring-2 ring-primary" : ""
        } ${!isEnlarged && canPin ? "cursor-pointer hover:ring-2 hover:ring-primary/50" : ""}`}
      >
        {hasTrack ? (
          trackRef.source === Track.Source.Camera || trackRef.source === Track.Source.ScreenShare ? (
            <VideoTrack trackRef={trackRefAny} className={`w-full h-full ${isScreen ? 'object-contain bg-black' : 'object-cover'}`} />
          ) : (
            <AudioTrack trackRef={trackRefAny} />
          )
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className={`${isEnlarged ? 'w-20 h-20 sm:w-24 sm:h-24' : 'w-12 h-12 sm:w-16 sm:h-16'} rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/30`}>
              <span className={`${isEnlarged ? 'text-2xl sm:text-3xl' : 'text-base sm:text-xl'} font-bold text-primary`}>{initials}</span>
            </div>
          </div>
        )}
        {/* Hand raise indicator on tile - top right */}
        {hasHandRaised && (
          <div className="absolute top-2 right-2 bg-purple-600 text-white rounded-full p-1.5 shadow-lg z-10">
            <Hand className="h-4 w-4" />
          </div>
        )}
        {/* Pinned indicator - top left */}
        {isPinned && !isEnlarged && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground rounded-full p-1 shadow-lg z-10">
            <Pin className="h-3 w-3" />
          </div>
        )}
        {/* Name badge - bottom left */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/80 to-transparent p-3 pt-8">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-foreground font-medium truncate">
              {name}{isScreen ? ' (apresentando)' : ''}
            </span>
          </div>
        </div>
        {/* Controls overlay - top right */}
        <div
          className={`absolute ${isEnlarged ? 'top-2 right-2' : 'bottom-2 right-2'} flex items-center gap-1 opacity-0 group-hover/tile:opacity-100 transition-opacity z-20 max-w-full flex-wrap justify-end`}
          onClick={(e) => e.stopPropagation()}
        >
          {canPin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setPinnedSid(prev => (prev === sid ? null : sid))}
                  className={`h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors border border-border/30 ${isPinned ? 'ring-2 ring-primary' : ''}`}
                >
                  {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{isPinned ? "Desafixar" : "Fixar como destaque"}</TooltipContent>
            </Tooltip>
          )}
          {isEnlarged && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleFullscreen(trackRef)}
                  className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors border border-border/30"
                >
                  {isFullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? "Sair da tela cheia" : "Tela cheia"}</TooltipContent>
            </Tooltip>
          )}
          {isEnlarged && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCinemaMode(c => !c)}
                  className={`h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors border border-border/30 ${cinemaMode ? 'ring-2 ring-primary' : ''}`}
                >
                  <Film className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{cinemaMode ? "Sair do modo cinema" : "Modo cinema"}</TooltipContent>
            </Tooltip>
          )}
          {isEnlarged && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    const next = presentationLayout === "strip" ? "sidebar" : "strip";
                    setPresentationLayout(next);
                    localStorage.setItem("uon1-presentation-layout", next);
                  }}
                  className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors border border-border/30"
                >
                  {presentationLayout === "strip" ? <PanelRight className="h-4 w-4" /> : <PanelBottom className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{presentationLayout === "strip" ? "Participantes na lateral" : "Participantes embaixo"}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setEnlargedSid(isEnlarged ? null : sid)}
                className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors border border-border/30"
              >
                {isEnlarged ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{isEnlarged ? "Reduzir" : "Ampliar"}</TooltipContent>
          </Tooltip>
          {hasTrack && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handlePip(trackRef)}
                  className={`h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors border border-border/30 ${pipSid === sid ? 'ring-2 ring-primary' : ''}`}
                >
                  <PictureInPicture2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Picture-in-Picture</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    );
  };

  const layoutOptions: { value: LayoutMode; label: string; desc: string }[] = [
    { value: "auto", label: "Automático (dinâmico)", desc: "Ajusta conforme participantes" },
    { value: "mosaic", label: "Mosaico", desc: "Grid uniforme para todos" },
    { value: "spotlight", label: "Destaque", desc: "Um participante em foco" },
    { value: "sidebar", label: "Barra lateral", desc: "Principal + lista lateral" },
  ];

  return (
    <div className={`h-full w-full overflow-hidden flex flex-col bg-muted/30 p-2 sm:p-3 gap-2 sm:gap-3`}>
      {/* Invisible audio tracks */}
      {audioTracks.map((trackRef) => (
        trackRef.publication?.track ? (
          <AudioTrack key={trackRef.participant.sid + '-audio'} trackRef={trackRef} />
        ) : null
      ))}

      {spotlightTrack ? (
        presentationLayout === "sidebar" && !cinemaMode ? (
          /* Sidebar layout: spotlight on the left, participants stacked on the right (Zoom side-by-side) */
          <div className="flex-1 min-h-0 flex gap-2 sm:gap-3">
            <div className="flex-1 min-w-0 rounded-2xl overflow-hidden">
              {renderTile(spotlightTrack, true)}
            </div>
            {gridTracks.length > 0 && (
              <div className="w-[180px] sm:w-[220px] lg:w-[260px] shrink-0 flex flex-col gap-2 overflow-y-auto overflow-x-hidden">
                {gridTracks.map((trackRef) => (
                  <div key={trackRef.participant.sid + (trackRef.publication?.trackSid || 'p')} className="aspect-video w-full shrink-0">
                    {renderTile(trackRef)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Strip layout (default, like the user's reference) */
          <>
            <div className="flex-1 min-h-0 rounded-2xl overflow-hidden">
              {renderTile(spotlightTrack, true)}
            </div>
            {!cinemaMode && gridTracks.length > 0 && (
              <div className="h-[14vh] min-h-[110px] max-h-[160px] shrink-0 flex flex-row items-stretch gap-2 overflow-x-auto overflow-y-hidden px-1">
                {gridTracks.map((trackRef) => (
                  <div key={trackRef.participant.sid + (trackRef.publication?.trackSid || 'p')} className="h-full aspect-video shrink-0">
                    {renderTile(trackRef)}
                  </div>
                ))}
              </div>
            )}
          </>
        )
      ) : (
        /* Grid mode: tiles auto-fit visible area without overflow */
        <div className={`flex-1 min-h-0 grid ${getGridClass()} gap-2 sm:gap-3 items-stretch content-stretch auto-rows-fr`}>
          {gridTracks.map((trackRef) => (
            <div key={trackRef.participant.sid + (trackRef.publication?.trackSid || 'p')} className="min-h-0 min-w-0">
              {renderTile(trackRef, true)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Control Bar ──
function ControlBar({ onLeave, chatOpen, onToggleChat }: { onLeave: () => void; chatOpen: boolean; onToggleChat: () => void }) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [blurEnabled, setBlurEnabled] = useState(false);
  const [blurLoading, setBlurLoading] = useState(false);
  const blurEnabledRef = useRef(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => (localStorage.getItem("uon1-video-layout") as LayoutMode) || "auto");
  const [maxTiles, setMaxTiles] = useState<number>(() => parseInt(localStorage.getItem("uon1-video-max-tiles") || "50", 10));
  const [hideNoVideo, setHideNoVideo] = useState<boolean>(() => localStorage.getItem("uon1-video-hide-novideo") === "true");

  const saveLayoutMode = (mode: LayoutMode) => { setLayoutMode(mode); localStorage.setItem("uon1-video-layout", mode); window.dispatchEvent(new Event("storage")); };
  const saveMaxTiles = (val: number) => { setMaxTiles(val); localStorage.setItem("uon1-video-max-tiles", String(val)); window.dispatchEvent(new Event("storage")); };
  const saveHideNoVideo = (val: boolean) => { setHideNoVideo(val); localStorage.setItem("uon1-video-hide-novideo", String(val)); window.dispatchEvent(new Event("storage")); };

  const layoutOptions: { value: LayoutMode; label: string; desc: string }[] = [
    { value: "auto", label: "Automático", desc: "Ajusta conforme participantes" },
    { value: "mosaic", label: "Mosaico", desc: "Grid uniforme para todos" },
    { value: "spotlight", label: "Destaque", desc: "Um participante em foco" },
    { value: "sidebar", label: "Barra lateral", desc: "Principal + lista lateral" },
  ];

  const encoder = useRef(new TextEncoder());

  // Hooks called unconditionally at top level
  const dataChannelResult = useDataChannel?.("reactions") || null;
  const sendData = dataChannelResult?.send || null;

  const localParticipantResult = useLocalParticipant?.() || {};
  const localParticipant = localParticipantResult?.localParticipant;
  const localName = localParticipant?.name || localParticipant?.identity || "Eu";
  const localIdentity = localParticipant?.identity || "";

  const roomContext = useRoomContext?.() || null;

  const broadcastMessage = useCallback((msg: DataMessage) => {
    if (!sendData) return;
    try {
      const data = encoder.current.encode(JSON.stringify(msg));
      sendData(data);
    } catch (e) {
      console.error("Failed to send data:", e);
    }
  }, [sendData]);

  const toggleHandRaise = () => {
    const newState = !handRaised;
    setHandRaised(newState);
    broadcastMessage({
      type: newState ? "hand_raise" : "hand_lower",
      senderName: localName,
      senderId: localIdentity,
    });
    if (newState) toast.info("🖐️ Mão levantada");
    else toast.info("Mão abaixada");
  };

  const sendReaction = (emoji: string) => {
    broadcastMessage({
      type: "reaction",
      emoji,
      senderName: localName,
      senderId: localIdentity,
    });
    setShowReactions(false);
    toast.info(`${emoji} Reação enviada`);
  };

  const toggleBackgroundBlur = async () => {
    if (blurLoading) return;
    setBlurLoading(true);
    try {
      const room = roomContext;
      const lp = room?.localParticipant;
      
      if (!lp) {
        toast.error("Participante local não encontrado");
        setBlurLoading(false);
        return;
      }

      const cameraPub = lp.getTrackPublication(Track.Source.Camera);
      const cameraTrack = cameraPub?.track;

      if (!cameraTrack) {
        toast.error("Câmera não está ativa. Ative a câmera primeiro.");
        setBlurLoading(false);
        return;
      }

      const mediaTrack = cameraTrack.mediaStreamTrack;
      if (!mediaTrack) {
        toast.error("Track de mídia não disponível");
        setBlurLoading(false);
        return;
      }

      if (!blurEnabled) {
        // Apply blur using canvas processing
        try {
          const stream = new MediaStream([mediaTrack]);
          const videoEl = document.createElement("video");
          videoEl.srcObject = stream;
          videoEl.muted = true;
          await videoEl.play();

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d")!;
          canvas.width = mediaTrack.getSettings().width || 640;
          canvas.height = mediaTrack.getSettings().height || 480;

          const processFrame = () => {
            if (!blurEnabledRef.current) return;
            ctx.filter = "blur(10px)";
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            ctx.filter = "none";
            // Draw person area with less blur (center)
            const cx = canvas.width * 0.15;
            const cy = canvas.height * 0.05;
            const cw = canvas.width * 0.7;
            const ch = canvas.height * 0.9;
            ctx.drawImage(videoEl, cx, cy, cw, ch, cx, cy, cw, ch);
            requestAnimationFrame(processFrame);
          };

          blurEnabledRef.current = true;
          processFrame();

          const canvasStream = canvas.captureStream(30);
          const canvasTrack = canvasStream.getVideoTracks()[0];
          
          // Store original track for restoration
          (lp as any)._originalCameraTrack = mediaTrack;
          
          await cameraTrack.replaceTrack(canvasTrack);
          setBlurEnabled(true);
          toast.success("Ofuscação de fundo ativada");
        } catch (err: any) {
          console.error("Blur processing error:", err);
          toast.error("Erro ao aplicar ofuscação: " + (err.message || ""));
        }
      } else {
        // Restore original track
        blurEnabledRef.current = false;
        const originalTrack = (lp as any)._originalCameraTrack;
        if (originalTrack) {
          await cameraTrack.replaceTrack(originalTrack);
          delete (lp as any)._originalCameraTrack;
        }
        setBlurEnabled(false);
        toast.info("Ofuscação de fundo desativada");
      }
    } catch (e: any) {
      console.error("Background blur error:", e);
      toast.error("Erro ao aplicar ofuscação de fundo");
    } finally {
      setBlurLoading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-6 py-3 sm:py-4 bg-card border-t border-border/50 relative">
        {/* Reactions popup */}
        {showReactions && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-card border border-border rounded-2xl shadow-xl p-3 flex gap-2 animate-in fade-in slide-in-from-bottom-4 duration-200 z-30">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                className="text-2xl hover:scale-125 transition-transform p-1 rounded-lg hover:bg-muted"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <TrackToggle
                source={Track.Source.Microphone}
                showIcon={true}
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all duration-200 [&_svg]:!h-5 [&_svg]:!w-5 data-[lk-muted=true]:bg-destructive data-[lk-muted=true]:text-destructive-foreground data-[lk-muted=false]:bg-primary data-[lk-muted=false]:text-primary-foreground data-[lk-muted=false]:hover:bg-primary/90"
              />
            </TooltipTrigger>
            <TooltipContent side="top"><p>Microfone</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <TrackToggle
                source={Track.Source.Camera}
                showIcon={true}
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all duration-200 [&_svg]:!h-5 [&_svg]:!w-5 data-[lk-muted=true]:bg-destructive data-[lk-muted=true]:text-destructive-foreground data-[lk-muted=false]:bg-primary data-[lk-muted=false]:text-primary-foreground data-[lk-muted=false]:hover:bg-primary/90"
              />
            </TooltipTrigger>
            <TooltipContent side="top"><p>Câmera</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <TrackToggle
                source={Track.Source.ScreenShare}
                showIcon={true}
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all duration-200 [&_svg]:!h-5 [&_svg]:!w-5 data-[lk-muted=true]:bg-muted data-[lk-muted=true]:text-muted-foreground data-[lk-muted=true]:hover:bg-accent data-[lk-muted=false]:bg-primary data-[lk-muted=false]:text-primary-foreground"
              />
            </TooltipTrigger>
            <TooltipContent side="top"><p>Compartilhar Tela</p></TooltipContent>
          </Tooltip>

          <div className="w-px h-8 bg-border mx-0.5" />

          {/* Hand Raise */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleHandRaise}
                className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all duration-200 ${
                  handRaised
                    ? "bg-purple-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                <Hand className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>{handRaised ? "Abaixar mão" : "Levantar mão"}</p></TooltipContent>
          </Tooltip>

          {/* Reactions */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowReactions(!showReactions)}
                className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all duration-200 ${
                  showReactions
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                <Smile className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Reações</p></TooltipContent>
          </Tooltip>

          {/* Background blur */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleBackgroundBlur}
                disabled={blurLoading}
                className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all duration-200 ${
                  blurEnabled
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                } ${blurLoading ? "opacity-50" : ""}`}
              >
                <PersonStanding className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>{blurEnabled ? "Desativar ofuscação" : "Ofuscar fundo"}</p></TooltipContent>
          </Tooltip>

          {/* Chat */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleChat}
                className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all duration-200 ${
                  chatOpen
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                <MessageCircle className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Chat</p></TooltipContent>
          </Tooltip>

          {/* Layout settings */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button className="h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all duration-200 bg-muted text-muted-foreground hover:bg-accent">
                    <LayoutGrid className="h-5 w-5" />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top"><p>Visualização</p></TooltipContent>
            </Tooltip>
            <PopoverContent className="w-72" align="center" side="top">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm mb-1">Ajuste a visualização</h4>
                  <p className="text-xs text-muted-foreground">A seleção é salva para as próximas reuniões</p>
                </div>
                <RadioGroup value={layoutMode} onValueChange={(v) => saveLayoutMode(v as LayoutMode)}>
                  {layoutOptions.map(opt => (
                    <div key={opt.value} className="flex items-center gap-3 py-1.5">
                      <RadioGroupItem value={opt.value} id={`layout-bar-${opt.value}`} />
                      <Label htmlFor={`layout-bar-${opt.value}`} className="cursor-pointer">
                        <span className="text-sm font-medium">{opt.label}</span>
                        <span className="block text-xs text-muted-foreground">{opt.desc}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div>
                    <h5 className="text-xs font-semibold mb-1">Blocos</h5>
                    <p className="text-[10px] text-muted-foreground">Máximo de blocos para exibição</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <LayoutGrid className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Slider value={[maxTiles]} onValueChange={([v]) => saveMaxTiles(v)} min={1} max={50} step={1} className="flex-1" />
                    <span className="text-xs text-muted-foreground w-5 text-right">{maxTiles}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <Label htmlFor="hide-no-video-bar" className="text-xs">Ocultar blocos sem vídeo</Label>
                  <Switch id="hide-no-video-bar" checked={hideNoVideo} onCheckedChange={saveHideNoVideo} className="scale-90" />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="w-px h-8 bg-border mx-1 sm:mx-2" />

        {confirmLeave ? (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
            <span className="text-xs sm:text-sm text-muted-foreground">Tem certeza?</span>
            <Button size="sm" variant="destructive" onClick={onLeave} className="rounded-full h-9 px-4 text-xs">
              Sim
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmLeave(false)} className="rounded-full h-9 px-4 text-xs">
              Não
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmLeave(true)}
            className="h-12 sm:h-14 px-5 sm:px-6 rounded-full bg-destructive text-destructive-foreground font-medium text-sm flex items-center gap-2 hover:bg-destructive/90 transition-colors"
          >
            <Phone className="h-4 w-4 rotate-[135deg]" />
            <span className="hidden sm:inline">Finalizar</span>
          </button>
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
  const knownIdsRef = useRef<Set<string>>(new Set());

  const fetchPending = async () => {
    const { data } = await supabase
      .from("meeting_participants")
      .select("*")
      .eq("room_id", roomId)
      .eq("status", "pending");
    const list = (data as unknown as PendingParticipant[]) || [];
    // Notify on new pending participants (after first load)
    if (knownIdsRef.current.size > 0) {
      list.forEach(p => {
        if (!knownIdsRef.current.has(p.id)) {
          toast.info(`${p.display_name} quer entrar na sala`, { duration: 10000 });
        }
      });
    }
    knownIdsRef.current = new Set(list.map(p => p.id));
    setPending(list);
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
    <div className="fixed top-20 right-4 z-[110] w-80 max-w-[calc(100vw-2rem)] bg-card border border-primary/40 rounded-xl shadow-2xl p-3 flex flex-col animate-in slide-in-from-right">
      <h3 className="font-semibold text-sm mb-2 flex items-center gap-2 text-foreground">
        <Users className="h-4 w-4 text-primary" />
        <span className="flex-1">Aguardando aprovação ({pending.length})</span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
      </h3>
      <ScrollArea className="max-h-[40vh]">
        <div className="space-y-2 pr-1">
          {pending.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 p-2.5 bg-muted/40 rounded-lg border border-border/30">
              <span className="text-sm truncate flex-1 text-foreground">{p.display_name}</span>
              <div className="flex gap-1.5 shrink-0">
                <Button
                  size="sm"
                  className="h-8 px-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                  onClick={() => handleAction(p.id, "approveParticipant")}
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> Admitir
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 rounded-full border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
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
