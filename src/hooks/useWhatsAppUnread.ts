import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useWhatsAppUnread() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const loadUnread = async () => {
      const { data } = await supabase
        .from('whatsapp_contacts')
        .select('unread_count');
      if (data) {
        const total = data.reduce((sum, c) => sum + ((c as any).unread_count || 0), 0);
        setUnreadCount(total);
      }
    };

    loadUnread();

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
