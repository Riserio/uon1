import { useState, useEffect, useCallback } from "react";
import { Play, Pause, Settings, ChevronLeft, ChevronRight, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";

type PortalModule = 'indicadores' | 'eventos' | 'mgf' | 'cobranca';

type Props = {
  corretoraId: string;
  availableModules: PortalModule[];
  currentModule: PortalModule;
};

export default function PortalCarouselControls({ corretoraId, availableModules, currentModule }: Props) {
  const navigate = useNavigate();
  const [carouselEnabled, setCarouselEnabled] = useState(false);
  const [carouselInterval, setCarouselInterval] = useState(30);

  const currentModuleIndex = availableModules.indexOf(currentModule);

  const getModuleUrl = (module: PortalModule) => {
    switch (module) {
      case 'indicadores':
        return `/portal?associacao=${corretoraId}`;
      case 'eventos':
        return `/portal/sga-insights?associacao=${corretoraId}`;
      case 'mgf':
        return `/portal/mgf-insights?associacao=${corretoraId}`;
      case 'cobranca':
        return `/portal/cobranca-insights?associacao=${corretoraId}`;
    }
  };

  const nextModule = useCallback(() => {
    const nextIndex = currentModuleIndex >= availableModules.length - 1 ? 0 : currentModuleIndex + 1;
    const nextMod = availableModules[nextIndex];
    navigate(getModuleUrl(nextMod));
  }, [currentModuleIndex, availableModules, navigate, corretoraId]);

  const previousModule = useCallback(() => {
    const prevIndex = currentModuleIndex <= 0 ? availableModules.length - 1 : currentModuleIndex - 1;
    const prevMod = availableModules[prevIndex];
    navigate(getModuleUrl(prevMod));
  }, [currentModuleIndex, availableModules, navigate, corretoraId]);

  // Auto-rotação do carrossel
  useEffect(() => {
    if (!carouselEnabled || availableModules.length <= 1) return;

    const timer = setInterval(() => {
      nextModule();
    }, carouselInterval * 1000);

    return () => clearInterval(timer);
  }, [carouselEnabled, carouselInterval, nextModule, availableModules.length]);

  if (availableModules.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1">
      {/* Navegação manual */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={previousModule}
        disabled={carouselEnabled}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Indicadores de slide */}
      <div className="flex items-center gap-1 px-2">
        {availableModules.map((mod, idx) => (
          <button
            key={mod}
            onClick={() => !carouselEnabled && navigate(getModuleUrl(mod))}
            className={`h-2 rounded-full transition-all ${
              idx === currentModuleIndex 
                ? 'bg-primary w-4' 
                : 'bg-muted-foreground/30 w-2 hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={nextModule}
        disabled={carouselEnabled}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {/* Botão Play/Pause do carrossel */}
      <Button
        variant={carouselEnabled ? "default" : "outline"}
        size="sm"
        className="gap-1.5 ml-2"
        onClick={() => setCarouselEnabled(!carouselEnabled)}
      >
        {carouselEnabled ? (
          <>
            <Pause className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Pausar</span>
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Auto</span>
          </>
        )}
      </Button>

      {/* Configurações do carrossel */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Modo Apresentação</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Tempo por tela</Label>
                <span className="text-sm font-medium text-primary">
                  {carouselInterval}s
                </span>
              </div>
              <Slider
                value={[carouselInterval]}
                onValueChange={([val]) => setCarouselInterval(val)}
                min={10}
                max={120}
                step={5}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>10s</span>
                <span>60s</span>
                <span>120s</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Ideal para exibição em TVs. O carrossel alterna automaticamente entre os módulos.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
