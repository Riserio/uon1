import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PortalKPI from "@/components/portal/PortalKPI";
import PortalExtrato from "@/components/portal/PortalExtrato";
import PortalIndicadores from "@/components/portal/PortalIndicadores";
import PortalLancamentos from "@/components/portal/PortalLancamentos";
import PortalSinistros from "@/components/portal/PortalSinistros";
import PortalComite from "@/components/portal/PortalComite";
import { GerenciarUsuariosCorretoraDialog } from "@/components/GerenciarUsuariosCorretoraDialog";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Activity, FileText, PieChart, ListChecks, ShieldCheck, Link as LinkIcon, ExternalLink } from "lucide-react";
import { CorretoraSlugDialog } from "@/components/CorretoraSlugDialog";

export default function PID() {
  const { user } = useAuth();
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [usuariosDialogOpen, setUsuariosDialogOpen] = useState(false);
  const [slugDialogOpen, setSlugDialogOpen] = useState(false);

  const selectedCorretoraData = corretoras.find((c) => c.id === selectedCorretora);

  const handleRefreshCorretoras = async () => {
    try {
      const { data, error } = await supabase.from("corretoras").select("id, nome, slug").order("nome");
      if (error) throw error;
      setCorretoras(data || []);
    } catch (error) {
      console.error("Erro ao recarregar corretoras:", error);
    }
  };

  const handleCopyPortalLink = () => {
    if (!selectedCorretoraData?.slug) {
      toast.error("Configure um slug primeiro");
      return;
    }
    
    const portalUrl = `${window.location.origin}/${selectedCorretoraData.slug}/login`;
    navigator.clipboard.writeText(portalUrl);
    toast.success("Link copiado para a área de transferência");
  };

  const handleOpenPortalLink = () => {
    if (!selectedCorretoraData?.slug) {
      toast.error("Configure um slug primeiro");
      return;
    }
    
    const portalUrl = `${window.location.origin}/${selectedCorretoraData.slug}/login`;
    window.open(portalUrl, '_blank');
  };

  useEffect(() => {
    async function fetchCorretoras() {
      try {
        const { data, error } = await supabase.from("corretoras").select("id, nome, slug").order("nome");

        if (error) throw error;

        setCorretoras(data || []);
        if (data && data.length > 0) {
          setSelectedCorretora(data[0].id);
        }
      } catch (error) {
        console.error("Erro ao carregar corretoras:", error);
        toast.error("Erro ao carregar corretoras");
      } finally {
        setLoading(false);
      }
    }

    fetchCorretoras();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-2 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 space-y-3 sm:space-y-4 md:space-y-6 max-w-7xl">
        {/* Header */}
        <div className="space-y-3 sm:space-y-4">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              PID - Painel de Indicadores e Demonstrativos
            </h1>
            <p className="text-muted-foreground mt-1 sm:mt-2 text-xs sm:text-sm md:text-base">
              Gestão completa de dados financeiros e sinistros das corretoras
            </p>
          </div>

          {/* Seleção de Corretora */}
          <Card className="border-2 border-primary/10 shadow-lg bg-gradient-to-br from-card to-card/80">
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex flex-col lg:flex-row justify-between gap-3 sm:gap-4 items-stretch lg:items-center">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 md:gap-4 flex-1 w-full min-w-0">
                  <Label htmlFor="corretora-select" className="text-xs sm:text-sm md:text-base font-semibold whitespace-nowrap flex-shrink-0">
                    Selecionar Corretora:
                  </Label>

                  <Select value={selectedCorretora} onValueChange={setSelectedCorretora} disabled={loading}>
                    <SelectTrigger
                      id="corretora-select"
                      className="w-full sm:max-w-md h-9 sm:h-10 md:h-11 border-2 text-xs sm:text-sm"
                    >
                      <SelectValue placeholder="Escolha uma corretora..." />
                    </SelectTrigger>

                    <SelectContent>
                      {corretoras.map((corretora) => (
                        <SelectItem
                          key={corretora.id}
                          value={corretora.id}
                          className="text-xs sm:text-sm py-2"
                        >
                          {corretora.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Botões de Ação */}
                {selectedCorretora && (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      onClick={() => setUsuariosDialogOpen(true)}
                      className="gap-2 whitespace-nowrap flex-shrink-0 h-9 sm:h-10"
                    >
                      <Users className="h-4 w-4" />
                      <span className="text-xs sm:text-sm">Gerenciar Usuários</span>
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={() => setSlugDialogOpen(true)}
                      className="gap-2 whitespace-nowrap flex-shrink-0 h-9 sm:h-10"
                    >
                      <LinkIcon className="h-4 w-4" />
                      <span className="text-xs sm:text-sm">
                        {selectedCorretoraData?.slug ? 'Editar Slug' : 'Configurar Slug'}
                      </span>
                    </Button>
                    
                    {selectedCorretoraData?.slug && (
                      <>
                        <Button
                          variant="outline"
                          onClick={handleCopyPortalLink}
                          className="gap-2 whitespace-nowrap flex-shrink-0 h-9 sm:h-10"
                        >
                          <LinkIcon className="h-4 w-4" />
                          <span className="text-xs sm:text-sm">Copiar Link</span>
                        </Button>
                        
                        <Button
                          variant="default"
                          onClick={handleOpenPortalLink}
                          className="gap-2 whitespace-nowrap flex-shrink-0 h-9 sm:h-10"
                        >
                          <ExternalLink className="h-4 w-4" />
                          <span className="text-xs sm:text-sm">Abrir Portal</span>
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Abas */}
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

      {/* Modals */}
      {selectedCorretoraData && (
        <>
          <GerenciarUsuariosCorretoraDialog
            open={usuariosDialogOpen}
            onOpenChange={setUsuariosDialogOpen}
            corretoraId={selectedCorretoraData.id}
            corretoraNome={selectedCorretoraData.nome}
          />
          
          <CorretoraSlugDialog
            open={slugDialogOpen}
            onOpenChange={setSlugDialogOpen}
            corretora={selectedCorretoraData}
            onSuccess={handleRefreshCorretoras}
          />
        </>
      )}
    </div>
  );
}
