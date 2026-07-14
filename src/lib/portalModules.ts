import { TrendingUp, Activity, DollarSign, CreditCard, KanbanSquare, MessageSquare } from "lucide-react";

// Config central dos módulos do Portal do Parceiro. Usado tanto pela
// sidebar desktop (PortalSidebar) quanto pela barra flutuante mobile
// (PortalMobileNav) — mantém os dois em sincronia (ícone/label/rota).
export type PortalModule =
  | "indicadores"
  | "eventos"
  | "mgf"
  | "cobranca"
  | "estudo-base"
  | "acompanhamento-eventos"
  | "ouvidoria";

// "estudo-base" foi removido da navegação do Portal do Parceiro. O tipo
// `PortalModule` mantém a entrada apenas para retrocompatibilidade com
// telas legadas (rotas antigas ainda apontam pra ela), mas ela não existe
// mais no CONFIG/ORDER, então nunca aparece em sidebar/barra/favoritos.
export const MODULE_CONFIG: Partial<
  Record<PortalModule, { label: string; shortLabel: string; icon: React.ElementType; path: string }>
> = {
  indicadores: { label: "Indicadores", shortLabel: "Indic.", icon: TrendingUp, path: "/portal" },
  eventos: { label: "Eventos", shortLabel: "Eventos", icon: Activity, path: "/portal/sga-insights" },
  mgf: { label: "MGF", shortLabel: "MGF", icon: DollarSign, path: "/portal/mgf-insights" },
  cobranca: { label: "Cobrança", shortLabel: "Cobrança", icon: CreditCard, path: "/portal/cobranca-insights" },
  "acompanhamento-eventos": { label: "Acompanhamento", shortLabel: "Acomp.", icon: KanbanSquare, path: "/portal/acompanhamento-eventos" },
  ouvidoria: { label: "Ouvidoria", shortLabel: "Ouvidoria", icon: MessageSquare, path: "/portal/ouvidoria" },
};

export const MODULE_ORDER: PortalModule[] = [
  "indicadores",
  "eventos",
  "mgf",
  "cobranca",
  "acompanhamento-eventos",
  "ouvidoria",
];
