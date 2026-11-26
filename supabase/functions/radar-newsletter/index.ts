// Radar do mercado — newsletter da página pública /radar.
// Ações:
//   assinar           (público) e-mail + aceite de comunicações → e-mail de confirmação
//   confirmar         (público) token do e-mail → assinatura ativa
//   cancelar          (público) token → assinatura cancelada (também aceita o
//                     "cancelar com um clique" dos provedores de e-mail, via POST)
//   enviar_novidades  (rotina diária) notícias novas desde o último envio → assinantes ativos.
//                     Idempotente: só manda o que foi coletado depois do último envio.
//                     Comunicados marcados como "interno e externo" entram junto, na
//                     ordem de publicação, uma única vez (comunicados.newsletter_enviado_em).
//   visita            (público) registra uma visita à página pública (local aproximado,
//                     dispositivo e origem; o endereço de rede não é guardado)
//   resumo / enviar_teste / campanha (administração logada). A campanha vai para
//                     assinantes, prospects (radar_prospects) ou todos; prospect recebe rodapé
//                     próprio e link de descadastro com o token dele (cancelar aceita os dois).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { blocoNoticias, emailCampanha, PADRAO_CONFIRMACAO, PADRAO_NOVIDADES, preencher, type Noticia } from "./modelos.ts";

const URL_PADRAO = "https://vangard.uon1.com.br";
const REMETENTE_PADRAO = "Vangard Gestora <vangard@uon1.com.br>";
export const TEXTO_ACEITE =
  "Aceito receber por e-mail as novidades do Radar e comunicações e publicidade da Vangard Gestora. Posso cancelar quando quiser.";
