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
import { Users, Activity, FileText, PieChart, ListChecks, ShieldCheck } from "lucide-react";

export default function PID() {
  const { user } = useAuth();
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [usuariosDialogOpen, setUsuariosDialogOpen] = useState(false);

  const selectedCorretoraData = corretoras.find((c) => c.id === selectedCorretora);

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
      <div className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 max-w-7xl">
        {/* Header */}
        <div className="space-y-3 sm:space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              PID - Painel de Indicadores e Demonstrativos
            </h1>
            <p className="text-muted-foreground mt-1.5 sm:mt-2 text-xs sm:text-sm md:text-base lg:text-lg">
              Gestão completa de dados financeiros e sinistros das corretoras
            </p>
          </div>

          {/* Seleção de Corretora */}
          <Card className="border-2 border-primary/10 shadow-lg bg-gradient-to-br from-card to-card/80">
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex flex-col lg:flex-row justify-between gap-3 sm:gap-4 items-stretch lg:items-center">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 md:gap-4 flex-1 w-full min-w-0">
                  <Label htmlFor="corretora-select" className="text-sm sm:text-base md:text-lg font-semibold whitespace-nowrap flex-shrink-0">
                    Selecionar Corretora:
                  </Label>

                  <Select value={selectedCorretora} onValueChange={setSelectedCorretora} disabled={loading}>
                    <SelectTrigger
                      id="corretora-select"
                      className="w-full sm:max-w-md h-10 sm:h-11 md:h-12 border-2 text-xs sm:text-sm md:text-base"
                    >
                      <SelectValue placeholder="Escolha uma corretora..." />
                    </SelectTrigger>

                    <SelectContent>
                      {corretoras.map((corretora) => (
                        <SelectItem
                          key={corretora.id}
                          value={corretora.id}
                          className="text-xs sm:text-sm md:text-base py-1.5 sm:py-2 md:py-3"
                        >
                          {corretora.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Botão Gerenciar Usuários PID */}
                {selectedCorretora && (
                  <Button
                    variant="outline"
                    onClick={() => setUsuariosDialogOpen(true)}
                    className="gap-2 whitespace-nowrap w-full sm:w-auto flex-shrink-0 h-10 sm:h-11"
                  >
                    <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="text-xs sm:text-sm">Gerenciar Usuários PID</span>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Abas */}
        <Tabs defaultValue="kpi" className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 rounded-lg sm:rounded-xl bg-muted/30 p-1 sm:p-1.5 shadow-sm gap-0.5 sm:gap-1">
            <TabsTrigger
              value="kpi"
              className="flex items-center justify-center gap-1 sm:gap-2 rounded-md sm:rounded-lg px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 
                         text-[10px] sm:text-xs md:text-sm font-medium transition-all
                         data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                         data-[state=active]:shadow-md hover:bg-muted/50"
            >
              <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">KPI</span>
            </TabsTrigger>

            <TabsTrigger
              value="extrato"
              className="flex items-center justify-center gap-1 sm:gap-2 rounded-md sm:rounded-lg px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 
                         text-[10px] sm:text-xs md:text-sm font-medium transition-all
                         data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                         data-[state=active]:shadow-md hover:bg-muted/50"
            >
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Extrato</span>
            </TabsTrigger>

            <TabsTrigger
              value="indicadores"
              className="flex items-center justify-center gap-1 sm:gap-2 rounded-md sm:rounded-lg px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 
                         text-[10px] sm:text-xs md:text-sm font-medium transition-all
                         data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                         data-[state=active]:shadow-md hover:bg-muted/50"
            >
              <PieChart className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline sm:hidden md:inline">Indicadores</span>
            </TabsTrigger>

            <TabsTrigger
              value="lancamentos"
              className="flex items-center justify-center gap-1 sm:gap-2 rounded-md sm:rounded-lg px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 
                         text-[10px] sm:text-xs md:text-sm font-medium transition-all
                         data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                         data-[state=active]:shadow-md hover:bg-muted/50"
            >
              <ListChecks className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline sm:hidden md:inline">Lançamentos</span>
            </TabsTrigger>

            <TabsTrigger
              value="sinistros"
              className="flex items-center justify-center gap-1 sm:gap-2 rounded-md sm:rounded-lg px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 
                         text-[10px] sm:text-xs md:text-sm font-medium transition-all
                         data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                         data-[state=active]:shadow-md hover:bg-muted/50"
            >
              <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Sinistros</span>
            </TabsTrigger>

            <TabsTrigger
              value="comite"
              className="flex items-center justify-center gap-1 sm:gap-2 rounded-md sm:rounded-lg px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 
                         text-[10px] sm:text-xs md:text-sm font-medium transition-all
                         data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                         data-[state=active]:shadow-md hover:bg-muted/50"
            >
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Comitê</span>
            </TabsTrigger>
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

      {/* Modal Gerenciar Usuários PID */}
      {selectedCorretoraData && (
        <GerenciarUsuariosCorretoraDialog
          open={usuariosDialogOpen}
          onOpenChange={setUsuariosDialogOpen}
          corretoraId={selectedCorretoraData.id}
          corretoraNome={selectedCorretoraData.nome}
        />
      )}
    </div>
  );
}
