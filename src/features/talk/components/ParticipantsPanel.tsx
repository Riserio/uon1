/* eslint-disable @typescript-eslint/no-explicit-any */
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Users, X } from "lucide-react";
import { lk } from "../livekit";

interface ParticipantsPanelProps {
  hostIdentity?: string;
  onClose: () => void;
}

function ParticipantRowItem({ participant, isHost }: { participant: any; isHost: boolean }) {
  const { Track } = lk;
  const micMuted: boolean = lk.useIsMuted?.(Track.Source.Microphone, { participant }) ?? false;
  const isSpeaking: boolean = lk.useIsSpeaking?.(participant) ?? false;
  const name: string = participant.name || participant.identity;
  const initials = name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors">
      <div
        className={`h-9 w-9 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center shrink-0 ${
          isSpeaking ? "ring-2 ring-emerald-400" : ""
        }`}
      >
        <span className="text-xs font-bold text-primary">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {name}
          {participant.isLocal && <span className="text-muted-foreground font-normal"> (você)</span>}
        </p>
        {isHost && <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/30 text-primary">Moderador</Badge>}
      </div>
      <span className={`shrink-0 rounded-full p-1.5 ${micMuted ? "bg-red-500/10 text-red-500" : isSpeaking ? "bg-emerald-500/15 text-emerald-500" : "text-muted-foreground"}`}>
        {micMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
      </span>
    </div>
  );
}

/** Painel lateral com a lista de participantes (padrão Meet) */
export default function ParticipantsPanel({ hostIdentity, onClose }: ParticipantsPanelProps) {
  const participants = lk.useParticipants?.() || [];

  return (
    <div className="w-80 shrink-0 border-l border-border/50 bg-card flex flex-col max-sm:fixed max-sm:inset-y-0 max-sm:right-0 max-sm:w-full max-sm:z-[115] animate-in slide-in-from-right duration-200">
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
          <Users className="h-4 w-4 text-primary" /> Participantes ({participants.length})
        </h3>
        <button onClick={onClose} className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Fechar painel">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-0.5">
          {participants.map((p: any) => (
            <ParticipantRowItem key={p.sid} participant={p} isHost={!!hostIdentity && p.identity === hostIdentity} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
