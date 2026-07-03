/**
 * Registro canônico dos módulos do sistema.
 * Fonte única usada pelo menu (AppSidebar) e pela gestão de módulos em Configurações.
 * O `id` deve ser idêntico ao usado no menu e nas permissões (menu_item).
 */
export type ModuloGrupo = "nav" | "cadastros" | "ferramentas";

export interface ModuloSistema {
  id: string;
  label: string;
  grupo: ModuloGrupo;
  /** Módulos essenciais não podem ser desabilitados (evita travar o acesso). */
  essencial?: boolean;
}

export const GRUPO_LABEL: Record<ModuloGrupo, string> = {
  nav: "Navegação",
  cadastros: "Cadastros",
  ferramentas: "Ferramentas",
};

export const SYSTEM_MODULES: ModuloSistema[] = [
  { id: "dashboard", label: "Painel", grupo: "nav", essencial: true },
  { id: "atendimentos", label: "Atendimentos", grupo: "nav" },
  { id: "corretoras", label: "Associações", grupo: "cadastros" },
  { id: "termos", label: "Termos de Aceite", grupo: "cadastros" },
  { id: "contatos", label: "Contatos", grupo: "cadastros" },
  { id: "sinistros", label: "Vistorias", grupo: "ferramentas" },
  { id: "lancamentos_financeiros", label: "Financeiro", grupo: "ferramentas" },
  { id: "agenda", label: "Agenda", grupo: "ferramentas" },
  { id: "documentos", label: "Documentos", grupo: "ferramentas" },
  { id: "emails", label: "Central de Atendimento", grupo: "ferramentas" },
  { id: "mensagens", label: "Mensagens", grupo: "ferramentas" },
  { id: "pid", label: "BI - Indicadores", grupo: "ferramentas" },
  { id: "ouvidoria", label: "Ouvidoria", grupo: "ferramentas" },
  { id: "contratos", label: "Uon1 Sign", grupo: "ferramentas" },
  { id: "talka", label: "Uon1 Talk", grupo: "ferramentas" },
  { id: "comunicados", label: "Comunicados", grupo: "ferramentas" },
  { id: "gestao", label: "Gestão", grupo: "ferramentas" },
  { id: "formularios", label: "Formulários", grupo: "ferramentas" },
  { id: "ppr", label: "PPR", grupo: "ferramentas" },
  { id: "debitos_veiculares", label: "Débitos Veiculares", grupo: "ferramentas" },
  { id: "ajuda", label: "Ajuda", grupo: "ferramentas", essencial: true },
  { id: "configuracoes", label: "Configurações", grupo: "ferramentas", essencial: true },
];
