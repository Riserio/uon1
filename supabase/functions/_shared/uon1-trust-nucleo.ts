// Uon1 Trust — núcleo usado pela função `uon1-trust` e pelos módulos que
// emitem documentos (hoje: `uonisign`, que importa este arquivo).
//
// Responsável por: código de verificação, registro de versões (SHA-256),
// histórico encadeado (o encadeamento é feito no banco), carimbo do tempo e
// selo ICP-Brasil (adaptadores plugáveis — desligados até haver provedor).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

export const APP_URL = (Deno.env.get("APP_URL") || "https://vangard.uon1.com.br").replace(/\/$/, "");
export const BUCKET_TRUST = "uon1-trust";

export const urlValidacao = (codigo: string) => `${APP_URL}/validar/${codigo}`;

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
export async function sha256Hex(dados: Uint8Array | string): Promise<string> {
  const bytes = typeof dados === "string" ? new TextEncoder().encode(dados) : dados;
  const h = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function paraBase64(bytes: Uint8Array): string {
  let s = "";
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(s);
}

export function deBase64(b64: string): Uint8Array {
  const limpo = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(limpo);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Sem 0/O, 1/I/L — fácil de ditar e digitar. 12 caracteres ≈ 60 bits.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function gerarCodigo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const c = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

export const normalizarCodigo = (c: string) =>
  (c ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3");

// ---------------------------------------------------------------------------
// Adaptadores (Fases 2 e 3)
// ---------------------------------------------------------------------------
// Carimbo do tempo (ACT credenciada na ICP-Brasil, RFC 3161):
//   UON1TRUST_CARIMBO_URL   POST {hash, algoritmo:"SHA-256"} → {token_base64, carimbo_em}
//   UON1TRUST_CARIMBO_TOKEN Bearer
// Selo ICP-Brasil (PAdES com o certificado DO EMISSOR — ex.: certificado em
// nuvem de um PSC credenciado, com assinatura remota por API):
//   UON1TRUST_SELO_URL      POST {emissor, documento_codigo, hash, pdf_base64} → {pdf_base64, carimbo_tempo_em}
//   UON1TRUST_SELO_TOKEN    Bearer
// (UONISIGN_LACRE_URL/TOKEN continuam aceitos como nomes antigos do selo.)
const env = (a: string, b?: string) => Deno.env.get(a) || (b ? Deno.env.get(b) : undefined) || "";

export const carimboConfigurado = () => Boolean(env("UON1TRUST_CARIMBO_URL"));
export const seloConfigurado = () => Boolean(env("UON1TRUST_SELO_URL", "UONISIGN_LACRE_URL"));

export async function carimbarHash(hash: string): Promise<{ ok: true; token: Uint8Array; em: string } | { ok: false; erro: string }> {
  const url = env("UON1TRUST_CARIMBO_URL");
  if (!url) return { ok: false, erro: "nao_configurado" };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("UON1TRUST_CARIMBO_TOKEN")}` },
      body: JSON.stringify({ hash, algoritmo: "SHA-256" }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return { ok: false, erro: `ACT ${r.status}: ${(await r.text()).slice(0, 300)}` };
    const j = await r.json();
    if (!j?.token_base64) return { ok: false, erro: "A ACT não devolveu o token" };
    return { ok: true, token: deBase64(j.token_base64), em: j.carimbo_em ?? new Date().toISOString() };
  } catch (e) {
    return { ok: false, erro: String((e as Error)?.message ?? e) };
  }
}

export async function selarPdf(
  pdf: Uint8Array,
  meta: { emissor: { slug: string; cnpj?: string | null }; codigo: string; hash: string },
): Promise<{ ok: true; pdf: Uint8Array; carimbo_tempo_em: string | null } | { ok: false; erro: string }> {
  const url = env("UON1TRUST_SELO_URL", "UONISIGN_LACRE_URL");
  if (!url) return { ok: false, erro: "nao_configurado" };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("UON1TRUST_SELO_TOKEN", "UONISIGN_LACRE_TOKEN")}` },
      body: JSON.stringify({ emissor: meta.emissor, documento_codigo: meta.codigo, hash: meta.hash, pdf_base64: paraBase64(pdf) }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) return { ok: false, erro: `Selo ${r.status}: ${(await r.text()).slice(0, 300)}` };
    const j = await r.json();
    if (!j?.pdf_base64) return { ok: false, erro: "O serviço de selo não devolveu o PDF" };
    return { ok: true, pdf: deBase64(j.pdf_base64), carimbo_tempo_em: j.carimbo_tempo_em ?? null };
  } catch (e) {
    return { ok: false, erro: String((e as Error)?.message ?? e) };
  }
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------
export interface Evento {
  tipo: string;
  descricao: string;
  publico?: boolean;
  dados?: unknown;
  ator_id?: string | null;
  versao_id?: string | null;
}

export async function registrarEvento(db: SupabaseClient, documentoId: string, e: Evento) {
  const { error } = await db.from("trust_eventos").insert({
    documento_id: documentoId,
    versao_id: e.versao_id ?? null,
    tipo: e.tipo,
    descricao: e.descricao,
    publico: e.publico ?? false,
    dados: e.dados ?? null,
    ator_id: e.ator_id ?? null,
  });
  if (error) console.error("[uon1-trust] evento", e.tipo, error.message);
}

export interface NovoDocumento {
  codigo: string;
  emissor: string; // slug
  origem: string;
  origem_id?: string | null;
  tipo: string;
  titulo_publico: string;
  ator_id?: string | null;
}

/** Garante o documento (idempotente pelo código) e devolve o id. */
export async function garantirDocumento(db: SupabaseClient, d: NovoDocumento): Promise<string> {
  const { data: existente } = await db.from("trust_documentos").select("id").eq("codigo", d.codigo).maybeSingle();
  if (existente) return existente.id;
  const { data: emissor } = await db.from("trust_emissores").select("id").eq("slug", d.emissor).maybeSingle();
  if (!emissor) throw new Error(`Emissor ${d.emissor} não cadastrado no Uon1 Trust`);
  const { data, error } = await db
    .from("trust_documentos")
    .insert({
      codigo: d.codigo,
      emissor_id: emissor.id,
      origem: d.origem,
      origem_id: d.origem_id ?? null,
      tipo: d.tipo,
      titulo_publico: d.titulo_publico.slice(0, 200),
      created_by: d.ator_id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    // corrida: outro processo criou no meio do caminho
    const { data: de } = await db.from("trust_documentos").select("id").eq("codigo", d.codigo).maybeSingle();
    if (de) return de.id;
    throw new Error(error.message);
  }
  await registrarEvento(db, data.id, {
    tipo: "documento_registrado",
    descricao: "Documento registrado no Uon1 Trust",
    publico: true,
    ator_id: d.ator_id,
    dados: { origem: d.origem, tipo: d.tipo },
  });
  return data.id;
}

export interface NovaVersao {
  tipo: "original" | "assinado" | "selado";
  bytes: Uint8Array;
  bucket?: string;
  path?: string;
  descricao: string;
  ator_id?: string | null;
  selo_status?: string;
  selo_em?: string | null;
}

/** Registra uma versão (arquivo) do documento e tenta o carimbo do tempo. */
export async function registrarVersao(db: SupabaseClient, documentoId: string, v: NovaVersao): Promise<{ id: string; hash: string }> {
  const hash = await sha256Hex(v.bytes);
  const { data: existe } = await db.from("trust_versoes").select("id").eq("documento_id", documentoId).eq("hash_sha256", hash).maybeSingle();
  if (existe) return { id: existe.id, hash };
  const { data, error } = await db
    .from("trust_versoes")
    .insert({
      documento_id: documentoId,
      tipo: v.tipo,
      hash_sha256: hash,
      tamanho: v.bytes.length,
      storage_bucket: v.bucket ?? null,
      storage_path: v.path ?? null,
      selo_status: v.selo_status ?? (seloConfigurado() ? "pendente" : "nao_configurado"),
      selo_em: v.selo_em ?? null,
      carimbo_status: carimboConfigurado() ? "pendente" : "nao_configurado",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await registrarEvento(db, documentoId, {
    tipo: `versao_${v.tipo}`,
    descricao: v.descricao,
    publico: true,
    versao_id: data.id,
    ator_id: v.ator_id,
    dados: { hash, tamanho: v.bytes.length },
  });
  if (carimboConfigurado()) await aplicarCarimbo(db, documentoId, data.id, hash);
  return { id: data.id, hash };
}

export async function aplicarCarimbo(db: SupabaseClient, documentoId: string, versaoId: string, hash: string): Promise<boolean> {
  const r = await carimbarHash(hash);
  if (!r.ok) {
    const { data: v } = await db.from("trust_versoes").select("carimbo_tentativas").eq("id", versaoId).maybeSingle();
    await db.from("trust_versoes").update({ carimbo_status: "erro", carimbo_tentativas: (v?.carimbo_tentativas ?? 0) + 1 }).eq("id", versaoId);
    return false;
  }
  const path = `carimbos/${versaoId}.tsr`;
  await db.storage.from(BUCKET_TRUST).upload(path, r.token, { contentType: "application/timestamp-reply", upsert: false });
  await db.from("trust_versoes").update({ carimbo_status: "concluido", carimbo_em: r.em, carimbo_path: path }).eq("id", versaoId);
  await registrarEvento(db, documentoId, {
    tipo: "carimbo_tempo",
    descricao: "Carimbo do tempo aplicado por Autoridade de Carimbo do Tempo",
    publico: true,
    versao_id: versaoId,
    dados: { hash, carimbo_em: r.em },
  });
  return true;
}

/** Documento deixa de valer (cancelado, revogado, substituído). Não volta. */
export async function encerrarDocumento(
  db: SupabaseClient,
  documentoId: string,
  status: "cancelado" | "revogado" | "substituido",
  motivoPublico: string,
  ator_id?: string | null,
) {
  const { error } = await db.from("trust_documentos").update({ status, motivo_status: motivoPublico }).eq("id", documentoId).eq("status", "valido");
  if (error) {
    console.error("[uon1-trust] encerrar", error.message);
    return;
  }
  await registrarEvento(db, documentoId, { tipo: `documento_${status}`, descricao: motivoPublico, publico: true, ator_id });
}
