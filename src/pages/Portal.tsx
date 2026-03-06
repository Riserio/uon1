import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import PIDDashboard from "@/components/portal/PIDDashboard";
import PIDOperacional from "@/components/portal/PIDOperacional";
import PIDEstudoBase from "@/components/portal/PIDEstudoBase";
import PIDHistorico from "@/components/portal/PIDHistorico";
import PortalSinistros from "@/components/portal/PortalSinistros";
import { GestaoAssociacaoKanban } from "@/components/gestao-associacao/GestaoAssociacaoKanban";
import PortalComite from "@/components/portal/PortalComite";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalPageWrapper from "@/components/portal/PortalPageWrapper";
import { PortalCarouselProvider } from "@/contexts/PortalCarouselContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { usePortalLayoutOptional } from "@/contexts/PortalLayoutContext";
import { LogOut, Building2, Activity, BarChart3, Car, Calendar, ShieldCheck, MessageSquare, KanbanSquare } from "lucide-react";

/**
 * PORTAL BI - Business Intelligence para Parceiros
 *
 * Este é o portal EXCLUSIVO para usuários com role 'parceiro'.
 *
 * SEGURANÇA (DECISÃO DEFINITIVA):
 * - Parceiros veem APENAS dados da sua corretora vinculada
 * - NÃO têm acesso a nenhuma outra parte do sistema
 * - NÃO veem sidebar ou menus administrativos
 * - Podem apenas VISUALIZAR dados financeiros e sinistros
 * - Podem EDITAR apenas deliberações do Comitê de Sinistros
 */
type Corretora = {
  id: string;
  nome: string;
  logo_url?: string | null;
};

type CorretoraUsuario = {
  corretora_id: string;
  modulos_bi: string[] | null;
  corretoras: Corretora;
};

type CorretoraComModulos = Corretora & {
  modulos_bi: string[];
};