const MAX_NOTICIAS = 15;
const LOTE = 100; // limite do envio em lote do Resend

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const db = (): SupabaseClient => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const urlFuncao = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/radar-newsletter`;

/** Base dos links: só domínios do sistema; o resto cai no endereço oficial. */
function baseSegura(base?: string | null): string {
  try {
    if (!base) return URL_PADRAO;
    const u = new URL(base);
    const h = u.hostname;
    if (u.protocol === "https:" && (h === "uon1.com.br" || h.endsWith(".uon1.com.br") || h.endsWith(".lovable.app"))) return u.origin;
  } catch {
    // base inválida
  }
  return URL_PADRAO;
}

const linkPagina = (base: string, acao: "confirmar" | "cancelar", token: string) =>
  `${base}/radar/newsletter?acao=${acao}&t=${token}`;

const dataHoje = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const saudacao = (nome?: string | null) => (nome?.trim() ? `, ${nome.trim().split(/\s+/)[0]}` : "");

async function remetente(s: SupabaseClient): Promise<string> {
  const { data } = await s.from("resend_config").select("from_name, from_email").not("from_email", "is", null).limit(1).maybeSingle();
  return data?.from_email ? `${data.from_name || "Vangard Gestora"} <${data.from_email}>` : REMETENTE_PADRAO;
}

async function modelo(s: SupabaseClient, tipo: "radar_confirmacao" | "radar_novidades") {
  const { data } = await s
    .from("email_templates")
    .select("assunto, corpo")
    .eq("tipo", tipo)
    .eq("ativo", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (data?.corpo) return { assunto: data.assunto || "", corpo: data.corpo };
  return tipo === "radar_confirmacao" ? PADRAO_CONFIRMACAO : PADRAO_NOVIDADES;
}

interface Email {
  from: string;
  to: string[];
  subject: string;
  html: string;
  headers?: Record<string, string>;
}

async function enviarLote(emails: Email[]): Promise<{ ok: boolean; erro?: string }> {
  const chave = Deno.env.get("RESEND_API_KEY");
  if (!chave) return { ok: false, erro: "RESEND_API_KEY não configurada" };
  const r = await fetch(emails.length === 1 ? "https://api.resend.com/emails" : "https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails.length === 1 ? emails[0] : emails),
  });
  if (r.ok) return { ok: true };
  return { ok: false, erro: `Resend ${r.status}: ${(await r.text()).slice(0, 300)}` };
}

async function registrarHistorico(s: SupabaseClient, linhas: { destinatario: string; assunto: string; status: string; erro?: string | null }[]) {
  if (!linhas.length) return;
  await s.from("email_historico").insert(
    linhas.map((l) => ({
      destinatario: l.destinatario,
      assunto: l.assunto,
      corpo: `[Resend][Radar newsletter] ${l.assunto}`,
      status: l.status,
      erro_mensagem: l.erro ?? null,
      origem: "radar_newsletter",
      enviado_em: new Date().toISOString(),
    })),
  );
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------
const AssinarSchema = z.object({
  acao: z.literal("assinar"),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido").max(255, "E-mail muito longo"),
  nome: z.string().trim().min(3, "Informe seu nome").max(120, "Nome muito longo"),
  associacao: z.string().trim().min(2, "Informe o nome da associação").max(160, "Nome da associação muito longo"),
  telefone: z
    .string()
    .transform((t) => t.replace(/\D/g, ""))
    .refine((t) => t.length === 10 || t.length === 11, "Informe o telefone com DDD"),
  aceite: z.literal(true, { errorMap: () => ({ message: "É preciso aceitar o recebimento das comunicações" }) }),
  base: z.string().max(200).optional().nullable(),
  site: z.string().max(0).optional().nullable(), // armadilha para robôs: precisa vir vazio
});

async function assinar(req: Request, body: unknown) {
  const p = AssinarSchema.safeParse(body);
  if (!p.success) return json({ error: p.error.issues[0]?.message ?? "Dados inválidos" }, 400);
  const { email, nome, associacao, telefone, base } = p.data;
  const s = db();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const ua = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  const resposta = { ok: true, mensagem: "Enviamos um e-mail para confirmar sua inscrição. Confira também a caixa de spam." };

  // até 5 inscrições por hora vindas do mesmo endereço de rede
  if (ip) {
    const { count } = await s
      .from("radar_assinantes")
      .select("id", { count: "exact", head: true })
      .eq("aceite_ip", ip)
      .gte("atualizado_em", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= 5) return json({ error: "Muitas tentativas. Tente de novo mais tarde." }, 429);
  }

  const { data: atual } = await s.from("radar_assinantes").select("*").ilike("email", email).maybeSingle();
  if (atual?.status === "ativo") {
    // já assina: aproveita para completar o cadastro
    await s.from("radar_assinantes").update({ nome, associacao, telefone, atualizado_em: new Date().toISOString() }).eq("id", atual.id);
    return json({ ok: true, jaAtivo: true, mensagem: "Este e-mail já recebe as novidades do Radar." });
  }
  // não reenvia a confirmação mais de uma vez a cada 2 minutos
  if (atual?.status === "pendente" && Date.now() - new Date(atual.atualizado_em).getTime() < 120_000) return json(resposta);

  const agora = new Date().toISOString();
  const dados = {
    email,
    nome,
    associacao,
    telefone,
    status: "pendente",
    token: crypto.randomUUID(),
    aceite_comunicacoes: true,
    aceite_texto: TEXTO_ACEITE,
    aceite_em: agora,
    aceite_ip: ip,
    aceite_user_agent: ua,
    origem: "radar_publico",
    cancelado_em: null,
    confirmacoes_enviadas: (atual?.confirmacoes_enviadas ?? 0) + 1,
    atualizado_em: agora,
  };
  const { data: linha, error } = atual
    ? await s.from("radar_assinantes").update(dados).eq("id", atual.id).select("token, nome").single()
    : await s.from("radar_assinantes").insert(dados).select("token, nome").single();
  if (error || !linha) {
    console.error("[radar-newsletter] gravar assinante:", error?.message);
    return json({ error: "Não foi possível registrar agora. Tente de novo em instantes." }, 500);
  }

  const b = baseSegura(base);
  const t = await modelo(s, "radar_confirmacao");
  const v = {
    nome: linha.nome ?? "",
    saudacao: saudacao(linha.nome),
    email,
    aceite: TEXTO_ACEITE,
    link_confirmar: linkPagina(b, "confirmar", linha.token),
    link_cancelar: linkPagina(b, "cancelar", linha.token),
    link_radar: `${b}/radar`,
    data: dataHoje(),
  };
  const assunto = preencher(t.assunto, v, false);
  const env = await enviarLote([{ from: await remetente(s), to: [email], subject: assunto, html: preencher(t.corpo, v, true) }]);
  await registrarHistorico(s, [{ destinatario: email, assunto, status: env.ok ? "enviado" : "erro", erro: env.erro }]);
  if (!env.ok) {
    console.error("[radar-newsletter] confirmação:", env.erro);
    return json({ error: "Não conseguimos enviar o e-mail de confirmação agora. Tente de novo em instantes." }, 502);
  }
  return json(resposta);
}

async function mudarStatus(token: string | null, acao: "confirmar" | "cancelar") {
  if (!token || !z.string().uuid().safeParse(token).success) return { ok: false, erro: "Link inválido" };
  const s = db();
  const { data: a } = await s.from("radar_assinantes").select("id, status, email").eq("token", token).maybeSingle();
  const agora = new Date().toISOString();
  if (!a) {
    // link de descadastro de uma campanha enviada a um prospect (não assinante)
    const { data: p } = acao === "cancelar"
      ? await s.from("radar_prospects").select("id, status, email").eq("token", token).maybeSingle()
      : { data: null };
    if (!p) return { ok: false, erro: "Link inválido ou expirado" };
    if (p.status !== "descadastrado") {
      await s.from("radar_prospects").update({ status: "descadastrado", descadastrado_em: agora, atualizado_em: agora }).eq("id", p.id);
    }
    return { ok: true, email: p.email };
  }
  if (acao === "confirmar") {
    if (a.status === "cancelado") return { ok: false, erro: "Esta inscrição foi cancelada. Assine de novo na página do Radar." };
    if (a.status !== "ativo") await s.from("radar_assinantes").update({ status: "ativo", confirmado_em: agora, atualizado_em: agora }).eq("id", a.id);
  } else if (a.status !== "cancelado") {
    await s.from("radar_assinantes").update({ status: "cancelado", cancelado_em: agora, atualizado_em: agora }).eq("id", a.id);
  }
  return { ok: true, email: a.email };
}

// ---------------------------------------------------------------------------
// Envio das novidades
// ---------------------------------------------------------------------------
async function noticiasNovas(s: SupabaseClient, desde: string) {
  const recentes = new Date(Date.now() - 30 * 86400_000).toISOString(); // matéria velha recém-coletada não vai
  const { data, error } = await s
    .from("mercado_noticias")
    .select("titulo, link, origem, categoria, publicado_em, coletado_em")
    .eq("oculto", false)
    .in("categoria", ["oficial", "setor"])
    .gt("coletado_em", desde)
    .gte("publicado_em", recentes)
    .order("publicado_em", { ascending: false })
    .limit(MAX_NOTICIAS);
  if (error) throw new Error(error.message);
  return (data ?? []) as (Noticia & { coletado_em: string })[];
}

type ComunicadoEmail = Noticia & { id: string };

/** Comunicados externos ativos que ainda não saíram na newsletter. */
async function comunicadosExternos(s: SupabaseClient, apenasNaoEnviados: boolean, limite = MAX_NOTICIAS): Promise<ComunicadoEmail[]> {
  const recentes = new Date(Date.now() - 30 * 86400_000).toISOString();
  let q = s
    .from("comunicados")
    .select("id, titulo, mensagem, link, imagem_url, created_at")
    .eq("ativo", true)
    .eq("publico", true)
    .gte("created_at", recentes)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (apenasNaoEnviados) q = q.is("newsletter_enviado_em", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as { id: string; titulo: string; mensagem: string; link: string | null; imagem_url: string | null; created_at: string }[];
  return await Promise.all(linhas.map(async (c) => ({
    id: c.id,
    titulo: c.titulo,
    link: c.link,
    origem: "Vangard Gestora",
    categoria: "comunicado",
    publicado_em: c.created_at,
    resumo: c.mensagem,
    imagem: null,
  })));
}

// Imagens de comunicado costumam ser links de outros sites. Programas de e-mail
// (Apple Mail, Gmail, Outlook) buscam a imagem pelos próprios servidores e muitos
// sites bloqueiam isso — a imagem chega quebrada. Por isso copiamos para o nosso
// armazenamento público e o e-mail aponta para a cópia.
const BUCKET_IMAGENS = "app-config";
const TIPOS_IMAGEM: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
const MAX_BYTES_IMAGEM = 5 * 1024 * 1024;

async function imagemPropria(s: SupabaseClient, url: string | null): Promise<string | null> {
  const original = url?.trim();
  if (!original || !/^https?:\/\//i.test(original)) return null;
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  if (base && original.startsWith(`${base}/storage/v1/object/public/`)) return original; // já é nossa
  try {
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(original))))
      .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
    const pasta = "radar/comunicados";
    const { data: existentes } = await s.storage.from(BUCKET_IMAGENS).list(pasta, { search: hash, limit: 1 });
    if (existentes && existentes.length) {
      return s.storage.from(BUCKET_IMAGENS).getPublicUrl(`${pasta}/${existentes[0].name}`).data.publicUrl;
    }
    const r = await fetch(original, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", Accept: "image/*" },
      signal: AbortSignal.timeout(10_000),
    });
    const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = TIPOS_IMAGEM[tipo];
    if (!r.ok || !ext) { console.warn("imagem do comunicado indisponível", r.status, tipo, original); return original; }
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES_IMAGEM) return original;
    const caminho = `${pasta}/${hash}.${ext}`;
    const { error } = await s.storage.from(BUCKET_IMAGENS).upload(caminho, bytes, { contentType: tipo, upsert: true, cacheControl: "31536000" });
    if (error) { console.warn("falha ao copiar imagem do comunicado", error.message); return original; }
    return s.storage.from(BUCKET_IMAGENS).getPublicUrl(caminho).data.publicUrl;
  } catch (e) {
    console.warn("falha ao copiar imagem do comunicado", (e as Error).message);
    return original;
  }
}

/** Notícias e comunicados na mesma fila, do mais novo para o mais antigo. */
const porPublicacao = <T extends Noticia>(itens: T[]) =>
  [...itens].sort((a, b) => b.publicado_em.localeCompare(a.publicado_em)).slice(0, MAX_NOTICIAS);

/** Link do Radar no e-mail: identifica o assinante quando ele visita a página. */
const linkRadarDe = (token: string, campanha: string) => `${URL_PADRAO}/radar?utm_source=newsletter&utm_campaign=${encodeURIComponent(campanha)}&r=${token}`;

async function montarEmails(s: SupabaseClient, noticias: Noticia[], destinatarios: { email: string; nome: string | null; token: string }[]) {
  const t = await modelo(s, "radar_novidades");
  const de = await remetente(s);
  return destinatarios.map((d) => {
    const cancelar = linkPagina(URL_PADRAO, "cancelar", d.token);
    const radar = linkRadarDe(d.token, "novidades");
    const bloco = blocoNoticias(noticias, radar);
    const v = {
      nome: d.nome ?? "",
      saudacao: saudacao(d.nome),
      email: d.email,
      quantidade: String(noticias.length),
      data: dataHoje(),
      noticias: bloco,
      link_radar: radar,
      link_cancelar: cancelar,
    };
    return {
      from: de,
      to: [d.email],
      subject: preencher(t.assunto, v, false),
      html: preencher(t.corpo, v, true),
      headers: {
        "List-Unsubscribe": `<${urlFuncao()}?acao=cancelar&t=${d.token}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    } as Email;
  });
}

