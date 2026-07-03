/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useMemo, useRef, useState } from "react";
import { Hand } from "lucide-react";
import { lk } from "../livekit";
import { useLayoutSettings } from "../context/LayoutSettingsContext";
import ParticipantTile from "./ParticipantTile";
import type { DataMessage, LayoutMode } from "../types";

interface Reaction {
  id: string;
  emoji: string;
  senderName: string;
}

/** Reações flutuantes (canto inferior esquerdo) */
function FloatingReactions({ reactions }: { reactions: Reaction[] }) {
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

/** Indicadores de mão levantada (canto superior esquerdo) */
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

function gridClass(mode: LayoutMode, hasSpotlight: boolean, count: number): string {
  if (mode === "mosaic") {
    if (count <= 1) return "grid-cols-1";
    if (count <= 4) return "grid-cols-2";
    if (count <= 9) return "grid-cols-3";
    if (count <= 16) return "grid-cols-4";
    if (count <= 25) return "grid-cols-5";
    if (count <= 36) return "grid-cols-6";
    return "grid-cols-7";
  }
  if (hasSpotlight) return "grid-cols-1";
  // auto — estilo Google Meet
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count <= 4) return "grid-cols-2";
  if (count <= 6) return "grid-cols-2 lg:grid-cols-3";
  if (count <= 9) return "grid-cols-3";
  if (count <= 16) return "grid-cols-3 lg:grid-cols-4";
  if (count <= 25) return "grid-cols-4 lg:grid-cols-5";
  if (count <= 36) return "grid-cols-5 lg:grid-cols-6";
  return "grid-cols-6 lg:grid-cols-7";
}

/**
 * Grade de vídeos com reações, mãos levantadas, destaque de quem fala
 * e layouts auto/mosaico/destaque/barra lateral (padrão Meet).
 */
export default function VideoGrid() {
  const { Track } = lk;
  const { layoutMode, maxTiles, hideNoVideo } = useLayoutSettings();

  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [raisedHands, setRaisedHands] = useState<Map<string, string>>(new Map());
  const [pinnedSid, setPinnedSid] = useState<string | null>(null);

  const decoder = useRef(new TextDecoder());

  // Reações e mão levantada via data channel
  const onDataReceived = useCallback((payload: any) => {
    try {
      const raw =
        typeof payload === "string" ? payload : payload?.payload ? decoder.current.decode(payload.payload) : null;
      if (!raw) return;
      const msg: DataMessage = JSON.parse(raw);

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
      // ignora dados malformados
    }
  }, []);
  lk.useDataChannel?.("reactions", onDataReceived);

  const tracks = lk.useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  // Destaque segue quem está falando (quando não há pin nem tela compartilhada)
  const speakers = lk.useSpeakingParticipants?.() || [];
  const lastSpeakerSidRef = useRef<string | null>(null);
  if (speakers.length > 0) lastSpeakerSidRef.current = speakers[0].sid;

  const { spotlightTrack, gridTracks, effectiveLayout } = useMemo(() => {
    const seen = new Set<string>();
    let deduped = tracks.filter((t: any) => {
      if (t.source === Track.Source.ScreenShare) return true;
      if (seen.has(t.participant.sid)) return false;
      seen.add(t.participant.sid);
      return true;
    });
    if (hideNoVideo) {
      deduped = deduped.filter((t: any) => t.publication?.track || t.source === Track.Source.ScreenShare);
    }
    const limited = deduped.slice(0, maxTiles);

    const screenShare = limited.find((t: any) => t.source === Track.Source.ScreenShare) || null;
    const effective: LayoutMode = screenShare && layoutMode === "auto" ? "sidebar" : layoutMode;

    const pinned = pinnedSid
      ? limited.find((t: any) => t.participant.sid === pinnedSid && t.source !== Track.Source.ScreenShare)
      : null;
    const speaking = lastSpeakerSidRef.current
      ? limited.find(
          (t: any) => t.participant.sid === lastSpeakerSidRef.current && t.source !== Track.Source.ScreenShare,
        )
      : null;

    let spotlight: any = null;
    if (pinned && !screenShare) spotlight = pinned;
    else if (screenShare) spotlight = screenShare;
    else if (effective === "spotlight" || effective === "sidebar") spotlight = pinned || speaking || limited[0] || null;

    return {
      spotlightTrack: spotlight,
      gridTracks: spotlight ? limited.filter((t: any) => t !== spotlight) : limited,
      effectiveLayout: effective,
    };
  }, [tracks, hideNoVideo, maxTiles, layoutMode, pinnedSid, Track, speakers.length]);

  const togglePin = useCallback((sid: string) => {
    setPinnedSid((prev) => (prev === sid ? null : sid));
  }, []);

  const tileKey = (t: any) => t.participant.sid + (t.publication?.trackSid || "p");
  const tileProps = (t: any) => ({
    trackRef: t,
    isPinned: pinnedSid === t.participant.sid && t.source !== Track.Source.ScreenShare,
    hasHandRaised: raisedHands.has(t.participant.identity) || raisedHands.has(t.participant.sid),
    onTogglePin: togglePin,
  });

  return (
    <div className="flex-1 relative overflow-hidden">
      <FloatingReactions reactions={reactions} />
      <HandRaiseIndicators raisedHands={raisedHands} />

      <div className="h-full w-full overflow-hidden flex flex-col bg-zinc-950 p-2 sm:p-3 gap-2 sm:gap-3">
        {spotlightTrack ? (
          effectiveLayout === "spotlight" ? (
            /* Destaque: principal grande + faixa inferior */
            <div className="flex-1 min-h-0 flex flex-col gap-2 sm:gap-3">
              <div className="flex-1 min-h-0 rounded-2xl overflow-hidden">
                <ParticipantTile {...tileProps(spotlightTrack)} isSpotlight />
              </div>
              {gridTracks.length > 0 && (
                <div className="h-[90px] sm:h-[110px] shrink-0 flex gap-2 overflow-x-auto overflow-y-hidden">
                  {gridTracks.map((t: any) => (
                    <ParticipantTile key={tileKey(t)} {...tileProps(t)} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Barra lateral: principal à esquerda + coluna à direita (Meet/Zoom) */
            <div className="flex-1 min-h-0 flex gap-2 sm:gap-3">
              <div className="flex-1 min-w-0 rounded-2xl overflow-hidden">
                <ParticipantTile {...tileProps(spotlightTrack)} isSpotlight />
              </div>
              {gridTracks.length > 0 && (
                <div className="w-[130px] sm:w-[200px] lg:w-[260px] shrink-0 flex flex-col gap-2 overflow-y-auto overflow-x-hidden">
                  {gridTracks.map((t: any) => (
                    <div key={tileKey(t)} className="aspect-video w-full shrink-0">
                      <ParticipantTile {...tileProps(t)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : (
          /* Grade automática/mosaico */
          <div
            className={`flex-1 min-h-0 grid ${gridClass(effectiveLayout, false, gridTracks.length)} gap-2 sm:gap-3 items-stretch content-stretch auto-rows-fr`}
          >
            {gridTracks.map((t: any) => (
              <div key={tileKey(t)} className="min-h-0 min-w-0">
                <ParticipantTile {...tileProps(t)} isSpotlight />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
