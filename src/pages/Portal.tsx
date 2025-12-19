import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import PIDDashboard from "@/components/portal/PIDDashboard";
import PIDOperacional from "@/components/portal/PIDOperacional";
import PIDEstudoBase from "@/components/portal/PIDEstudoBase";
import PIDHistorico from "@/components/portal/PIDHistorico";
import PortalSinistros from "@/components/portal/PortalSinistros";
import PortalComite from "@/components/portal/PortalComite";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Building2, Activity, BarChart3, Car, Calendar, ShieldCheck, MessageSquare, TrendingUp } from "lucide-react";
import { toast } from "sonner";

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

type CorretoraUsuarioResult = {
  corretora_id: string;
  corretoras: Corretora;
};

export default function Portal() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [corretora, setCorretora] = useState<Corretora | null>(null);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);

  useEffect(() => {
    async function loadCorretoraData() {
      // enquanto o auth ainda está carregando, não faz nada
      if (authLoading) return;

      if (!user) {
        navigate("/auth", { replace: true });
        return;
      }

      try {
        const { data, error } = await supabase
          .from("corretora_usuarios")
          .select("corretora_id, corretoras(id, nome, logo_url)")
          .eq("profile_id", user.id)
          .eq("ativo", true)
          .single<CorretoraUsuarioResult>();

        if (error || !data?.corretoras) {
          // Usuário não está vinculado a nenhuma corretora
          console.error("Usuário não vinculado a corretora:", error);
          setNotLinked(true);
          setLoading(false);
          return;
        }

        setCorretora(data.corretoras);
      } catch (error) {
        console.error("Erro ao carregar dados da corretora:", error);
        setNotLinked(true);
      } finally {
        setLoading(false);
      }
    }

    loadCorretoraData();
  }, [user, authLoading, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando portal...</p>
        </div>
      </div>
    );
  }

  // Usuário não está vinculado a nenhuma associação - mostrar mensagem informativa
  if (notLinked || !corretora) {
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

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "operacional", label: "Operacional", icon: Activity },
    { id: "estudo-base", label: "Estudo de Base", icon: Car },
    { id: "historico", label: "Histórico", icon: Calendar },
    { id: "sinistros", label: "Sinistros", icon: ShieldCheck },
    { id: "comite", label: "Comitê", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              {corretora.logo_url ? (
                <img
                  src={corretora.logo_url}
                  alt={corretora.nome}
                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-full object-cover"
                />
              ) : (
                <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold leading-tight truncate">{corretora.nome}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Portal de Gestão · BI</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 justify-end">
              <Button 
                variant="outline" 
                onClick={() => navigate({
                  pathname: "/portal/sga-insights",
                  search: `?associacao=${corretora.id}`
                })}
                className="gap-2 px-3 sm:px-4 text-xs sm:text-sm"
              >
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">SGA Insights</span>
              </Button>
              <Button variant="outline" onClick={handleLogout} className="gap-2 px-3 sm:px-4 text-xs sm:text-sm">
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Welcome Card */}
        <Card className="border-2 border-primary/10 shadow-lg bg-gradient-to-br from-card to-card/80">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Bem-vindo ao Portal</h2>
                <p className="text-xs sm:text-sm md:text-base text-muted-foreground">
                  Acompanhe seus indicadores e dados financeiros em tempo real
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs Section */}
        <Tabs defaultValue="dashboard" className="space-y-6">
          {/* Wrapper para scroll horizontal em telas pequenas */}
          <div className="w-full overflow-x-auto pb-2">
            <TabsList className="inline-flex md:flex md:w-full gap-1 p-1.5 bg-muted/40 rounded-xl min-w-max md:min-w-0">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                               text-muted-foreground transition-all
                               data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                               data-[state=active]:shadow-md hover:text-foreground hover:bg-muted/60
                               whitespace-nowrap"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-4 mt-0">
            <PIDDashboard corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="operacional" className="space-y-4 mt-0">
            <PIDOperacional corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="estudo-base" className="space-y-4 mt-0">
            <PIDEstudoBase corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="historico" className="space-y-4 mt-0">
            <PIDHistorico corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="sinistros" className="space-y-4 mt-0">
            <PortalSinistros corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="comite" className="space-y-4 mt-0">
            <PortalComite corretoraId={corretora.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