async function enviarNovidades() {
  const s = db();
  // uma vez por dia: chamada repetida não reenvia
  const { data: recente } = await s
    .from("radar_newsletter_envios")
    .select("id")
    .in("status", ["ok", "executando", "sem_novidades"])
    .gte("iniciado_em", new Date(Date.now() - 6 * 3600_000).toISOString())
    .limit(1);
  if (recente?.length) return { ok: true, pulado: "já houve envio nas últimas 6 horas" };

  const { data: ultimo } = await s
    .from("radar_newsletter_envios")
    .select("ate")
    .not("ate", "is", null)
    .order("ate", { ascending: false })
    .limit(1)
    .maybeSingle();
  const desde = ultimo?.ate ?? new Date(Date.now() - 86400_000).toISOString();

  const { data: envio } = await s.from("radar_newsletter_envios").insert({ status: "executando" }).select("id").single();
  const fechar = (campos: Record<string, unknown>) =>
    s.from("radar_newsletter_envios").update({ concluido_em: new Date().toISOString(), ...campos }).eq("id", envio!.id);

  try {
    const coletadas = await noticiasNovas(s, desde);
    const ate = coletadas.reduce((m, n) => (n.coletado_em > m ? n.coletado_em : m), desde);
    const comunicados = await comunicadosExternos(s, true);
    const noticias = porPublicacao<Noticia & { id?: string; coletado_em?: string }>([...coletadas, ...comunicados]);
    const comunicadosNoEmail = noticias.filter((n) => n.categoria === "comunicado" && n.id).map((n) => n.id!);
    if (!noticias.length) {
      await fechar({ status: "sem_novidades", ate: new Date().toISOString() });
      return { ok: true, noticias: 0, enviados: 0 };
    }

    const { data: assinantes } = await s.from("radar_assinantes").select("id, email, nome, token").eq("status", "ativo").limit(10000);
    const lista = assinantes ?? [];
    let enviados = 0;
    let falhas = 0;
    const erros: string[] = [];
    const emails = await montarEmails(s, noticias, lista);
    for (let i = 0; i < emails.length; i += LOTE) {
      const lote = emails.slice(i, i + LOTE);
      const ids = lista.slice(i, i + LOTE).map((a) => a.id);
      const r = await enviarLote(lote);
      if (r.ok) {
        enviados += lote.length;
        await s.from("radar_assinantes").update({ ultimo_envio_em: new Date().toISOString() }).in("id", ids);
      } else {
        falhas += lote.length;
        erros.push(r.erro ?? "falha");
      }
      await registrarHistorico(s, lote.map((e) => ({ destinatario: e.to[0], assunto: e.subject, status: r.ok ? "enviado" : "erro", erro: r.erro })));
      if (i + LOTE < emails.length) await new Promise((ok) => setTimeout(ok, 700));
    }
    // comunicado só sai uma vez: marca os que foram no e-mail
    if (enviados && comunicadosNoEmail.length) {
      await s.from("comunicados").update({ newsletter_enviado_em: new Date().toISOString() }).in("id", comunicadosNoEmail);
    }
    await fechar({
      status: falhas && !enviados ? "falhou" : "ok",
      // se nada saiu, as notícias continuam pendentes para a próxima rodada
      ate: falhas && !enviados ? null : ate,
      noticias: noticias.length,
      destinatarios: lista.length,
      enviados,
      falhas,
      erro: erros.length ? erros.join(" | ").slice(0, 1000) : null,
    });
    return { ok: true, noticias: noticias.length, destinatarios: lista.length, enviados, falhas };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await fechar({ status: "falhou", erro: msg.slice(0, 1000) });
    return { ok: false, erro: msg };
  }
}

