import { Building2, LogOut, ArrowLeftRight, TrendingUp, Activity, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

type Corretora = {
  id: string;
  nome: string;
  logo_url?: string | null;
  modulos_bi: string[];
};

type PortalHeaderProps = {
  corretora: Corretora;
  showChangeButton?: boolean;
  onChangeCorretora?: () => void;
  onLogout: () => void;
  currentModule?: 'indicadores' | 'eventos' | 'mgf' | 'cobranca';
};

export default function PortalHeader({
  corretora,
  showChangeButton = false,
  onChangeCorretora,
  onLogout,
  currentModule
}: PortalHeaderProps) {
  const navigate = useNavigate();
  
  // Verificar permissões de módulos
  const hasModulo = (modulo: string) => corretora.modulos_bi.includes(modulo);
  const hasIndicadores = hasModulo('indicadores');
  const hasEventos = hasModulo('eventos');
  const hasMGF = hasModulo('mgf');
  const hasCobranca = hasModulo('cobranca');

  // Contagem de módulos disponíveis para decidir layout
  const modulosDisponiveis = [hasIndicadores, hasEventos, hasMGF, hasCobranca].filter(Boolean).length;

  return (
    <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 py-3">
        <div className="flex flex-col gap-3">
          {/* Linha 1: Logo, nome e botões de ação */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {corretora.logo_url ? (
                <img
                  src={corretora.logo_url}
                  alt={corretora.nome}
                  className="h-10 w-10 sm:h-11 sm:w-11 rounded-full object-cover ring-2 ring-primary/20"
                />
              ) : (
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold leading-tight truncate text-foreground">
                  {corretora.nome}
                </h1>
                <p className="text-xs text-muted-foreground">Portal de Gestão</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {showChangeButton && onChangeCorretora && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={onChangeCorretora}
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  title="Trocar associação"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs">Trocar</span>
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onLogout} 
                className="gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Sair</span>
              </Button>
            </div>
          </div>

          {/* Linha 2: Navegação entre módulos */}
          {modulosDisponiveis > 1 && (
            <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {hasIndicadores && (
                <Button
                  variant={currentModule === 'indicadores' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => navigate(`/portal?associacao=${corretora.id}`)}
                  className={`gap-2 shrink-0 ${currentModule === 'indicadores' ? 'shadow-md' : ''}`}
                >
                  <TrendingUp className="h-4 w-4" />
                  <span>Indicadores</span>
                </Button>
              )}
              {hasEventos && (
                <Button
                  variant={currentModule === 'eventos' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => navigate(`/portal/sga-insights?associacao=${corretora.id}`)}
                  className={`gap-2 shrink-0 ${currentModule === 'eventos' ? 'shadow-md' : ''}`}
                >
                  <Activity className="h-4 w-4" />
                  <span>Eventos</span>
                </Button>
              )}
              {hasMGF && (
                <Button
                  variant={currentModule === 'mgf' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => navigate(`/portal/mgf-insights?associacao=${corretora.id}`)}
                  className={`gap-2 shrink-0 ${currentModule === 'mgf' ? 'shadow-md' : ''}`}
                >
                  <Activity className="h-4 w-4" />
                  <span>MGF</span>
                </Button>
              )}
              {hasCobranca && (
                <Button
                  variant={currentModule === 'cobranca' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => navigate(`/portal/cobranca-insights?associacao=${corretora.id}`)}
                  className={`gap-2 shrink-0 ${currentModule === 'cobranca' ? 'shadow-md' : ''}`}
                >
                  <DollarSign className="h-4 w-4" />
                  <span>Cobrança</span>
                </Button>
              )}
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
