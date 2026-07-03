import {
  Activity,
  DollarSign,
  CreditCard,
  Database,
  History,
  TrendingUp,
  KanbanSquare,
  BarChart3,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import BISyncButton from "./BISyncButton";
import { useAppConfig } from "@/hooks/useAppConfig";

type BIPageHeaderProps = {
  title: string;
  subtitle: string;
  associacoes: {
    id: string;
    nome: string;
  }[];
  selectedAssociacao: string;
  onAssociacaoChange: (id: string) => void;
  loadingAssociacoes?: boolean;
  currentModule:
    | "indicadores"
    | "eventos"
    | "mgf"
    | "cobranca"
    | "estudo-base"
    | "cadastro"
    | "acompanhamento-eventos"
    | "admin";
  showHistorico?: boolean;
  onHistoricoClick?: () => void;
  recordCount?: number;
  hasActiveFilters?: boolean;
  fileName?: string;
  showAdminOption?: boolean;
};

const modules = [
  {
    id: "indicadores",
    label: "Indicadores",
    icon: TrendingUp,
    path: "/pid",
  },
  {
    id: "eventos",
    label: "Eventos",
    icon: Activity,
    path: "/sga-insights",
  },
  {
    id: "mgf",
    label: "MGF",
    icon: DollarSign,
    path: "/mgf-insights",
  },
  {
    id: "cobranca",
    label: "Cobrança",
    icon: CreditCard,
    path: "/cobranca-insights",
  },
  {
    id: "estudo-base",
    label: "Estudo de Base",
    icon: Database,
    path: "/estudo-base-insights",
  },
  {
    id: "cadastro",
    label: "Cadastro",
    icon: Keyboard,
    path: "/cadastro-insights",
  },
  {
    id: "acompanhamento-eventos",
    label: "Acompanhamento",
    icon: KanbanSquare,
    path: "/acompanhamento-eventos",
  },
] as const;

export default function BIPageHeader({
  title,
  subtitle,
  associacoes,
  selectedAssociacao,
  onAssociacaoChange,
  loadingAssociacoes,
  currentModule,
  showHistorico,
  onHistoricoClick,
  recordCount,
  hasActiveFilters,
  fileName,
  showAdminOption,
}: BIPageHeaderProps) {
  const navigate = useNavigate();
  const { config } = useAppConfig();
  const headerLogo = config.header_logo_url || "/images/logo-vg.png";
  const selectedAssociacaoNome = associacoes.find((a) => a.id === selectedAssociacao)?.nome;

  return (
    <div className="space-y-3 pt-4 mb-4">
      {/* ================= Linha 1: identidade + contexto + ações ================= */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {/* Título compacto */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold leading-tight text-foreground truncate">{title}</h1>
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          </div>
        </div>

        {/* Ações agrupadas: associação em destaque, o resto discreto */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedAssociacao} onValueChange={onAssociacaoChange} disabled={loadingAssociacoes}>
            <SelectTrigger className="w-48 sm:w-56 h-9 text-sm rounded-lg font-medium">
              <SelectValue placeholder="Selecione associação..." />
            </SelectTrigger>
            <SelectContent>
              {showAdminOption && (
                <SelectItem value="__admin__" className="font-semibold">
                  🏢 Visão Administradora
                </SelectItem>
              )}
              {associacoes.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedAssociacao && selectedAssociacao !== "__admin__" && (
            <BISyncButton corretoraId={selectedAssociacao} corretoraNome={selectedAssociacaoNome} />
          )}
          {showHistorico && onHistoricoClick && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onHistoricoClick}
              className="gap-1.5 text-muted-foreground hover:text-foreground rounded-lg h-9"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Histórico</span>
            </Button>
          )}
          <div className="hidden sm:block h-6 w-px bg-border mx-1" />
          <img src={headerLogo} alt="Logo" className="h-7 w-auto opacity-90 shrink-0 object-contain" />
        </div>
      </div>

      {/* ================= Linha 2: navegação de módulos centralizada + contagem à direita ================= */}
      {currentModule !== "admin" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/60 pb-3">
          <div className="hidden lg:block" />
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 flex justify-start lg:justify-center">
            <div className="flex items-center gap-1 w-fit">
              {modules.map((mod) => {
                const Icon = mod.icon;
                const isActive = currentModule === mod.id;
                return (
                  <button
                    key={mod.id}
                    onClick={() =>
                      navigate(`${mod.path}${selectedAssociacao ? `?associacao=${selectedAssociacao}` : ""}`)
                    }
                    className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-sm whitespace-nowrap transition-all duration-200 ${
                      isActive
                        ? "bg-card text-foreground font-semibold shadow-md"
                        : "text-muted-foreground font-medium hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{mod.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contagem de registros alinhada à direita, sem ocupar linha própria */}
          {recordCount !== undefined && recordCount > 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 justify-center lg:justify-self-end">
              <Database className="h-3.5 w-3.5 shrink-0" />
              <span>{recordCount.toLocaleString("pt-BR")} registros</span>
              {hasActiveFilters && <span className="text-primary">(filtrados)</span>}
              {fileName && (
                <>
                  <span className="text-muted-foreground/40">|</span>
                  <span className="truncate max-w-[140px]">{fileName}</span>
                </>
              )}
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
      )}
    </div>
  );
}
