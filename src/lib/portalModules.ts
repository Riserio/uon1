import { TrendingUp, Activity, DollarSign, CreditCard, Database, KanbanSquare, MessageSquare } from "lucide-react";

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

export const MODULE_CONFIG: Record<
  PortalModule,
  { label: string; shortLabel: string; icon: React.ElementType; path: string }
> = {
  indicadores: { label: "Indicadores", shortLabel: "Indic.", icon: TrendingUp, path: "/portal" },
  eventos: { label: "Eventos", shortLabel: "Eventos", icon: Activity, path: "/portal/sga-insights" },
  mgf: { label: "MGF", shortLabel: "MGF", icon: DollarSign, path: "/portal/mgf-insights" },
  cobranca: { label: "Cobrança", shortLabel: "Cobrança", icon: CreditCard, path: "/portal/cobranca-insights" },
  "estudo-base": { label: "Estudo de Base", shortLabel: "Base", icon: Database, path: "/portal/estudo-base-insights" },
  "acompanhamento-eventos": { label: "Acompanhamento", shortLabel: "Acomp.", icon: KanbanSquare, path: "/portal/acompanhamento-eventos" },
  ouvidoria: { label: "Ouvidoria", shortLabel: "Ouvidoria", icon: MessageSquare, path: "/portal/ouvidoria" },
};

export const MODULE_ORDER: PortalModule[] = [
  "indicadores",
  "eventos",
  "mgf",
  "cobranca",
  "estudo-base",
  "acompanhamento-eventos",
  "ouvidoria",
];
