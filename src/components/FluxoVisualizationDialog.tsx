import { useState, useEffect } from 'react';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowRight, Circle, CheckCircle2, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Fluxo {
  id: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  gera_proximo_automatico: boolean;
  proximo_fluxo_id: string | null;
}

interface StatusConfig {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  fluxo_id: string | null;
  prazo_horas: number;
}

interface FluxoVisualizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FluxoVisualizationDialog({ open, onOpenChange }: FluxoVisualizationDialogProps) {
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [statusConfigs, setStatusConfigs] = useState<StatusConfig[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load fluxos
      const { data: fluxosData, error: fluxosError } = await supabase
        .from('fluxos')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (fluxosError) throw fluxosError;

      // Load status configs
      const { data: statusData, error: statusError } = await supabase
        .from('status_config')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (statusError) throw statusError;

      setFluxos(fluxosData || []);
      setStatusConfigs(statusData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusForFluxo = (fluxoId: string) => {
    return statusConfigs.filter(s => s.fluxo_id === fluxoId);
  };

  const getNextFluxo = (fluxoId: string) => {
    const fluxo = fluxos.find(f => f.id === fluxoId);
    if (fluxo?.gera_proximo_automatico && fluxo.proximo_fluxo_id) {
      return fluxos.find(f => f.id === fluxo.proximo_fluxo_id);
    }
    return null;
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Visualização Completa do Fluxo</DialogTitle>
          <DialogDescription>
            Visualize todos os fluxos e seus status de forma completa
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Carregando...</div>
          </div>
        ) : (
          <ScrollArea className="h-[calc(90vh-120px)]">
            <div className="space-y-8 p-6">
              {fluxos.map((fluxo, index) => {
                const statuses = getStatusForFluxo(fluxo.id);
                const nextFluxo = getNextFluxo(fluxo.id);

                return (
                  <div key={fluxo.id} className="space-y-4">
                    {/* Fluxo Header */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-bold">{index + 1}</span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{fluxo.nome}</h3>
                          {fluxo.descricao && (
                            <p className="text-sm text-muted-foreground">{fluxo.descricao}</p>
                          )}
                        </div>
                      </div>
                      {fluxo.gera_proximo_automatico && nextFluxo && (
                        <div className="flex items-center gap-2 ml-auto text-sm text-muted-foreground">
                          <Link2 className="h-4 w-4 text-primary" />
                          <span>Gera automaticamente próximo fluxo</span>
                        </div>
                      )}
                    </div>

                    {/* Status Columns */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pl-12">
                      {statuses.length > 0 ? (
                        statuses.map((status, statusIndex) => (
                          <div key={status.id} className="relative">
                            <div
                              className={cn(
                                "p-4 rounded-lg border-2 transition-all",
                                "bg-card hover:shadow-md"
                              )}
                              style={{ borderColor: status.cor }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                {statusIndex === statuses.length - 1 ? (
                                  <CheckCircle2 className="h-5 w-5" style={{ color: status.cor }} />
                                ) : (
                                  <Circle className="h-5 w-5" style={{ color: status.cor }} />
                                )}
                                <span className="font-medium">{status.nome}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Prazo: {status.prazo_horas || 24}h
                              </div>
                            </div>
                            {statusIndex < statuses.length - 1 && (
                              <div className="absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full text-center text-muted-foreground py-8">
                          Nenhum status configurado para este fluxo
                        </div>
                      )}
                    </div>

                    {/* Arrow to next fluxo */}
                    {nextFluxo && (
                      <div className="flex items-center justify-center py-4">
                        <div className="flex flex-col items-center gap-2">
                          <ArrowRight className="h-8 w-8 text-primary rotate-90" />
                          <span className="text-sm text-muted-foreground font-medium">
                            Próximo Fluxo: {nextFluxo.nome}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Divider */}
                    {index < fluxos.length - 1 && !nextFluxo && (
                      <div className="border-t border-border mt-8" />
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
