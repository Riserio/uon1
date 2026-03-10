import { Outlet, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, LogOut } from "lucide-react";
import PortalSidebar from "./PortalSidebar";
import PortalPageWrapper from "./PortalPageWrapper";
import { PortalCarouselProvider } from "@/contexts/PortalCarouselContext";
import { usePortalLayout } from "@/contexts/PortalLayoutContext";
import { usePortalDataPrefetch } from "@/hooks/usePortalDataPrefetch";

type PortalModule = 'indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base' | 'acompanhamento-eventos' | 'ouvidoria';

const moduleMap: Record<string, PortalModule> = {
  '/portal': 'indicadores',
  '/portal/sga-insights': 'eventos',
  '/portal/mgf-insights': 'mgf',
  '/portal/cobranca-insights': 'cobranca',
  '/portal/estudo-base-insights': 'estudo-base',
  '/portal/acompanhamento-eventos': 'acompanhamento-eventos',
  '/portal/ouvidoria': 'ouvidoria',
};

export default function PortalLayout() {
  const location = useLocation();
  const {
    corretora,
    corretorasDisponiveis,
    loading,
    notLinked,
    showSelection,
    handleSelectCorretora,
    handleChangeCorretora,
    handleLogout,
  } = usePortalLayout();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando portal...</p>
        </div>
      </div>
    );
  }

  if (notLinked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="p-8 text-center space-y-6">
            <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Vinculação Necessária</h2>
              <p className="text-muted-foreground text-sm">
                Sua conta ainda não está vinculada a nenhuma associação.
              </p>
            </div>
            <Button onClick={handleLogout} variant="outline" className="w-full gap-2">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showSelection && corretorasDisponiveis.length > 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <Card className="max-w-lg w-full shadow-xl border-0">
          <CardContent className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Selecione a Associação</h2>
              <p className="text-muted-foreground text-sm">Escolha qual deseja acessar.</p>
            </div>
            <div className="space-y-2">
              {corretorasDisponiveis.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectCorretora(item)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:border-primary hover:bg-primary/5 transition-all duration-200 text-left group"
                >
                  {(item.logo_collapsed_url || item.logo_url) ? (
                    <img src={item.logo_collapsed_url || item.logo_url!} alt={item.nome} className="h-12 w-12 rounded-full object-cover ring-2 ring-muted group-hover:ring-primary/30 transition-all" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-all">
                      <Building2 className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate group-hover:text-primary transition-colors">{item.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.modulos_bi.length} módulo{item.modulos_bi.length > 1 ? 's' : ''} disponível{item.modulos_bi.length > 1 ? 'is' : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <Button onClick={handleLogout} variant="ghost" className="w-full gap-2 text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!corretora) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
      </div>
    );
  }

  const currentModule: PortalModule = moduleMap[location.pathname] || 'indicadores';

  const availableModules: PortalModule[] = [
    ...(corretora.modulos_bi.includes('indicadores') ? ['indicadores'] as const : []),
    ...(corretora.modulos_bi.includes('eventos') ? ['eventos'] as const : []),
    ...(corretora.modulos_bi.includes('mgf') ? ['mgf'] as const : []),
    ...(corretora.modulos_bi.includes('cobranca') ? ['cobranca'] as const : []),
    ...(corretora.modulos_bi.includes('estudo-base') ? ['estudo-base'] as const : []),
    ...(corretora.modulos_bi.includes('acompanhamento-eventos') ? ['acompanhamento-eventos'] as const : []),
    ...(corretora.modulos_bi.includes('ouvidoria') ? ['ouvidoria'] as const : []),
  ];

  return (
    <PortalCarouselProvider
      corretoraId={corretora.id}
      corretoraSlug={corretora.slug}
      availableModules={availableModules}
      currentModule={currentModule}
    >
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
        <PortalSidebar
          corretora={corretora}
          currentModule={currentModule}
          showChangeButton={corretorasDisponiveis.length > 1}
          onChangeCorretora={handleChangeCorretora}
          onLogout={handleLogout}
        />

        <div id="portal-main-content" className="transition-all duration-300 ease-in-out">
          <PortalPageWrapper>
            <Outlet context={{ corretora, corretorasDisponiveis }} />
          </PortalPageWrapper>
        </div>
      </div>
    </PortalCarouselProvider>
  );
}
