/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Expand, Hand, MicOff, Pin, PinOff, PictureInPicture2, Shrink, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { lk } from "../livekit";

interface ParticipantTileProps {
  trackRef: any;
  isSpotlight?: boolean;
  isPinned: boolean;
  hasHandRaised: boolean;
  onTogglePin: (sid: string) => void;
}

const overlayBtn =
  "h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors border border-border/30";

/**
 * Bloco de vídeo de um participante: fala ativa, mic mutado, qualidade de conexão,
 * fixar, tela cheia e picture-in-picture.
 */
function ParticipantTile({ trackRef, isSpotlight = false, isPinned, hasHandRaised, onTogglePin }: ParticipantTileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);

  const { VideoTrack, Track } = lk;
  const participant = trackRef.participant;
  const sid: string = participant.sid;
  const name: string = participant.name || participant.identity;
  const initials = name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const isScreen = trackRef.source === Track.Source.ScreenShare;
  const hasTrack = Boolean(trackRef.publication?.track);
  const canPin = !isScreen;

  // Indicadores em tempo real (padrão Meet)
  const isSpeaking: boolean = lk.useIsSpeaking?.(participant) ?? false;
  const micMuted: boolean = lk.useIsMuted?.(Track.Source.Microphone, { participant }) ?? false;
  const qualityResult = lk.useConnectionQualityIndicator?.({ participant });
  const poorConnection = qualityResult?.quality === lk.ConnectionQuality?.Poor;

  const ring = hasHandRaised
    ? "ring-2 ring-yellow-500"
    : isPinned
      ? "ring-2 ring-primary"
      : isSpeaking && !isScreen
        ? "ring-2 ring-emerald-400"
        : "";

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await el.requestFullscreen();
        setIsFullscreen(true);
        const onExit = () => {
          if (!document.fullscreenElement) {
            setIsFullscreen(false);
            document.removeEventListener("fullscreenchange", onExit);
          }
        };
        document.addEventListener("fullscreenchange", onExit);
      }
    } catch {
      toast.error("Tela cheia não suportada");
    }
  };

  const togglePip = async () => {
    const videoEl = containerRef.current?.querySelector("video") as HTMLVideoElement | null;
    if (!videoEl || !document.pictureInPictureEnabled) {
      toast.error("PIP não suportado neste navegador");
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPip(false);
      } else {
        await videoEl.requestPictureInPicture();
        setIsPip(true);
        videoEl.addEventListener("leavepictureinpicture", () => setIsPip(false), { once: true });
      }
    } catch {
      /* ignora */
    }
  };

  return (
    <div
      ref={containerRef}
      data-participant-sid={sid}
      onClick={() => canPin && !isSpotlight && onTogglePin(sid)}
      className={`relative rounded-2xl overflow-hidden flex items-center justify-center group/tile transition-all duration-300 ${
        isSpotlight ? "w-full h-full" : "h-full aspect-video shrink-0"
      } ${hasTrack ? "bg-zinc-900" : "bg-zinc-900/80"} ${ring} ${
        !isSpotlight && canPin ? "cursor-pointer hover:ring-2 hover:ring-primary/50" : ""
      }`}
    >
      {hasTrack ? (
        <VideoTrack
          trackRef={trackRef}
          className={`w-full h-full ${isScreen ? "object-contain bg-black" : "object-cover"}`}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 animate-in fade-in duration-300">
          <div
            className={`${
              isSpotlight ? "w-20 h-20 sm:w-24 sm:h-24" : "w-12 h-12 sm:w-16 sm:h-16"
            } rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center ring-2 ring-primary/30 ${
              isSpeaking ? "ring-emerald-400" : ""
            }`}
          >
            <span className={`${isSpotlight ? "text-2xl sm:text-3xl" : "text-base sm:text-xl"} font-bold text-primary`}>
              {initials}
            </span>
          </div>
        </div>
      )}

      {/* Mão levantada */}
      {hasHandRaised && (
        <div className="absolute top-2 right-2 bg-purple-600 text-white rounded-full p-1.5 shadow-lg z-10">
          <Hand className="h-4 w-4" />
        </div>
      )}
      {/* Fixado */}
      {isPinned && !isSpotlight && (
        <div className="absolute top-2 left-2 bg-primary text-primary-foreground rounded-full p-1 shadow-lg z-10">
          <Pin className="h-3 w-3" />
        </div>
      )}
      {/* Conexão ruim */}
      {poorConnection && (
        <div className="absolute top-2 left-2 bg-red-600/90 text-white rounded-full p-1.5 shadow-lg z-10" title="Conexão instável">
          <WifiOff className="h-3 w-3" />
        </div>
      )}

      {/* Nome + status do microfone */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
        <div className="flex items-center gap-1.5">
          {micMuted && !isScreen && (
            <span className="bg-red-600/90 rounded-full p-1 shrink-0">
              <MicOff className="h-3 w-3 text-white" />
            </span>
          )}
          <span className="text-xs sm:text-sm text-white font-medium truncate drop-shadow">
            {name}
            {isScreen ? " (apresentando)" : ""}
          </span>
        </div>
      </div>

      {/* Ações do bloco */}
      <div
        className={`absolute ${isSpotlight ? "top-2 right-2" : "bottom-2 right-2"} flex items-center gap-1 opacity-0 group-hover/tile:opacity-100 focus-within:opacity-100 transition-opacity z-20`}
        onClick={(e) => e.stopPropagation()}
      >
        {canPin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => onTogglePin(sid)} className={`${overlayBtn} ${isPinned ? "ring-2 ring-primary" : ""}`}>
                {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{isPinned ? "Desafixar" : "Fixar como destaque"}</TooltipContent>
          </Tooltip>
        )}
        {isSpotlight && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={toggleFullscreen} className={overlayBtn}>
                {isFullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{isFullscreen ? "Sair da tela cheia" : "Tela cheia"}</TooltipContent>
          </Tooltip>
        )}
        {hasTrack && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={togglePip} className={`${overlayBtn} ${isPip ? "ring-2 ring-primary" : ""}`}>
                <PictureInPicture2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Picture-in-Picture</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export default memo(ParticipantTile);
