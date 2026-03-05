import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

type PortalModule = 'indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base' | 'acompanhamento-eventos' | 'ouvidoria';

type CarouselConfig = {
  enabled: boolean;
  interval: number; // segundos
  visibleModules: PortalModule[]; // módulos a exibir no carrossel
};

type CarouselContextType = {
  config: CarouselConfig;
  setEnabled: (enabled: boolean) => void;
  setInterval: (interval: number) => void;
  setVisibleModules: (modules: PortalModule[]) => void;
  isTransitioning: boolean;
  transitionDirection: 'left' | 'right';
  goToNext: () => void;
  goToPrevious: () => void;
  goToModule: (module: PortalModule) => void;
};

const defaultConfig: CarouselConfig = {
  enabled: false,
  interval: 30,
  visibleModules: ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base', 'acompanhamento-eventos'],
};

const CarouselContext = createContext<CarouselContextType | null>(null);

const STORAGE_KEY = 'portal-carousel-config';

export function PortalCarouselProvider({ 
  children, 
  corretoraId, 
  availableModules,
  currentModule 
}: { 
  children: ReactNode;
  corretoraId: string;
  availableModules: PortalModule[];
  currentModule: PortalModule;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Carregar config do localStorage
  const [config, setConfig] = useState<CarouselConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaultConfig,
          ...parsed,
          // Filtrar módulos visíveis para apenas os disponíveis
          visibleModules: (parsed.visibleModules || defaultConfig.visibleModules)
            .filter((m: PortalModule) => availableModules.includes(m)),
        };
      }
    } catch (e) {
      console.error('Erro ao carregar config do carrossel:', e);
    }
    return {
      ...defaultConfig,
      visibleModules: availableModules,
    };
  });

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'left' | 'right'>('right');

  // Salvar config no localStorage quando mudar
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  // Módulos que serão efetivamente mostrados (interseção de visíveis e disponíveis)
  const activeModules = config.visibleModules.filter(m => availableModules.includes(m));

  const getModuleUrl = useCallback((module: PortalModule) => {
    switch (module) {
      case 'indicadores':
        return `/portal?associacao=${corretoraId}`;
      case 'eventos':
        return `/portal/sga-insights?associacao=${corretoraId}`;
      case 'mgf':
        return `/portal/mgf-insights?associacao=${corretoraId}`;
      case 'cobranca':
        return `/portal/cobranca-insights?associacao=${corretoraId}`;
      case 'estudo-base':
        return `/portal/estudo-base-insights?associacao=${corretoraId}`;
      case 'acompanhamento-eventos':
        return `/portal/acompanhamento-eventos?associacao=${corretoraId}`;
      case 'ouvidoria':
        return `/portal/ouvidoria?associacao=${corretoraId}`;
    }
  }, [corretoraId]);

  const navigateWithTransition = useCallback((targetModule: PortalModule, direction: 'left' | 'right') => {
    setTransitionDirection(direction);
    setIsTransitioning(true);
    
    // Pequeno delay para a animação de saída
    setTimeout(() => {
      navigate(getModuleUrl(targetModule));
      // Reset da transição após navegação
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 150);
  }, [navigate, getModuleUrl]);

  const goToNext = useCallback(() => {
    if (activeModules.length <= 1) return;
    
    const currentIndex = activeModules.indexOf(currentModule);
    const nextIndex = currentIndex >= activeModules.length - 1 ? 0 : currentIndex + 1;
    navigateWithTransition(activeModules[nextIndex], 'right');
  }, [activeModules, currentModule, navigateWithTransition]);

  const goToPrevious = useCallback(() => {
    if (activeModules.length <= 1) return;
    
    const currentIndex = activeModules.indexOf(currentModule);
    const prevIndex = currentIndex <= 0 ? activeModules.length - 1 : currentIndex - 1;
    navigateWithTransition(activeModules[prevIndex], 'left');
  }, [activeModules, currentModule, navigateWithTransition]);

  const goToModule = useCallback((module: PortalModule) => {
    if (module === currentModule) return;
    
    const currentIndex = activeModules.indexOf(currentModule);
    const targetIndex = activeModules.indexOf(module);
    const direction = targetIndex > currentIndex ? 'right' : 'left';
    
    navigateWithTransition(module, direction);
  }, [activeModules, currentModule, navigateWithTransition]);

  // Auto-rotação
  useEffect(() => {
    if (!config.enabled || activeModules.length <= 1) return;

    const timer = setInterval(() => {
      goToNext();
    }, config.interval * 1000);

    return () => clearInterval(timer);
  }, [config.enabled, config.interval, activeModules.length, goToNext]);

  const setEnabled = (enabled: boolean) => {
    setConfig(prev => ({ ...prev, enabled }));
  };

  const setIntervalValue = (interval: number) => {
    setConfig(prev => ({ ...prev, interval }));
  };

  const setVisibleModules = (modules: PortalModule[]) => {
    // Garantir que só inclua módulos disponíveis
    const filtered = modules.filter(m => availableModules.includes(m));
    setConfig(prev => ({ ...prev, visibleModules: filtered }));
  };

  return (
    <CarouselContext.Provider value={{
      config,
      setEnabled,
      setInterval: setIntervalValue,
      setVisibleModules,
      isTransitioning,
      transitionDirection,
      goToNext,
      goToPrevious,
      goToModule,
    }}>
      {children}
    </CarouselContext.Provider>
  );
}

export function usePortalCarousel() {
  const context = useContext(CarouselContext);
  if (!context) {
    throw new Error('usePortalCarousel must be used within PortalCarouselProvider');
  }
  return context;
}

// Hook para verificar se está dentro do provider (para componentes que podem não ter)
export function usePortalCarouselOptional() {
  return useContext(CarouselContext);
}
