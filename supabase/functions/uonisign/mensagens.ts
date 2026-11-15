// Uon1 Sign — textos das mensagens.
// E-mail: templates do sistema (email_templates, tipos uonisign_*), editáveis em
// Central de Atendimento → Templates. Sem template ativo, vale o texto padrão.
// WhatsApp: template aprovado na Meta + ordem das variáveis em uonisign_config.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import type { TemplateWa } from "./servicos.ts";

export type Valores = Record<string, string | null | undefined>;

export const VARIAVEIS: Record<string, string> = {
  nome: "Nome do signatário",
  contrato: "Título do contrato",
  numero: "Número do contrato",
  link: "Link de assinatura",
  prazo: "Prazo do link (data)",
  dias: "Dias aguardando",
  codigo: "Código de assinatura",
  validade: "Validade do código (min)",
  url_validacao: "Link de validação (Uon1 Trust)",
  assunto: "Assunto do aviso",
  mensagem: "Texto do aviso",
  empresa: "Empresa (Contratada)",
  token: "Final do link de assinatura (botão)",
  codigo_verificacao: "Código de verificação (Uon1 Trust)",
};

// Variável usada no final da URL do botão (quando o template tem botão de link dinâmico)
export const BOTAO_PADRAO: Partial<Record<TemplateWa, string>> = { convite: "token", lembrete: "token", concluido: "token" };

export const PARAMETROS_PADRAO: Record<TemplateWa, string[]> = {
  convite: ["nome", "contrato", "numero", "empresa", "prazo"],
  codigo: ["codigo"],
  lembrete: ["nome", "contrato", "numero", "dias", "prazo"],
  concluido: ["nome", "contrato", "numero", "codigo_verificacao"],
  aviso: ["nome", "contrato", "numero", "assunto"],
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Troca {{variavel}} pelo valor (escapado quando o destino é HTML). */
export function preencher(texto: string, v: Valores, html: boolean): string {
  return (texto ?? "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k: string) => {
    const valor = v[k.toLowerCase()] ?? "";
    // links ficam crus para funcionar em href
    if (!html || k.toLowerCase() === "link" || k.toLowerCase() === "url_validacao") return String(valor);
    return esc(String(valor));
  });
}

export interface TemplateEmail {
  assunto: string;
  corpo: string;
}

export interface CacheMensagens {
  email: Map<string, TemplateEmail | null>;
  whatsapp?: { idioma?: string; mensagens?: Record<string, { template?: string; parametros?: string[]; botao?: string | null }> } | null;
}

export const novoCache = (): CacheMensagens => ({ email: new Map() });

export async function templateEmail(db: SupabaseClient, cache: CacheMensagens, tipo: string): Promise<TemplateEmail | null> {
  if (cache.email.has(tipo)) return cache.email.get(tipo) ?? null;
  const { data } = await db
    .from("email_templates")
    .select("assunto, corpo")
    .eq("tipo", `uonisign_${tipo}`)
    .eq("ativo", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const t = data?.corpo ? { assunto: data.assunto ?? "", corpo: data.corpo } : null;
  cache.email.set(tipo, t);
  return t;
}

export async function configWhatsApp(db: SupabaseClient, cache: CacheMensagens) {
  if (cache.whatsapp !== undefined) return cache.whatsapp;
  const { data } = await db.from("uonisign_config").select("valor").eq("chave", "whatsapp").maybeSingle();
  cache.whatsapp = (data?.valor as CacheMensagens["whatsapp"]) ?? null;
  return cache.whatsapp;
}

// ---------------------------------------------------------------------------
// Templates padrão para criar na Meta (aprovação leva de minutos a horas).
// A Meta recusa corpo que começa ou termina com variável: por isso o texto final.
// ---------------------------------------------------------------------------
export const TEMPLATES_META = [
  {
    name: "uonisign_convite",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text:
          "Olá, {{1}}!\n\nVocê recebeu um contrato para assinatura eletrônica.\n\n📄 Contrato\n- Documento: {{2}}\n- Número: {{3}}\n- Enviado por: {{4}}\n\n⏳ Prazo\n- Assine até: {{5}}\n\n🔒 Segurança\n- Para confirmar, você receberá um código de 6 dígitos.\n\nToque no botão abaixo para revisar e assinar.",
        example: {
          body_text: [["Ana Souza", "Adesão — Assistência 24h e Rastreamento", "CON-2026-000017", "Vangard Gestora", "29/11/2026"]],
        },
      },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "Revisar e assinar",
            url: "https://vangard.uon1.com.br/assinar/{{1}}",
            example: ["https://vangard.uon1.com.br/assinar/8f1c2d3e-0000-4000-8000-000000000000"],
          },
        ],
      },
    ],
  },
  {
    name: "uonisign_codigo",
    category: "AUTHENTICATION",
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 10 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copiar código" }] },
    ],
  },
  {
    name: "uonisign_lembrete",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Olá, {{1}}!\n\nSeu contrato ainda aguarda assinatura.\n\n📄 Contrato\n- Documento: {{2}}\n- Número: {{3}}\n- Enviado há: {{4}} dia(s)\n\n⏳ Prazo\n- Assine até: {{5}}\n\nToque no botão abaixo para revisar e assinar.",
        example: { body_text: [["Ana Souza", "Adesão — Assistência 24h e Rastreamento", "CON-2026-000017", "3", "29/11/2026"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "Revisar e assinar",
            url: "https://vangard.uon1.com.br/assinar/{{1}}",
            example: ["https://vangard.uon1.com.br/assinar/8f1c2d3e-0000-4000-8000-000000000000"],
          },
        ],
      },
    ],
  },

  {
    name: "uonisign_concluido",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Olá, {{1}}!\n\nO contrato foi assinado por todas as partes. ✅\n\n📄 Contrato\n- Documento: {{2}}\n- Número: {{3}}\n\n🛡️ Autenticidade\n- Código de verificação: {{4}}\n\nToque no botão abaixo para baixar a sua cópia assinada.",
        example: { body_text: [["Ana Souza", "Adesão — Assistência 24h e Rastreamento", "CON-2026-000017", "RVQC-MGM5-SWMA"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "Baixar contrato",
            url: "https://vangard.uon1.com.br/assinar/{{1}}",
            example: ["https://vangard.uon1.com.br/assinar/8f1c2d3e-0000-4000-8000-000000000000"],
          },
        ],
      },
    ],
  },

  {
    name: "uonisign_aviso",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Olá, {{1}}!\n\nHá uma atualização sobre o seu contrato.\n\n📄 Contrato\n- Documento: {{2}}\n- Número: {{3}}\n\n⚠️ Situação\n- {{4}}\n\nO link de assinatura anterior deixou de valer. Em caso de dúvida, fale com quem enviou o contrato.",
        example: { body_text: [["Ana Souza", "Adesão — Assistência 24h e Rastreamento", "CON-2026-000017", "Contrato cancelado"]] },
      },
    ],
  },

];

