/**
 * Pausa global da camada Realtime quando a aba fica oculta por >60s.
 * Reduz custo de Cloud Realtime sem alterar nenhum hook individual:
 * todos os canais existentes simplesmente desconectam quando ninguém
 * está olhando e se reconectam (com replay) quando o usuário volta.
 */
import { supabase } from "@/integrations/supabase/client";

let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
let disconnected = false;
const HIDDEN_GRACE_MS = 60_000; // 1 minuto de tolerância

function disconnectIfStillHidden() {
  if (document.visibilityState !== "hidden" || disconnected) return;
  try {
    // @ts-ignore - método público do RealtimeClient
    supabase.realtime.disconnect();
    disconnected = true;
  } catch {
    /* noop */
  }
}

function reconnect() {
  if (!disconnected) return;
  try {
    // @ts-ignore - método público do RealtimeClient
    supabase.realtime.connect();
  } catch {
    /* noop */
  }
  disconnected = false;
}

function onVisibilityChange() {
  if (hiddenTimer) {
    clearTimeout(hiddenTimer);
    hiddenTimer = null;
  }
  if (document.visibilityState === "hidden") {
    hiddenTimer = setTimeout(disconnectIfStillHidden, HIDDEN_GRACE_MS);
  } else {
    reconnect();
  }
}

export function installRealtimeVisibilityPause() {
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", reconnect);
  window.addEventListener("pagehide", disconnectIfStillHidden);
}