// ---------------------------------------------------------------------------
// Administração
// ---------------------------------------------------------------------------
async function adminLogado(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const s = db();
  const { data } = await s.auth.getUser(token);
  const u = data?.user;
  if (!u) return null;
  const { data: admin } = await s.rpc("painel_admin", { _uid: u.id });
  return admin ? { id: u.id, email: u.email ?? "" } : null;
}

async function resumo() {
  const s = db();
  const conta = async (status: string) =>
    (await s.from("radar_assinantes").select("id", { count: "exact", head: true }).eq("status", status)).count ?? 0;
  const [ativos, pendentes, cancelados] = await Promise.all([conta("ativo"), conta("pendente"), conta("cancelado")]);
  const { data: ultimo } = await s
    .from("radar_newsletter_envios")
    .select("iniciado_em, status, noticias, enviados, falhas, erro")
    .order("iniciado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { ativos, pendentes, cancelados, ultimoEnvio: ultimo ?? null };
}

async function enviarTeste(email: string) {
  const s = db();
  const { data } = await s
    .from("mercado_noticias")
    .select("titulo, link, origem, categoria, publicado_em")
    .eq("oculto", false)
    .in("categoria", ["oficial", "setor"])
    .order("publicado_em", { ascending: false })
    .limit(6);
  const comunicados = await comunicadosExternos(s, false, 3);
  const noticias = porPublicacao([...((data ?? []) as Noticia[]), ...comunicados]).slice(0, 8);
  if (!noticias.length) return { ok: false, erro: "Ainda não há notícias no Radar" };
  const [e] = await montarEmails(s, noticias, [{ email, nome: null, token: crypto.randomUUID() }]);
  e.subject = `[Teste] ${e.subject}`;
  const r = await enviarLote([e]);
  await registrarHistorico(s, [{ destinatario: email, assunto: e.subject, status: r.ok ? "enviado" : "erro", erro: r.erro }]);
  return r.ok ? { ok: true, email } : { ok: false, erro: r.erro };
}

// ---------------------------------------------------------------------------
// Visitas da página pública
// ---------------------------------------------------------------------------
const VisitaSchema = z.object({
  acao: z.literal("visita"),
  visitante: z.string().uuid(),
  pagina: z.enum(["radar", "newsletter"]).default("radar"),
  referencia: z.string().max(500).optional().nullable(),
  utm_source: z.string().max(80).optional().nullable(),
  utm_campaign: z.string().max(80).optional().nullable(),
  r: z.string().uuid().optional().nullable(),
});

async function sha256(texto: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Cidade aproximada pelo endereço de rede (dois serviços, o segundo como reserva). */
async function localizar(ip: string): Promise<{ cidade: string | null; uf: string | null; pais: string | null }> {
  const vazio = { cidade: null, uf: null, pais: null };
  if (!ip || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i.test(ip)) return vazio;
  try {
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region_code,country&lang=pt-BR`, { signal: AbortSignal.timeout(2500) });
    const j = await r.json();
    if (j?.success) return { cidade: j.city || null, uf: j.region_code || null, pais: j.country || null };
  } catch {
    // tenta o próximo
  }
  try {
    const r = await fetch(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`, { signal: AbortSignal.timeout(2500) });
    const j = await r.json();
    return { cidade: j?.city || null, uf: null, pais: j?.country || null };
  } catch {
    return vazio;
  }
}

function dispositivoDe(ua: string) {
  const t = ua.toLowerCase();
  const dispositivo = /ipad|tablet/.test(t) ? "Tablet" : /mobi|android|iphone/.test(t) ? "Celular" : "Computador";
  const navegador = /instagram/.test(t)
    ? "Instagram"
    : /fban|fbav/.test(t)
      ? "Facebook"
      : /edg\//.test(t)
        ? "Edge"
        : /chrome|crios/.test(t)
          ? "Chrome"
          : /safari/.test(t)
            ? "Safari"
            : /firefox|fxios/.test(t)
              ? "Firefox"
              : "Outro";
  return { dispositivo, navegador };
}

function origemDe(ref: string | null | undefined, utm: string | null | undefined, ua: string) {
  if (utm) return utm.toLowerCase() === "newsletter" ? "Newsletter" : utm;
  if (/instagram/i.test(ua)) return "Instagram";
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "").replace(/^l\./, "").replace(/^lm\./, "");
    if (/instagram\.com$/.test(h)) return "Instagram";
    if (/facebook\.com$/.test(h)) return "Facebook";
    if (/linkedin\.com$|lnkd\.in$/.test(h)) return "LinkedIn";
    if (/whatsapp\.com$/.test(h)) return "WhatsApp";
    if (/google\./.test(h)) return "Google";
    if (/uon1\.com\.br$/.test(h)) return null;
    return h;
  } catch {
    return null;
  }
}

