import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Fluxo {
  id: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  cor: string;
}

interface FluxoSelectorProps {
  selectedFluxoId: string | null;
  onFluxoSelect: (fluxoId: string | null) => void;
  onConfigureFluxos: () => void;
}

export function FluxoSelector({ selectedFluxoId, onFluxoSelect, onConfigureFluxos }: FluxoSelectorProps) {
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);

  useEffect(() => {
    loadFluxos();
  }, []);

  const loadFluxos = async () => {
    try {
      const { data, error } = await supabase
        .from('fluxos')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (error) throw error;
      setFluxos(data || []);

      // Auto-select first fluxo on initial load
      if (!selectedFluxoId && data && data.length > 0) {
        onFluxoSelect(data[0].id);
      }
    } catch (error: any) {
      console.error('Erro ao carregar fluxos:', error);
    }
  };

  if (fluxos.length === 0) {
    return (
      <div className="bg-card border-b border-border py-3 px-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Workflow className="h-5 w-5" />
            <span className="text-sm">Nenhum fluxo configurado</span>
          </div>
          <Button variant="outline" size="sm" onClick={onConfigureFluxos}>
            Configurar Fluxos
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-4">
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex items-center gap-3 px-1">
        {fluxos.map((fluxo, index) => {
          const isActive = selectedFluxoId === fluxo.id;
          const isPassed = fluxos.findIndex(f => f.id === selectedFluxoId) > index;
          
          return (
            <div key={fluxo.id} className="flex items-center">
              {index > 0 && (
                <div className="flex items-center gap-1 mx-2">
                  <div 
                    className={cn(
                      "h-[2px] w-8 transition-all duration-300",
                      isPassed || isActive ? "bg-current" : "bg-border"
                    )}
                    style={{ 
                      color: isPassed || isActive ? fluxos[index - 1].cor : undefined 
                    }}
                  />
                  <div 
                    className={cn(
                      "w-2 h-2 rounded-full transition-all duration-300",
                      isPassed || isActive ? "bg-current scale-100" : "bg-border scale-75"
                    )}
                    style={{ 
                      color: isPassed || isActive ? fluxo.cor : undefined 
                    }}
                  />
                  <div 
                    className={cn(
                      "h-[2px] w-8 transition-all duration-300",
                      isActive ? "bg-current" : "bg-border"
                    )}
                    style={{ 
                      color: isActive ? fluxo.cor : undefined 
                    }}
                  />
                </div>
              )}
              <Button
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => onFluxoSelect(fluxo.id)}
                title={fluxo.descricao || fluxo.nome}
                className={cn(
                  "h-10 px-6 rounded-full font-medium transition-all whitespace-nowrap relative overflow-hidden group",
                  isActive && "shadow-lg border-2",
                  isPassed && !isActive && "border-2 bg-opacity-10"
                )}
                style={{
                  backgroundColor: isActive ? fluxo.cor : isPassed ? `${fluxo.cor}15` : undefined,
                  borderColor: (isActive || isPassed) ? fluxo.cor : undefined,
                  color: isActive ? '#ffffff' : isPassed ? fluxo.cor : undefined,
                }}
              >
                {isActive && (
                  <div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
                    style={{ 
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 2s infinite'
                    }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <div 
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      isActive && "animate-pulse"
                    )}
                    style={{ 
                      backgroundColor: isActive ? '#ffffff' : fluxo.cor 
                    }}
                  />
                  {fluxo.nome}
                </span>
              </Button>
            </div>
          );
        })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}