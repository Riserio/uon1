import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { callLivekitFn } from "@/lib/livekitApi";
import { loadLiveKit, livekitLoadError } from "../livekit";
import type { RoomData } from "../types";

/**
 * Estado e ciclo de vida da conexão com uma reunião:
 * carregamento do LiveKit, token, reconexão, saída e encerramento.
 */
export function useMeetingConnection(roomId: string | undefined, userReady: boolean) {
  const navigate = useNavigate();

  const [livekitReady, setLivekitReady] = useState(false);
  const [livekitError, setLivekitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState("");
  const [room, setRoom] = useState<RoomData | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [participantStatus, setParticipantStatus] = useState("pending");
  const [connectionLost, setConnectionLost] = useState(false);
  const [rejoining, setRejoining] = useState(false);

  const intentionalLeaveRef = useRef(false);

  useEffect(() => {
    loadLiveKit().then((ok) => {
      if (ok) setLivekitReady(true);
      else setLivekitError(livekitLoadError || "Falha ao carregar módulos de vídeo");
    });
  }, []);

  const joinRoom = useCallback(async () => {
    try {
      const data = await callLivekitFn("getToken", { roomId });
      setToken(data.token);
      setLivekitUrl(data.livekitUrl);
      setRoom(data.room);
      setIsHost(data.isHost);
      setParticipantStatus(data.participantStatus);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao entrar na sala");
      navigate("/video");
    }
    setLoading(false);
  }, [roomId, navigate]);

  useEffect(() => {
    if (userReady && roomId && livekitReady) joinRoom();
  }, [userReady, roomId, livekitReady, joinRoom]);

  /** Reconexão manual após queda definitiva: novo token e remonta a sala */
  const rejoin = useCallback(async () => {
    setRejoining(true);
    try {
      const data = await callLivekitFn("getToken", { roomId });
      setToken(data.token);
      setLivekitUrl(data.livekitUrl);
      setRoom(data.room);
      setConnectionLost(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reconectar. Tente novamente.");
    }
    setRejoining(false);
  }, [roomId]);

  const handleDisconnected = useCallback(() => {
    if (intentionalLeaveRef.current) navigate("/video");
    else setConnectionLost(true); // o LiveKit já tentou reconectar sozinho antes deste evento
  }, [navigate]);

  /** "Sair da reunião": só eu saio (padrão Meet) */
  const leave = useCallback(() => {
    intentionalLeaveRef.current = true;
    navigate("/video");
  }, [navigate]);

  /** "Encerrar para todos": só o host — encerra no servidor e desconecta todos */
  const endForAll = useCallback(async () => {
    if (!isHost || !roomId) return;
    intentionalLeaveRef.current = true;
    try {
      await callLivekitFn("endRoom", { roomId });
      toast.success("Reunião encerrada para todos");
    } catch {
      // navega mesmo assim
    }
    navigate("/video");
  }, [isHost, roomId, navigate]);

  const extendRoom = useCallback((mins: number) => {
    setRoom((prev) => (prev ? { ...prev, duracao_minutos: (prev.duracao_minutos || 60) + mins } : prev));
  }, []);

  return {
    livekitReady,
    livekitError,
    loading,
    token,
    livekitUrl,
    room,
    isHost,
    participantStatus,
    connectionLost,
    rejoining,
    setToken,
    setParticipantStatus,
    rejoin,
    leave,
    endForAll,
    extendRoom,
    handleDisconnected,
  };
}
