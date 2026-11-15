// Uon1 Sign — e-mail (Resend), WhatsApp (Meta Cloud API) e relatório de assinaturas.
// Hash, selo ICP-Brasil e carimbo do tempo ficam no Uon1 Trust (../uon1-trust).
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

export const APP_URL = (Deno.env.get("APP_URL") || "https://vangard.uon1.com.br").replace(/\/$/, "");
export const linkAssinatura = (token: string) => `${APP_URL}/assinar/${token}`;
export const linkProposta = (token: string) => `${APP_URL}/proposta/${token}`;

const esc = (s: string) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------
export interface Anexo {
  filename: string;
  content: string; // base64
}

export function layoutEmail(opts: {
  titulo: string;
  paragrafos: string[];
  botao?: { texto: string; url: string };
  destaque?: string;
  rodape?: string;
  /** Corpo HTML pronto (template editado no sistema); substitui título/parágrafos */
  htmlLivre?: string;
}): string {
  const p = opts.htmlLivre
    ? `<div style="color:#374151;line-height:1.6">${opts.htmlLivre}</div>`
    : opts.paragrafos.map((t) => `<p style="margin:0 0 12px;color:#374151;line-height:1.6">${t}</p>`).join("");
  const destaque = opts.destaque
    ? `<div style="margin:20px 0;text-align:center"><span style="display:inline-block;font-size:30px;letter-spacing:8px;font-weight:700;color:#111827;background:#f3f4f6;border-radius:10px;padding:12px 20px">${esc(opts.destaque)}</span></div>`
    : "";
  const botao = opts.botao
    ? `<div style="text-align:center;margin:24px 0"><a href="${opts.botao.url}" style="display:inline-block;padding:13px 26px;background:#362C89;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">${esc(opts.botao.texto)}</a></div>
       <p style="margin:0;font-size:12px;color:#9ca3af;word-break:break-all;text-align:center">Se o botão não funcionar, copie e cole no navegador:<br>${opts.botao.url}</p>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="padding:20px 28px;border-bottom:1px solid #eef2f7;font-weight:700;font-size:17px;color:#362C89">Uon1 Sign</td></tr>
<tr><td style="padding:28px">
${opts.htmlLivre ? "" : `<h1 style="margin:0 0 14px;font-size:19px;color:#111827">${esc(opts.titulo)}</h1>`}${p}${destaque}${botao}
</td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #eef2f7;color:#9ca3af;font-size:12px;text-align:center">${esc(opts.rodape ?? "Mensagem automática do Uon1 Sign. Não responda este e-mail.")}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Grava o envio em email_historico (painel de e-mails). Nunca derruba o envio. */
// deno-lint-ignore no-explicit-any
let dbHistorico: any = null;
async function registrarEmail(opts: OpcoesEmail, r: { ok: boolean; erro?: string }) {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) return;
    dbHistorico ??= createClient(url, chave, { auth: { persistSession: false } });
    const reg = opts.registro ?? {};
    // código de confirmação não fica guardado, nem no assunto nem no corpo
    const assunto = reg.sensivel ? opts.assunto.replace(/\d{6}/g, "••••••") : opts.assunto;
    const corpo = reg.sensivel ? "[Conteúdo com código de confirmação: não é guardado no histórico]" : opts.html;
    const agora = new Date().toISOString();
    await dbHistorico.from("email_historico").insert(
      (Array.isArray(opts.para) ? opts.para : [opts.para]).map((destinatario) => ({
        destinatario,
        assunto,
        corpo,
        status: r.ok ? "enviado" : "erro",
        erro_mensagem: r.ok ? null : (r.erro ?? "Falha no envio").slice(0, 500),
        enviado_em: r.ok ? agora : null,
        enviado_por: reg.enviado_por ?? null,
        contrato_id: reg.contrato_id ?? null,
        origem: reg.origem ?? "uonisign",
      })),
    );
  } catch (e) {
    console.error("[email_historico]", (e as Error)?.message ?? e);
  }
}

interface OpcoesEmail {
  from: string;
  para: string | string[];
  assunto: string;
  html: string;
  anexos?: Anexo[];
  /** Dados para o histórico de e-mails. `sensivel`: o corpo traz código de confirmação. */
  registro?: { origem?: string; sensivel?: boolean; enviado_por?: string | null; contrato_id?: string | null };
}

export async function enviarEmail(opts: OpcoesEmail): Promise<{ ok: boolean; erro?: string }> {
  const r = await despacharEmail(opts);
  await registrarEmail(opts, r);
  return r;
}

async function despacharEmail(opts: OpcoesEmail): Promise<{ ok: boolean; erro?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, erro: "RESEND_API_KEY ausente" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: opts.from,
        to: Array.isArray(opts.para) ? opts.para : [opts.para],
        subject: opts.assunto,
        html: opts.html,
        attachments: opts.anexos?.length ? opts.anexos : undefined,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return { ok: false, erro: `Resend ${r.status}: ${(await r.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: String((e as Error)?.message ?? e) };
  }
}

