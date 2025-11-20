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
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex items-center gap-2 px-1 py-2">
        {fluxos.map((fluxo, index) => {
          const isActive = selectedFluxoId === fluxo.id;
          const isPassed = fluxos.findIndex(f => f.id === selectedFluxoId) > index;
          
          return (
            <div key={fluxo.id} className="flex items-center">
              {index > 0 && (
                <div className={cn(
                  "h-[2px] w-12 mx-2 transition-colors",
                  isPassed || isActive ? "bg-primary" : "bg-border"
                )} />
              )}
              <Button
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => onFluxoSelect(fluxo.id)}
                title={fluxo.descricao || fluxo.nome}
                className={cn(
                  "h-9 px-6 rounded-full font-medium transition-all whitespace-nowrap",
                  isActive && "shadow-md",
                  isPassed && !isActive && "border-primary text-primary bg-primary/5"
                )}
              >
                {fluxo.nome}
              </Button>
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}