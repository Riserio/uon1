import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import PortalKPI from '@/components/portal/PortalKPI';
import PortalExtrato from '@/components/portal/PortalExtrato';
import PortalIndicadores from '@/components/portal/PortalIndicadores';
import PortalLancamentos from '@/components/portal/PortalLancamentos';
import PortalSinistros from '@/components/portal/PortalSinistros';
import PortalComite from '@/components/portal/PortalComite';
import { CorretoraSlugDialog } from '@/components/CorretoraSlugDialog';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link2, Copy, Settings } from 'lucide-react';

export default function PID() {
  const { user } = useAuth();
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [slugDialogOpen, setSlugDialogOpen] = useState(false);
  
  const selectedCorretoraData = corretoras.find(c => c.id === selectedCorretora);
  const portalLink = selectedCorretoraData?.slug 
    ? `${window.location.origin}/${selectedCorretoraData.slug}/login`
    : null;

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

  const handleCopyLink = () => {
    if (portalLink) {
      navigator.clipboard.writeText(portalLink);
      toast.success('Link copiado para a área de transferência!');
    }
  };

  const handleSlugConfigured = async () => {
    // Recarregar lista de corretoras para pegar o slug atualizado
    try {
      const { data, error } = await supabase
        .from('corretoras')
        .select('id, nome, slug')
        .order('nome');
      
      if (error) throw error;
      setCorretoras(data || []);
      toast.success('Slug configurado com sucesso!');
    } catch (error) {
      console.error('Erro ao recarregar corretoras:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header Section */}
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                PID - Painel de Indicadores e Demonstrativos
              </h1>
              <p className="text-muted-foreground mt-2 text-lg">
                Gestão completa de dados financeiros e sinistros das corretoras
              </p>
            </div>
          </div>

          {/* Corretora Selection Card */}
          <Card className="border-2 border-primary/10 shadow-lg bg-gradient-to-br from-card to-card/80">
            <CardContent className="p-6">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <Label htmlFor="corretora-select" className="text-lg font-semibold min-w-fit">
                    Selecionar Corretora:
                  </Label>
                  <Select value={selectedCorretora} onValueChange={setSelectedCorretora} disabled={loading}>
                    <SelectTrigger id="corretora-select" className="w-full sm:w-[400px] h-12 text-base border-2">
                      <SelectValue placeholder="Escolha uma corretora para visualizar os dados..." />
                    </SelectTrigger>
                    <SelectContent>
                      {corretoras.map((corretora) => (
                        <SelectItem key={corretora.id} value={corretora.id} className="text-base py-3">
                          {corretora.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Portal Link Section */}
                {portalLink && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-muted/50 rounded-lg border border-border/50">
                    <Link2 className="h-5 w-5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium mb-1">Link do Portal Externo:</p>
                      <code className="text-xs bg-background px-2 py-1 rounded border break-all">
                        {portalLink}
                      </code>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyLink}
                      className="flex-shrink-0 gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      Copiar Link
                    </Button>
                  </div>
                )}

                {selectedCorretora && !selectedCorretoraData?.slug && (
                  <div className="flex items-center justify-between gap-3 p-3 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 rounded-lg border border-yellow-500/20">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 flex-shrink-0" />
                      <p className="text-sm">
                        Esta corretora ainda não possui um slug configurado. Configure o slug para habilitar o portal externo.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSlugDialogOpen(true)}
                      className="gap-2 bg-background hover:bg-background/80"
                    >
                      <Settings className="h-4 w-4" />
                      Configurar
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="kpi" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 h-auto p-1 bg-muted/50">
            <TabsTrigger value="kpi" className="text-sm sm:text-base py-3">KPI</TabsTrigger>
            <TabsTrigger value="extrato" className="text-sm sm:text-base py-3">Extrato</TabsTrigger>
            <TabsTrigger value="indicadores" className="text-sm sm:text-base py-3">Indicadores</TabsTrigger>
            <TabsTrigger value="lancamentos" className="text-sm sm:text-base py-3">Lançamentos</TabsTrigger>
            <TabsTrigger value="sinistros" className="text-sm sm:text-base py-3">Sinistros</TabsTrigger>
            <TabsTrigger value="comite" className="text-sm sm:text-base py-3">Comitê</TabsTrigger>
          </TabsList>

          <TabsContent value="kpi" className="space-y-4">
            <PortalKPI corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="extrato" className="space-y-4">
            <PortalExtrato corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="indicadores" className="space-y-4">
            <PortalIndicadores corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="lancamentos" className="space-y-4">
            <PortalLancamentos corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="sinistros" className="space-y-4">
            <PortalSinistros corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="comite" className="space-y-4">
            <PortalComite corretoraId={selectedCorretora} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de Configuração de Slug */}
      {selectedCorretoraData && (
        <CorretoraSlugDialog
          open={slugDialogOpen}
          onOpenChange={setSlugDialogOpen}
          corretora={{
            id: selectedCorretoraData.id,
            nome: selectedCorretoraData.nome,
            slug: selectedCorretoraData.slug
          }}
          onSuccess={handleSlugConfigured}
        />
      )}
    </div>
  );
}
