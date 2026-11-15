// Uon1 Trust — utilitários do lado do navegador.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";

const URL_FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uon1-trust`;
const URL_PADRAO = "https://vangard.uon1.com.br";

/** Endereço público do app (nunca o de pré-visualização/localhost). */
export function urlPublica(): string {
  const env = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, "");
  if (env) return env;
  const { origin, hostname } = window.location;
  if (hostname === "localhost" || hostname.includes("preview") || hostname.endsWith("lovableproject.com")) return URL_PADRAO;
  return origin;
}

export const urlValidacao = (codigo: string) => `${urlPublica()}/validar/${codigo}`;

/** Módulos do QR (para desenhar com retângulos no jsPDF). */
export function qrModulos(texto: string): { tamanho: number; quadrados: [number, number, number][] } {
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value: texto, level: "M", marginSize: 0 }));
  const tamanho = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1] ?? 0);
  const d = [...svg.matchAll(/<path[^>]*d="([^"]+)"/g)].map((m) => m[1]).pop() ?? "";
  const quadrados: [number, number, number][] = [];
  for (const m of d.matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v1H\d+z/g)) quadrados.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  return { tamanho, quadrados };
}

export async function sha256Arquivo(arquivo: Blob): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer());
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function chamar<T>(acao: string, corpo: Record<string, unknown>, autenticado = false): Promise<T> {
  let bearer = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  if (autenticado) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Sessão expirada. Entre novamente.");
    bearer = data.session.access_token;
  }
  let r: Response;
  try {
    r = await fetch(URL_FUNCAO, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ acao, ...corpo }),
    });
  } catch {
    throw new Error("Sem conexão. Verifique a internet e tente novamente.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erro || "Não foi possível consultar. Tente novamente.");
  return j as T;
}

export interface FichaTrust {
  encontrado: boolean;
  documento?: { codigo: string; titulo: string; tipo: string; status: string; motivo_status: string | null; emitido_em: string; url: string };
  emissor?: { nome: string; cnpj: string | null };
  versoes?: {
    tipo: string;
    rotulo: string;
    hash: string;
    registrada_em: string;
    selo: string;
    selo_em: string | null;
    carimbo: string;
    carimbo_em: string | null;
    mais_recente: boolean;
  }[];
  versao_consultada?: { tipo: string; rotulo: string; mais_recente: boolean } | null;
  historico?: { tipo: string; descricao: string; created_at: string; hash: string }[];
  historico_integro?: boolean;
  outros?: number;
}

export const trust = {
  validar: (codigo: string) => chamar<FichaTrust>("validar", { codigo }),
  validarHash: (hash: string) => chamar<FichaTrust>("validar_hash", { hash }),
  verificarCadeia: () =>
    chamar<{ ok: boolean; total: number; primeiro_erro: number | null; ultimo_hash: string; selo_configurado: boolean; carimbo_configurado: boolean }>(
      "verificar_cadeia",
      {},
      true,
    ),
  registrar: (p: { pdf_base64: string; titulo_publico: string; tipo: string }) =>
    chamar<{ codigo: string; url: string; hash: string }>("registrar", p, true),
  revogar: (documento_id: string, motivo: string) => chamar<{ ok: true }>("revogar", { documento_id, motivo }, true),
};
