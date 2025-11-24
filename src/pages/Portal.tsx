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

        if (error) {
          // erro típico de "nenhuma linha" no .single()
          console.error("Erro ao buscar corretora_usuarios:", error);
          toast.error("Você não está vinculado a nenhuma corretora");
          navigate("/", { replace: true });
          return;
        }

        if (data?.corretoras) {
          setCorretora(data.corretoras);
        } else {
          toast.error("Você não está vinculado a nenhuma corretora");
          navigate("/", { replace: true });
        }
      } catch (error) {
        console.error("Erro ao carregar dados da corretora:", error);
        toast.error("Erro ao carregar dados da corretora");
        navigate("/", { replace: true });
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

  if (!corretora) {
    // já tratamos com toast + navigate no efeito; aqui só evita quebrar render
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 md:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold leading-tight truncate">{corretora.nome}</h1>
                <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground truncate">Portal de Gestão · PID</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 md:gap-4 justify-end flex-shrink-0">
              <Button variant="outline" onClick={handleLogout} className="gap-1.5 sm:gap-2 px-2.5 sm:px-3 md:px-4 text-[11px] sm:text-xs md:text-sm h-8 sm:h-9 md:h-10">
                <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Sair</span>
              </Button>
              {corretora.logo_url && (
                <img
                  src={corretora.logo_url}
                  alt={corretora.nome}
                  className="h-7 sm:h-8 md:h-10 lg:h-12 w-auto object-contain"
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-2 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 space-y-3 sm:space-y-4 md:space-y-6 max-w-7xl">
        {/* Welcome Card */}
        <Card className="border-2 border-primary/10 shadow-lg bg-gradient-to-br from-card to-card/80">
          <CardContent className="p-3 sm:p-4 md:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold truncate">Bem-vindo ao Portal</h2>
                <p className="text-xs sm:text-sm md:text-base text-muted-foreground line-clamp-2">
                  Acompanhe seus indicadores e dados financeiros em tempo real
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs Section */}
        <Tabs defaultValue="kpi" className="space-y-3 sm:space-y-4 md:space-y-6">
          <div className="w-full overflow-x-hidden">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 rounded-lg bg-muted/30 p-1 gap-1">
              <TabsTrigger
                value="kpi"
                className="flex flex-col sm:flex-row items-center justify-center gap-1 rounded-md px-2 py-2
                           text-xs sm:text-sm font-medium transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-md hover:bg-muted/50"
              >
                <Activity className="h-4 w-4" />
                <span className="text-[10px] sm:text-xs">KPI</span>
              </TabsTrigger>

              <TabsTrigger
                value="extrato"
                className="flex flex-col sm:flex-row items-center justify-center gap-1 rounded-md px-2 py-2
                           text-xs sm:text-sm font-medium transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-md hover:bg-muted/50"
              >
                <FileText className="h-4 w-4" />
                <span className="text-[10px] sm:text-xs">Extrato</span>
              </TabsTrigger>

              <TabsTrigger
                value="indicadores"
                className="flex flex-col sm:flex-row items-center justify-center gap-1 rounded-md px-2 py-2
                           text-xs sm:text-sm font-medium transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-md hover:bg-muted/50"
              >
                <PieChart className="h-4 w-4" />
                <span className="text-[10px] sm:text-xs hidden sm:inline">Indicadores</span>
                <span className="text-[10px] sm:hidden">Indic.</span>
              </TabsTrigger>

              <TabsTrigger
                value="lancamentos"
                className="flex flex-col sm:flex-row items-center justify-center gap-1 rounded-md px-2 py-2
                           text-xs sm:text-sm font-medium transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-md hover:bg-muted/50"
              >
                <ListChecks className="h-4 w-4" />
                <span className="text-[10px] sm:text-xs hidden sm:inline">Lançamentos</span>
                <span className="text-[10px] sm:hidden">Lanç.</span>
              </TabsTrigger>

              <TabsTrigger
                value="sinistros"
                className="flex flex-col sm:flex-row items-center justify-center gap-1 rounded-md px-2 py-2
                           text-xs sm:text-sm font-medium transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-md hover:bg-muted/50"
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="text-[10px] sm:text-xs">Sinistros</span>
              </TabsTrigger>

              <TabsTrigger
                value="comite"
                className="flex flex-col sm:flex-row items-center justify-center gap-1 rounded-md px-2 py-2
                           text-xs sm:text-sm font-medium transition-all
                           data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                           data-[state=active]:shadow-md hover:bg-muted/50"
              >
                <Users className="h-4 w-4" />
                <span className="text-[10px] sm:text-xs">Comitê</span>
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
