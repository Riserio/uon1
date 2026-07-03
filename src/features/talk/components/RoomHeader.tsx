import { Button } from "@/components/ui/button";
import { Calendar, Copy } from "lucide-react";
import { toast } from "sonner";
import { lk } from "../livekit";

interface RoomHeaderProps {
  room: { nome: string; agendado_para?: string | null; duracao_minutos?: number | null };
  isHost: boolean;
  roomId: string;
  subtitleOverride?: string;
}

/** Barra superior da reunião: marca, nome da sala, horário e link */
export default function RoomHeader({ room, isHost, roomId, subtitleOverride }: RoomHeaderProps) {
  const participants = lk.useParticipants();

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/video/${roomId}`);
    toast.success("Link copiado!");
  };

  const startTime = room.agendado_para ? new Date(room.agendado_para) : null;
  const endTime =
    startTime && room.duracao_minutos ? new Date(startTime.getTime() + room.duracao_minutos * 60000) : null;
  const fmtTime = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-card/80 backdrop-blur-md border-b border-border/40 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <img src="/images/logo-full.png" alt="UON1" className="h-7 w-auto hidden sm:block" />
        <div className="h-5 w-px bg-border/50 hidden sm:block" />
        <img src="/images/logo-vg.png" alt="Vangard" className="h-7 w-auto hidden md:block" />
        <div className="h-5 w-px bg-border/50 hidden md:block" />
        <div className="min-w-0">
          <h2 className="font-semibold text-sm flex items-center gap-1.5 truncate">
            <span className="text-primary">Talk</span>
            <span className="text-[10px] text-muted-foreground font-normal">by Uon1</span>
            <span className="mx-1 text-muted-foreground">•</span>
            <span className="text-foreground truncate">{room.nome}</span>
          </h2>
          <p className="text-xs text-muted-foreground flex items-center gap-2 truncate">
            {participants.length} participante(s) • {subtitleOverride ?? (isHost ? "Moderador" : "Participante")}
            {startTime && (
              <span className="hidden sm:flex items-center gap-1">
                • <Calendar className="h-3 w-3" />
                {startTime.toLocaleDateString("pt-BR")} {fmtTime(startTime)}
                {endTime && ` – ${fmtTime(endTime)}`}
              </span>
            )}
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={copyLink} className="h-8 text-xs rounded-lg shrink-0">
        <Copy className="h-3.5 w-3.5 sm:mr-1.5" />
        <span className="hidden sm:inline">Copiar Link</span>
      </Button>
    </div>
  );
}
