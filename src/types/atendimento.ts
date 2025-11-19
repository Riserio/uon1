export type StatusType = string;
export type PriorityType = 'Alta' | 'Média' | 'Baixa';

export interface Atendimento {
  id: string;
  numero: number;
  corretora: string;
  corretoraId?: string;
  corretoraEmail?: string;
  contato: string;
  assunto: string;
  prioridade: PriorityType;
  responsavel: string;
  status: StatusType;
  tags: string[];
  observacoes: string;
  dataRetorno?: string;
  dataConcluido?: string;
  fluxoConcluido?: string;
  fluxoConcluidoId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Corretora {
  id: string;
  nome: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  responsavel?: string;
  observacoes?: string;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  cargo?: string;
  equipe?: string;
  ativo: boolean;
}

export interface Equipe {
  id: string;
  nome: string;
  descricao?: string;
  lider?: string;
  membros: string[];
}

export interface Contato {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  cargo?: string;
  corretoraId?: string;
  corretora?: string;
  observacoes?: string;
}
