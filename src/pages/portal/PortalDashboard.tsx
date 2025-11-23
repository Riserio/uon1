import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut } from 'lucide-react';
import PortalKPI from '@/components/portal/PortalKPI';
import PortalExtrato from '@/components/portal/PortalExtrato';
import PortalIndicadores from '@/components/portal/PortalIndicadores';
import PortalLancamentos from '@/components/portal/PortalLancamentos';

export default function PortalDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const { token, corretora, logout } = usePortalAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token || !corretora || corretora.slug !== slug) {
      navigate(`/portal/${slug}/login`);
    }
  }, [token, corretora, slug, navigate]);

  const handleLogout = () => {
    logout();
    navigate(`/portal/${slug}/login`);
  };

  if (!corretora) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">PID - {corretora.nome}</h1>
            <p className="text-sm text-muted-foreground">
              Painel de Indicadores e Demonstrativos
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="kpi" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="kpi">KPI</TabsTrigger>
            <TabsTrigger value="extrato">Extrato</TabsTrigger>
            <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
            <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
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
