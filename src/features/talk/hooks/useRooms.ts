import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { callLivekitFn } from "@/lib/livekitApi";
import { toast } from "sonner";
import type { MeetingRoomSummary, RsvpCounts } from "../types";

/**
 * Lista de salas do usuário: carregamento, RSVP, auto-finalização de expiradas
 * e ações de encerrar/reabrir/apagar/convidar.
 */
export function useRooms(userReady: boolean) {
  const [rooms, setRooms] = useState<MeetingRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [rsvpMap, setRsvpMap] = useState<Record<string, RsvpCounts>>({});

  const autoFinalizeExpired = useCallback(async () => {
    try {
      const { data: activeRooms } = await supabase
        .from("meeting_rooms")
        .select("id, agendado_para, duracao_minutos, host_id, created_at")
        .eq("status", "ativa");
      if (!activeRooms?.length) return;

      const now = new Date();
      for (const room of activeRooms) {
        let shouldFinalize = false;
        if (room.agendado_para && room.duracao_minutos) {
          const endTime = new Date(new Date(room.agendado_para).getTime() + room.duracao_minutos * 60000);
          shouldFinalize = now > endTime;
        } else if (room.agendado_para) {
          shouldFinalize = now.getTime() - new Date(room.agendado_para).getTime() > 2 * 60 * 60 * 1000;
        } else {
          shouldFinalize = now.getTime() - new Date(room.created_at).getTime() > 4 * 60 * 60 * 1000;
        }
        if (shouldFinalize) {
          try {
            await callLivekitFn("endRoom", { roomId: room.id });
          } catch {
            await supabase
              .from("meeting_rooms")
              .update({ status: "finalizada", finalizado_em: now.toISOString() })
              .eq("id", room.id);
          }
        }
      }
    } catch (e) {
      console.error("Erro ao auto-finalizar salas:", e);
    }
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      // Edge function filtra por host/participante/convidado (segurança)
      const data = await callLivekitFn("listRooms");
      const roomsList = (data.rooms || []) as MeetingRoomSummary[];
      setRooms(roomsList);

      const roomIds = roomsList.map((r) => r.id);
      if (roomIds.length > 0) {
        const { data: rsvpData } = await supabase
          .from("meeting_rsvp")
          .select("room_id, resposta")
          .in("room_id", roomIds);
        const map: Record<string, RsvpCounts> = {};
        for (const r of roomsList) {
          const rsvps = (rsvpData || []).filter((rv) => rv.room_id === r.id);
          const total = r.convidados?.length || 0;
          const sim = rsvps.filter((rv) => rv.resposta === "sim").length;
          const nao = rsvps.filter((rv) => rv.resposta === "nao").length;
          const talvez = rsvps.filter((rv) => rv.resposta === "talvez").length;
          map[r.id] = { sim, nao, talvez, pendente: Math.max(0, total - (sim + nao + talvez)) };
        }
        setRsvpMap(map);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar salas");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!userReady) return;
    autoFinalizeExpired().then(fetchRooms);
    const interval = setInterval(() => autoFinalizeExpired().then(fetchRooms), 60000);
    return () => clearInterval(interval);
  }, [userReady, autoFinalizeExpired, fetchRooms]);

  const endRoom = async (roomId: string) => {
    try {
      await callLivekitFn("endRoom", { roomId });
      toast.success("Sala encerrada");
      fetchRooms();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao encerrar sala");
    }
  };

  const reopenRoom = async (roomId: string) => {
    try {
      const { error } = await supabase
        .from("meeting_rooms")
        .update({ status: "ativa", finalizado_em: null })
        .eq("id", roomId);
      if (error) throw error;
      toast.success("Sala reaberta com sucesso!");
      fetchRooms();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reabrir sala");
    }
  };

  const deleteRoom = async (roomId: string) => {
    try {
      await callLivekitFn("deleteRoom", { roomId });
      toast.success("Reunião apagada");
      fetchRooms();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao apagar reunião");
    }
  };

  const createInvite = async (roomId: string): Promise<string | null> => {
    try {
      const data = await callLivekitFn("createInvite", { roomId });
      return `${window.location.origin}/invite/${data.invite.id}`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar convite");
      return null;
    }
  };

  return { rooms, loading, rsvpMap, fetchRooms, endRoom, reopenRoom, deleteRoom, createInvite };
}
