import { supabase } from "./client";
import type { Json } from "./types";

/** Acesso público mediado por funções seguras; o token nunca vira regra de RLS. */
export async function getVistoriaPublica(token?: string | null) {
  if (!token) return { data: null, error: new Error("Link de vistoria inválido") };
  const result = await supabase.rpc("get_vistoria_publica", { p_token: token });
  return { ...result, data: result.data as any };
}

export async function atualizarVistoriaPublica(token: string | undefined, payload: Record<string, unknown>) {
  if (!token) return { data: null, error: new Error("Link de vistoria inválido") };
  const result = await supabase.rpc("atualizar_vistoria_publica", { p_token: token, p_payload: payload as Json });
  return { ...result, data: result.data as any };
}
