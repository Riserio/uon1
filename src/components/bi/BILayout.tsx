import { Outlet, useLocation } from "react-router-dom";
import BIPageHeader from "./BIPageHeader";
import { BIAuditLogDialog } from "@/components/BIAuditLogDialog";
import { BILayoutProvider, useBILayout } from "@/contexts/BILayoutContext";

type BIModule = 'indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base' | 'acompanhamento-eventos' | 'admin';

const moduleMap: Record<string, BIModule> = {
  '/pid': 'indicadores',
  '/sga-insights': 'eventos',
  '/mgf-insights': 'mgf',
  '/cobranca-insights': 'cobranca',
  '/estudo-base-insights': 'estudo-base',
  '/acompanhamento-eventos': 'acompanhamento-eventos',
};

const titleMap: Record<BIModule, { title: string; subtitle: string }> = {
  indicadores: { title: 'BI - Indicadores', subtitle: 'Visão consolidada dos indicadores operacionais, financeiros e de sinistros' },
  eventos: { title: 'BI - Eventos', subtitle: 'Business Intelligence de Eventos' },
  mgf: { title: 'BI - MGF', subtitle: 'Business Intelligence de MGF' },
  cobranca: { title: 'BI - Cobrança', subtitle: 'Business Intelligence de Cobrança' },
  'estudo-base': { title: 'BI - Estudo de Base', subtitle: 'Business Intelligence de Estudo de Base' },
  'acompanhamento-eventos': { title: 'Acompanhamento de Eventos', subtitle: 'Kanban de acompanhamento dos eventos da associação' },
  admin: { title: 'BI - Administradora', subtitle: 'Visão consolidada de todas as associações, automações e acessos' },
};

type AuditModule = "bi_indicadores" | "sga_insights" | "mgf_insights" | "cobranca_insights" | "estudo_base";

const auditModuleMap: Record<BIModule, AuditModule> = {
  indicadores: 'bi_indicadores',
  eventos: 'sga_insights',
  mgf: 'mgf_insights',
  cobranca: 'cobranca_insights',
  'estudo-base': 'estudo_base',
  'acompanhamento-eventos': 'sga_insights',
  admin: 'bi_indicadores',
};

function BILayoutInner() {
  const location = useLocation();
  const {
    associacoes,
    selectedAssociacao,
    setSelectedAssociacao,
    loadingAssociacoes,
    canViewAdmin,
    canViewHistorico,
    isAdminView,
    headerDynamic,
    historicoDialogOpen,
    setHistoricoDialogOpen,
  } = useBILayout();

  const currentModule: BIModule = isAdminView ? 'admin' : (moduleMap[location.pathname] || 'indicadores');
  const info = isAdminView ? titleMap.admin : titleMap[currentModule];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6">
        <BIPageHeader
          title={info.title}
          subtitle={info.subtitle}
          associacoes={associacoes}
          selectedAssociacao={selectedAssociacao}
          onAssociacaoChange={setSelectedAssociacao}
          loadingAssociacoes={loadingAssociacoes}
          currentModule={currentModule}
          showHistorico={canViewHistorico && !isAdminView}
          onHistoricoClick={() => setHistoricoDialogOpen(true)}
          showAdminOption={canViewAdmin}
          recordCount={headerDynamic.recordCount}
          hasActiveFilters={headerDynamic.hasActiveFilters}
          fileName={headerDynamic.fileName}
        />
      </div>

      <Outlet />

      <BIAuditLogDialog
        open={historicoDialogOpen}
        onOpenChange={setHistoricoDialogOpen}
        modulo={auditModuleMap[currentModule]}
        corretoraId={selectedAssociacao}
      />
    </div>
  );
}

export default function BILayout() {
  return (
    <BILayoutProvider>
      <BILayoutInner />
    </BILayoutProvider>
  );
}
