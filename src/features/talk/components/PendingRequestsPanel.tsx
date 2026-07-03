import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { callLivekitFn } from "@/lib/livekitApi";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Users, X } from "lucide-react";
import { toast } from "sonner";
import type { PendingParticipant } from "../types";

/** Notificação flutuante do host para aprovar/recusar entradas na sala de espera */
export default function PendingRequestsPanel({ roomId }: { roomId: string }) {
  const [pending, setPending] = useState<PendingParticipant[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const fetchPending = useCallback(async () => {
    const { data } = await supabase
      .from("meeting_participants")
      .select("*")
      .eq("room_id", roomId)
      .eq("status", "pending");
    const list = (data as unknown as PendingParticipant[]) || [];
    if (knownIdsRef.current.size > 0) {
      list.forEach((p) => {
        if (!knownIdsRef.current.has(p.id)) {
          toast.info(`${p.display_name} quer entrar na sala`, { duration: 10000 });
        }
      });
    }
    knownIdsRef.current = new Set(list.map((p) => p.id));
    setPending(list);
  }, [roomId]);

  useEffect(() => {
    fetchPending();
    const channel = supabase
      .channel(`pending-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_participants", filter: `room_id=eq.${roomId}` },
        fetchPending,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchPending]);

  const handleAction = async (participantId: string, action: "approveParticipant" | "denyParticipant") => {
    try {
      await callLivekitFn(action, { roomId, participantId });
      toast.success(action === "approveParticipant" ? "Participante aprovado" : "Participante recusado");
      fetchPending();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar solicitação");
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
