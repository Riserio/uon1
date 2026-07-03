import { lk } from "../livekit";

/** Banner exibido enquanto o LiveKit reconecta (mantém a sala montada, padrão Meet) */
function ConnectionBanner() {
  const state = lk.useConnectionState?.();
  if (!lk.ConnectionState || state !== lk.ConnectionState.Reconnecting) return null;
  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-2 bg-amber-500/90 text-white rounded-full px-4 py-1.5 text-xs font-medium shadow-lg">
      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
      Reconectando…
    </div>
  );
}

/**
 * Camada de confiabilidade da sala:
 * - RoomAudioRenderer central (corrige "não ouço ninguém")
 * - StartAudio para navegadores que bloqueiam autoplay
 * - Banner de reconexão
 */
export default function ReliabilityLayer() {
  const { RoomAudioRenderer, StartAudio } = lk;
  return (
    <>
      <RoomAudioRenderer />
      <StartAudio
        label="Clique para ativar o som da reunião"
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] bg-primary text-primary-foreground rounded-full px-4 py-2 text-sm shadow-lg"
      />
      <ConnectionBanner />
    </>
  );
}
