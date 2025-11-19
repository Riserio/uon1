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
    <div className="bg-background/50 backdrop-blur-sm border-b border-border/50">
      <div className="container mx-auto px-4 py-3">
        <ScrollArea className="w-full">
          <div className="flex items-center justify-center gap-1.5 pb-2">
            {fluxos.map((fluxo, index) => {
              const isActive = selectedFluxoId === fluxo.id;
              const isPassed = fluxos.findIndex(f => f.id === selectedFluxoId) > index;
              
              return (
                <div key={fluxo.id} className="flex items-center flex-shrink-0">
                  {index > 0 && (
                    <div className={cn(
                      "h-0.5 w-8 mx-1 transition-all duration-500",
                      isPassed || isActive ? "bg-primary" : "bg-border"
                    )} />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onFluxoSelect(fluxo.id)}
                    title={fluxo.descricao || fluxo.nome}
                    className={cn(
                      "relative h-8 px-4 rounded-full text-sm font-medium transition-all duration-300 hover:scale-105",
                      isActive && "bg-primary text-primary-foreground shadow-md scale-105",
                      isPassed && "bg-primary/15 text-primary"
                    )}
                  >
                    <span className="relative z-10">{fluxo.nome}</span>
                    {isActive && (
                      <div className="absolute inset-0 bg-primary rounded-full animate-pulse opacity-20" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}