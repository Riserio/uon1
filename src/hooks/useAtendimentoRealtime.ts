import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseAtendimentoRealtimeProps {
  atendimentoId: string | null;
  onUpdate?: () => void;
}

export function useAtendimentoRealtime({ 
  atendimentoId, 
  onUpdate 
}: UseAtendimentoRealtimeProps) {
  useEffect(() => {
    if (!atendimentoId) return;

    console.log('🔄 Iniciando escuta realtime para atendimento:', atendimentoId);

    // Canal para escutar mudanças em vistorias vinculadas
    const vistoriasChannel = supabase
      .channel(`vistorias_atendimento_${atendimentoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vistorias',
          filter: `atendimento_id=eq.${atendimentoId}`,
        },
        (payload) => {
          console.log('📝 Vistoria atualizada:', payload);
          
          if (payload.eventType === 'UPDATE') {
            toast.info('Dados atualizados via vistoria', {
              description: 'O atendimento foi atualizado com informações da vistoria',
            });
          } else if (payload.eventType === 'INSERT') {
            toast.success('Nova vistoria vinculada', {
              description: 'Uma vistoria foi vinculada a este atendimento',
            });
          }
          
          onUpdate?.();
        }
      )
      .subscribe((status) => {
        console.log('📡 Status do canal vistorias:', status);
      });

    // Canal para escutar mudanças no próprio atendimento
    const atendimentoChannel = supabase
      .channel(`atendimento_${atendimentoId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'atendimentos',
          filter: `id=eq.${atendimentoId}`,
        },
        (payload) => {
          console.log('📋 Atendimento atualizado:', payload);
          onUpdate?.();
        }
      )
      .subscribe((status) => {
        console.log('📡 Status do canal atendimento:', status);
      });

    // Canal para escutar novo histórico
    const historicoChannel = supabase
      .channel(`historico_${atendimentoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'atendimentos_historico',
          filter: `atendimento_id=eq.${atendimentoId}`,
        },
        (payload) => {
          console.log('📜 Novo histórico registrado:', payload);
          
          const historico = payload.new as any;
          if (historico.acao?.includes('Vistoria')) {
            toast.info('Atualização registrada', {
              description: historico.acao,
            });
          }
          
          onUpdate?.();
        }
      )
      .subscribe((status) => {
        console.log('📡 Status do canal histórico:', status);
      });

    // Cleanup
    return () => {
      console.log('🛑 Removendo canais realtime');
      supabase.removeChannel(vistoriasChannel);
      supabase.removeChannel(atendimentoChannel);
      supabase.removeChannel(historicoChannel);
    };
  }, [atendimentoId, onUpdate]);
}
