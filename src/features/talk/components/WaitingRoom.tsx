import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { callLivekitFn } from "@/lib/livekitApi";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { toast } from "sonner";
import type { RoomData } from "../types";

interface WaitingRoomProps {
  room: RoomData;
  roomId: string;
  onApproved: (token: string) => void;
  onDenied: () => void;
}

/** Sala de espera com realtime + polling de fallback (aprovação nunca se perde) */
export default function WaitingRoom({ room, roomId, onApproved, onDenied }: WaitingRoomProps) {
  const { user } = useAuth();
  const approvedRef = useRef(false);

  const checkApproval = useCallback(async () => {
    if (approvedRef.current) return;
    try {
      const data = await callLivekitFn("getToken", { roomId });
      if (data.participantStatus === "denied") {
        toast.error("Sua entrada foi recusada");
        onDenied();
        return;
      }
      if (data.participantStatus !== "approved") return;
      approvedRef.current = true;
      toast.success("Você foi aprovado! Entrando na sala...");
      onApproved(data.token);
    } catch (e) {
      console.error("[WaitingRoom] Erro ao verificar aprovação:", e);
    }
  }, [roomId, onApproved, onDenied]);

  useEffect(() => {
    const channel = supabase
      .channel(`meeting-participant-${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meeting_participants", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const updated = payload.new as { user_id?: string; status?: string };
          if (updated.user_id !== user?.id) return;
          if (updated.status === "approved") checkApproval();
          else if (updated.status === "denied") {
            toast.error("Sua entrada foi recusada");
            onDenied();
          }
        },
      )
      .subscribe();

    const poll = setInterval(checkApproval, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [roomId, user?.id, checkApproval, onDenied]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/10">
      <Card className="max-w-md w-full mx-4 shadow-lg border-border/50">
        <CardContent className="p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Sala de Espera</h2>
          <p className="text-muted-foreground text-sm">
            Aguardando aprovação do moderador para entrar em{" "}
            <strong className="text-foreground">{room.nome}</strong>
          </p>
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">O moderador será notificado da sua presença</p>
        </CardContent>
      </Card>
    </div>
  );
}
