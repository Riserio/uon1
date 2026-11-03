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
}

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
