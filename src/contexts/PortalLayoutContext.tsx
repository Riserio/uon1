import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type CorretoraComModulos = {
  id: string;
  nome: string;
  logo_url?: string | null;
  modulos_bi: string[];
  acesso_ouvidoria?: boolean;
};

interface PortalLayoutContextType {
  corretora: CorretoraComModulos | null;
  corretorasDisponiveis: CorretoraComModulos[];
  loading: boolean;
  notLinked: boolean;
  showSelection: boolean;
  handleSelectCorretora: (c: CorretoraComModulos) => void;
  handleChangeCorretora: () => void;
  handleLogout: () => void;
}

const PortalLayoutContext = createContext<PortalLayoutContextType | null>(null);

export function usePortalLayout() {
  const ctx = useContext(PortalLayoutContext);
  if (!ctx) throw new Error("usePortalLayout must be used within PortalLayoutProvider");
  return ctx;
}

export function usePortalLayoutOptional() {
  return useContext(PortalLayoutContext);
}

export function PortalLayoutProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [corretora, setCorretora] = useState<CorretoraComModulos | null>(null);
  const [corretorasDisponiveis, setCorretorasDisponiveis] = useState<CorretoraComModulos[]>([]);
  const [showSelection, setShowSelection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);

  useEffect(() => {
    async function loadCorretoraData() {
      if (authLoading) return;
      if (!user) { navigate("/auth", { replace: true }); return; }

      try {
        const { data, error } = await supabase
          .from("corretora_usuarios")
          .select("corretora_id, modulos_bi, acesso_ouvidoria, corretoras(id, nome, logo_url)")
          .eq("profile_id", user.id)
          .eq("ativo", true);

        if (error || !data || data.length === 0) {
          setNotLinked(true);
          setLoading(false);
          return;
        }

        const validas: CorretoraComModulos[] = data
          .filter(item => item.corretoras)
          .map(item => {
            const baseModulos = item.modulos_bi || ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base'];
            const modulos = item.acesso_ouvidoria ? [...baseModulos, 'ouvidoria'] : baseModulos;
            return {
              ...(item.corretoras as any),
              modulos_bi: modulos,
              acesso_ouvidoria: item.acesso_ouvidoria || false,
            };
          });

        if (validas.length === 0) {
          setNotLinked(true);
          setLoading(false);
          return;
        }

        setCorretorasDisponiveis(validas);

        const associacaoParam = searchParams.get("associacao");
        if (associacaoParam) {
          const found = validas.find(c => c.id === associacaoParam);
          if (found) {
            setCorretora(found);
            setLoading(false);
            return;
          }
        }

        if (validas.length === 1) {
          setCorretora(validas[0]);
        } else {
          setShowSelection(true);
        }
      } catch (error) {
        console.error("Erro ao carregar dados da corretora:", error);
        setNotLinked(true);
      } finally {
        setLoading(false);
      }
    }

    loadCorretoraData();
  }, [user, authLoading, navigate, searchParams]);

  const handleSelectCorretora = (selected: CorretoraComModulos) => {
    setCorretora(selected);
    setShowSelection(false);
  };

  const handleChangeCorretora = () => {
    setCorretora(null);
    setShowSelection(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <PortalLayoutContext.Provider value={{
      corretora,
      corretorasDisponiveis,
      loading,
      notLinked,
      showSelection,
      handleSelectCorretora,
      handleChangeCorretora,
      handleLogout,
    }}>
      {children}
    </PortalLayoutContext.Provider>
  );
}
