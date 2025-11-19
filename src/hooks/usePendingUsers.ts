import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function usePendingUsers() {
  const { userRole } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (userRole !== 'admin' && userRole !== 'superintendente' && userRole !== 'administrativo') {
      setPendingCount(0);
      return;
    }

    fetchPendingCount();

    // Subscribe to changes
    const channel = supabase
      .channel('profiles_pending')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          fetchPendingCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRole]);

  const fetchPendingCount = async () => {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendente');

    if (!error) {
      setPendingCount(count || 0);
    }
  };

  return pendingCount;
}
