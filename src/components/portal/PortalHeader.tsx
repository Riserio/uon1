import { Building2, LogOut, ArrowLeftRight, TrendingUp, Activity, DollarSign, Car, KanbanSquare, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import PortalCarouselControls from "./PortalCarouselControls";
import { usePortalDataPrefetch } from "@/hooks/usePortalDataPrefetch";
import { usePortalCarouselOptional } from "@/contexts/PortalCarouselContext";

type Corretora = {
  id: string;
  nome: string;
  slug?: string | null;
  logo_url?: string | null;
  modulos_bi: string[];
};

type PortalHeaderProps = {
  corretora: Corretora;
  showChangeButton?: boolean;
  onChangeCorretora?: () => void;
  onLogout: () => void;
  currentModule?: 'indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base' | 'acompanhamento-eventos' | 'ouvidoria';
  showCarouselControls?: boolean;
  hasAcompanhamento?: boolean;
  hasOuvidoria?: boolean;
};

export default function PortalHeader({
  corretora,
  showChangeButton = false,
  onChangeCorretora,
  onLogout,
  currentModule,
  showCarouselControls = false,
  hasAcompanhamento = false,
  hasOuvidoria = false
}: PortalHeaderProps) {
  const carousel = usePortalCarouselOptional();
  const navigate = useNavigate();
  
  // Identificador para URLs — sempre o id (trabalhamos SEM slug)
  const assocKey = corretora.id;
  
  // Verificar permissões de módulos
  const hasModulo = (modulo: string) => corretora.modulos_bi.includes(modulo);
  const hasIndicadores = hasModulo('indicadores');
  const hasEventos = hasModulo('eventos');
  const hasMGF = hasModulo('mgf');
  const hasCobranca = hasModulo('cobranca');

  // Lista de módulos disponíveis para o carrossel
  // ("estudo-base" removido do Portal do Parceiro — mantido apenas no BI interno)
  const availableModules: ('indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'acompanhamento-eventos' | 'ouvidoria')[] = [
    ...(hasIndicadores ? ['indicadores'] as const : []),
    ...(hasEventos ? ['eventos'] as const : []),
    ...(hasMGF ? ['mgf'] as const : []),
    ...(hasCobranca ? ['cobranca'] as const : []),
    ...(hasAcompanhamento ? ['acompanhamento-eventos'] as const : []),
    ...(hasOuvidoria ? ['ouvidoria'] as const : []),
  ];

  // Contagem de módulos disponíveis para decidir layout
  const modulosDisponiveis = availableModules.length;

  // For prefetch, use only prefetch-compatible module
  const prefetchModule: 'indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base' =
    (currentModule === 'acompanhamento-eventos' || currentModule === 'ouvidoria' || currentModule === 'estudo-base') ? 'indicadores' : (currentModule || 'indicadores');

  // Pré-carregar dados dos outros módulos em segundo plano. 'cobranca' é
  // excluída aqui: a tela de Cobrança usa RPCs server-side (rápidas o
  // suficiente) e não consome mais o cache de pré-carregamento — deixá-la
  // na lista só gerava uma chamada "vazia" (log de início/fim sem buscar
  // nada) toda vez que o parceiro navegava por outro módulo.
  const prefetchAvailableModules = availableModules.filter(m => m !== 'cobranca');
  usePortalDataPrefetch(corretora.id, prefetchModule, prefetchAvailableModules);

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
              {/* Controles do carrossel - oculto no mobile */}
              {showCarouselControls && modulosDisponiveis > 1 && currentModule && (
                <div className="hidden md:flex">
                  <PortalCarouselControls
                    corretoraId={corretora.id}
                    availableModules={availableModules}
                    currentModule={!currentModule || currentModule === 'estudo-base' ? 'indicadores' : currentModule}
                  />
                </div>
              )}
              
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
                  onClick={() => {
                    if (carousel) {
                      carousel.goToModule('indicadores');
                    } else {
                      navigate(`/portal?associacao=${assocKey}`);
                    }
                  }}
                  disabled={carousel?.config.enabled}
                  className={`gap-2 shrink-0 transition-all duration-300 ${
                    currentModule === 'indicadores' 
                      ? 'bg-primary text-primary-foreground border-primary shadow-md hover:bg-primary/90 hover:text-primary-foreground' 
                      : 'hover:bg-muted'
                  } ${carousel?.config.enabled ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <TrendingUp className="h-4 w-4" />
                  <span>Indicadores</span>
                </Button>
              )}
              {hasEventos && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (carousel) {
                      carousel.goToModule('eventos');
                    } else {
                      navigate(`/portal/sga-insights?associacao=${assocKey}`);
                    }
                  }}
                  disabled={carousel?.config.enabled}
                  className={`gap-2 shrink-0 transition-all duration-300 ${
                    currentModule === 'eventos' 
                      ? 'bg-primary text-primary-foreground border-primary shadow-md hover:bg-primary/90 hover:text-primary-foreground' 
                      : 'hover:bg-muted'
                  } ${carousel?.config.enabled ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <Activity className="h-4 w-4" />
                  <span>Eventos</span>
                </Button>
              )}
              {hasMGF && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (carousel) {
                      carousel.goToModule('mgf');
                    } else {
                      navigate(`/portal/mgf-insights?associacao=${assocKey}`);
                    }
                  }}
                  disabled={carousel?.config.enabled}
                  className={`gap-2 shrink-0 transition-all duration-300 ${
                    currentModule === 'mgf' 
                      ? 'bg-primary text-primary-foreground border-primary shadow-md hover:bg-primary/90 hover:text-primary-foreground' 
                      : 'hover:bg-muted'
                  } ${carousel?.config.enabled ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <Activity className="h-4 w-4" />
                  <span>MGF</span>
                </Button>
              )}
              {hasCobranca && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (carousel) {
                      carousel.goToModule('cobranca');
                    } else {
                      navigate(`/portal/cobranca-insights?associacao=${assocKey}`);
                    }
                  }}
                  disabled={carousel?.config.enabled}
                  className={`gap-2 shrink-0 transition-all duration-300 ${
                    currentModule === 'cobranca' 
                      ? 'bg-primary text-primary-foreground border-primary shadow-md hover:bg-primary/90 hover:text-primary-foreground' 
                      : 'hover:bg-muted'
                  } ${carousel?.config.enabled ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <DollarSign className="h-4 w-4" />
                  <span>Cobrança</span>
                </Button>
              )}
              {hasAcompanhamento && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigate(`/portal/acompanhamento-eventos?associacao=${assocKey}`);
                  }}
                  className={`gap-2 shrink-0 transition-all duration-300 ${
                    currentModule === 'acompanhamento-eventos' 
                      ? 'bg-primary text-primary-foreground border-primary shadow-md hover:bg-primary/90 hover:text-primary-foreground' 
                      : 'hover:bg-muted'
                  }`}
                >
                  <KanbanSquare className="h-4 w-4" />
                  <span>Acompanhamento</span>
                </Button>
              )}
              {hasOuvidoria && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigate(`/portal/ouvidoria?associacao=${assocKey}`);
                  }}
                  className={`gap-2 shrink-0 transition-all duration-300 ${
                    currentModule === 'ouvidoria' 
                      ? 'bg-primary text-primary-foreground border-primary shadow-md hover:bg-primary/90 hover:text-primary-foreground' 
                      : 'hover:bg-muted'
                  }`}
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Ouvidoria</span>
                </Button>
              )}
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
