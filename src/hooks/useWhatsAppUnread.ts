import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useWhatsAppUnread() {
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const loadUnread = async () => {
      const { data } = await supabase
        .from('whatsapp_contacts')
        .select('unread_count');
      if (data) {
        const total = data.reduce((sum, c) => sum + ((c as any).unread_count || 0), 0);
        
        // Show toast if count increased (new message arrived)
        if (total > prevCountRef.current && prevCountRef.current >= 0) {
          toast.info('📩 Nova mensagem no WhatsApp', {
            description: 'Você recebeu uma nova mensagem na Central de Atendimento',
            duration: 5000,
          });
        }
        
        prevCountRef.current = total;
        setUnreadCount(total);
      }
    };

    // Initial load without toast
    const initialLoad = async () => {
      const { data } = await supabase
        .from('whatsapp_contacts')
        .select('unread_count');
      if (data) {
        const total = data.reduce((sum, c) => sum + ((c as any).unread_count || 0), 0);
        prevCountRef.current = total;
        setUnreadCount(total);
      }
    };

    initialLoad();

    const channel = supabase
      .channel('wa-unread-badge')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_contacts',
      }, () => {
        loadUnread();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return unreadCount;
}
