/**
 * Registro canônico dos módulos do sistema.
 * Fonte única usada pelo menu (AppSidebar) e pela gestão de módulos em Configurações.
 * O `id` deve ser idêntico ao usado no menu e nas permissões (menu_item).
 *
 * AO CRIAR UM MÓDULO NOVO, adicione aqui também. Item que existe no AppSidebar e
 * não está nesta lista aparece no menu mas não pode ser desabilitado em
 * Configurações — foi o caso de "biblioteca", que ficou de fora e passou
 * despercebido porque a tela de gestão simplesmente não o exibia.
 */
/**
 * Grupos do menu, organizados pelo QUE A PESSOA ESTA TENTANDO FAZER — nao por
 * tipo tecnico. Antes eram tres ("nav", "cadastros", "ferramentas") e
 * "ferramentas" acumulava 16 itens: lista longa demais para encontrar algo.
 */
export type ModuloGrupo =
  | "inicio"
  | "relacionamento"
  | "inteligencia"
  | "operacao"
  | "documentos"
  | "cadastros"
  | "interno";

export interface ModuloSistema {
  id: string;
  label: string;
  grupo: ModuloGrupo;
  /** Módulos essenciais não podem ser desabilitados (evita travar o acesso). */
  essencial?: boolean;
}

export const GRUPO_LABEL: Record<ModuloGrupo, string> = {
  inicio: "Início",
  relacionamento: "Relacionamento",
  inteligencia: "Inteligência",
  operacao: "Operação",
  documentos: "Documentos",
  cadastros: "Cadastros",
  interno: "Interno",
};

/** Ordem de exibicao no menu e na tela de gestao. */
export const GRUPO_ORDEM: ModuloGrupo[] = [
  "inicio", "relacionamento", "inteligencia", "operacao", "documentos", "cadastros", "interno",
];

/** Grupos que comecam recolhidos. "inicio" nao expande (item unico). */
export const GRUPO_RECOLHIDO_PADRAO: ModuloGrupo[] = ["documentos", "cadastros", "interno"];

export const SYSTEM_MODULES: ModuloSistema[] = [
  { id: "dashboard", label: "Painel", grupo: "inicio", essencial: true },
  { id: "atendimentos", label: "Atendimentos", grupo: "relacionamento" },
  { id: "corretoras", label: "Associações", grupo: "cadastros" },
  { id: "termos", label: "Termos de Aceite", grupo: "documentos" },
  { id: "contatos", label: "Contatos", grupo: "cadastros" },
  { id: "sinistros", label: "Vistorias", grupo: "operacao" },
  { id: "lancamentos_financeiros", label: "Financeiro", grupo: "operacao" },
  { id: "agenda", label: "Agenda", grupo: "interno" },
  { id: "documentos", label: "Documentos", grupo: "documentos" },
  { id: "emails", label: "Central de Atendimento", grupo: "relacionamento" },
  { id: "mensagens", label: "Mensagens", grupo: "relacionamento" },
  { id: "sga", label: "SGA — Associados", grupo: "inteligencia" },
  { id: "pid", label: "BI - Indicadores", grupo: "inteligencia" },
  { id: "ouvidoria", label: "Ouvidoria", grupo: "relacionamento" },
  { id: "contratos", label: "Uon1 Sign", grupo: "documentos" },
  { id: "talka", label: "Uon1 Talk", grupo: "relacionamento" },
  { id: "comunicados", label: "Comunicados", grupo: "relacionamento" },
  { id: "gestao", label: "Gestão", grupo: "interno" },
  { id: "formularios", label: "Formulários", grupo: "operacao" },
  { id: "ppr", label: "PPR", grupo: "interno" },
  { id: "debitos_veiculares", label: "Débitos Veiculares", grupo: "operacao" },
  { id: "biblioteca", label: "Biblioteca", grupo: "documentos" },
  { id: "ajuda", label: "Ajuda", grupo: "interno", essencial: true },
  { id: "configuracoes", label: "Configurações", grupo: "interno", essencial: true },
];

// ---------------------------------------------------------------------------
// Permissões — fonte ÚNICA para as telas de permissão (perfil, cargo e usuário).
// Antes cada tela tinha sua própria lista, com ids divergentes do menu real
// (ex.: "uon1sign" em vez de "contratos", "vistorias" em vez de "sinistros"),
// o que fazia várias permissões não surtirem efeito.
// ---------------------------------------------------------------------------
const MODULO_EMOJI: Record<string, string> = {
  dashboard: "📊", atendimentos: "📋", corretoras: "🏢", termos: "📄", contatos: "👥",
  sinistros: "🔍", lancamentos_financeiros: "💰", agenda: "📅", documentos: "📁",
  emails: "📧", mensagens: "💬", pid: "📈", ouvidoria: "🛡️", contratos: "✍️",
  talka: "🎥", comunicados: "📢", gestao: "⚙️", formularios: "📝", ppr: "✅",
  debitos_veiculares: "🚗", biblioteca: "📚", ajuda: "❓", configuracoes: "⚙️",
  usuarios: "👤", performance: "🎯",
};

// Chaves de permissão que não são itens próprios do menu lateral, mas são
// verificadas no código (MenuNav) — mantidas para não perder controle de acesso.
const PERMISSOES_EXTRAS: { id: string; label: string }[] = [
  { id: "usuarios", label: "Usuários" },
  { id: "performance", label: "Performance" },
];

export interface MenuPermissionItem {
  id: string;
  label: string;
  icon: string;
}

export const MENU_PERMISSION_ITEMS: MenuPermissionItem[] = [
  ...SYSTEM_MODULES.map((m) => ({ id: m.id, label: m.label, icon: MODULO_EMOJI[m.id] ?? "•" })),
  ...PERMISSOES_EXTRAS.map((e) => ({ id: e.id, label: e.label, icon: MODULO_EMOJI[e.id] ?? "•" })),
];
