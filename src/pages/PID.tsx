import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import BIPageHeader from "@/components/bi/BIPageHeader";
import BIAdminDashboard from "@/components/bi/BIAdminDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Users, BarChart3, Car, ShieldCheck, MessageSquare, Calendar, Activity, Upload
} from "lucide-react";
import { useSearchParams } from "react-router-dom";

export default function PID() {
  const { user, userRole } = useAuth();
  const [searchParams] = useSearchParams();
  const [associacoes, setAssociacoes] = useState<any[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [usuariosDialogOpen, setUsuariosDialogOpen] = useState(false);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  const canViewHistorico = userRole === "superintendente" || userRole === "admin";
  const canViewAdmin = userRole === "superintendente" || userRole === "administrativo";
  const isAdminView = selectedAssociacao === "__admin__";
  const selectedAssociacaoData = associacoes.find((c) => c.id === selectedAssociacao);

  useEffect(() => {
    async function fetchAssociacoes() {
      try {
        const { data, error } = await supabase.from("corretoras").select("id, nome, slug").order("nome");
        if (error) throw error;
        setAssociacoes(data || []);
        
        const associacaoParam = searchParams.get("associacao") || searchParams.get("corretora");
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header unificado com navegação entre módulos */}
      <BIPageHeader
        title={isAdminView ? "BI - Administradora" : "BI - Indicadores"}
        subtitle={isAdminView ? "Visão consolidada de todas as associações, automações e acessos" : "Visão consolidada dos indicadores operacionais, financeiros e de sinistros"}
        associacoes={associacoes}
        selectedAssociacao={selectedAssociacao}
        onAssociacaoChange={setSelectedAssociacao}
        loadingAssociacoes={loading}
        currentModule={isAdminView ? "admin" : "indicadores"}
        showHistorico={canViewHistorico && !isAdminView}
        onHistoricoClick={() => setHistoricoDialogOpen(true)}
        showAdminOption={canViewAdmin}
      />

      <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        {isAdminView ? (
          <BIAdminDashboard />
        ) : (
          <>
            {/* Gerenciar Usuários */}
            {selectedAssociacao && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUsuariosDialogOpen(true)}
                  className="gap-2"
                >
                  <Users className="h-4 w-4" />
                  <span className="text-sm">Gerenciar Usuários</span>
                </Button>
              </div>
            )}

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
          </>
        )}
      </div>

      {selectedAssociacaoData && (
        <GerenciarUsuariosCorretoraDialog
          open={usuariosDialogOpen}
          onOpenChange={setUsuariosDialogOpen}
          corretoraId={selectedAssociacaoData.id}
          corretoraNome={selectedAssociacaoData.nome}
        />
      )}

      <BIAuditLogDialog
        open={historicoDialogOpen}
        onOpenChange={setHistoricoDialogOpen}
        modulo="bi_indicadores"
        corretoraId={selectedAssociacao}
      />
    </div>
  );
}
