// Chamadas à edge function `uonisign` (fluxo 2 do uoniSign).
import { supabase } from "@/integrations/supabase/client";

const URL_FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uonisign`;

export class ErroUoniSign extends Error {
  constructor(
    message: string,
    public status: number,
    public erros?: Record<string, string>,
  ) {
    super(message);
  }
}

async function chamar<T>(acao: string, corpo: Record<string, unknown>, publica = false): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  if (!publica) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new ErroUoniSign("Sessão expirada. Entre novamente.", 401);
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers.Authorization = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
  }
  let r: Response;
  try {
    r = await fetch(URL_FUNCAO, { method: "POST", headers, body: JSON.stringify({ acao, ...corpo }) });
  } catch {
    throw new ErroUoniSign("Sem conexão. Verifique a internet e tente novamente.", 0);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroUoniSign(j?.erro || "Não foi possível concluir. Tente novamente.", r.status, j?.erros);
  return j as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContratoV2 = Record<string, any>;

export const uonisign = {
  criar: (p: { template_id?: string; contrato_id?: string; dados: Record<string, string> }) =>
    chamar<{ contrato: ContratoV2; faltando: string[]; pendencias_modelo: string[] }>("criar", p),
  registrarPdf: (contrato_id: string, pdf_base64: string) =>
    chamar<{ hash: string; url: string }>("registrar_pdf", { contrato_id, pdf_base64 }),
  enviar: (p: { contrato_id: string; email: string; telefone?: string; whatsapp: boolean }) =>
    chamar<{ ok: true; whatsapp: boolean | null }>("enviar", p),
  reenviar: (assinatura_id: string, tipo: "convite" | "copia") => chamar<{ ok: true }>("reenviar", { assinatura_id, tipo }),
  corrigirContato: (p: { assinatura_id: string; email?: string; telefone?: string; whatsapp?: boolean; motivo: string }) =>
    chamar<{ ok: true }>("corrigir_contato", p),
  cancelar: (contrato_id: string, motivo: string) => chamar<{ ok: true }>("cancelar", { contrato_id, motivo }),
  url: (contrato_id: string, tipo: "original" | "final", download = false) =>
    chamar<{ url: string }>("url", { contrato_id, tipo, download }),

  // Página pública de assinatura
  abrir: (token: string) => chamar<PaginaAssinatura>("pub_abrir", { token }, true),
  solicitarCodigo: (token: string, canal: "email" | "whatsapp") =>
    chamar<{ ok: true; destino: string; validade_min: number }>("pub_solicitar_codigo", { token, canal }, true),
  assinar: (token: string, codigo: string) =>
    chamar<{ ok: true; estado: string }>("pub_assinar", { token, codigo, aceite: true }, true),
  recusar: (token: string, motivo: string) => chamar<{ ok: true }>("pub_recusar", { token, motivo }, true),
};

export interface PaginaAssinatura {
  contrato: {
    numero: string;
    titulo: string;
    status: string;
    motivo_recusa: string | null;
    concluido_em: string | null;
    lacre_status: string | null;
    hash: string | null;
    codigo_verificacao: string | null;
    url_validacao: string | null;
  };
  signatario: {
    nome: string;
    papel: string;
    status: string;
    canais: string[];
    email: string;
    telefone: string;
    expira_em: string | null;
    bloqueado_ate: string | null;
    assinado_em: string | null;
  };
  signatarios: { nome: string; papel: string; status: string; assinado_em: string | null; voce: boolean }[];
  estado:
    | "pode_assinar"
    | "aguardando_outros"
    | "ja_assinou"
    | "concluido"
    | "processando"
    | "cancelado"
    | "recusado"
    | "expirado"
    | "indisponivel"
    | "documento_indisponivel";
  pdf_url: string | null;
}

export type NivelUoniSign = "admin" | "operador" | "vendedor" | "nenhum";

export async function meuNivel(): Promise<NivelUoniSign> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("uonisign_meu_nivel");
  if (error) return "vendedor";
  return (data as NivelUoniSign) ?? "nenhum";
}

export const STATUS_V2: Record<string, { label: string; cor: string }> = {
  rascunho: { label: "Rascunho", cor: "text-muted-foreground bg-muted/60 border-border" },
  aguardando_assinatura: { label: "Aguardando assinatura", cor: "text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-400" },
  parcialmente_assinado: { label: "Parcialmente assinado", cor: "text-sky-700 bg-sky-500/10 border-sky-500/20 dark:text-sky-400" },
  assinado_processando: { label: "Assinado — processando", cor: "text-violet-700 bg-violet-500/10 border-violet-500/20 dark:text-violet-400" },
  assinado: { label: "Assinado", cor: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400" },
  recusado: { label: "Recusado", cor: "text-red-700 bg-red-500/10 border-red-500/20 dark:text-red-400" },
  cancelado: { label: "Cancelado", cor: "text-red-700 bg-red-500/10 border-red-500/20 dark:text-red-400" },
  expirado: { label: "Expirado", cor: "text-gray-600 bg-gray-500/10 border-gray-500/20 dark:text-gray-400" },
};
