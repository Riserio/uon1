import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Fluxo {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string;
  ordem: number;
  ativo: boolean;
}

interface GestaoAssociacaoFluxoSelectorProps {
  corretoraId: string | null;
  selectedFluxoId: string | null;
  onFluxoSelect: (fluxoId: string | null) => void;
  onConfigureFluxos?: () => void;
  cardCounts?: Record<string, number>;
  refreshKey?: number;
}

export function GestaoAssociacaoFluxoSelector({
  corretoraId,
  selectedFluxoId,
  onFluxoSelect,
  onConfigureFluxos,
  cardCounts = {},
  refreshKey = 0,
}: GestaoAssociacaoFluxoSelectorProps) {
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadFluxos();
  }, [corretoraId, refreshKey]);

  const loadFluxos = async () => {
    if (!corretoraId) {
      setFluxos([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('gestao_associacao_fluxos')
        .select('*')
        .eq('corretora_id', corretoraId)
        .eq('ativo', true)
        .order('ordem');

      if (error) throw error;
      setFluxos(data || []);

      // Auto-select first fluxo if none selected
      if (!selectedFluxoId && data && data.length > 0) {
        onFluxoSelect(data[0].id);
      } else if (selectedFluxoId && data && !data.find(f => f.id === selectedFluxoId)) {
        // If selected fluxo no longer exists, select first
        onFluxoSelect(data && data.length > 0 ? data[0].id : null);
      }
    } catch (error) {
      console.error('Erro ao carregar fluxos:', error);
    }
  };

  const startScrolling = useCallback((direction: 'left' | 'right') => {
    if (scrollIntervalRef.current) return;
    scrollIntervalRef.current = setInterval(() => {
      if (containerRef.current) {
        containerRef.current.scrollLeft += direction === 'left' ? -10 : 10;
      }
    }, 20);
  }, []);

  const stopScrolling = useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
  }, []);

  if (!corretoraId) return null;

  if (fluxos.length === 0) {
    return (
      <div className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Workflow className="h-5 w-5" />
            <span className="text-sm">Nenhum fluxo configurado para esta associação</span>
          </div>
          {onConfigureFluxos && (
            <Button variant="outline" size="sm" onClick={onConfigureFluxos}>
              Configurar Fluxos
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-4 relative">
      <div
        className="absolute left-0 top-0 bottom-0 w-12 z-10 cursor-w-resize"
        onMouseEnter={() => startScrolling('left')}
        onMouseLeave={stopScrolling}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-12 z-10 cursor-e-resize"
        onMouseEnter={() => startScrolling('right')}
        onMouseLeave={stopScrolling}
      />

      <div
        ref={containerRef}
        className="overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex items-center gap-3 px-1 min-w-max">
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
                      style={{ color: isPassed || isActive ? fluxos[index - 1].cor : undefined }}
                    />
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full transition-all duration-300",
                        isPassed || isActive ? "bg-current scale-100" : "bg-border scale-75"
                      )}
                      style={{ color: isPassed || isActive ? fluxo.cor : undefined }}
                    />
                    <div
                      className={cn(
                        "h-[2px] w-8 transition-all duration-300",
                        isActive ? "bg-current" : "bg-border"
                      )}
                      style={{ color: isActive ? fluxo.cor : undefined }}
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
                      style={{ backgroundSize: '200% 100%', animation: 'shimmer 2s infinite' }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <div
                      className={cn("w-2 h-2 rounded-full transition-all", isActive && "animate-pulse")}
                      style={{ backgroundColor: isActive ? '#ffffff' : fluxo.cor }}
                    />
                    {fluxo.nome}
                    {cardCounts[fluxo.id] !== undefined && cardCounts[fluxo.id] > 0 && (
                      <span
                        className={cn(
                          "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold min-w-[18px] text-center",
                          isActive ? "bg-white/25 text-white" : "bg-primary/15 text-primary"
                        )}
                        style={{
                          backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : `${fluxo.cor}20`,
                          color: isActive ? '#ffffff' : fluxo.cor,
                        }}
                      >
                        {cardCounts[fluxo.id]}
                      </span>
                    )}
                  </span>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