async function registrarVisita(req: Request, body: unknown) {
  const p = VisitaSchema.safeParse(body);
  if (!p.success) return json({ ok: false }, 400);
  const v = p.data;
  const s = db();
  // a mesma pessoa na mesma página conta uma vez a cada 30 minutos
  const { data: recente } = await s
    .from("radar_visitas")
    .select("id")
    .eq("visitante", v.visitante)
    .eq("pagina", v.pagina)
    .gte("criado_em", new Date(Date.now() - 30 * 60_000).toISOString())
    .limit(1);
  if (recente?.length) return json({ ok: true, repetida: true });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ua = req.headers.get("user-agent")?.slice(0, 300) ?? "";
  const ipHash = ip ? await sha256(`${ip}|${Deno.env.get("SUPABASE_URL")}`) : null;
  // mesmo endereço visto na última semana: reaproveita o local, sem consultar de novo
  let local = { cidade: null as string | null, uf: null as string | null, pais: null as string | null };
  if (ipHash) {
    const { data: antes } = await s
      .from("radar_visitas")
      .select("cidade, uf, pais")
      .eq("ip_hash", ipHash)
      .not("pais", "is", null)
      .gte("criado_em", new Date(Date.now() - 7 * 86400_000).toISOString())
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    local = antes ?? (await localizar(ip));
  }
  let assinanteId: string | null = null;
  if (v.r) {
    const { data: a } = await s.from("radar_assinantes").select("id").eq("token", v.r).maybeSingle();
    assinanteId = a?.id ?? null;
  }
  let referencia: string | null = null;
  try {
    referencia = v.referencia ? new URL(v.referencia).hostname : null;
  } catch {
    referencia = null;
  }
  await s.from("radar_visitas").insert({
    visitante: v.visitante,
    pagina: v.pagina,
    origem: origemDe(v.referencia, v.utm_source, ua),
    referencia,
    utm_source: v.utm_source || null,
    utm_campaign: v.utm_campaign || null,
    ...local,
    ...dispositivoDe(ua),
    ip_hash: ipHash,
    assinante_id: assinanteId,
  });
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Campanhas avulsas para os assinantes
// ---------------------------------------------------------------------------
const CampanhaSchema = z.object({
  acao: z.literal("campanha"),
  teste: z.boolean().default(false),
  assunto: z.string().trim().min(3, "Escreva o assunto").max(150),
  titulo: z.string().trim().min(3, "Escreva o título").max(150),
  mensagem: z.string().trim().min(10, "Escreva a mensagem").max(5000),
  noticia_ids: z.array(z.string().uuid()).max(10).default([]),
  /** comunicados "interno e externo" escolhidos; somados às notícias, até 10 */
  comunicado_ids: z.array(z.string().uuid()).max(10).default([]),
  botao_texto: z.string().trim().max(40).optional().nullable(),
  botao_url: z.string().trim().url("Link do botão inválido").max(500).optional().nullable().or(z.literal("")),
  /** assinantes (padrão), prospects ou todos */
  publico: z.enum(["assinantes", "prospects", "todos"]).default("assinantes"),
  /** vazio = todos os assinantes ativos do público escolhido */
  assinante_ids: z.array(z.string().uuid()).max(10000).optional().nullable(),
  /** vazio = todos os prospects ativos */
  prospect_ids: z.array(z.string().uuid()).max(10000).optional().nullable(),
});

interface Destinatario {
  email: string;
  nome: string | null;
  token: string;
  prospect: boolean;
  prospectId?: string;
}

/** Quem recebe a campanha. Assinantes: só ativos com aceite. Prospects: só ativos, sem repetir
 *  e-mail de assinante e nunca quem cancelou a assinatura da newsletter. */
async function destinatariosCampanha(s: SupabaseClient, c: z.infer<typeof CampanhaSchema>): Promise<Destinatario[]> {
  const lista: Destinatario[] = [];
  if (c.publico !== "prospects") {
    let q = s.from("radar_assinantes").select("id, email, nome, token").eq("status", "ativo").eq("aceite_comunicacoes", true);
    if (c.assinante_ids?.length) q = q.in("id", c.assinante_ids);
    const { data } = await q.limit(10000);
    for (const a of data ?? []) lista.push({ email: a.email, nome: a.nome, token: a.token, prospect: false });
  }
  if (c.publico !== "assinantes") {
    const { data: todosAssinantes } = await s.from("radar_assinantes").select("email").limit(20000);
    const bloqueados = new Set((todosAssinantes ?? []).map((a) => String(a.email).toLowerCase()));
    let q = s.from("radar_prospects").select("id, email, associacao, token").eq("status", "ativo");
    if (c.prospect_ids?.length) q = q.in("id", c.prospect_ids);
    const { data } = await q.limit(10000);
    for (const p of data ?? []) {
      const chave = String(p.email).toLowerCase();
      if (bloqueados.has(chave)) continue;
      bloqueados.add(chave);
      lista.push({ email: p.email, nome: null, token: p.token, prospect: true, prospectId: p.id });
    }
  }
  return lista;
}

async function campanha(admin: { id: string; email: string }, body: unknown) {
  const p = CampanhaSchema.safeParse(body);
  if (!p.success) return { ok: false, erro: p.error.issues[0]?.message ?? "Dados inválidos" };
  const c = p.data;
  const s = db();

  let noticias: Noticia[] = [];
  if (c.noticia_ids.length) {
    const { data } = await s
      .from("mercado_noticias")
      .select("id, titulo, link, origem, categoria, publicado_em")
      .in("id", c.noticia_ids)
      .eq("oculto", false);
    // mantém a ordem escolhida
    const porId = new Map((data ?? []).map((n) => [n.id, n as Noticia]));
    noticias = c.noticia_ids.map((id) => porId.get(id)).filter(Boolean) as Noticia[];
  }
  if (c.noticia_ids.length + c.comunicado_ids.length > 10) return { ok: false, erro: "Escolha até 10 notícias e comunicados" };
  if (c.comunicado_ids.length) {
    // só comunicados ativos e marcados como "interno e externo" saem para fora
    const { data } = await s
      .from("comunicados")
      .select("id, titulo, mensagem, link, created_at")
      .in("id", c.comunicado_ids)
      .eq("ativo", true)
      .eq("publico", true);
    const porId = new Map((data ?? []).map((m) => [m.id, m]));
    const escolhidos: Noticia[] = c.comunicado_ids
      .map((id) => porId.get(id))
      .filter(Boolean)
      .map((m) => ({
        titulo: m!.titulo,
        link: m!.link,
        origem: "Vangard Gestora",
        categoria: "comunicado",
        publicado_em: m!.created_at,
        resumo: m!.mensagem,
        imagem: null,
      }) as Noticia);
    // comunicados primeiro, depois as notícias na ordem escolhida
    noticias = [...escolhidos, ...noticias];
  }

  const base = {
    titulo: c.titulo,
    mensagem: c.mensagem,
    botaoTexto: c.botao_texto || null,
    botaoUrl: c.botao_url || null,
    noticias: noticias.length ? "{{noticias}}" : "",
  };
  const htmlAssinante = emailCampanha(base);
  const htmlProspect = emailCampanha({ ...base, prospect: true });
  const de = await remetente(s);
  const montar = (d: { email: string; nome: string | null; token: string; prospect?: boolean }, campanhaId: string) => {
    const html = d.prospect ? htmlProspect : htmlAssinante;
    const radar = linkRadarDe(d.token, campanhaId);
    const v = {
      nome: d.nome ?? "",
      saudacao: saudacao(d.nome),
      email: d.email,
      data: dataHoje(),
      noticias: noticias.length ? blocoNoticias(noticias, radar) : "",
      link_radar: radar,
      link_cancelar: linkPagina(URL_PADRAO, "cancelar", d.token),
    };
    return {
      from: de,
      to: [d.email],
      subject: preencher(c.assunto, v, false),
      html: preencher(html, v, true),
      headers: {
        "List-Unsubscribe": `<${urlFuncao()}?acao=cancelar&t=${d.token}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    } as Email;
  };

  if (c.teste) {
    // o teste mostra o rodapé de prospect quando a campanha é só para prospects
    const e = montar({ email: admin.email, nome: null, token: crypto.randomUUID(), prospect: c.publico === "prospects" }, "teste");
    e.subject = `[Teste] ${e.subject}`;
    const r = await enviarLote([e]);
    await registrarHistorico(s, [{ destinatario: admin.email, assunto: e.subject, status: r.ok ? "enviado" : "erro", erro: r.erro }]);
    return r.ok ? { ok: true, teste: true, email: admin.email } : { ok: false, erro: r.erro };
  }

  const destinatarios = await destinatariosCampanha(s, c);
  if (!destinatarios.length) return { ok: false, erro: "Ninguém ativo para receber neste público" };
  const qtdProspects = destinatarios.filter((d) => d.prospect).length;

  const { data: reg, error } = await s
    .from("radar_campanhas")
    .insert({
      assunto: c.assunto,
      titulo: c.titulo,
      mensagem: c.mensagem,
      noticias: [...c.comunicado_ids, ...c.noticia_ids],
      botao_texto: c.botao_texto || null,
      botao_url: c.botao_url || null,
      criado_por: admin.id,
      destinatarios: destinatarios.length,
      publico: c.publico,
      assinantes: destinatarios.length - qtdProspects,
      prospects: qtdProspects,
    })
    .select("id")
    .single();
  if (error || !reg) return { ok: false, erro: "Não foi possível registrar a campanha" };

  let enviados = 0;
  let falhas = 0;
  const erros: string[] = [];
  const emails = destinatarios.map((d) => montar(d, reg.id));
  for (let i = 0; i < emails.length; i += LOTE) {
    const lote = emails.slice(i, i + LOTE);
    const r = await enviarLote(lote);
    if (r.ok) {
      enviados += lote.length;
      const ids = destinatarios.slice(i, i + LOTE).map((d) => d.prospectId).filter(Boolean) as string[];
      if (ids.length) await s.from("radar_prospects").update({ ultimo_envio_em: new Date().toISOString() }).in("id", ids);
    } else {
      falhas += lote.length;
      erros.push(r.erro ?? "falha");
    }
    await registrarHistorico(s, lote.map((e) => ({ destinatario: e.to[0], assunto: e.subject, status: r.ok ? "enviado" : "erro", erro: r.erro })));
    if (i + LOTE < emails.length) await new Promise((ok) => setTimeout(ok, 700));
  }
  await s
    .from("radar_campanhas")
    .update({
      status: enviados ? "enviada" : "falhou",
      concluido_em: new Date().toISOString(),
      enviados,
      falhas,
      erro: erros.length ? erros.join(" | ").slice(0, 1000) : null,
    })
    .eq("id", reg.id);
  return { ok: enviados > 0, enviados, falhas, destinatarios: destinatarios.length, prospects: qtdProspects, erro: enviados ? undefined : erros[0] };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  try {
    // "Cancelar com um clique" dos provedores de e-mail (RFC 8058)
    if (req.method === "POST" && url.searchParams.get("acao") === "cancelar") {
      const r = await mudarStatus(url.searchParams.get("t"), "cancelar");
      return json(r, r.ok ? 200 : 400);
    }
    if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);

    // deno-lint-ignore no-explicit-any
    const body: any = await req.json().catch(() => ({}));
    switch (body?.acao) {
      case "assinar":
        return await assinar(req, body);
      case "confirmar":
      case "cancelar": {
        const r = await mudarStatus(typeof body.token === "string" ? body.token : null, body.acao);
        return json(r, r.ok ? 200 : 400);
      }
      case "visita":
        return await registrarVisita(req, body);
      case "campanha": {
        const admin = await adminLogado(req);
        if (!admin) return json({ error: "Acesso restrito à administração" }, 403);
        return json(await campanha(admin, body));
      }
      case "enviar_novidades":
        return json(await enviarNovidades());
      case "resumo":
      case "enviar_teste": {
        const admin = await adminLogado(req);
        if (!admin) return json({ error: "Acesso restrito à administração" }, 403);
        return json(body.acao === "resumo" ? await resumo() : await enviarTeste(admin.email));
      }
      default:
        return json({ error: "Ação inválida" }, 400);
    }
  } catch (e) {
    console.error("[radar-newsletter]", e);
    return json({ error: "Erro inesperado" }, 500);
  }
});
