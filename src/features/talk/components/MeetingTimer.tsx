import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { callLivekitFn } from "@/lib/livekitApi";
import type { RoomData } from "../types";

interface MeetingTimerProps {
  room: RoomData;
  isHost: boolean;
  roomId: string;
  onEndForAll: () => void;
  onExtend: (mins: number) => void;
}

/** Timer informativo: avisa aos 5 min e no fim — só o host decide estender ou encerrar */
export default function MeetingTimer({ room, isHost, roomId, onEndForAll, onExtend }: MeetingTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [showExtend, setShowExtend] = useState(false);
  const [extending, setExtending] = useState(false);
  const warnedRef = useRef(false);
  const timeUpRef = useRef(false);

  useEffect(() => {
    if (!room.agendado_para || !room.duracao_minutos) return;
    const endMs = new Date(room.agendado_para).getTime() + room.duracao_minutos * 60 * 1000;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setRemainingSeconds(remaining);

      if (remaining <= 300 && remaining > 0 && !warnedRef.current) {
        warnedRef.current = true;
        toast.warning("⏰ Faltam 5 minutos para o fim previsto da reunião!", { duration: 8000 });
        if (isHost) setShowExtend(true);
      }
      if (remaining <= 0 && !timeUpRef.current) {
        timeUpRef.current = true;
        if (isHost) {
          setShowExtend(true);
          toast.warning("⏰ Tempo previsto esgotado. Estenda a reunião ou encerre para todos.", { duration: 10000 });
        } else {
          toast.info("⏰ O tempo previsto da reunião terminou.", { duration: 8000 });
        }
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [room.agendado_para, room.duracao_minutos, isHost]);

  const handleExtend = async (mins: number) => {
    setExtending(true);
    try {
      await callLivekitFn("extendRoom", { roomId, extraMinutes: mins });
      onExtend(mins);
      setShowExtend(false);
      warnedRef.current = false;
      timeUpRef.current = false;
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
  const timeUp = remainingSeconds <= 0;
  const fmtTime = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div
        className={`flex items-center justify-center gap-2 py-1 text-xs font-mono ${
          isUrgent ? "bg-destructive/10 text-destructive animate-pulse" : "bg-muted/50 text-muted-foreground"
        }`}
      >
        <Clock className="h-3 w-3" />
        <span>
          {timeUp
            ? "Tempo previsto esgotado"
            : `Tempo restante: ${hrs > 0 ? `${hrs}h ` : ""}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`}
        </span>
        {room.agendado_para && (
          <span className="ml-2 opacity-70 hidden sm:inline">
            • Início: {fmtTime(new Date(room.agendado_para))}
            {room.duracao_minutos &&
              ` • Fim: ${fmtTime(new Date(new Date(room.agendado_para).getTime() + room.duracao_minutos * 60000))}`}
          </span>
        )}
      </div>

      {showExtend && isHost && (
        <div className="flex items-center justify-center gap-3 py-2 bg-yellow-500/10 border-b border-yellow-500/30 px-4 flex-wrap">
          <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
            ⏰ {timeUp ? "Tempo esgotado!" : "Tempo acabando!"} Estender reunião?
          </span>
          {[15, 30, 60].map((m) => (
            <Button key={m} size="sm" variant="outline" className="h-7 text-xs" disabled={extending} onClick={() => handleExtend(m)}>
              +{m} min
            </Button>
          ))}
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={onEndForAll}>
            Encerrar para todos
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowExtend(false)}>
            Ignorar
          </Button>
        </div>
      )}
    </>
  );
}
