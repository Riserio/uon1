import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, CheckCircle2, Link2, MessageSquare, Pencil, RotateCcw, Trash2, Users, Video } from "lucide-react";
import type { MeetingRoomSummary, RsvpCounts } from "../../types";

function DateRange({ room }: { room: MeetingRoomSummary }) {
  if (!room.agendado_para) return null;
  const start = new Date(room.agendado_para);
  const end = room.duracao_minutos ? new Date(start.getTime() + room.duracao_minutos * 60000) : null;
  const fmtTime = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <Calendar className="h-3 w-3 text-primary" />
      <span className="font-medium text-foreground">
        {start.toLocaleDateString("pt-BR")} {fmtTime(start)}
        {end && ` – ${fmtTime(end)}`}
      </span>
      {room.duracao_minutos && <span className="text-muted-foreground">({room.duracao_minutos}min)</span>}
    </span>
  );
}

function RemainingTime({ room }: { room: MeetingRoomSummary }) {
  if (!room.agendado_para || !room.duracao_minutos) return null;
  const endTime = new Date(new Date(room.agendado_para).getTime() + room.duracao_minutos * 60000);
  const diff = endTime.getTime() - Date.now();
  if (diff <= 0) return <Badge variant="destructive" className="text-[10px] h-5">Expirada</Badge>;
  const mins = Math.floor(diff / 60000);
  const label = mins < 60 ? `${mins}min restante(s)` : `${Math.floor(mins / 60)}h${mins % 60}min`;
  return <Badge variant="outline" className="text-[10px] h-5 border-primary/30 text-primary">{label}</Badge>;
}

function RsvpChips({ rsvp }: { rsvp?: RsvpCounts }) {
  if (!rsvp || (rsvp.sim === 0 && rsvp.nao === 0 && rsvp.talvez === 0)) return null;
  const chip = "px-1.5 py-0.5 rounded-full text-[10px] font-semibold";
  return (
    <span className="flex items-center gap-1">
      <span className={`${chip} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`}>✓ {rsvp.sim}</span>
      {rsvp.talvez > 0 && <span className={`${chip} bg-amber-500/10 text-amber-600 dark:text-amber-400`}>? {rsvp.talvez}</span>}
      {rsvp.nao > 0 && <span className={`${chip} bg-red-500/10 text-red-600 dark:text-red-400`}>✕ {rsvp.nao}</span>}
      {rsvp.pendente > 0 && <span className={`${chip} bg-muted text-muted-foreground`}>⏳ {rsvp.pendente}</span>}
    </span>
  );
}

interface ActiveRoomCardProps {
  room: MeetingRoomSummary;
  rsvp?: RsvpCounts;
  isOwner: boolean;
  onEnter: () => void;
  onEdit: () => void;
  onInvite: () => void;
  onEnd: () => void;
}

/** Card de sala ativa com avatares, badge "Ao vivo" e ações */
export function ActiveRoomCard({ room, rsvp, isOwner, onEnter, onEdit, onInvite, onEnd }: ActiveRoomCardProps) {
  const aprovados = room.meeting_participants?.filter((p) => p.status === "approved") || [];

  return (
    <Card className="rounded-2xl hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30 transition-all duration-200 border-border/50 group">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="font-semibold text-base truncate">{room.nome}</h3>
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 text-[11px] font-medium gap-1.5 pl-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Ao vivo
              </Badge>
              <Badge variant="outline" className="text-[11px]">{room.tipo}</Badge>
              <RemainingTime room={room} />
            </div>
            {room.descricao && <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{room.descricao}</p>}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <DateRange room={room} />
              <span className="flex items-center gap-1.5">
                {aprovados.length > 0 && (
                  <span className="flex -space-x-1.5">
                    {aprovados.slice(0, 4).map((p) => (
                      <span
                        key={p.id}
                        title={p.display_name}
                        className="h-5 w-5 rounded-full bg-primary/15 ring-2 ring-card text-primary text-[9px] font-bold flex items-center justify-center uppercase"
                      >
                        {(p.display_name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2)}
                      </span>
                    ))}
                  </span>
                )}
                <Users className="h-3 w-3" />
                {aprovados.length} participante(s)
              </span>
              {room.convidados && room.convidados.length > 0 && (
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {room.convidados.length} convidado(s)
                </span>
              )}
              <RsvpChips rsvp={rsvp} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button size="sm" onClick={onEnter} className="gap-1.5 rounded-xl shadow-sm">
              <Video className="h-3.5 w-3.5" /> Entrar
            </Button>
            {isOwner && (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={onEdit} title="Editar">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" variant="outline" className="rounded-xl" onClick={onInvite} title="Gerar convite">
              <Link2 className="h-3.5 w-3.5" />
            </Button>
            {isOwner && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onEnd}
                className="text-primary hover:text-primary/80 hover:bg-primary/10 rounded-xl"
                title="Finalizar reunião"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface HistoryRoomCardProps {
  room: MeetingRoomSummary;
  isOwner: boolean;
  onReopen: () => void;
  onDelete: () => void;
}

/** Card compacto do histórico de reuniões */
export function HistoryRoomCard({ room, isOwner, onReopen, onDelete }: HistoryRoomCardProps) {
  return (
    <Card className="rounded-2xl border-border/40 bg-card/80 hover:bg-card transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-sm truncate">{room.nome}</h3>
              <Badge variant="secondary" className="text-[10px] h-5">
                {room.status === "finalizada" ? "Finalizada" : room.status === "cancelada" ? "Cancelada" : room.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
              <DateRange room={room} />
              {room.finalizado_em && (
                <span>
                  Encerrada em {new Date(room.finalizado_em).toLocaleDateString("pt-BR")} às{" "}
                  {new Date(room.finalizado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <span>{room.meeting_participants?.length || 0} participante(s)</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isOwner && room.status === "finalizada" && (
              <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={onReopen} title="Reabrir sala">
                <RotateCcw className="h-3 w-3" />
                <span className="hidden sm:inline">Reabrir</span>
              </Button>
            )}
            {isOwner && (
              <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive rounded-xl" title="Apagar">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
