import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Video, VideoOff, Users, Mic, MicOff, MonitorUp, Phone, MessageCircle, Send
} from "lucide-react";

// Lazy-load LiveKit
let LiveKitRoom: any;
let VideoTrack: any;
let AudioTrack: any;
let useTracks: any;
let useParticipants: any;
let TrackToggle: any;
let Track: any;
let livekitLoaded = false;

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

  // Listen for approval via realtime
  useEffect(() => {
    if (!roomId || !participantIdentity || approved) return;

    const channel = supabase
      .channel(`guest-approval-${roomId}-${participantIdentity}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "meeting_participants",
        filter: `room_id=eq.${roomId}`,
      }, async (payload) => {
        const updated = payload.new as any;
        if (updated.identity !== participantIdentity) return;

        if (updated.status === "approved") {
          // Fetch new token with canPublish=true
          try {
            const res = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=getGuestToken`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomId, identity: participantIdentity }),
              }
            );
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setToken(data.token);
            setLivekitUrl(data.livekitUrl);
            setApproved(true);
            toast.success("Aprovado! Entrando na sala...");
          } catch (e: any) {
            console.error("Error fetching guest token:", e);
            toast.error("Erro ao entrar na sala");
          }
        } else if (updated.status === "denied") {
          toast.error("Sua entrada foi recusada pelo moderador");
          setToken(null);
          setError("Entrada recusada pelo moderador");
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
  if (approved && token && livekitUrl && livekitReady) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <LiveKitRoom
          serverUrl={livekitUrl}
          token={token}
          connect={true}
          onDisconnected={() => { setApproved(false); setToken(null); }}
          className="flex flex-col flex-1"
        >
          {/* Header */}
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
                  <span className="text-foreground">{roomInfo?.nome}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{displayName} • Convidado</p>
              </div>
            </div>
          </div>

          {/* Video grid + controls */}
          <div className="flex flex-1 overflow-hidden">
            <GuestVideoGrid />
            {chatOpen && roomId && (
              <GuestChatPanel roomId={roomId} guestName={displayName} guestIdentity={participantIdentity} />
            )}
          </div>
          <GuestControlBar
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

// ── Guest Video Grid ──
function GuestVideoGrid() {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  const seen = new Set<string>();
  const dedupedTracks = tracks.filter((trackRef: any) => {
    if (trackRef.source === Track.Source.ScreenShare) return true;
    const pid = trackRef.participant.sid;
    if (seen.has(pid)) return false;
    seen.add(pid);
    return true;
  });

  const count = dedupedTracks.length;
  const gridClass = count <= 1
    ? "grid-cols-1 max-w-3xl mx-auto"
    : count <= 4
      ? "grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto"
      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="flex-1 p-3 overflow-auto flex items-center">
      <div className={`grid ${gridClass} gap-3 w-full`}>
        {dedupedTracks.map((trackRef: any) => {
          const hasTrack = trackRef.publication && trackRef.publication.track;
          return (
            <div
              key={trackRef.participant.sid + (trackRef.publication?.trackSid || "placeholder")}
              className="relative bg-muted/50 rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-border/30"
            >
              {hasTrack ? (
                trackRef.source === Track.Source.Camera || trackRef.source === Track.Source.ScreenShare ? (
                  <VideoTrack trackRef={trackRef} className="w-full h-full object-cover" />
                ) : (
                  <AudioTrack trackRef={trackRef} />
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

// ── Guest Control Bar (matching system design) ──
function GuestControlBar({ onLeave, chatOpen, onToggleChat }: { onLeave: () => void; chatOpen: boolean; onToggleChat: () => void }) {
  const [confirmLeave, setConfirmLeave] = useState(false);

  const btnBase = "h-11 w-11 rounded-full flex items-center justify-center transition-all duration-200 border";
  const btnOff = "bg-card border-border/50 text-muted-foreground hover:bg-accent";
  const btnOn = "bg-primary border-primary text-primary-foreground shadow-sm hover:bg-primary/90";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-center gap-3 px-6 py-3 border-t border-border/50 bg-card">
        <div className="flex items-center gap-2 bg-muted/20 rounded-full px-2 py-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <TrackToggle
                source={Track.Source.Microphone}
                showIcon={false}
                className={`${btnBase} ${btnOff} data-[lk-muted=false]:bg-primary data-[lk-muted=false]:border-primary data-[lk-muted=false]:text-primary-foreground data-[lk-muted=false]:shadow-sm`}
              >
                <Mic className="h-4.5 w-4.5 hidden data-[lk-muted=false]:block" />
                <MicOff className="h-4.5 w-4.5" />
              </TrackToggle>
            </TooltipTrigger>
            <TooltipContent>Microfone</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <TrackToggle
                source={Track.Source.Camera}
                showIcon={false}
                className={`${btnBase} ${btnOff} data-[lk-muted=false]:bg-primary data-[lk-muted=false]:border-primary data-[lk-muted=false]:text-primary-foreground data-[lk-muted=false]:shadow-sm`}
              >
                <Video className="h-4.5 w-4.5 hidden data-[lk-muted=false]:block" />
                <VideoOff className="h-4.5 w-4.5" />
              </TrackToggle>
            </TooltipTrigger>
            <TooltipContent>Câmera</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <TrackToggle
                source={Track.Source.ScreenShare}
                showIcon={false}
                className={`${btnBase} ${btnOff} data-[lk-muted=false]:bg-primary data-[lk-muted=false]:border-primary data-[lk-muted=false]:text-primary-foreground data-[lk-muted=false]:shadow-sm`}
              >
                <MonitorUp className="h-4.5 w-4.5" />
              </TrackToggle>
            </TooltipTrigger>
            <TooltipContent>Compartilhar Tela</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onToggleChat} className={`${btnBase} ${chatOpen ? btnOn : btnOff}`}>
                <MessageCircle className="h-4.5 w-4.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Chat</TooltipContent>
          </Tooltip>
        </div>

        {confirmLeave ? (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
            <span className="text-sm text-muted-foreground">Tem certeza?</span>
            <Button size="sm" variant="destructive" onClick={onLeave} className="rounded-full h-9 px-4 text-xs">
              Sim, sair
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

// ── Guest Chat Panel ──
function GuestChatPanel({ roomId, guestName, guestIdentity }: { roomId: string; guestName: string; guestIdentity: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("meeting_messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(200);
      setMessages(data || []);
    };
    load();

    const channel = supabase
      .channel(`guest-chat-${roomId}`)
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
      sender_id: guestIdentity,
      sender_name: guestName,
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
            <div key={m.id} className={`text-xs ${m.sender_id === guestIdentity ? "text-right" : ""}`}>
              <span className="font-semibold text-primary text-[11px]">{m.sender_id === guestIdentity ? "Eu" : m.sender_name}</span>
              <p className={`mt-0.5 p-2 rounded-lg inline-block max-w-[90%] text-foreground ${m.sender_id === guestIdentity ? "bg-primary/10" : "bg-muted"}`}>
                {m.message}
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-2 border-t border-border/50 flex gap-1.5">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem..." className="text-xs h-8" onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
        <Button size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={sendMessage}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
