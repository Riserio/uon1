import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import type { MediaChoice, RoomData } from "../types";

interface PreJoinScreenProps {
  room: RoomData;
  onJoin: (media: MediaChoice) => void;
  onCancel: () => void;
}

/** Pré-join (padrão Meet): preview da câmera e escolha de mídia antes de entrar */
export default function PreJoinScreen({ room, onJoin, onCancel }: PreJoinScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [videoOn, setVideoOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        console.warn("[PreJoin] getUserMedia falhou:", e);
        setMediaError(
          "Não foi possível acessar câmera/microfone. Permita o acesso nas configurações do navegador — você ainda pode entrar sem mídia.",
        );
        setVideoOn(false);
        setAudioOn(false);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggle = (kind: "video" | "audio") => {
    const next = kind === "video" ? !videoOn : !audioOn;
    if (kind === "video") setVideoOn(next);
    else setAudioOn(next);
    const tracks =
      kind === "video" ? streamRef.current?.getVideoTracks() : streamRef.current?.getAudioTracks();
    tracks?.forEach((t) => {
      t.enabled = next;
    });
  };

  const handleJoin = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onJoin({ video: videoOn && !mediaError, audio: audioOn && !mediaError });
  };

  const mediaBtn = (on: boolean) =>
    `h-12 w-12 rounded-full flex items-center justify-center transition-colors shadow-lg focus-visible:ring-2 focus-visible:ring-primary ${
      on ? "bg-background/80 backdrop-blur-sm text-foreground hover:bg-background" : "bg-destructive text-destructive-foreground"
    }`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/10 p-4">
      <div className="w-full max-w-3xl grid gap-6 md:grid-cols-[1.4fr_1fr] items-center">
        {/* Preview da câmera */}
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-zinc-900 flex items-center justify-center shadow-xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${videoOn && !mediaError ? "" : "hidden"}`}
            style={{ transform: "scaleX(-1)" }}
          />
          {(!videoOn || mediaError) && (
            <div className="flex flex-col items-center gap-2 text-zinc-400">
              <VideoOff className="h-10 w-10" />
              <span className="text-sm">{mediaError ? "Sem acesso à câmera" : "Câmera desligada"}</span>
            </div>
          )}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-3">
            <button onClick={() => toggle("audio")} disabled={!!mediaError} className={mediaBtn(audioOn && !mediaError)} aria-label={audioOn ? "Desativar microfone" : "Ativar microfone"}>
              {audioOn && !mediaError ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            <button onClick={() => toggle("video")} disabled={!!mediaError} className={mediaBtn(videoOn && !mediaError)} aria-label={videoOn ? "Desativar câmera" : "Ativar câmera"}>
              {videoOn && !mediaError ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Informações + entrar */}
        <div className="text-center md:text-left space-y-4">
          <img src="/images/logo-full.png" alt="UON1" className="h-8 w-auto mx-auto md:mx-0" />
          <div>
            <p className="text-sm text-muted-foreground">Pronto para entrar?</p>
            <h2 className="text-2xl font-semibold text-foreground">{room.nome}</h2>
            {room.descricao && <p className="text-sm text-muted-foreground mt-1">{room.descricao}</p>}
          </div>
          {mediaError && (
            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              {mediaError}
            </p>
          )}
          <div className="flex gap-2 justify-center md:justify-start">
            <Button size="lg" className="rounded-full px-8" onClick={handleJoin}>
              Entrar agora
            </Button>
            <Button size="lg" variant="outline" className="rounded-full" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
