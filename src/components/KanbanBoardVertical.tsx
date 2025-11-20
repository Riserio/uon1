import { useState, useEffect } from 'react';
import { Atendimento } from '@/types/atendimento';
import { AtendimentoCard } from './AtendimentoCard';
import { supabase } from '@/integrations/supabase/client';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StatusConfig {
  id: string;
  nome: string;
  cor: string;
  prazo_horas: number;
  ordem: number;
  fluxo_id: string | null;
}

interface KanbanBoardVerticalProps {
  atendimentos: Atendimento[];
  onUpdateStatus: (id: string, newStatus: string) => void;
  onEdit: (atendimento: Atendimento) => void;
  onDelete: (id: string) => void;
  onArquivar: (id: string) => void;
  onViewAndamentos?: (atendimento: Atendimento) => void;
  statusPrazo: Record<string, number>;
  selectedFluxoId: string | null;
}

export function KanbanBoardVertical({ 
  atendimentos, 
  onUpdateStatus, 
  onEdit, 
  onDelete, 
  onArquivar, 
  onViewAndamentos, 
  statusPrazo,
  selectedFluxoId 
}: KanbanBoardVerticalProps) {
  const [columns, setColumns] = useState<StatusConfig[]>([]);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  useEffect(() => {
    loadColumns();

    const channel = supabase
      .channel('kanban_status_config_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'status_config',
        },
        () => {
          loadColumns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedFluxoId]);

  const loadColumns = async () => {
    try {
      let query = supabase
        .from('status_config')
        .select('*')
        .eq('ativo', true);

      if (selectedFluxoId) {
        query = query.eq('fluxo_id', selectedFluxoId);
      }

      const { data, error } = await query.order('ordem');

      if (error) throw error;
      setColumns(data || []);
    } catch (error) {
      console.error('Erro ao carregar colunas:', error);
    }
  };

  const handleDragStart = (id: string) => {
    setDraggedItem(id);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const handleDrop = (status: string) => {
    if (draggedItem) {
      onUpdateStatus(draggedItem, status);
      setDraggedItem(null);
    }
  };

  return (
    <div className="space-y-6">
      {columns.map((column, index) => {
        const columnAtendimentos = atendimentos.filter((a) => a.status === column.nome);
        const isFirst = index === 0;
        const isLast = index === columns.length - 1;
        
        return (
          <div key={column.id} className="relative">
            {/* Status Header com linha conectora */}
            <div className="flex items-center gap-4 mb-4">
              {/* Indicador de status */}
              <div className="relative flex items-center">
                {!isFirst && (
                  <div 
                    className="absolute bottom-full left-1/2 -translate-x-1/2 w-[2px] h-6 bg-border"
                  />
                )}
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg relative z-10"
                  style={{ 
                    backgroundColor: column.cor,
                  }}
                >
                  <span className="text-white font-bold text-sm">{columnAtendimentos.length}</span>
                </div>
                {!isLast && (
                  <div 
                    className="absolute top-full left-1/2 -translate-x-1/2 w-[2px] h-6 bg-border"
                  />
                )}
              </div>

              {/* Nome e contador */}
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-foreground">{column.nome}</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                    {columnAtendimentos.length} {columnAtendimentos.length === 1 ? 'item' : 'itens'}
                  </span>
                </div>
              </div>

              {/* Botão de adicionar */}
              <Button 
                variant="outline" 
                size="sm"
                className="gap-2"
                onClick={() => {
                  // Trigger new atendimento with this status
                }}
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>

            {/* Drop Zone e Cards */}
            <div
              className={cn(
                "min-h-[100px] rounded-xl border-2 border-dashed transition-all duration-200",
                draggedItem && "border-primary/50 bg-primary/5",
                !draggedItem && "border-border bg-muted/20"
              )}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(column.nome);
              }}
            >
              {columnAtendimentos.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                  Nenhum atendimento neste status
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                  {columnAtendimentos.map((atendimento) => (
                    <AtendimentoCard
                      key={atendimento.id}
                      atendimento={atendimento}
                      statusPrazo={statusPrazo[atendimento.status] || 0}
                      onDragStart={() => handleDragStart(atendimento.id)}
                      onDragEnd={handleDragEnd}
                      onEdit={() => onEdit(atendimento)}
                      onDelete={() => onDelete(atendimento.id)}
                      onArquivar={() => onArquivar(atendimento.id)}
                      onViewAndamentos={onViewAndamentos ? () => onViewAndamentos(atendimento) : undefined}
                      isDragging={draggedItem === atendimento.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
