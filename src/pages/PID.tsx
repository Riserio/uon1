import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PortalKPI from '@/components/portal/PortalKPI';
import PortalExtrato from '@/components/portal/PortalExtrato';
import PortalIndicadores from '@/components/portal/PortalIndicadores';
import PortalLancamentos from '@/components/portal/PortalLancamentos';
import { useAuth } from '@/hooks/useAuth';

export default function PID() {
  const { user } = useAuth();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">PID - Painel de Indicadores e Demonstrativos</h1>
        <p className="text-muted-foreground mt-2">
          Gestão completa de dados financeiros das corretoras
        </p>
      </div>

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
    </div>
  );
}