// ---------------------------------------------------------------------------
// WhatsApp (Meta Cloud API, mesmas credenciais do restante do UONI).
// Fora da janela de 24h a Meta só aceita template aprovado — os nomes podem ser
// trocados por secrets sem mudar código.
// ---------------------------------------------------------------------------
export type TemplateWa = "convite" | "codigo" | "lembrete" | "concluido" | "aviso" | "proposta";
const TEMPLATE_PADRAO: Record<TemplateWa, string> = {
  convite: "uonisign_convite",
  codigo: "uonisign_codigo",
  lembrete: "uonisign_lembrete",
  concluido: "uonisign_concluido",
  aviso: "uonisign_aviso",
  proposta: "uonisign_proposta",
};

export function telefoneWhatsApp(t?: string | null): string | null {
  const d = (t ?? "").replace(/\D/g, "");
  if (d.length === 11) return `55${d}`;
  if (d.length === 13 && d.startsWith("55")) return d;
  return null;
}

export async function enviarWhatsApp(
  telefone: string | null | undefined,
  tipo: TemplateWa,
  parametros: string[],
  opcoes: { template?: string | null; idioma?: string | null; botaoUrl?: string | null } = {},
): Promise<{ ok: boolean; erro?: string }> {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID");
  const para = telefoneWhatsApp(telefone);
  if (!token || !phoneId) return { ok: false, erro: "WhatsApp (Meta) não configurado" };
  if (!para) return { ok: false, erro: "Celular inválido para WhatsApp" };
  const nome = opcoes.template || Deno.env.get(`UONISIGN_WA_TEMPLATE_${tipo.toUpperCase()}`) || TEMPLATE_PADRAO[tipo];
  const idioma = opcoes.idioma || Deno.env.get("UONISIGN_WA_IDIOMA") || "pt_BR";
  const components: unknown[] = [
    { type: "body", parameters: parametros.map((text) => ({ type: "text", text: text || "-" })) },
  ];
  // Template de autenticação (código): a Meta exige o código também no botão "copiar".
  if (tipo === "codigo") {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: parametros[0] }] });
  } else if (opcoes.botaoUrl) {
    // Botão "Revisar e assinar" com URL dinâmica (ex.: .../assinar/{{1}} → token do signatário)
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: opcoes.botaoUrl }] });
  }
  try {
    const r = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: para,
        type: "template",
        template: { name: nome, language: { code: idioma }, components },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, erro: `Meta ${r.status}: ${(await r.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: String((e as Error)?.message ?? e) };
  }
}

// Hash, base64, selo e carimbo agora são do Uon1 Trust
export { deBase64, paraBase64, sha256Hex } from "../_shared/uon1-trust-nucleo.ts";

// ---------------------------------------------------------------------------
// Relatório de assinaturas anexado ao PDF (RN23 / seção 11)
// ---------------------------------------------------------------------------
export interface LinhaRelatorio {
  papel: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  assinado_em: string;
  ip: string | null;
  user_agent: string | null;
  canal: string | null;
  contato: string | null;
}

// pdf-lib com fontes padrão só aceita WinAnsi: troca o que estiver fora.
const winAnsi = (s: string) =>
  (s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

const dataHoraBR = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }) +
  " (horário de Brasília)";

export async function anexarRelatorio(
  original: Uint8Array,
  info: {
    numero: string;
    titulo: string;
    hashOriginal: string;
    concluidoEm: string;
    linhas: LinhaRelatorio[];
    codigoVerificacao?: string | null;
    urlValidacao?: string | null;
  },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const [L, A] = [595.28, 841.89];
  const margem = 50;
  let pagina = doc.addPage([L, A]);
  let y = A - margem;

  const quebrar = (texto: string, f: typeof fonte, tam: number, largura: number) => {
    const palavras = winAnsi(texto).split(/\s+/);
    const linhas: string[] = [];
    let atual = "";
    for (const p of palavras) {
      const teste = atual ? `${atual} ${p}` : p;
      if (f.widthOfTextAtSize(teste, tam) > largura && atual) {
        linhas.push(atual);
        atual = p;
      } else atual = teste;
    }
    if (atual) linhas.push(atual);
    return linhas;
  };
  const escrever = (texto: string, opts: { tam?: number; bold?: boolean; cor?: [number, number, number]; recuo?: number } = {}) => {
    const tam = opts.tam ?? 9.5;
    const f = opts.bold ? negrito : fonte;
    const x = margem + (opts.recuo ?? 0);
    for (const linha of quebrar(texto, f, tam, L - x - margem)) {
      if (y < margem + 20) {
        pagina = doc.addPage([L, A]);
        y = A - margem;
      }
      pagina.drawText(linha, { x, y, size: tam, font: f, color: rgb(...(opts.cor ?? [0.1, 0.1, 0.12])) });
      y -= tam * 1.45;
    }
  };

  escrever("RELATÓRIO DE ASSINATURAS — Uon1 Sign", { tam: 14, bold: true, cor: [0.21, 0.17, 0.54] });
  y -= 4;
  escrever(`Contrato nº ${info.numero} — ${info.titulo}`, { bold: true });
  escrever(`Concluído em ${dataHoraBR(info.concluidoEm)}`);
  y -= 4;
  escrever("Hash SHA-256 do arquivo assinado pelas partes (o documento original, sem este relatório):", { tam: 8.5 });
  escrever(info.hashOriginal, { tam: 8.5, bold: true });
  if (info.codigoVerificacao) {
    y -= 4;
    escrever(`Código de verificação Uon1 Trust: ${info.codigoVerificacao}`, { tam: 9.5, bold: true, cor: [0.21, 0.17, 0.54] });
    if (info.urlValidacao) escrever(`Confira a autenticidade em ${info.urlValidacao}`, { tam: 8.5 });
  }
  y -= 10;

  info.linhas.forEach((l, i) => {
    escrever(`${i + 1}. ${l.papel.toUpperCase()} — ${l.nome}`, { tam: 10.5, bold: true });
    const det = [
      l.cpf ? `CPF: ${l.cpf}` : null,
      l.email ? `E-mail: ${l.email}` : null,
      l.telefone ? `Celular: ${l.telefone}` : null,
      `Assinado em: ${dataHoraBR(l.assinado_em)}`,
      `Autenticação: código de uso único enviado por ${l.canal === "whatsapp" ? "WhatsApp" : "e-mail"}${l.contato ? ` para ${l.contato}` : ""}, com aceite dos termos`,
      `IP: ${l.ip ?? "não identificado"}`,
      l.user_agent ? `Dispositivo: ${l.user_agent}` : null,
      `Hash do documento no momento da assinatura: ${info.hashOriginal}`,
    ].filter(Boolean) as string[];
    det.forEach((d) => escrever(d, { tam: 8.5, recuo: 12 }));
    y -= 8;
  });

  y -= 6;
  escrever(
    "As assinaturas acima foram realizadas eletronicamente, com identificação dos signatários por código de uso único e registro das evidências, nos termos do art. 10, § 2º, da MP nº 2.200-2/2001. Qualquer alteração no documento muda o seu hash e pode ser identificada.",
    { tam: 8, cor: [0.35, 0.35, 0.4] },
  );
  return await doc.save();
}
