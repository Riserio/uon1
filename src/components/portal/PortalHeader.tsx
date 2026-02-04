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

          {/* Linha 2: Navegação entre módulos - só exibe os módulos que o usuário tem acesso */}
          {modulosDisponiveis > 0 && (
            <nav className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {hasIndicadores && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/portal?associacao=${corretora.id}`)}
                  className={`gap-2 shrink-0 transition-all ${
                    currentModule === 'indicadores' 
                      ? 'bg-primary text-primary-foreground border-primary shadow-md hover:bg-primary/90 hover:text-primary-foreground' 
                      : 'hover:bg-muted'
                  }`}
                >
                  <TrendingUp className="h-4 w-4" />
                  <span>Indicadores</span>
                </Button>
              )}
              {hasEventos && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/portal/sga-insights?associacao=${corretora.id}`)}
                  className={`gap-2 shrink-0 transition-all ${
                    currentModule === 'eventos' 
                      ? 'bg-primary text-primary-foreground border-primary shadow-md hover:bg-primary/90 hover:text-primary-foreground' 
                      : 'hover:bg-muted'
                  }`}
                >
                  <Activity className="h-4 w-4" />
                  <span>Eventos</span>
                </Button>
              )}
              {hasMGF && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/portal/mgf-insights?associacao=${corretora.id}`)}
                  className={`gap-2 shrink-0 transition-all ${
                    currentModule === 'mgf' 
                      ? 'bg-primary text-primary-foreground border-primary shadow-md hover:bg-primary/90 hover:text-primary-foreground' 
                      : 'hover:bg-muted'
                  }`}
                >
                  <Activity className="h-4 w-4" />
                  <span>MGF</span>
                </Button>
              )}
              {hasCobranca && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/portal/cobranca-insights?associacao=${corretora.id}`)}
                  className={`gap-2 shrink-0 transition-all ${
                    currentModule === 'cobranca' 
                      ? 'bg-primary text-primary-foreground border-primary shadow-md hover:bg-primary/90 hover:text-primary-foreground' 
                      : 'hover:bg-muted'
                  }`}
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
