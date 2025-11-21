import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface MenuPermission {
  menu_item: string;
  pode_visualizar: boolean;
  pode_editar: boolean;
}

export function useMenuPermissions(userId: string | undefined) {
  const [permissions, setPermissions] = useState<Record<string, MenuPermission>>({});
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    loadPermissions();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('user_menu_permissions_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_menu_permissions',
        filter: `user_id=eq.${userId}`,
      }, () => {
        loadPermissions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const loadPermissions = async () => {
    if (!userId) return;

    try {
      // Carregar role do usuário
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      setUserRole(roleData?.role || null);

      // Superintendente e admin têm acesso total - não precisa verificar permissões
      if (roleData?.role === 'superintendente' || roleData?.role === 'admin') {
        setPermissions({});
        setLoading(false);
        return;
      }

      // Carregar permissões específicas
      const { data: permissionsData, error } = await supabase
        .from('user_menu_permissions')
        .select('menu_item, pode_visualizar, pode_editar')
        .eq('user_id', userId);

      if (error) throw error;

      const permissionsMap: Record<string, MenuPermission> = {};
      (permissionsData || []).forEach((perm) => {
        permissionsMap[perm.menu_item] = {
          menu_item: perm.menu_item,
          pode_visualizar: perm.pode_visualizar,
          pode_editar: perm.pode_editar,
        };
      });

      setPermissions(permissionsMap);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
    } finally {
      setLoading(false);
    }
  };

  const canViewMenu = (menuItem: string): boolean => {
    // Superintendente e admin têm acesso total
    if (userRole === 'superintendente' || userRole === 'admin') {
      return true;
    }

    // Se não há permissões definidas, permitir (comportamento padrão)
    if (Object.keys(permissions).length === 0) {
      return true;
    }

    // Verificar permissão específica
    const permission = permissions[menuItem];
    return permission ? permission.pode_visualizar : true;
  };

  const canEditMenu = (menuItem: string): boolean => {
    // Superintendente e admin têm acesso total
    if (userRole === 'superintendente' || userRole === 'admin') {
      return true;
    }

    // Se não há permissões definidas, permitir (comportamento padrão)
    if (Object.keys(permissions).length === 0) {
      return true;
    }

    // Verificar permissão específica
    const permission = permissions[menuItem];
    return permission ? permission.pode_editar : true;
  };

  return {
    permissions,
    loading,
    userRole,
    canViewMenu,
    canEditMenu,
  };
}