const GRAPH = "https://graph.facebook.com/v22.0";

async function waba(): Promise<{ token: string; waba: string } | { erro: string }> {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  const phone = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phone) return { erro: "WhatsApp (Meta) não configurado" };
  const env = Deno.env.get("META_WHATSAPP_BUSINESS_ACCOUNT_ID");
  if (env) return { token, waba: env };
  const r = await fetch(`${GRAPH}/${phone}?fields=whatsapp_business_account`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  const id = j?.whatsapp_business_account?.id;
  return id ? { token, waba: id } : { erro: "Não foi possível descobrir a conta do WhatsApp Business" };
}

export interface TemplateMetaResumo {
  name: string;
  status: string;
  language: string;
  category: string;
  corpo: string;
  variaveis: number;
  url_botao?: string | null;
  motivo_rejeicao?: string | null;
}

export async function listarTemplatesMeta(): Promise<{ templates: TemplateMetaResumo[] } | { erro: string }> {
  const w = await waba();
  if ("erro" in w) return w;
  const r = await fetch(`${GRAPH}/${w.waba}/message_templates?fields=name,status,language,category,components,rejected_reason&limit=200`, {
    headers: { Authorization: `Bearer ${w.token}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { erro: `Meta ${r.status}: ${JSON.stringify(j?.error ?? j).slice(0, 300)}` };
  // deno-lint-ignore no-explicit-any
  const templates = (j.data ?? []).map((t: any) => {
    // deno-lint-ignore no-explicit-any
    const body = (t.components ?? []).find((c: any) => c.type === "BODY");
    const corpo: string = body?.text ?? (t.category === "AUTHENTICATION" ? "{{1}} é o seu código de verificação." : "");
    const variaveis = new Set([...corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
    // deno-lint-ignore no-explicit-any
    const botoes = (t.components ?? []).find((c: any) => c.type === "BUTTONS")?.buttons ?? [];
    // deno-lint-ignore no-explicit-any
    const urlBotao = botoes.find((b: any) => b.type === "URL" && /\{\{1\}\}/.test(b.url ?? ""))?.url ?? null;
    return { name: t.name, status: t.status, language: t.language, category: t.category, corpo, variaveis, url_botao: urlBotao, motivo_rejeicao: t.rejected_reason ?? null };
  });
  return { templates };
}

export async function criarTemplatesPadrao(idioma: string): Promise<{ resultados: { name: string; ok: boolean; detalhe: string }[] } | { erro: string }> {
  const w = await waba();
  if ("erro" in w) return w;
  const existentes = await listarTemplatesMeta();
  const nomes = new Set("templates" in existentes ? existentes.templates.filter((t) => t.language === idioma).map((t) => t.name) : []);
  const resultados: { name: string; ok: boolean; detalhe: string }[] = [];
  for (const t of TEMPLATES_META) {
    if (nomes.has(t.name)) {
      resultados.push({ name: t.name, ok: true, detalhe: "já existe" });
      continue;
    }
    const r = await fetch(`${GRAPH}/${w.waba}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${w.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...t, language: idioma }),
    });
    const j = await r.json().catch(() => ({}));
    resultados.push({
      name: t.name,
      ok: r.ok,
      detalhe: r.ok ? `enviado para aprovação (${j?.status ?? "PENDING"})` : String(j?.error?.error_user_msg ?? j?.error?.message ?? r.status),
    });
  }
  return { resultados };
}
