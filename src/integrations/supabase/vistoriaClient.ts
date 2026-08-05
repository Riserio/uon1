// Client Supabase "escopado" por token de vistoria pública.
//
// As policies da tabela `vistorias` para acesso público comparam o
// `link_token` da linha com o header `x-vistoria-token` enviado na
// requisição. Assim, um visitante só enxerga/atualiza a vistoria do
// link que ele possui — e não todas as vistorias ativas.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const cache = new Map<string, SupabaseClient<Database>>();

export function getVistoriaClient(token?: string | null): SupabaseClient<Database> {
  const key = token || "";
  const existing = cache.get(key);
  if (existing) return existing;

  const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: key ? { "x-vistoria-token": key } : {} },
  });
  cache.set(key, client);
  return client;
}
