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
import BIAdminDashboard from "@/components/bi/BIAdminDashboard";
import { useBILayout } from "@/contexts/BILayoutContext";
import { useState } from "react";
import { 
  Users, BarChart3, Car, ShieldCheck, MessageSquare, Calendar, Activity, Upload
} from "lucide-react";

export default function PID() {
  const { associacoes, selectedAssociacao, isAdminView } = useBILayout();
  const [usuariosDialogOpen, setUsuariosDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  const selectedAssociacaoData = associacoes.find((c) => c.id === selectedAssociacao);

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
    <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
      {isAdminView ? (
        <BIAdminDashboard />
      ) : (
        <>
          {/* Actions row - aligned right */}
          {selectedAssociacao && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUsuariosDialogOpen(true)}
                className="gap-2 rounded-xl"
              >
                <Users className="h-4 w-4" />
                <span className="text-sm">Gerenciar Usuários</span>
              </Button>
            </div>
          )}

          {/* Tabs - Widget style matching other pages */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="flex items-center gap-1.5 p-1.5 bg-muted/40 rounded-2xl w-fit min-w-full sm:min-w-0">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
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

      {selectedAssociacaoData && (
        <GerenciarUsuariosCorretoraDialog
          open={usuariosDialogOpen}
          onOpenChange={setUsuariosDialogOpen}
          corretoraId={selectedAssociacaoData.id}
          corretoraNome={selectedAssociacaoData.nome}
        />
      )}
    </div>
  );
}
