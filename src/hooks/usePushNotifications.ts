import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel('new_messages_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `destinatario_id=eq.${user.id}`,
        },
        (payload) => {
          toast({
            title: '📩 Nova Mensagem',
            description: `${payload.new.assunto}`,
          });
        }
      )
      .subscribe();

    // Subscribe to new pending users (for admin/superintendente/administrativo)
    const pendingUsersChannel = supabase
      .channel('new_pending_users_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profiles',
          filter: 'status=eq.pendente',
        },
        (payload) => {
          toast({
            title: '👤 Novo Usuário Pendente',
            description: `${payload.new.nome} solicitou aprovação de cadastro`,
          });
        }
      )
      .subscribe();

    // Subscribe to profile status changes (when user gets approved)
    const profileUpdatesChannel = supabase
      .channel('profile_updates_notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new.status === 'ativo' && payload.old.status === 'pendente') {
            toast({
              title: '✅ Cadastro Aprovado',
              description: 'Seu cadastro foi aprovado! Você já pode acessar todas as funcionalidades.',
            });
          }
        }
      )
      .subscribe();

    // Subscribe to new lembretes (calendar reminders)
    const lembretesChannel = supabase
      .channel('lembretes_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lembretes_disparados',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          // Busca os detalhes do evento
          const { data: evento } = await supabase
            .from('eventos')
            .select('titulo, data_inicio')
            .eq('id', payload.new.evento_id)
            .single();

          if (evento) {
            const dataEvento = new Date(evento.data_inicio);
            toast({
              title: '🔔 Lembrete de Evento',
              description: `${evento.titulo} às ${dataEvento.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
              duration: 10000,
            });

            // Tentar enviar notificação do navegador se permitido
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('🔔 Lembrete de Evento', {
                body: `${evento.titulo} às ${dataEvento.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
              });
            }
          }
        }
      )
      .subscribe();

    // Solicitar permissão para notificações do navegador
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(pendingUsersChannel);
      supabase.removeChannel(profileUpdatesChannel);
      supabase.removeChannel(lembretesChannel);
    };
  }, [user]);
}
