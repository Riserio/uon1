import { Play, Pause, Settings, ChevronLeft, ChevronRight, Monitor, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { usePortalCarouselOptional } from "@/contexts/PortalCarouselContext";

type PortalModule = 'indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base';

type Props = {
  corretoraId: string;
  availableModules: PortalModule[];
  currentModule: PortalModule;
};

const MODULE_LABELS: Record<PortalModule, string> = {
  indicadores: 'Indicadores',
  eventos: 'Eventos',
  mgf: 'MGF',
  cobranca: 'Cobrança',
  'estudo-base': 'Estudo de Base',
};

export default function PortalCarouselControls({ corretoraId, availableModules, currentModule }: Props) {
  const carousel = usePortalCarouselOptional();

  // Se não está dentro do provider, não renderiza
  if (!carousel) return null;

  const { 
    config, 
    setEnabled, 
    setInterval, 
    setVisibleModules,
    goToNext, 
    goToPrevious, 
    goToModule 
  } = carousel;

  // Módulos ativos no carrossel (interseção de visíveis e disponíveis)
  const activeModules = config.visibleModules.filter(m => availableModules.includes(m));
  const currentModuleIndex = activeModules.indexOf(currentModule);

  if (availableModules.length <= 1) return null;

  const handleModuleToggle = (module: PortalModule, checked: boolean) => {
    if (checked) {
      // Adicionar módulo mantendo a ordem original
      const newModules = availableModules.filter(
        m => config.visibleModules.includes(m) || m === module
      );
      setVisibleModules(newModules);
    } else {
      // Remover módulo (manter pelo menos 2)
      const newModules = config.visibleModules.filter(m => m !== module);
      if (newModules.length >= 2) {
        setVisibleModules(newModules);
      }
    }
  };

  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1">
      {/* Navegação manual */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={goToPrevious}
        disabled={config.enabled || activeModules.length <= 1}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Indicadores de slide */}
      <div className="flex items-center gap-1 px-2">
        {activeModules.map((mod, idx) => (
          <button
            key={mod}
            onClick={() => !config.enabled && goToModule(mod)}
            disabled={config.enabled}
            title={MODULE_LABELS[mod]}
            className={`h-2 rounded-full transition-all duration-300 ${
              mod === currentModule 
                ? 'bg-primary w-4' 
                : 'bg-muted-foreground/30 w-2 hover:bg-muted-foreground/50'
            } ${config.enabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          />
        ))}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={goToNext}
        disabled={config.enabled || activeModules.length <= 1}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {/* Botão Play/Pause do carrossel */}
      <Button
        variant={config.enabled ? "default" : "outline"}
        size="sm"
        className="gap-1.5 ml-2"
        onClick={() => setEnabled(!config.enabled)}
        disabled={activeModules.length <= 1}
      >
        {config.enabled ? (
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
        <PopoverContent className="w-80" align="end">
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Modo Apresentação</span>
            </div>
            
            {/* Tempo por tela */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Tempo por tela</Label>
                <span className="text-sm font-medium text-primary">
                  {config.interval}s
                </span>
              </div>
              <Slider
                value={[config.interval]}
                onValueChange={([val]) => setInterval(val)}
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

            {/* Módulos a exibir */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Módulos no carrossel</Label>
              </div>
              <div className="space-y-2 pl-1">
                {availableModules.map((module) => {
                  const isVisible = config.visibleModules.includes(module);
                  const canDisable = config.visibleModules.filter(m => availableModules.includes(m)).length > 2;
                  
                  return (
                    <div key={module} className="flex items-center gap-2">
                      <Checkbox
                        id={`module-${module}`}
                        checked={isVisible}
                        onCheckedChange={(checked) => handleModuleToggle(module, !!checked)}
                        disabled={isVisible && !canDisable}
                      />
                      <Label 
                        htmlFor={`module-${module}`} 
                        className="text-sm cursor-pointer flex-1"
                      >
                        {MODULE_LABELS[module]}
                      </Label>
                      {module === currentModule && (
                        <span className="text-xs text-primary">(atual)</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Mínimo de 2 módulos para o carrossel funcionar.
              </p>
            </div>

            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Ideal para exibição em TVs. O carrossel alterna automaticamente entre os módulos selecionados.
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
