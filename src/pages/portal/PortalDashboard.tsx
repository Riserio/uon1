import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Activity, FileText, PieChart, ListChecks } from "lucide-react";
import PortalKPI from "@/components/portal/PortalKPI";
import PortalExtrato from "@/components/portal/PortalExtrato";
import PortalIndicadores from "@/components/portal/PortalIndicadores";
import PortalLancamentos from "@/components/portal/PortalLancamentos";

export default function PortalDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const { token, corretora, logout } = usePortalAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token || !corretora || corretora.slug !== slug) {
      navigate(`/${slug}/login`);
    }
  }, [token, corretora, slug, navigate]);

  const handleLogout = () => {
    logout();
    navigate(`/${slug}/login`);
  };

  if (!corretora) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">PID - {corretora.nome}</h1>
            <p className="text-sm text-muted-foreground">Painel de Indicadores e Demonstrativos</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Tabs defaultValue="kpi" className="space-y-6">
          {/* Abas modernas com ícones e cor do sistema na aba ativa */}
          <TabsList className="grid w-full grid-cols-4 rounded-xl bg-muted/60 p-1.5 shadow-sm">
            <TabsTrigger
              value="kpi"
              className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium
                         text-muted-foreground transition-all
                         data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                         data-[state=active]:shadow-sm hover:text-foreground"
            >
              <Activity className="h-4 w-4 sm:h-4 sm:w-4" />
              <span>KPI</span>
            </TabsTrigger>

            <TabsTrigger
              value="extrato"
              className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium
                         text-muted-foreground transition-all
                         data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                         data-[state=active]:shadow-sm hover:text-foreground"
            >
              <FileText className="h-4 w-4 sm:h-4 sm:w-4" />
              <span>Extrato</span>
            </TabsTrigger>

            <TabsTrigger
              value="indicadores"
              className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[11px] sm:text-sm font-medium
                         text-muted-foreground transition-all
                         data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                         data-[state=active]:shadow-sm hover:text-foreground"
            >
              <PieChart className="h-4 w-4 sm:h-4 sm:w-4" />
              <span>Indicadores</span>
            </TabsTrigger>

            <TabsTrigger
              value="lancamentos"
              className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[11px] sm:text-sm font-medium
                         text-muted-foreground transition-all
                         data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                         data-[state=active]:shadow-sm hover:text-foreground"
            >
              <ListChecks className="h-4 w-4 sm:h-4 sm:w-4" />
              <span>Lançamentos</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kpi">
            <PortalKPI />
          </TabsContent>

          <TabsContent value="extrato">
            <PortalExtrato />
          </TabsContent>

          <TabsContent value="indicadores">
            <PortalIndicadores />
          </TabsContent>

          <TabsContent value="lancamentos">
            <PortalLancamentos />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
