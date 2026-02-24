import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useWhatsAppUnread() {
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCountRef = useRef(-1);
  const initialLoadDoneRef = useRef(false);

  const fetchUnread = useCallback(async () => {
    const { data } = await supabase
      .from('whatsapp_contacts')
      .select('unread_count')
      .gt('unread_count', 0);
    if (data) {
      const total = data.reduce((sum, c) => sum + (Number((c as any).unread_count) || 0), 0);

      if (initialLoadDoneRef.current && total > prevCountRef.current && prevCountRef.current >= 0) {
        toast.info('📩 Nova mensagem no WhatsApp', {
          description: 'Você recebeu uma nova mensagem na Central de Atendimento',
          duration: 5000,
        });
      }

      prevCountRef.current = total;
      setUnreadCount(total);
    } else {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    // Initial load (silent)
    const init = async () => {
      const { data } = await supabase
        .from('whatsapp_contacts')
        .select('unread_count')
        .gt('unread_count', 0);
      if (data) {
        const total = data.reduce((sum, c) => sum + (Number((c as any).unread_count) || 0), 0);
        prevCountRef.current = total;
        setUnreadCount(total);
      }
      initialLoadDoneRef.current = true;
    };
    init();

    // Realtime subscription
    const channel = supabase
      .channel('wa-unread-badge')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_contacts',
      }, () => {
        fetchUnread();
      })
      .subscribe();

    // Polling fallback every 10s in case realtime drops
    const pollInterval = setInterval(() => {
      fetchUnread();
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [fetchUnread]);

  return unreadCount;
}
