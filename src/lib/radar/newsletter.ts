// Newsletter do Radar do mercado: chamadas à função do servidor.
// A inscrição, a confirmação e o cancelamento passam todos pela função
// (ninguém grava direto na lista de assinantes).
import { supabase } from "@/integrations/supabase/client";
import { urlPublica } from "@/lib/trust";

/** Texto do aceite: o mesmo é gravado junto com a inscrição e mostrado no e-mail. */
export const TEXTO_ACEITE =
  "Aceito receber por e-mail as novidades do Radar e comunicações e publicidade da Vangard Gestora. Posso cancelar quando quiser.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const emailValido = (e: string) => EMAIL.test(e.trim());

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("radar-newsletter", { body });
  if (error) {
    // a função devolve { error } com a mensagem para a pessoa
    let msg = "Não foi possível concluir agora. Tente de novo em instantes.";
    try {
      const corpo = await (error as { context?: Response }).context?.json();
      if (corpo?.error || corpo?.erro) msg = corpo.error ?? corpo.erro;
    } catch {
      // sem corpo legível
    }
    throw new Error(msg);
  }
  return data as T;
}

export interface DadosAssinatura {
  email: string;
  nome: string;
  associacao: string;
  telefone: string;
}

export const assinarNewsletter = (d: DadosAssinatura, site: string) =>
  chamar<{ ok: boolean; jaAtivo?: boolean; mensagem: string }>({
    acao: "assinar",
    email: d.email.trim(),
    nome: d.nome.trim(),
    associacao: d.associacao.trim(),
    telefone: d.telefone.replace(/\D/g, ""),
    aceite: true,
    base: urlPublica(),
    site,
  });

export const confirmarNewsletter = (token: string) => chamar<{ ok: boolean; email?: string }>({ acao: "confirmar", token });
export const cancelarNewsletter = (token: string) => chamar<{ ok: boolean; email?: string }>({ acao: "cancelar", token });

export interface ResumoNewsletter {
  ativos: number;
  pendentes: number;
  cancelados: number;
  ultimoEnvio: { iniciado_em: string; status: string; noticias: number; enviados: number; falhas: number; erro: string | null } | null;
}
export const resumoNewsletter = () => chamar<ResumoNewsletter>({ acao: "resumo" });
export const enviarTesteNewsletter = () => chamar<{ ok: boolean; email?: string; erro?: string }>({ acao: "enviar_teste" });

// ---------------------------------------------------------------------------
// Visitas da página pública
// ---------------------------------------------------------------------------
const CHAVE_VISITANTE = "radar_visitante";
function idVisitante(): string {
  try {
    let id = localStorage.getItem(CHAVE_VISITANTE);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CHAVE_VISITANTE, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Registra a visita (uma por pessoa a cada 30 minutos). Nunca atrapalha a página. */
export function registrarVisita(pagina: "radar" | "newsletter" = "radar") {
  const p = new URLSearchParams(window.location.search);
  supabase.functions
    .invoke("radar-newsletter", {
      body: {
        acao: "visita",
        visitante: idVisitante(),
        pagina,
        referencia: document.referrer || null,
        utm_source: p.get("utm_source"),
        utm_campaign: p.get("utm_campaign"),
        r: p.get("r"),
      },
    })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Campanhas (administração)
// ---------------------------------------------------------------------------
export interface Campanha {
  teste: boolean;
  assunto: string;
  titulo: string;
  mensagem: string;
  noticia_ids: string[];
  botao_texto?: string | null;
  botao_url?: string | null;
  /** vazio = todos os assinantes ativos */
  assinante_ids?: string[] | null;
}
export const enviarCampanha = (c: Campanha) =>
  chamar<{ ok: boolean; teste?: boolean; email?: string; enviados?: number; falhas?: number; destinatarios?: number; erro?: string }>({
    acao: "campanha",
    ...c,
  });

// Lembra neste aparelho que a pessoa já assinou, para não mostrar o convite de novo.
const CHAVE_LOCAL = "radar_newsletter";
export function jaAssinouNesteAparelho(): boolean {
  try {
    return !!localStorage.getItem(CHAVE_LOCAL);
  } catch {
    return false;
  }
}
export function lembrarAssinatura(email: string, status: "pendente" | "ativo") {
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ email, status, em: new Date().toISOString() }));
  } catch {
    // navegador sem armazenamento local
  }
}
export function esquecerAssinatura() {
  try {
    localStorage.removeItem(CHAVE_LOCAL);
  } catch {
    // navegador sem armazenamento local
  }
}