export default function Portal() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const portalLayout = usePortalLayoutOptional();
  const [corretora, setCorretora] = useState<CorretoraComModulos | null>(null);
  const [corretorasDisponiveis, setCorretorasDisponiveis] = useState<CorretoraComModulos[]>([]);
  const [showSelection, setShowSelection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);

  // When inside PortalLayout, use its corretora data
  useEffect(() => {
    if (portalLayout?.corretora) {
      setCorretora(portalLayout.corretora);
      setCorretorasDisponiveis(portalLayout.corretorasDisponiveis);
      setLoading(false);
      return;
    }
  }, [portalLayout?.corretora]);

  useEffect(() => {
    if (portalLayout) return; // Skip - using layout context
    
    async function loadCorretoraData() {
      if (authLoading) return;
      if (!user) { navigate("/auth", { replace: true }); return; }

      try {
        const { data, error } = await supabase
          .from("corretora_usuarios")
          .select("corretora_id, modulos_bi, corretoras(id, nome, logo_url)")
          .eq("profile_id", user.id)
          .eq("ativo", true);

        if (error || !data || data.length === 0) {
          setNotLinked(true);
          setLoading(false);
          return;
        }

        const corretorasValidas: CorretoraComModulos[] = data
          .filter(item => item.corretoras)
          .map(item => ({
            ...(item.corretoras as Corretora),
            modulos_bi: item.modulos_bi || ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base']
          }));

        if (corretorasValidas.length === 0) {
          setNotLinked(true);
          setLoading(false);
          return;
        }

        const associacaoParam = searchParams.get("associacao");
        if (associacaoParam) {
          const associacaoSelecionada = corretorasValidas.find(c => c.id === associacaoParam);
          if (associacaoSelecionada) {
            if (!associacaoSelecionada.modulos_bi.includes('indicadores')) {
              redirectToFirstAvailableModule(associacaoSelecionada);
              return;
            }
            setCorretora(associacaoSelecionada);
            setCorretorasDisponiveis(corretorasValidas);
            setLoading(false);
            return;
          }
        }

        if (corretorasValidas.length === 1) {
          const singleCorretora = corretorasValidas[0];
          if (!singleCorretora.modulos_bi.includes('indicadores')) {
            redirectToFirstAvailableModule(singleCorretora);
            return;
          }
          setCorretora(singleCorretora);
        } else {
          setCorretorasDisponiveis(corretorasValidas);
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
  }, [user, authLoading, navigate, searchParams, portalLayout]);

  // Função para redirecionar ao primeiro módulo disponível
  const redirectToFirstAvailableModule = (corretoraData: CorretoraComModulos) => {
    const modulos = corretoraData.modulos_bi;
    if (modulos.includes('eventos')) {
      navigate(`/portal/sga-insights?associacao=${corretoraData.id}`, { replace: true });
    } else if (modulos.includes('mgf')) {
      navigate(`/portal/mgf-insights?associacao=${corretoraData.id}`, { replace: true });
    } else if (modulos.includes('cobranca')) {
      navigate(`/portal/cobranca-insights?associacao=${corretoraData.id}`, { replace: true });
    } else if (modulos.includes('estudo-base')) {
      navigate(`/portal/estudo-base-insights?associacao=${corretoraData.id}`, { replace: true });
    }
  };

  const handleSelectCorretora = (selectedCorretora: CorretoraComModulos) => {
    // Verificar se tem acesso ao módulo indicadores
    if (!selectedCorretora.modulos_bi.includes('indicadores')) {
      redirectToFirstAvailableModule(selectedCorretora);
      return;
    }
    setCorretora(selectedCorretora);
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

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando portal...</p>
        </div>
      </div>
    );
  }

  // Usuário não está vinculado a nenhuma associação - mostrar mensagem informativa
  if (notLinked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="p-8 text-center space-y-6">
            <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Vinculação Necessária</h2>
              <p className="text-muted-foreground text-sm">
                Sua conta ainda não está vinculada a nenhuma associação.
              </p>
              <p className="text-muted-foreground text-sm">
                Por favor, entre em contato com o administrador do sistema para solicitar a vinculação à sua associação.
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

  // Mostrar tela de seleção quando vinculado a múltiplas associações
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
              <p className="text-muted-foreground text-sm">
                Você está vinculado a múltiplas associações. Escolha qual deseja acessar.
              </p>
            </div>
            
            <div className="space-y-2">
              {corretorasDisponiveis.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectCorretora(item)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:border-primary hover:bg-primary/5 transition-all duration-200 text-left group"
                >
                  {item.logo_url ? (
                    <img
                      src={item.logo_url}
                      alt={item.nome}
                      className="h-12 w-12 rounded-full object-cover ring-2 ring-muted group-hover:ring-primary/30 transition-all"
                    />
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

  // Se não tem corretora selecionada (não deveria acontecer), mostrar loading
  if (!corretora) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Tabs do BI Indicadores
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "operacional", label: "Operacional", icon: Activity },
    { id: "estudo-base", label: "Estudo de Base", icon: Car },
    { id: "historico", label: "Histórico", icon: Calendar },
    { id: "sinistros", label: "Sinistros", icon: ShieldCheck },
    { id: "comite", label: "Comitê", icon: MessageSquare },
  ];

  // Lista de módulos disponíveis para o carrossel
  const availableModules: ('indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base')[] = [
    ...(corretora.modulos_bi.includes('indicadores') ? ['indicadores'] as const : []),
    ...(corretora.modulos_bi.includes('eventos') ? ['eventos'] as const : []),
    ...(corretora.modulos_bi.includes('mgf') ? ['mgf'] as const : []),
    ...(corretora.modulos_bi.includes('cobranca') ? ['cobranca'] as const : []),
    ...(corretora.modulos_bi.includes('estudo-base') ? ['estudo-base'] as const : []),
  ];

  // When inside PortalLayout, just render content (no header/wrapper)
  if (portalLayout) {
    return (
      <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        <Tabs defaultValue="dashboard" className="space-y-6">
          <div className="w-full overflow-x-auto pb-2 -mx-1 px-1">
            <TabsList className="inline-flex md:flex md:w-full gap-1 p-1.5 bg-muted/50 rounded-xl min-w-max md:min-w-0 shadow-sm">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md hover:text-foreground hover:bg-background/50 whitespace-nowrap">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
          <TabsContent value="dashboard" className="space-y-4 mt-0"><PIDDashboard corretoraId={corretora.id} /></TabsContent>
          <TabsContent value="operacional" className="space-y-4 mt-0"><PIDOperacional corretoraId={corretora.id} /></TabsContent>
          <TabsContent value="estudo-base" className="space-y-4 mt-0"><PIDEstudoBase corretoraId={corretora.id} /></TabsContent>
          <TabsContent value="historico" className="space-y-4 mt-0"><PIDHistorico corretoraId={corretora.id} /></TabsContent>
          <TabsContent value="sinistros" className="space-y-4 mt-0"><PortalSinistros corretoraId={corretora.id} /></TabsContent>
          <TabsContent value="comite" className="space-y-4 mt-0"><PortalComite corretoraId={corretora.id} /></TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <PortalCarouselProvider
      corretoraId={corretora.id}
      availableModules={availableModules}
      currentModule="indicadores"
    >
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
        <PortalHeader
          corretora={corretora}
          showChangeButton={corretorasDisponiveis.length > 1}
          onChangeCorretora={handleChangeCorretora}
          onLogout={handleLogout}
          currentModule="indicadores"
          showCarouselControls={true}
        />
        <PortalPageWrapper>
          <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
            <Tabs defaultValue="dashboard" className="space-y-6">
              <div className="w-full overflow-x-auto pb-2 -mx-1 px-1">
                <TabsList className="inline-flex md:flex md:w-full gap-1 p-1.5 bg-muted/50 rounded-xl min-w-max md:min-w-0 shadow-sm">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md hover:text-foreground hover:bg-background/50 whitespace-nowrap">
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>
              <TabsContent value="dashboard" className="space-y-4 mt-0"><PIDDashboard corretoraId={corretora.id} /></TabsContent>
              <TabsContent value="operacional" className="space-y-4 mt-0"><PIDOperacional corretoraId={corretora.id} /></TabsContent>
              <TabsContent value="estudo-base" className="space-y-4 mt-0"><PIDEstudoBase corretoraId={corretora.id} /></TabsContent>
              <TabsContent value="historico" className="space-y-4 mt-0"><PIDHistorico corretoraId={corretora.id} /></TabsContent>
              <TabsContent value="sinistros" className="space-y-4 mt-0"><PortalSinistros corretoraId={corretora.id} /></TabsContent>
              <TabsContent value="comite" className="space-y-4 mt-0"><PortalComite corretoraId={corretora.id} /></TabsContent>
            </Tabs>
          </div>
        </PortalPageWrapper>
      </div>
    </PortalCarouselProvider>
  );
}
