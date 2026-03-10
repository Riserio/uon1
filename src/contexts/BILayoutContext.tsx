import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getCachedAssociacoes, setCachedAssociacoes } from "@/hooks/useBIGlobalCache";
import { toast } from "sonner";

interface BIHeaderDynamic {
  recordCount?: number;
  hasActiveFilters?: boolean;
  fileName?: string;
}

interface BILayoutContextType {
  associacoes: { id: string; nome: string; slug?: string | null }[];
  selectedAssociacao: string;
  setSelectedAssociacao: (id: string) => void;
  loadingAssociacoes: boolean;
  canViewAdmin: boolean;
  canViewHistorico: boolean;
  isAdminView: boolean;
  // Dynamic header props set by child pages
  headerDynamic: BIHeaderDynamic;
  setHeaderDynamic: (d: BIHeaderDynamic) => void;
  historicoDialogOpen: boolean;
  setHistoricoDialogOpen: (v: boolean) => void;
}

const BILayoutContext = createContext<BILayoutContextType | null>(null);

export function useBILayout() {
  const ctx = useContext(BILayoutContext);
  if (!ctx) throw new Error("useBILayout must be used within BILayoutProvider");
  return ctx;
}

export function useBILayoutOptional() {
  return useContext(BILayoutContext);
}

export function BILayoutProvider({ children }: { children: ReactNode }) {
  const { userRole } = useAuth();
  const [searchParams] = useSearchParams();
  const [associacoes, setAssociacoes] = useState<any[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState<string>("");
  const [loadingAssociacoes, setLoadingAssociacoes] = useState(true);
  const [headerDynamic, setHeaderDynamic] = useState<BIHeaderDynamic>({});
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);

  const canViewAdmin = userRole === "superintendente" || userRole === "administrativo";
  const canViewHistorico = userRole === "superintendente" || userRole === "admin";
  const isAdminView = selectedAssociacao === "__admin__";
  const adminDefaultAppliedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchAssociacoes() {
      try {
        const cached = getCachedAssociacoes();
        const associacaoParam = searchParams.get("associacao") || searchParams.get("corretora");

        if (cached && cached.length > 0) {
          setAssociacoes(cached);
          if (associacaoParam && cached.some(c => c.id === associacaoParam)) {
            setSelectedAssociacao(associacaoParam);
          } else if (canViewAdmin && !adminDefaultAppliedRef.current) {
            setSelectedAssociacao("__admin__");
            adminDefaultAppliedRef.current = true;
          } else if (!adminDefaultAppliedRef.current && !selectedAssociacao) {
            setSelectedAssociacao(cached[0].id);
          }
          setLoadingAssociacoes(false);
        }

        const { data, error } = await supabase.from("corretoras").select("id, nome, slug").order("nome");
        if (cancelled) return;
        if (error) throw error;
        setAssociacoes(data || []);
        setCachedAssociacoes(data || []);

        if (!cached || cached.length === 0) {
          if (associacaoParam && data?.some(c => c.id === associacaoParam)) {
            setSelectedAssociacao(associacaoParam);
          } else if (canViewAdmin && !adminDefaultAppliedRef.current) {
            setSelectedAssociacao("__admin__");
            adminDefaultAppliedRef.current = true;
          } else if (!adminDefaultAppliedRef.current && data && data.length > 0) {
            setSelectedAssociacao(data[0].id);
          }
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Erro ao carregar associações:", error);
        // Silently retry once before showing error
        try {
          const { data } = await supabase.from("corretoras").select("id, nome, slug").order("nome");
          if (cancelled) return;
          if (data && data.length > 0) {
            setAssociacoes(data);
            setCachedAssociacoes(data);
            if (!selectedAssociacao) {
              if (canViewAdmin) { setSelectedAssociacao("__admin__"); adminDefaultAppliedRef.current = true; }
              else setSelectedAssociacao(data[0].id);
            }
            return;
          }
        } catch { /* ignore retry error */ }
        if (!cancelled) toast.error("Erro ao carregar associações");
      } finally {
        if (!cancelled) setLoadingAssociacoes(false);
      }
    }
    fetchAssociacoes();
    return () => { cancelled = true; };
  }, [searchParams, canViewAdmin]);

  return (
    <BILayoutContext.Provider value={{
      associacoes,
      selectedAssociacao,
      setSelectedAssociacao,
      loadingAssociacoes,
      canViewAdmin,
      canViewHistorico,
      isAdminView,
      headerDynamic,
      setHeaderDynamic,
      historicoDialogOpen,
      setHistoricoDialogOpen,
    }}>
      {children}
    </BILayoutContext.Provider>
  );
}
