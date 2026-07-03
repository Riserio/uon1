import { supabase } from "@/integrations/supabase/client";

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms`;

/**
 * Chama a edge function livekit-rooms com:
 * - verificação de res.ok antes de res.json()
 * - mensagem de erro amigável
 * - 1 retry automático para falhas de rede
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callLivekitFn<T = any>(action: string, body?: unknown, retries = 1): Promise<T> {
  try {
    const session = (await supabase.auth.getSession()).data.session;
    // Authorization só quando há sessão — endpoints públicos (convidados) funcionam sem login
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${BASE_URL}?action=${action}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // resposta não-JSON (ex.: gateway timeout) — tratada abaixo via res.ok
    }
    if (!res.ok || data?.error) {
      throw new Error(data?.error || `Falha na comunicação com o servidor (${res.status})`);
    }
    return data as T;
  } catch (e) {
    // TypeError = falha de rede no fetch → 1 retry com backoff curto
    if (retries > 0 && e instanceof TypeError) {
      await new Promise((r) => setTimeout(r, 800));
      return callLivekitFn<T>(action, body, retries - 1);
    }
    throw e;
  }
}
