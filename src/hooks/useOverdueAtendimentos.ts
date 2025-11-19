import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OverdueAtendimento {
  id: string;
  assunto: string;
  status: string;
  horasVencidas: number;
}

export function useOverdueAtendimentos() {
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueList, setOverdueList] = useState<OverdueAtendimento[]>([]);
  const [loading, setLoading] = useState(true);

  const checkOverdue = async () => {
    try {
      // Buscar configurações de status (apenas não finalizados)
      const { data: statusConfigs, error: statusError } = await supabase
        .from('status_config')
        .select('nome, prazo_horas, is_final')
        .gt('prazo_horas', 0)
        .eq('ativo', true)
        .eq('is_final', false);

      if (statusError) throw statusError;

      if (!statusConfigs || statusConfigs.length === 0) {
        setOverdueCount(0);
        setOverdueList([]);
        setLoading(false);
        return;
      }

      // Buscar atendimentos não arquivados
      const { data: atendimentos, error: atendError } = await supabase
        .from('atendimentos')
        .select('id, assunto, status, status_changed_at')
        .eq('arquivado', false);

      if (atendError) throw atendError;

      const now = new Date();
      const overdue: OverdueAtendimento[] = [];

      atendimentos?.forEach((atendimento) => {
        const statusConfig = statusConfigs.find(sc => sc.nome === atendimento.status);
        if (!statusConfig) return;

        const statusChangedAt = new Date(atendimento.status_changed_at);
        const horasPassadas = (now.getTime() - statusChangedAt.getTime()) / (1000 * 60 * 60);
        
        if (horasPassadas > statusConfig.prazo_horas) {
          overdue.push({
            id: atendimento.id,
            assunto: atendimento.assunto,
            status: atendimento.status,
            horasVencidas: Math.floor(horasPassadas - statusConfig.prazo_horas),
          });
        }
      });

      setOverdueCount(overdue.length);
      setOverdueList(overdue);
    } catch (error) {
      console.error('Erro ao verificar prazos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkOverdue();
    
    // Verificar a cada 5 minutos
    const interval = setInterval(checkOverdue, 5 * 60 * 1000);

    // Subscribe to real-time changes for atendimentos
    const atendimentosChannel = supabase
      .channel('overdue_atendimentos_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'atendimentos',
        },
        () => {
          checkOverdue();
        }
      )
      .subscribe();

    // Subscribe to real-time changes for status_config
    const statusConfigChannel = supabase
      .channel('overdue_status_config_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'status_config',
        },
        () => {
          checkOverdue();
        }
      )
      .subscribe();
    
    return () => {
      clearInterval(interval);
      supabase.removeChannel(atendimentosChannel);
      supabase.removeChannel(statusConfigChannel);
    };
  }, []);

  return {
    overdueCount,
    overdueList,
    loading,
    refresh: checkOverdue,
  };
}
