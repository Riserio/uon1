export interface RoomData {
  id: string;
  nome: string;
  descricao: string | null;
  host_id: string;
  livekit_room_name: string;
  status: string;
  agendado_para: string | null;
  duracao_minutos: number | null;
  finalizado_em: string | null;
}

export interface ParticipantRow {
  id: string;
  display_name: string;
  status: string;
  is_host: boolean;
}

export interface MeetingRoomSummary extends RoomData {
  tipo: string;
  max_participantes: number;
  created_at: string;
  convidados: { nome?: string; email?: string; telefone?: string }[] | null;
  meeting_participants?: ParticipantRow[];
}

export interface PendingParticipant {
  id: string;
  identity: string;
  display_name: string;
  status: string;
  is_host: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  sender_name: string;
  sender_id: string;
  message: string;
  created_at: string;
}

/** Mensagens do data channel (reações e mão levantada) */
export interface DataMessage {
  type: "reaction" | "hand_raise" | "hand_lower";
  emoji?: string;
  senderName?: string;
  senderId?: string;
}

export type LayoutMode = "auto" | "mosaic" | "spotlight" | "sidebar";

export interface MediaChoice {
  video: boolean;
  audio: boolean;
}

export interface RsvpCounts {
  sim: number;
  nao: number;
  talvez: number;
  pendente: number;
}

export const REACTION_EMOJIS = ["👍", "👏", "😂", "❤️", "🎉", "🔥", "😮", "🤔"] as const;
