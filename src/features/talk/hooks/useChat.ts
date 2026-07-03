import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ChatMessage } from "../types";

/** Mensagens do chat da reunião com realtime e envio resiliente */
export function useChatMessages(roomId: string, userId: string, userName: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("meeting_messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (!cancelled) setMessages((data as ChatMessage[]) || []);
      });

    const channel = supabase
      .channel(`chat-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_messages", filter: `room_id=eq.${roomId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as ChatMessage]),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const send = async (text: string): Promise<boolean> => {
    const message = text.trim();
    if (!message) return false;
    const { error } = await supabase.from("meeting_messages").insert({
      room_id: roomId,
      sender_id: userId,
      sender_name: userName,
      message,
    });
    if (error) {
      toast.error("Falha ao enviar mensagem. Tente novamente.");
      return false;
    }
    return true;
  };

  return { messages, send };
}

/** Contador de mensagens não lidas enquanto o painel de chat está fechado (badge padrão Meet) */
export function useUnreadChat(roomId: string | undefined, userId: string | undefined, isOpen: boolean) {
  const [unread, setUnread] = useState(0);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) setUnread(0);
  }, [isOpen]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`chat-unread-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          if (isOpenRef.current || msg.sender_id === userId) return;
          setUnread((u) => u + 1);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, userId]);

  return unread;
}
