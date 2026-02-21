import { ArrowLeft, Activity, DollarSign, CreditCard, Database, History, TrendingUp, KanbanSquare } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import BISyncButton from "./BISyncButton";

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
  currentModule: 'indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base' | 'acompanhamento-eventos' | 'admin';
  showHistorico?: boolean;
  onHistoricoClick?: () => void;
  recordCount?: number;
  hasActiveFilters?: boolean;
  fileName?: string;
  showAdminOption?: boolean;
};

const modules = [{
  id: 'indicadores',
  label: 'Indicadores',
  icon: TrendingUp,
  path: '/pid'
}, {
  id: 'eventos',
  label: 'Eventos',
  icon: Activity,
  path: '/sga-insights'
}, {
  id: 'mgf',
  label: 'MGF',
  icon: DollarSign,
  path: '/mgf-insights'
}, {
  id: 'cobranca',
  label: 'Cobrança',
  icon: CreditCard,
  path: '/cobranca-insights'
}, {
  id: 'estudo-base',
  label: 'Estudo de Base',
  icon: Database,
  path: '/estudo-base-insights'
}, {
  id: 'acompanhamento-eventos',
  label: 'Acompanhamento',
  icon: KanbanSquare,
  path: '/acompanhamento-eventos'
}] as const;

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
  showAdminOption
}: BIPageHeaderProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const selectedAssociacaoNome = associacoes.find(a => a.id === selectedAssociacao)?.nome;

  return <div className="space-y-4 mb-6">
      {/* Row 1: Title + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pl-12 sm:pl-0">
          <Select value={selectedAssociacao} onValueChange={onAssociacaoChange} disabled={loadingAssociacoes}>
            <SelectTrigger className="w-44 sm:w-56 h-9 text-sm">
              <SelectValue placeholder="Selecione associação..." />
            </SelectTrigger>
            <SelectContent>
              {showAdminOption && (
                <SelectItem value="__admin__" className="font-semibold">
                  🏢 Visão Administradora
                </SelectItem>
              )}
              {associacoes.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
            </SelectContent>
          </Select>

          {selectedAssociacao && selectedAssociacao !== '__admin__' && (
            <BISyncButton 
              corretoraId={selectedAssociacao} 
              corretoraNome={selectedAssociacaoNome}
            />
          )}

          {recordCount !== undefined && recordCount > 0 && <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg whitespace-nowrap">
              <Database className="h-3.5 w-3.5 shrink-0" />
              <span>{recordCount.toLocaleString('pt-BR')}</span>
              {hasActiveFilters && <span className="text-primary">(filtrados)</span>}
              {fileName && <>
                  <span className="text-muted-foreground/40">|</span>
                  <span className="truncate max-w-[120px]">{fileName}</span>
                </>}
            </div>}

          {showHistorico && onHistoricoClick && <Button variant="ghost" size="sm" onClick={onHistoricoClick} className="gap-1.5 text-muted-foreground hover:text-foreground">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Histórico</span>
            </Button>}
        </div>
      </div>

      {/* Row 2: Module navigation pills */}
      {currentModule !== 'admin' && (
        <nav className="flex items-center gap-2 overflow-x-auto pb-1">
          {modules.map(mod => {
          const Icon = mod.icon;
          const isActive = currentModule === mod.id;
          return <Button key={mod.id} variant="outline" size="sm" onClick={() => navigate(`${mod.path}${selectedAssociacao ? `?associacao=${selectedAssociacao}` : ''}`)} className={`gap-2 shrink-0 transition-all duration-300 ${isActive ? 'bg-primary text-primary-foreground border-primary shadow-md hover:bg-primary/90 hover:text-primary-foreground' : 'hover:bg-muted'}`}>
                <Icon className="h-4 w-4" />
                <span>{mod.label}</span>
              </Button>;
        })}
        </nav>
      )}
    </div>;
}
