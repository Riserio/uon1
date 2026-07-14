import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BIPageHeader from "@/components/bi/BIPageHeader";
import { BIAuditLogDialog } from "@/components/BIAuditLogDialog";
import { useAuth } from "@/hooks/useAuth";
import EstudoBaseConteudo from "@/components/estudo-base/EstudoBaseConteudo";
import { getCachedAssociacoes, setCachedAssociacoes } from "@/hooks/useBIGlobalCache";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalPageWrapper from "@/components/portal/PortalPageWrapper";
import { PortalCarouselProvider } from "@/contexts/PortalCarouselContext";
import { useBILayoutOptional } from "@/contexts/BILayoutContext";
import { usePortalLayoutOptional } from "@/contexts/PortalLayoutContext";

export default function EstudoBaseInsights() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { userRole } = useAuth();
  const biLayout = useBILayoutOptional();
  const portalLayout = usePortalLayoutOptional();
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  const [associacoes, setAssociacoes] = useState<any[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState<string>("");
  const [loadingAssociacoes, setLoadingAssociacoes] = useState(true);
  const [recordCount, setRecordCount] = useState(0);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const canViewHistorico = userRole === "superintendente" || userRole === "admin";

  // Detectar se é acesso via portal (parceiro)
  const isPortalAccess = location.pathname.startsWith('/portal');

  // Portal state
  const [modulosBi, setModulosBi] = useState<string[]>(['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base']);
  const [corretoraData, setCorretoraData] = useState<{ id: string; nome: string; logo_url?: string | null } | null>(null);
  const [multipleAssociacoes, setMultipleAssociacoes] = useState(false);

  // Sync from shared BILayout context when available (internal access)
  useEffect(() => {
    if (biLayout && !isPortalAccess) {
      setSelectedAssociacao(biLayout.selectedAssociacao);
      setAssociacoes(biLayout.associacoes);
      setLoadingAssociacoes(false);
    }
  }, [biLayout?.selectedAssociacao, biLayout?.associacoes, isPortalAccess]);

  // Update shared header dynamic props
  useEffect(() => {
    if (biLayout && !isPortalAccess) {
      biLayout.setHeaderDynamic({
        recordCount,
        fileName,
      });
    }
  }, [recordCount, fileName, biLayout, isPortalAccess]);

  // Load associations (only for portal access)
  useEffect(() => {
    if (biLayout && !isPortalAccess) return;
    
    // Portal access: use corretora from portal context directly
    if (isPortalAccess && portalLayout?.corretora) {
      const c = portalLayout.corretora;
      setAssociacoes([{ id: c.id, nome: c.nome }]);
      setSelectedAssociacao(c.id);
      setCorretoraData({ id: c.id, nome: c.nome, logo_url: c.logo_url });
      setModulosBi(c.modulos_bi || ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base']);
      setMultipleAssociacoes(portalLayout.corretorasDisponiveis.length > 1);
      setLoadingAssociacoes(false);
      return;
    }
    
    async function fetchAssociacoes() {
      try {
        const associacaoParam = searchParams.get("associacao") || searchParams.get("corretora");

        if (isPortalAccess && associacaoParam) {
          let { data: corretora } = await supabase
            .from("corretoras")
            .select("id, nome, logo_url")
            .eq("id", associacaoParam)
            .maybeSingle();

          if (!corretora) {
            const slugResult = await supabase
              .from("corretoras")
              .select("id, nome, logo_url")
              .eq("slug", associacaoParam)
              .maybeSingle();
            corretora = slugResult.data;
          }

          if (corretora) {
            setAssociacoes([{ id: corretora.id, nome: corretora.nome }]);
            setSelectedAssociacao(corretora.id);
            setCorretoraData(corretora);
            setLoadingAssociacoes(false);
            return;
          }
        }
        
        const cached = getCachedAssociacoes();
        if (cached && cached.length > 0 && !associacoes.length) {
          setAssociacoes(cached);
          const ap = searchParams.get("associacao") || searchParams.get("corretora");
          if (ap && cached.some(c => c.id === ap)) {
            setSelectedAssociacao(ap);
          } else if (!selectedAssociacao) {
            setSelectedAssociacao(cached[0].id);
          }
          setLoadingAssociacoes(false);
        }
        
        const { data, error } = await supabase.from("corretoras").select("id, nome").order("nome");
        if (error) throw error;
        setAssociacoes(data || []);
        setCachedAssociacoes(data || []);
        
        if (!cached || cached.length === 0) {
          const ap2 = searchParams.get("associacao") || searchParams.get("corretora");
          if (ap2 && data?.some((c) => c.id === ap2)) {
            setSelectedAssociacao(ap2);
          } else if (data && data.length > 0) {
            setSelectedAssociacao(data[0].id);
          }
        }
      } catch (error) {
        if (!isPortalAccess) toast.error("Erro ao carregar associações");
      } finally {
        setLoadingAssociacoes(false);
      }
    }
    fetchAssociacoes();
  }, [searchParams, isPortalAccess, biLayout, portalLayout?.corretora?.id]);

  const selectedAssociacaoNome = associacoes.find((a) => a.id === selectedAssociacao)?.nome || "";

  const handlePortalLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const handleChangeAssociacao = () => {
    navigate("/portal", { replace: true });
  };

  const availableModules: ('indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base')[] = [
    ...(modulosBi.includes('indicadores') ? ['indicadores'] as const : []),
    ...(modulosBi.includes('eventos') ? ['eventos'] as const : []),
    ...(modulosBi.includes('mgf') ? ['mgf'] as const : []),
    ...(modulosBi.includes('cobranca') ? ['cobranca'] as const : []),
    ...(modulosBi.includes('estudo-base') ? ['estudo-base'] as const : []),
  ];

  const handleRegistrosChange = useCallback((count: number, fname?: string) => {
    setRecordCount(count);
    setFileName(fname);
  }, []);

  const mainContent = (
    <>
      {/* Portal Header - only when NOT inside PortalLayout */}
      {isPortalAccess && corretoraData && !portalLayout && (
        <PortalHeader
          corretora={{
            id: corretoraData.id,
            nome: corretoraData.nome,
            logo_url: corretoraData.logo_url,
            modulos_bi: modulosBi,
          }}
          showChangeButton={multipleAssociacoes}
          onChangeCorretora={handleChangeAssociacao}
          onLogout={handlePortalLogout}
          currentModule="estudo-base"
          showCarouselControls={true}
        />
      )}

      {/* Internal header - only when NOT inside BILayout */}
      {!isPortalAccess && !biLayout && (
        <BIPageHeader
          title="Estudo de Base"
          subtitle="Análise detalhada da base de veículos e associados"
          associacoes={associacoes}
          selectedAssociacao={selectedAssociacao}
          onAssociacaoChange={setSelectedAssociacao}
          loadingAssociacoes={loadingAssociacoes}
          currentModule="estudo-base"
          showHistorico={canViewHistorico}
          onHistoricoClick={() => setHistoricoDialogOpen(true)}
          recordCount={recordCount}
          fileName={fileName}
        />
      )}

      <div className="container mx-auto px-4 sm:px-6 py-6">
        {selectedAssociacao && (
          <EstudoBaseConteudo
            corretoraId={selectedAssociacao}
            corretoraNome={selectedAssociacaoNome}
            hideImport={isPortalAccess}
            onRegistrosChange={handleRegistrosChange}
          />
        )}
      </div>

      {!biLayout && (
        <BIAuditLogDialog
          open={historicoDialogOpen}
          onOpenChange={setHistoricoDialogOpen}
          modulo="estudo_base"
          corretoraId={selectedAssociacao}
        />
      )}
    </>
  );

  // Portal access: wrap with carousel provider
  if (isPortalAccess && portalLayout) {
    return <>{mainContent}</>;
  }

  if (isPortalAccess) {
    return (
      <PortalCarouselProvider
        corretoraId={selectedAssociacao}
        availableModules={availableModules}
        currentModule="estudo-base"
      >
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
          <PortalPageWrapper>
            {mainContent}
          </PortalPageWrapper>
        </div>
      </PortalCarouselProvider>
    );
  }

  return <>{mainContent}</>;
}
