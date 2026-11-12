export type EtapaTipo = "aberta" | "ganho" | "perdido";

export interface ComercialFunil {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  produtos: string[];
  ativo: boolean;
}

export interface ComercialEtapa {
  id: string;
  funil_id: string;
  nome: string;
  cor: string;
  ordem: number;
  tipo: EtapaTipo;
}

export interface ComercialVendedor {
  id: string;
  nome: string;
  codigo: string;
  whatsapp: string | null;
  email: string | null;
  ativo: boolean;
  /** Usuário do sistema que é este vendedor (para "ver só os próprios leads"). */
  profile_id?: string | null;
}

export interface ComercialLead {
  id: string;
  funil_id: string;
  etapa_id: string;
  vendedor_id: string | null;
  nome: string;
  associacao: string | null;
  cargo: string | null;
  whatsapp: string | null;
  indicacao_externa: boolean;
  indicador_nome: string | null;
  produto: string | null;
  observacoes: string | null;
  motivo_perda: string | null;
  origem: "interno" | "qrcode";
  etapa_alterada_em: string;
  created_at: string;
  /** Cadeia gravada no registro (equipe de origem nos relatórios). */
  lider_id?: string | null;
  gerente_id?: string | null;
  arquivado_em?: string | null;
}

/** Nível do usuário no Comercial (calculado no banco: comercial_nivel). */
export type ComercialNivel = "admin" | "gerente" | "lider" | "direto" | "nenhum";

export interface ComercialAcesso {
  nivel: ComercialNivel;
  profile_id: string | null;
  vendedor_id: string | null;
  equipe: string | null;
  lider: string | null;
  gerente: string | null;
  vendedores_editaveis: string[];
  vendedores_visiveis: string[];
}

export type CotacaoStatus = "rascunho" | "enviada" | "aprovada" | "emitida" | "cancelamento_solicitado" | "cancelada";

export interface ComercialCotacao {
  id: string;
  numero: number;
  lead_id: string;
  vendedor_id: string | null;
  lider_id: string | null;
  gerente_id: string | null;
  produto: string | null;
  descricao: string | null;
  valor: number;
  status: CotacaoStatus;
  status_anterior: CotacaoStatus | null;
  motivo_cancelamento: string | null;
  cancelamento_solicitado_em: string | null;
  cancelada_em: string | null;
  emitida_em: string | null;
  arquivado_em: string | null;
  created_at: string;
  updated_at: string;
}

export const STATUS_COTACAO: Record<CotacaoStatus, { label: string; classe: string }> = {
  rascunho: { label: "Rascunho", classe: "bg-slate-500/10 text-slate-600" },
  enviada: { label: "Enviada", classe: "bg-blue-500/10 text-blue-600" },
  aprovada: { label: "Aprovada", classe: "bg-violet-500/10 text-violet-600" },
  emitida: { label: "Emitida", classe: "bg-green-500/10 text-green-700" },
  cancelamento_solicitado: { label: "Cancelamento solicitado", classe: "bg-amber-500/10 text-amber-700" },
  cancelada: { label: "Cancelada", classe: "bg-destructive/10 text-destructive" },
};

/** Status em que Direto/Líder não alteram mais a cotação. */
export const COTACAO_TRAVADA: CotacaoStatus[] = ["aprovada", "emitida", "cancelada", "cancelamento_solicitado"];

export const NIVEL_LABEL: Record<ComercialNivel, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  lider: "Líder",
  direto: "Vendedor",
  nenhum: "Sem acesso",
};

export const PRODUTOS_PADRAO = ["PPR", "Assistência 24 horas", "Gestão de Sinistros", "Gestão completa"];

export const ETAPAS_PADRAO: Omit<ComercialEtapa, "id" | "funil_id">[] = [
  { nome: "Aberto", cor: "#64748b", ordem: 1, tipo: "aberta" },
  { nome: "Contato feito", cor: "#3b82f6", ordem: 2, tipo: "aberta" },
  { nome: "Reunião agendada", cor: "#8b5cf6", ordem: 3, tipo: "aberta" },
  { nome: "Pendente enviar proposta", cor: "#f59e0b", ordem: 4, tipo: "aberta" },
  { nome: "Proposta enviada", cor: "#f97316", ordem: 5, tipo: "aberta" },
  { nome: "Fechada", cor: "#16a34a", ordem: 6, tipo: "ganho" },
  { nome: "Cancelado", cor: "#dc2626", ordem: 7, tipo: "perdido" },
];
