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

/**
 * Icone de cada grupo (nome do icone lucide-react).
 *
 * REGRA: nenhum icone daqui pode se repetir nos itens do menu. Se o grupo
 * "Inteligencia" usasse TrendingUp, que ja e o icone do BI, o mesmo desenho
 * significaria duas coisas em niveis diferentes da hierarquia — recolhido, o
 * usuario nao sabe se clicou no grupo ou na tela. Por isso os grupos usam uma
 * familia visual propria (formas abstratas: radar, escudo, aperto de mao) e os
 * itens ficam com os objetos concretos. Ha uma checagem em DEV no AppSidebar.
 *
 * Excecao: "inicio" repete LayoutDashboard do Painel de proposito. O grupo tem
 * um item so, entao grupo e tela sao a mesma coisa — aqui o icone repetido e
 * coerencia, nao ambiguidade. A checagem em DEV ignora grupos de item unico.
 * Usado quando a sidebar esta recolhida: em vez de listar todos os itens em
 * coluna, mostra so o icone do grupo — clicar expande a sidebar e abre o grupo.
 */
export const GRUPO_ICONE: Record<ModuloGrupo, string> = {
  inicio: "LayoutDashboard",
  relacionamento: "Handshake",
  inteligencia: "Radar",
  operacao: "Wrench",
  documentos: "FolderOpen",
  cadastros: "Database",
  interno: "ShieldCheck",
};

/** Grupos que comecam recolhidos. "inicio" nao expande (item unico). */
export const GRUPO_RECOLHIDO_PADRAO: ModuloGrupo[] = ["documentos", "cadastros", "interno"];

export const SYSTEM_MODULES: ModuloSistema[] = [
  { id: "dashboard", label: "Painel", grupo: "inicio", essencial: true },
  { id: "atendimentos", label: "Atendimentos", grupo: "relacionamento" },
  { id: "comercial", label: "Comercial", grupo: "relacionamento" },
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
  { id: "links", label: "Links", grupo: "relacionamento" },
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
  dashboard: "📊", atendimentos: "📋", comercial: "🎯", corretoras: "🏢", termos: "📄", contatos: "👥",
  sinistros: "🔍", lancamentos_financeiros: "💰", agenda: "📅", documentos: "📁",
  emails: "📧", mensagens: "💬", pid: "📈", ouvidoria: "🛡️", contratos: "✍️",
  talka: "🎥", comunicados: "📢", gestao: "⚙️", formularios: "📝", ppr: "✅",
  debitos_veiculares: "🚗", links: "🔗", biblioteca: "📚", ajuda: "❓", configuracoes: "⚙️",
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

// ---------------------------------------------------------------------------
// Subitens de módulo (abas/áreas internas que podem ser liberadas por cargo).
// Gravados na MESMA tabela de permissões com a chave "modulo:subitem" — não
// exige migration. Regra: subitem sem registro herda o módulo; módulo bloqueado
// bloqueia todos os subitens.
//
// AO CRIAR UMA ABA NOVA num módulo listado aqui, adicione o subitem e filtre a
// aba na tela com `podeVer(modulo, subitem)` (hook usePermissoes).
// ---------------------------------------------------------------------------
export interface SubitemModulo {
  id: string;
  label: string;
}

export const SUBITENS_MODULO: Record<string, SubitemModulo[]> = {
  atendimentos: [
    { id: "administradora", label: "Gestão Administradora" },
    { id: "associacao", label: "Gestão Associação" },
  ],
  comercial: [
    { id: "funil", label: "Funil" },
    { id: "vendedores", label: "Vendedores" },
  ],
  pid: [
    { id: "dashboard", label: "Visão Geral" },
    { id: "estudo-base", label: "Estudo de Base" },
    { id: "historico", label: "Histórico" },
    { id: "importacao", label: "Importação" },
  ],
  sinistros: [
    { id: "acompanhamento", label: "Painel" },
    { id: "vistorias", label: "Vistorias" },
    { id: "dashboard", label: "Dashboard" },
  ],
  lancamentos_financeiros: [
    { id: "visao-geral", label: "Visão Geral" },
    { id: "a-receber", label: "A Receber" },
    { id: "a-pagar", label: "A Pagar" },
    { id: "fluxo-caixa", label: "Fluxo de Caixa" },
    { id: "lancamentos", label: "Lançamentos" },
    { id: "conciliacao", label: "Conciliação" },
    { id: "historico", label: "Histórico" },
    { id: "notas-fiscais", label: "Nota Fiscal" },
    { id: "centros-custo", label: "Centro de Custo" },
    { id: "categorias", label: "Categorias" },
  ],
  gestao: [
    { id: "dashboard", label: "Dashboard" },
    { id: "jornada", label: "Jornada de Trabalho" },
    { id: "analise", label: "Análise de Funcionário" },
    { id: "dispositivos", label: "Dispositivos do Ponto" },
  ],
};

export const chavePermissao = (modulo: string, subitem?: string) =>
  subitem ? `${modulo}:${subitem}` : modulo;

/**
 * Rota de cada módulo — usada para bloquear acesso direto pela URL quando o
 * módulo não está liberado. Mantenha em sincronia com o AppSidebar.
 */
export const ROTA_MODULO: Record<string, string> = {
  atendimentos: "/atendimentos",
  comercial: "/comercial",
  corretoras: "/corretoras",
  termos: "/termos",
  contatos: "/contatos",
  sinistros: "/sinistros",
  lancamentos_financeiros: "/financeiro",
  agenda: "/agenda",
  documentos: "/documentos",
  emails: "/central-atendimento",
  mensagens: "/mensagens",
  sga: "/sga",
  pid: "/pid",
  ouvidoria: "/ouvidoria-backoffice",
  contratos: "/uon1sign",
  talka: "/video",
  comunicados: "/comunicados",
  links: "/links",
  gestao: "/gestao",
  formularios: "/formularios",
  ppr: "/ppr",
  debitos_veiculares: "/debitos-veiculares",
  biblioteca: "/biblioteca",
};

/** Módulo dono de um caminho (o prefixo mais longo vence). */
export function moduloDaRota(pathname: string): string | null {
  let melhor: { id: string; len: number } | null = null;
  for (const [id, rota] of Object.entries(ROTA_MODULO)) {
    if (pathname === rota || pathname.startsWith(rota + "/")) {
      if (!melhor || rota.length > melhor.len) melhor = { id, len: rota.length };
    }
  }
  return melhor?.id ?? null;
}
