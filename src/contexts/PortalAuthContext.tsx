import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface PortalAuthContextType {
  token: string | null;
  corretora: {
    id: string;
    nome: string;
    slug: string;
  } | null;
  login: (token: string, corretora: any) => void;
  logout: () => void;
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

  const login = (newToken: string, corretoraData: any) => {
    setToken(newToken);
    setCorretora(corretoraData);
    localStorage.setItem('portal_token', newToken);
    localStorage.setItem('portal_corretora', JSON.stringify(corretoraData));
  };

  const logout = () => {
    setToken(null);
    setCorretora(null);
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_corretora');
  };

  return (
    <PortalAuthContext.Provider value={{ token, corretora, login, logout }}>
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
