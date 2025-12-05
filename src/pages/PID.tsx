import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PIDDashboard from "@/components/portal/PIDDashboard";
import PIDOperacional from "@/components/portal/PIDOperacional";
import PIDEstudoBase from "@/components/portal/PIDEstudoBase";
import PIDHistorico from "@/components/portal/PIDHistorico";
import PIDImportacao from "@/components/portal/PIDImportacao";
import PortalSinistros from "@/components/portal/PortalSinistros";
import PortalComite from "@/components/portal/PortalComite";
import { GerenciarUsuariosCorretoraDialog } from "@/components/GerenciarUsuariosCorretoraDialog";
import { BIAuditLogDialog } from "@/components/BIAuditLogDialog";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Users, BarChart3, Car, ShieldCheck, MessageSquare, Calendar, Activity, Database, Upload, History
} from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function PID() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [associacoes, setAssociacoes] = useState<any[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [usuariosDialogOpen, setUsuariosDialogOpen] = useState(false);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Verifica se pode ver histórico (superintendente ou admin)
  const canViewHistorico = userRole === "superintendente" || userRole === "admin";

  const selectedAssociacaoData = associacoes.find((c) => c.id === selectedAssociacao);

  useEffect(() => {
    async function fetchAssociacoes() {
      try {
        const { data, error } = await supabase.from("corretoras").select("id, nome, slug").order("nome");

        if (error) throw error;

        setAssociacoes(data || []);
        
        const associacaoParam = searchParams.get("corretora");
        if (associacaoParam && data?.some(c => c.id === associacaoParam)) {
          setSelectedAssociacao(associacaoParam);
        } else if (data && data.length > 0) {
          setSelectedAssociacao(data[0].id);
        }
      } catch (error) {
        console.error("Erro ao carregar associações:", error);
        toast.error("Erro ao carregar associações");
      } finally {
        setLoading(false);
      }
    }

    fetchAssociacoes();
  }, [searchParams]);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "operacional", label: "Operacional", icon: Activity },
    { id: "estudo-base", label: "Estudo de Base", icon: Car },
    { id: "historico", label: "Histórico", icon: Calendar },
    { id: "importacao", label: "Importação", icon: Upload },
    { id: "sinistros", label: "Sinistros", icon: ShieldCheck },
    { id: "comite", label: "Comitê", icon: MessageSquare },
  ];

  const handleNavigateToSGA = () => {
    if (selectedAssociacao) {
      navigate({
        pathname: "/sga-insights",
        search: `?associacao=${selectedAssociacao}`
      });
    } else {
      navigate("/sga-insights");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                BI - Indicadores
              </h1>
              <p className="text-muted-foreground mt-2 text-sm sm:text-base lg:text-lg">
                Gestão completa de dados financeiros e sinistros das associações
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Botão Histórico - só para superintendente e admin */}
              {canViewHistorico && (
                <Button
                  variant="outline"
                  onClick={() => setHistoricoDialogOpen(true)}
                  className="gap-2"
                >
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Histórico</span>
                </Button>
              )}
              
              {/* Botão SGA Insights */}
              <Button
                onClick={handleNavigateToSGA}
                className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
              >
                <Database className="h-4 w-4" />
                <span>SGA Insights</span>
              </Button>
            </div>
          </div>

          {/* Seleção de Associação */}
          <Card className="border-2 border-primary/10 shadow-lg bg-gradient-to-br from-card to-card/80">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 flex-1 w-full">
                  <Label htmlFor="associacao-select" className="text-base sm:text-lg font-semibold whitespace-nowrap">
                    Selecionar Associação:
                  </Label>

                  <Select value={selectedAssociacao} onValueChange={setSelectedAssociacao} disabled={loading}>
                    <SelectTrigger
                      id="associacao-select"
                      className="w-full sm:max-w-md h-11 sm:h-12 border-2 text-sm sm:text-base"
                    >
                      <SelectValue placeholder="Escolha uma associação..." />
                    </SelectTrigger>

                    <SelectContent>
                      {associacoes.map((associacao) => (
                        <SelectItem
                          key={associacao.id}
                          value={associacao.id}
                          className="text-sm sm:text-base py-2 sm:py-3"
                        >
                          {associacao.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedAssociacao && (
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
            <PIDDashboard corretoraId={selectedAssociacao} />
          </TabsContent>

          <TabsContent value="operacional" className="space-y-4 mt-0">
            <PIDOperacional corretoraId={selectedAssociacao} />
          </TabsContent>

          <TabsContent value="estudo-base" className="space-y-4 mt-0">
            <PIDEstudoBase corretoraId={selectedAssociacao} />
          </TabsContent>

          <TabsContent value="historico" className="space-y-4 mt-0">
            <PIDHistorico corretoraId={selectedAssociacao} />
          </TabsContent>

          <TabsContent value="importacao" className="space-y-4 mt-0">
            <PIDImportacao 
              corretoraId={selectedAssociacao} 
              onImportSuccess={() => setActiveTab("operacional")} 
            />
          </TabsContent>

          <TabsContent value="sinistros" className="space-y-4 mt-0">
            <PortalSinistros corretoraId={selectedAssociacao} />
          </TabsContent>

          <TabsContent value="comite" className="space-y-4 mt-0">
            <PortalComite corretoraId={selectedAssociacao} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal Gerenciar Usuários PID */}
      {selectedAssociacaoData && (
        <GerenciarUsuariosCorretoraDialog
          open={usuariosDialogOpen}
          onOpenChange={setUsuariosDialogOpen}
          corretoraId={selectedAssociacaoData.id}
          corretoraNome={selectedAssociacaoData.nome}
        />
      )}

      {/* Modal Histórico de Alterações */}
      <BIAuditLogDialog
        open={historicoDialogOpen}
        onOpenChange={setHistoricoDialogOpen}
        modulo="bi_indicadores"
        corretoraId={selectedAssociacao}
      />
    </div>
  );
}
