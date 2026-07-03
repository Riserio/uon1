/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Hand, LayoutGrid, MessageCircle, PersonStanding, Phone, Smile, Users } from "lucide-react";
import { toast } from "sonner";
import { lk } from "../livekit";
import { useLayoutSettings } from "../context/LayoutSettingsContext";
import DeviceSettingsButton from "./DeviceSettingsButton";
import { REACTION_EMOJIS, type DataMessage, type LayoutMode } from "../types";

interface ControlBarProps {
  isHost?: boolean;
  onLeave: () => void;
  onEndForAll?: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  participantsOpen?: boolean;
  onToggleParticipants?: () => void;
  unreadCount?: number;
}

const LAYOUT_OPTIONS: { value: LayoutMode; label: string; desc: string }[] = [
  { value: "auto", label: "Automático", desc: "Ajusta conforme participantes" },
  { value: "mosaic", label: "Mosaico", desc: "Grade uniforme para todos" },
  { value: "spotlight", label: "Destaque", desc: "Um participante em foco" },
  { value: "sidebar", label: "Barra lateral", desc: "Principal + lista lateral" },
];

const roundBtn = (active: boolean) =>
  `h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary ${
    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
  }`;

/** Barra inferior de controles em pílula flutuante (padrão Meet) */
export default function ControlBar({
  isHost = false,
  onLeave,
  onEndForAll,
  chatOpen,
  onToggleChat,
  participantsOpen = false,
  onToggleParticipants,
  unreadCount = 0,
}: ControlBarProps) {
  const { Track, TrackToggle } = lk;
  const { layoutMode, maxTiles, hideNoVideo, setLayoutMode, setMaxTiles, setHideNoVideo } = useLayoutSettings();

  const [handRaised, setHandRaised] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [blurEnabled, setBlurEnabled] = useState(false);
  const [blurLoading, setBlurLoading] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const encoder = useRef(new TextEncoder());
  const dataChannel = lk.useDataChannel?.("reactions") || null;
  const sendData = dataChannel?.send || null;

  const localResult = lk.useLocalParticipant?.() || {};
  const localParticipant = localResult?.localParticipant;
  const localName = localParticipant?.name || localParticipant?.identity || "Eu";
  const localIdentity = localParticipant?.identity || "";
  const roomContext = lk.useRoomContext?.() || null;
  const participants = lk.useParticipants?.() || [];

  const broadcast = useCallback(
    (msg: DataMessage) => {
      if (!sendData) return;
      try {
        sendData(encoder.current.encode(JSON.stringify(msg)));
      } catch (e) {
        console.error("Falha ao enviar dados:", e);
      }
    },
    [sendData],
  );

  const toggleHandRaise = () => {
    const next = !handRaised;
    setHandRaised(next);
    broadcast({ type: next ? "hand_raise" : "hand_lower", senderName: localName, senderId: localIdentity });
    toast.info(next ? "🖐️ Mão levantada" : "Mão abaixada");
  };

  const sendReaction = (emoji: string) => {
    broadcast({ type: "reaction", emoji, senderName: localName, senderId: localIdentity });
    setShowReactions(false);
  };

  const toggleBackgroundBlur = async () => {
    if (blurLoading) return;
    setBlurLoading(true);
    try {
      const cameraTrack: any = roomContext?.localParticipant?.getTrackPublication(Track.Source.Camera)?.track;
      if (!cameraTrack) {
        toast.error("Câmera não está ativa. Ative a câmera primeiro.");
        return;
      }
      if (!blurEnabled) {
        // Desfoque real com segmentação de pessoa (mesma técnica do Meet/Zoom)
        const { BackgroundBlur } = await import("@livekit/track-processors");
        await cameraTrack.setProcessor(BackgroundBlur(10));
        setBlurEnabled(true);
        toast.success("Desfoque de fundo ativado");
      } else {
        await cameraTrack.stopProcessor();
        setBlurEnabled(false);
        toast.info("Desfoque de fundo desativado");
      }
    } catch (e) {
      console.error("Background blur error:", e);
      toast.error("Seu navegador não suporta desfoque de fundo (use Chrome ou Edge recentes)");
      setBlurEnabled(false);
    } finally {
      setBlurLoading(false);
    }
  };

  const trackToggleClass =
    "h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all duration-200 [&_svg]:!h-5 [&_svg]:!w-5 data-[lk-muted=true]:bg-destructive data-[lk-muted=true]:text-destructive-foreground data-[lk-muted=false]:bg-primary data-[lk-muted=false]:text-primary-foreground data-[lk-muted=false]:hover:bg-primary/90";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative z-30 mx-auto mb-3 mt-2 w-fit max-w-[calc(100vw-1rem)] flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full bg-card/90 backdrop-blur-md border border-border/50 shadow-2xl">
        {/* Popup de reações */}
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

        {/* Mídia */}
        <Tooltip>
          <TooltipTrigger asChild>
            <TrackToggle source={Track.Source.Microphone} showIcon className={trackToggleClass} />
          </TooltipTrigger>
          <TooltipContent side="top"><p>Microfone</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <TrackToggle source={Track.Source.Camera} showIcon className={trackToggleClass} />
          </TooltipTrigger>
          <TooltipContent side="top"><p>Câmera</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <TrackToggle
              source={Track.Source.ScreenShare}
              showIcon
              className="h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all duration-200 [&_svg]:!h-5 [&_svg]:!w-5 data-[lk-muted=true]:bg-muted data-[lk-muted=true]:text-muted-foreground data-[lk-muted=true]:hover:bg-accent data-[lk-muted=false]:bg-primary data-[lk-muted=false]:text-primary-foreground"
            />
          </TooltipTrigger>
          <TooltipContent side="top"><p>Compartilhar Tela</p></TooltipContent>
        </Tooltip>

        <div className="w-px h-8 bg-border mx-0.5 hidden sm:block" />

        {/* Interação */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={toggleHandRaise} className={`${roundBtn(false)} ${handRaised ? "!bg-purple-600 !text-white" : ""}`}>
              <Hand className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>{handRaised ? "Abaixar mão" : "Levantar mão"}</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => setShowReactions(!showReactions)} className={roundBtn(showReactions)}>
              <Smile className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>Reações</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={toggleBackgroundBlur} disabled={blurLoading} className={`${roundBtn(blurEnabled)} ${blurLoading ? "opacity-50" : ""}`}>
              <PersonStanding className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>{blurEnabled ? "Desativar desfoque" : "Desfocar fundo"}</p></TooltipContent>
        </Tooltip>
        <DeviceSettingsButton buttonClass={roundBtn(false)} />

        <div className="w-px h-8 bg-border mx-0.5 hidden sm:block" />

        {/* Painéis */}
        {onToggleParticipants && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onToggleParticipants} className={`relative ${roundBtn(participantsOpen)}`}>
                <Users className="h-5 w-5" />
                {participants.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {participants.length}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Participantes</p></TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onToggleChat} className={`relative ${roundBtn(chatOpen)}`}>
              <MessageCircle className="h-5 w-5" />
              {unreadCount > 0 && !chatOpen && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>Chat</p></TooltipContent>
        </Tooltip>

        {/* Layout */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button className={roundBtn(false)}>
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
              <RadioGroup value={layoutMode} onValueChange={(v) => setLayoutMode(v as LayoutMode)}>
                {LAYOUT_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-3 py-1.5">
                    <RadioGroupItem value={opt.value} id={`layout-${opt.value}`} />
                    <Label htmlFor={`layout-${opt.value}`} className="cursor-pointer">
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
                  <Slider value={[maxTiles]} onValueChange={([v]) => setMaxTiles(v)} min={1} max={50} step={1} className="flex-1" />
                  <span className="text-xs text-muted-foreground w-5 text-right">{maxTiles}</span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <Label htmlFor="hide-no-video" className="text-xs">Ocultar blocos sem vídeo</Label>
                <Switch id="hide-no-video" checked={hideNoVideo} onCheckedChange={setHideNoVideo} className="scale-90" />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-8 bg-border mx-1 sm:mx-2" />

        {/* Sair / encerrar — botão vermelho destacado (padrão Meet) */}
        <Popover open={leaveOpen} onOpenChange={setLeaveOpen}>
          <PopoverTrigger asChild>
            <button
              className="h-12 sm:h-14 px-6 sm:px-8 rounded-full bg-red-600 text-white font-medium text-sm flex items-center gap-2 hover:bg-red-700 transition-colors shadow-lg focus-visible:ring-2 focus-visible:ring-red-400"
              aria-label="Sair da chamada"
            >
              <Phone className="h-5 w-5 rotate-[135deg]" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-2" align="end" side="top">
            <div className="space-y-1">
              <Button variant="ghost" className="w-full justify-start rounded-lg" onClick={() => { setLeaveOpen(false); onLeave(); }}>
                Sair da reunião
              </Button>
              {isHost && onEndForAll && (
                <Button
                  variant="ghost"
                  className="w-full justify-start rounded-lg text-red-600 hover:text-red-600 hover:bg-red-500/10"
                  onClick={() => { setLeaveOpen(false); onEndForAll(); }}
                >
                  Encerrar para todos
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}
