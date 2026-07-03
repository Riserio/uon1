/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Carregamento tardio (lazy) dos módulos LiveKit.
 * Evita crash de import em navegadores sem suporte e reduz o bundle inicial.
 * Os componentes só renderizam após loadLiveKit() resolver, então `lk.*` está sempre definido em runtime.
 */
export const lk: Record<string, any> = {};

let loaded = false;
export let livekitLoadError: string | null = null;

export async function loadLiveKit(): Promise<boolean> {
  if (loaded) return true;
  try {
    const [components, client] = await Promise.all([
      import("@livekit/components-react"),
      import("livekit-client"),
    ]);
    Object.assign(lk, {
      // Componentes
      LiveKitRoom: components.LiveKitRoom,
      VideoTrack: components.VideoTrack,
      AudioTrack: components.AudioTrack,
      RoomAudioRenderer: components.RoomAudioRenderer,
      StartAudio: components.StartAudio,
      TrackToggle: components.TrackToggle,
      // Hooks
      useTracks: components.useTracks,
      useParticipants: components.useParticipants,
      useSpeakingParticipants: components.useSpeakingParticipants,
      useDataChannel: components.useDataChannel,
      useLocalParticipant: components.useLocalParticipant,
      useRoomContext: components.useRoomContext,
      useConnectionState: components.useConnectionState,
      useIsSpeaking: components.useIsSpeaking,
      useIsMuted: components.useIsMuted,
      useConnectionQualityIndicator: components.useConnectionQualityIndicator,
      // Enums / classes do client
      Track: client.Track,
      ConnectionState: client.ConnectionState,
      ConnectionQuality: client.ConnectionQuality,
    });
    await import("@livekit/components-styles");
    loaded = true;
    return true;
  } catch (e: any) {
    console.error("Falha ao carregar módulos de vídeo:", e);
    livekitLoadError = e?.message || "Falha ao carregar módulos de vídeo";
    return false;
  }
}
