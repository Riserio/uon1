// Radar do mercado — newsletter da página pública /radar.
// Ações:
//   assinar           (público) e-mail + aceite de comunicações → e-mail de confirmação
//   confirmar         (público) token do e-mail → assinatura ativa
//   cancelar          (público) token → assinatura cancelada (também aceita o
//                     "cancelar com um clique" dos provedores de e-mail, via POST)
//   enviar_novidades  (rotina diária) notícias novas desde o último envio → assinantes ativos.
//                     Idempotente: só manda o que foi coletado depois do último envio.
//   resumo / enviar_teste (administração logada)
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { blocoNoticias, PADRAO_CONFIRMACAO, PADRAO_NOVIDADES, preencher, type Noticia } from "./modelos.ts";

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
  nome: z.string().trim().max(120).optional().nullable(),
  aceite: z.literal(true, { errorMap: () => ({ message: "É preciso aceitar o recebimento das comunicações" }) }),
  base: z.string().max(200).optional().nullable(),
  site: z.string().max(0).optional().nullable(), // armadilha para robôs: precisa vir vazio
});

async function assinar(req: Request, body: unknown) {
  const p = AssinarSchema.safeParse(body);
  if (!p.success) return json({ error: p.error.issues[0]?.message ?? "Dados inválidos" }, 400);
  const { email, nome, base } = p.data;
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
  if (atual?.status === "ativo") return json({ ok: true, jaAtivo: true, mensagem: "Este e-mail já recebe as novidades do Radar." });
  // não reenvia a confirmação mais de uma vez a cada 2 minutos
  if (atual?.status === "pendente" && Date.now() - new Date(atual.atualizado_em).getTime() < 120_000) return json(resposta);

  const agora = new Date().toISOString();
  const dados = {
    email,
    nome: nome || atual?.nome || null,
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
  if (!a) return { ok: false, erro: "Link inválido ou expirado" };
  const agora = new Date().toISOString();
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

async function montarEmails(s: SupabaseClient, noticias: Noticia[], destinatarios: { email: string; nome: string | null; token: string }[]) {
  const t = await modelo(s, "radar_novidades");
  const de = await remetente(s);
  const bloco = blocoNoticias(noticias);
  return destinatarios.map((d) => {
    const cancelar = linkPagina(URL_PADRAO, "cancelar", d.token);
    const v = {
      nome: d.nome ?? "",
      saudacao: saudacao(d.nome),
      email: d.email,
      quantidade: String(noticias.length),
      data: dataHoje(),
      noticias: bloco,
      link_radar: `${URL_PADRAO}/radar`,
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
    const noticias = await noticiasNovas(s, desde);
    const ate = noticias.reduce((m, n) => (n.coletado_em > m ? n.coletado_em : m), desde);
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
  const noticias = (data ?? []) as Noticia[];
  if (!noticias.length) return { ok: false, erro: "Ainda não há notícias no Radar" };
  const [e] = await montarEmails(s, noticias, [{ email, nome: null, token: crypto.randomUUID() }]);
  e.subject = `[Teste] ${e.subject}`;
  const r = await enviarLote([e]);
  await registrarHistorico(s, [{ destinatario: email, assunto: e.subject, status: r.ok ? "enviado" : "erro", erro: r.erro }]);
  return r.ok ? { ok: true, email } : { ok: false, erro: r.erro };
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
