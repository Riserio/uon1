import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PIDDashboard from "@/components/portal/PIDDashboard";
import PIDOperacional from "@/components/portal/PIDOperacional";
import PIDEstudoBase from "@/components/portal/PIDEstudoBase";
import PIDHistorico from "@/components/portal/PIDHistorico";
import PortalSinistros from "@/components/portal/PortalSinistros";
import PortalComite from "@/components/portal/PortalComite";
import { GerenciarUsuariosCorretoraDialog } from "@/components/GerenciarUsuariosCorretoraDialog";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, BarChart3, Car, ShieldCheck, MessageSquare, Calendar, Activity } from "lucide-react";
import { useSearchParams } from "react-router-dom";

export default function PID() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [usuariosDialogOpen, setUsuariosDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  const selectedCorretoraData = corretoras.find((c) => c.id === selectedCorretora);

  useEffect(() => {
    async function fetchCorretoras() {
      try {
        const { data, error } = await supabase.from("corretoras").select("id, nome, slug").order("nome");

        if (error) throw error;

        setCorretoras(data || []);

        const corretoraParam = searchParams.get("corretora");
        if (corretoraParam && data?.some((c) => c.id === corretoraParam)) {
          setSelectedCorretora(corretoraParam);
        } else if (data && data.length > 0) {
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
  }, [searchParams]);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "operacional", label: "Operacional", icon: Activity },
    { id: "estudo-base", label: "Estudo de Base", icon: Car },
    { id: "historico", label: "Histórico", icon: Calendar },
    { id: "sinistros", label: "Sinistros", icon: ShieldCheck },
    { id: "comite", label: "Comitê", icon: MessageSquare },
  ];

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

                {selectedCorretora && (
                  <Button
                    variant="outline"
                    onClick={() => setUsuariosDialogOpen(true)}
                    className="gap-2 whitespace-nowrap"
                  >
                    <Users className="h-4 w-4" />
                    <span className="text-sm">Gerenciar Usuários</span>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Abas */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="w-full overflow-x-auto pb-2">
            <TabsList className="inline-flex md:flex md:w-full gap-1 p-1.5 bg-muted/40 rounded-xl min-w-max md:min-w-0">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                               text-muted-foreground transition-all
                               data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                               data-[state=active]:shadow-md hover:text-foreground hover:bg-muted/60
                               whitespace-nowrap"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-4 mt-0">
            <PIDDashboard corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="operacional" className="space-y-4 mt-0">
            <PIDOperacional corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="estudo-base" className="space-y-4 mt-0">
            <PIDEstudoBase corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="historico" className="space-y-4 mt-0">
            <PIDHistorico corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="sinistros" className="space-y-4 mt-0">
            <PortalSinistros corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="comite" className="space-y-4 mt-0">
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
