// Uon1 Trust — camada de confiança digital dos documentos emitidos.
// Ações:
//   públicas: validar (por código), validar_hash (hash calculado no navegador;
//             o arquivo não sai do aparelho de quem consulta)
//   internas: verificar_cadeia, registrar (documento avulso), revogar
//   rotina:   processar (novas tentativas de carimbo do tempo)
// A consulta pública mostra só o necessário para conferir autenticidade:
// emissor, título público, situação, datas, hashes e eventos públicos —
// nenhum dado pessoal das partes (LGPD).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import {
  BUCKET_TRUST,
  aplicarCarimbo,
  carimboConfigurado,
  deBase64,
  encerrarDocumento,
  garantirDocumento,
  gerarCodigo,
  normalizarCodigo,
  registrarVersao,
  seloConfigurado,
  urlValidacao,
} from "./nucleo.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

class Erro extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

const ROTULO_VERSAO: Record<string, string> = {
  original: "Documento emitido",
  assinado: "Documento assinado por todas as partes",
  selado: "Documento assinado com selo ICP-Brasil",
};

async function fichaPublica(db: SupabaseClient, doc: Row, hashConsultado?: string) {
  const [{ data: emissor }, { data: versoes }, { data: eventos }, { data: integro }] = await Promise.all([
    db.from("trust_emissores").select("nome, cnpj").eq("id", doc.emissor_id).maybeSingle(),
    db.from("trust_versoes").select("*").eq("documento_id", doc.id).order("created_at"),
    db.from("trust_eventos").select("tipo, descricao, created_at, hash").eq("documento_id", doc.id).eq("publico", true).order("id"),
    db.rpc("trust_verificar_documento", { _documento_id: doc.id }),
  ]);
  const lista = (versoes ?? []) as Row[];
  const ultima = lista[lista.length - 1];
  const encontrada = hashConsultado ? lista.find((v) => v.hash_sha256 === hashConsultado) : null;
  return {
    documento: {
      codigo: doc.codigo,
      titulo: doc.titulo_publico,
      tipo: doc.tipo,
      status: doc.status,
      motivo_status: doc.status === "valido" ? null : doc.motivo_status,
      emitido_em: doc.emitido_em,
      url: urlValidacao(doc.codigo),
    },
    emissor: { nome: emissor?.nome ?? "—", cnpj: emissor?.cnpj ?? null },
    versoes: lista.map((v) => ({
      tipo: v.tipo,
      rotulo: ROTULO_VERSAO[v.tipo] ?? v.tipo,
      hash: v.hash_sha256,
      registrada_em: v.created_at,
      selo: v.selo_status,
      selo_em: v.selo_em,
      carimbo: v.carimbo_status,
      carimbo_em: v.carimbo_em,
      mais_recente: v.id === ultima?.id,
    })),
    versao_consultada: encontrada
      ? { tipo: encontrada.tipo, rotulo: ROTULO_VERSAO[encontrada.tipo] ?? encontrada.tipo, mais_recente: encontrada.id === ultima?.id }
      : null,
    historico: eventos ?? [],
    historico_integro: integro !== false,
  };
}

async function validar(db: SupabaseClient, body: Row) {
  const codigo = normalizarCodigo(String(body.codigo ?? ""));
  if (!/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(codigo)) throw new Erro(422, "Código de verificação inválido");
  const { data: doc } = await db.from("trust_documentos").select("*").eq("codigo", codigo).maybeSingle();
  if (!doc) return json({ encontrado: false });
  return json({ encontrado: true, ...(await fichaPublica(db, doc)) });
}

