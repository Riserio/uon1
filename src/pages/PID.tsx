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
      <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              PID - Painel de Indicadores e Demonstrativos
            </h1>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base lg:text-lg">
              Gestão completa de dados financeiros e sinistros das corretoras
            </p>
          </div>

          {/* Seleção de Corretora */}
          <Card className="border-2 border-primary/10 shadow-lg bg-gradient-to-br from-card to-card/80">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 flex-1 w-full">
                  <Label htmlFor="corretora-select" className="text-base sm:text-lg font-semibold whitespace-nowrap">
                    Selecionar Corretora:
                  </Label>

                  <Select value={selectedCorretora} onValueChange={setSelectedCorretora} disabled={loading}>
                    <SelectTrigger
                      id="corretora-select"
                      className="w-full sm:max-w-md h-11 sm:h-12 border-2 text-sm sm:text-base"
                    >
                      <SelectValue placeholder="Escolha uma corretora..." />
                    </SelectTrigger>

                    <SelectContent>
                      {corretoras.map((corretora) => (
                        <SelectItem
                          key={corretora.id}
                          value={corretora.id}
                          className="text-sm sm:text-base py-2 sm:py-3"
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
                    className="gap-2 whitespace-nowrap w-full sm:w-auto"
                  >
                    <Users className="h-4 w-4" />
                    <span className="text-sm">Gerenciar Usuários PID</span>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Abas */}
        <Tabs defaultValue="kpi" className="space-y-6">
          {/* Responsivo: scroll horizontal no mobile, grid em telas maiores */}
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
