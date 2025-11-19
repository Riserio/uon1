import { useState, useEffect } from 'react';
import { Atendimento, StatusType } from '@/types/atendimento';
import { KanbanColumn } from './KanbanColumn';
import { AtendimentoCard } from './AtendimentoCard';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface StatusConfig {
  id: string;
  nome: string;
  cor: string;
  prazo_horas: number;
  ordem: number;
  fluxo_id: string | null;
}

interface KanbanBoardProps {
  atendimentos: Atendimento[];
  onUpdateStatus: (id: string, newStatus: string) => void;
  onEdit: (atendimento: Atendimento) => void;
  onDelete: (id: string) => void;
  onArquivar: (id: string) => void;
  onViewAndamentos?: (atendimento: Atendimento) => void;
  statusPrazo: Record<string, number>;
  selectedFluxoId: string | null;
}

export function KanbanBoard({ atendimentos, onUpdateStatus, onEdit, onDelete, onArquivar, onViewAndamentos, statusPrazo, selectedFluxoId }: KanbanBoardProps) {
  const [columns, setColumns] = useState<StatusConfig[]>([]);

  useEffect(() => {
    loadColumns();

    // Subscribe to real-time updates for status_config
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

      // Filter by fluxo_id if selected
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
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

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

  const needsScroll = columns.length > 4;

  return (
    <ScrollArea className={needsScroll ? "w-full" : ""}>
      <div 
        className={`flex gap-4 lg:gap-6 ${
          needsScroll ? 'min-w-max pb-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
        }`}
        style={needsScroll ? { minWidth: `${columns.length * 320}px` } : {}}
      >
        {columns.map((column) => {
          const columnAtendimentos = atendimentos.filter((a) => a.status === column.nome);
          
          return (
            <div key={column.id} className={needsScroll ? 'w-80 flex-shrink-0' : ''}>
              <KanbanColumn
                title={column.nome}
                count={columnAtendimentos.length}
                color={column.cor}
                onDrop={() => handleDrop(column.nome)}
              >
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
              </KanbanColumn>
            </div>
          );
        })}
      </div>
      {needsScroll && <ScrollBar orientation="horizontal" />}
    </ScrollArea>
  );
}