async function validarHash(db: SupabaseClient, body: Row) {
  const hash = String(body.hash ?? "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Erro(422, "Hash inválido");
  const { data: versoes } = await db.from("trust_versoes").select("documento_id").eq("hash_sha256", hash).limit(5);
  const ids = [...new Set((versoes ?? []).map((v: Row) => v.documento_id))];
  if (!ids.length) return json({ encontrado: false });
  const { data: docs } = await db.from("trust_documentos").select("*").in("id", ids);
  const fichas = await Promise.all((docs ?? []).map((d: Row) => fichaPublica(db, d, hash)));
  return json({ encontrado: true, ...fichas[0], outros: fichas.length - 1 });
}

// ---------------------------------------------------------------------------
async function nivel(db: SupabaseClient, uid: string): Promise<string> {
  const { data } = await db.rpc("uonisign_nivel", { _uid: uid });
  return (data as string) ?? "nenhum";
}

async function verificarCadeia(db: SupabaseClient, uid: string) {
  if (!["admin", "operador"].includes(await nivel(db, uid))) throw new Erro(403, "Sem permissão");
  const { data, error } = await db.rpc("trust_verificar_cadeia");
  if (error) throw new Erro(500, error.message);
  const r = (Array.isArray(data) ? data[0] : data) as Row;
  return json({ ...r, selo_configurado: seloConfigurado(), carimbo_configurado: carimboConfigurado() });
}

async function registrar(db: SupabaseClient, uid: string, body: Row) {
  if ((await nivel(db, uid)) !== "admin") throw new Erro(403, "Só o administrador registra documentos avulsos");
  const titulo = String(body.titulo_publico ?? "").trim();
  if (titulo.length < 5) throw new Erro(422, "Informe um título público (sem dados pessoais)");
  const bytes = deBase64(String(body.pdf_base64 ?? ""));
  if (bytes.length < 100 || bytes.length > 20 * 1024 * 1024) throw new Erro(400, "Arquivo inválido (até 20 MB)");
  const codigo = gerarCodigo();
  const docId = await garantirDocumento(db, {
    codigo,
    emissor: String(body.emissor ?? "vangard"),
    origem: "manual",
    tipo: String(body.tipo ?? "documento").slice(0, 40),
    titulo_publico: titulo,
    ator_id: uid,
  });
  const path = `avulsos/${docId}/${crypto.randomUUID()}.pdf`;
  const { error } = await db.storage.from(BUCKET_TRUST).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (error) throw new Erro(500, "Falha ao guardar o arquivo: " + error.message);
  const v = await registrarVersao(db, docId, { tipo: "original", bytes, bucket: BUCKET_TRUST, path, descricao: "Documento emitido", ator_id: uid });
  return json({ codigo, url: urlValidacao(codigo), hash: v.hash });
}

async function revogar(db: SupabaseClient, uid: string, body: Row) {
  if ((await nivel(db, uid)) !== "admin") throw new Erro(403, "Só o administrador revoga documentos");
  const motivo = String(body.motivo ?? "").trim();
  if (motivo.length < 5) throw new Erro(422, "Informe o motivo (aparece na validação pública; não inclua dados pessoais)");
  const { data: doc } = await db.from("trust_documentos").select("id, status").eq("id", body.documento_id).maybeSingle();
  if (!doc) throw new Erro(404, "Documento não encontrado");
  if (doc.status !== "valido") throw new Erro(409, "Documento já encerrado");
  await encerrarDocumento(db, doc.id, "revogado", `Documento revogado pelo emissor: ${motivo}`, uid);
  return json({ ok: true });
}

async function processar(db: SupabaseClient) {
  if (!carimboConfigurado()) return json({ ok: true, carimbos: 0, motivo: "carimbo não configurado" });
  const { data } = await db
    .from("trust_versoes")
    .select("id, documento_id, hash_sha256, carimbo_tentativas")
    .in("carimbo_status", ["pendente", "erro", "nao_configurado"])
    .lt("carimbo_tentativas", 10)
    .limit(100);
  let n = 0;
  for (const v of data ?? []) if (await aplicarCarimbo(db, v.documento_id, v.id, v.hash_sha256)) n++;
  return json({ ok: true, carimbos: n });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = (await req.json().catch(() => ({}))) as Row;
    const acao = String(body.acao ?? "");
    if (acao === "validar") return await validar(db, body);
    if (acao === "validar_hash") return await validarHash(db, body);
    if (acao === "processar") return await processar(db);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ erro: "Não autenticado" }, 401);
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u } = await anon.auth.getUser();
    if (!u?.user) return json({ erro: "Não autenticado" }, 401);
    if (acao === "verificar_cadeia") return await verificarCadeia(db, u.user.id);
    if (acao === "registrar") return await registrar(db, u.user.id, body);
    if (acao === "revogar") return await revogar(db, u.user.id, body);
    return json({ erro: "Ação inválida" }, 400);
  } catch (e) {
    if (e instanceof Erro) return json({ erro: e.message }, e.status);
    console.error("[uon1-trust]", e);
    return json({ erro: "Erro interno. Tente novamente." }, 500);
  }
});
