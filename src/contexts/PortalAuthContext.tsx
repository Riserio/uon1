import { createContext, useContext, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type MenuPosition = 'inferior' | 'vertical';

interface PortalAuthContextType {
  token: string | null;
  corretora: {
    id: string;
    nome: string;
    slug: string;
  } | null;
  userId: string | null;
  menuPosition: MenuPosition;
  login: (token: string, corretora: any, extras?: { userId?: string; menu_position?: MenuPosition }) => void;
  logout: () => void;
  setMenuPosition: (value: MenuPosition) => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextType | undefined>(undefined);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => 
    localStorage.getItem('portal_token')
  );
  const [corretora, setCorretora] = useState<any>(() => {
    const stored = localStorage.getItem('portal_corretora');
    return stored ? JSON.parse(stored) : null;
  });
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem('portal_user_id'));
  const [menuPosition, setMenuPositionState] = useState<MenuPosition>(() => {
    const stored = localStorage.getItem('portal_menu_position');
    return (stored === 'vertical' ? 'vertical' : 'inferior');
  });

  const login = (
    newToken: string,
    corretoraData: any,
    extras?: { userId?: string; menu_position?: MenuPosition }
  ) => {
    setToken(newToken);
    setCorretora(corretoraData);
    localStorage.setItem('portal_token', newToken);
    localStorage.setItem('portal_corretora', JSON.stringify(corretoraData));
    if (extras?.userId) {
      setUserId(extras.userId);
      localStorage.setItem('portal_user_id', extras.userId);
    }
    const pos: MenuPosition = extras?.menu_position === 'vertical' ? 'vertical' : 'inferior';
    setMenuPositionState(pos);
    localStorage.setItem('portal_menu_position', pos);
  };

  const logout = () => {
    setToken(null);
    setCorretora(null);
    setUserId(null);
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_corretora');
    localStorage.removeItem('portal_user_id');
    localStorage.removeItem('portal_menu_position');
  };

  const setMenuPosition = async (value: MenuPosition) => {
    setMenuPositionState(value);
    localStorage.setItem('portal_menu_position', value);
    if (!token) return;
    try {
      await supabase.functions.invoke('portal-auth/preferencia-menu', {
        body: { menu_position: value },
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.error('Falha ao salvar menu_position', e);
    }
  };

  return (
    <PortalAuthContext.Provider value={{ token, corretora, userId, menuPosition, login, logout, setMenuPosition }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const context = useContext(PortalAuthContext);
  if (!context) {
    throw new Error('usePortalAuth must be used within PortalAuthProvider');
  }
  return context;
}
