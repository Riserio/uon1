import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import PortalKPI from '@/components/portal/PortalKPI';
import PortalExtrato from '@/components/portal/PortalExtrato';
import PortalIndicadores from '@/components/portal/PortalIndicadores';
import PortalLancamentos from '@/components/portal/PortalLancamentos';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function PID() {
  const { user } = useAuth();
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCorretoras() {
      try {
        const { data, error } = await supabase
          .from('corretoras')
          .select('id, nome, slug')
          .order('nome');
        
        if (error) throw error;
        
        setCorretoras(data || []);
        if (data && data.length > 0) {
          setSelectedCorretora(data[0].id);
        }
      } catch (error) {
        console.error('Erro ao carregar corretoras:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchCorretoras();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">PID - Painel de Indicadores e Demonstrativos</h1>
        <p className="text-muted-foreground mt-2">
          Gestão completa de dados financeiros das corretoras
        </p>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-4">
          <Label htmlFor="corretora-select" className="min-w-fit">Filtrar por Corretora:</Label>
          <Select value={selectedCorretora} onValueChange={setSelectedCorretora} disabled={loading}>
            <SelectTrigger id="corretora-select" className="w-[300px]">
              <SelectValue placeholder="Selecione uma corretora" />
            </SelectTrigger>
            <SelectContent>
              {corretoras.map((corretora) => (
                <SelectItem key={corretora.id} value={corretora.id}>
                  {corretora.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Tabs defaultValue="kpi" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="kpi">KPI</TabsTrigger>
          <TabsTrigger value="extrato">Extrato</TabsTrigger>
          <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="kpi">
          <PortalKPI corretoraId={selectedCorretora} />
        </TabsContent>

        <TabsContent value="extrato">
          <PortalExtrato corretoraId={selectedCorretora} />
        </TabsContent>

        <TabsContent value="indicadores">
          <PortalIndicadores corretoraId={selectedCorretora} />
        </TabsContent>

        <TabsContent value="lancamentos">
          <PortalLancamentos corretoraId={selectedCorretora} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
