import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import PortalKPI from "@/components/portal/PortalKPI";
import PortalExtrato from "@/components/portal/PortalExtrato";
import PortalIndicadores from "@/components/portal/PortalIndicadores";
import PortalLancamentos from "@/components/portal/PortalLancamentos";
import PortalSinistros from "@/components/portal/PortalSinistros";
import PortalComite from "@/components/portal/PortalComite";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Building2, Activity, FileText, PieChart, ListChecks, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

/**
 * PORTAL PID - Painel de Indicadores e Demonstrativos para Parceiros
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
export default function Portal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [corretora, setCorretora] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCorretoraData() {
      if (!user) {
        navigate("/auth");
        return;
      }

      try {
        // Buscar corretora vinculada ao usuário PARCEIRO via corretora_usuarios
        const { data: corretoraUsuario, error: cuError } = await supabase
          .from("corretora_usuarios")
          .select("corretora_id, corretoras(id, nome, logo_url)")
          .eq("profile_id", user.id)
          .eq("ativo", true)
          .single();

        if (cuError) throw cuError;

        if (corretoraUsuario?.corretoras) {
          setCorretora(corretoraUsuario.corretoras);
        } else {
          toast.error("Você não está vinculado a nenhuma corretora");
          navigate("/");
        }
      } catch (error: any) {
        console.error("Erro ao carregar dados da corretora:", error);
        toast.error("Erro ao carregar dados da corretora");
        navigate("/");
      } finally {
        setLoading(false);
      }
    }

    loadCorretoraData();
  }, [user, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando portal...</p>
        </div>
      </div>
    );
  }

  if (!corretora) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold leading-tight truncate">{corretora.nome}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Portal de Gestão · PID</p>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 justify-end">
              <Button variant="outline" onClick={handleLogout} className="gap-2 px-3 sm:px-4 text-xs sm:text-sm">
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
              {corretora.logo_url && (
                <img
                  src={corretora.logo_url}
                  alt={corretora.nome}
                  className="h-8 sm:h-10 md:h-12 w-auto object-contain"
                />
              )}
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
        <Tabs defaultValue="kpi" className="space-y-6">
          {/* Wrapper para scroll horizontal em telas pequenas */}
          <div className="w-full overflow-x-auto">
            <TabsList
              className="
                inline-flex md:grid md:w-full md:grid-cols-3 lg:grid-cols-6
                rounded-xl bg-muted/30 p-1.5 shadow-sm
                min-w-max md:min-w-0
              "
            >
              <TabsTrigger
                value="kpi"
                className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 
                           text-[11px] sm:text-sm font-medium text-muted-foreground transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-sm hover:text-foreground"
              >
                <Activity className="h-4 w-4" />
                <span>KPI</span>
              </TabsTrigger>

              <TabsTrigger
                value="extrato"
                className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 
                           text-[11px] sm:text-sm font-medium text-muted-foreground transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-sm hover:text-foreground"
              >
                <FileText className="h-4 w-4" />
                <span>Extrato</span>
              </TabsTrigger>

              <TabsTrigger
                value="indicadores"
                className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 
                           text-[10px] sm:text-sm font-medium text-muted-foreground transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-sm hover:text-foreground"
              >
                <PieChart className="h-4 w-4" />
                <span>Indicadores</span>
              </TabsTrigger>

              <TabsTrigger
                value="lancamentos"
                className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 
                           text-[10px] sm:text-sm font-medium text-muted-foreground transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-sm hover:text-foreground"
              >
                <ListChecks className="h-4 w-4" />
                <span>Lançamentos</span>
              </TabsTrigger>

              <TabsTrigger
                value="sinistros"
                className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 
                           text-[10px] sm:text-sm font-medium text-muted-foreground transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-sm hover:text-foreground"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Sinistros</span>
              </TabsTrigger>

              <TabsTrigger
                value="comite"
                className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 
                           text-[10px] sm:text-sm font-medium text-muted-foreground transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-sm hover:text-foreground"
              >
                <Users className="h-4 w-4" />
                <span>Comitê</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="kpi" className="space-y-4">
            <PortalKPI corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="extrato" className="space-y-4">
            <PortalExtrato corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="indicadores" className="space-y-4">
            <PortalIndicadores corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="lancamentos" className="space-y-4">
            <PortalLancamentos corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="sinistros" className="space-y-4">
            <PortalSinistros corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="comite" className="space-y-4">
            <PortalComite corretoraId={corretora.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
