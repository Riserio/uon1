import { Tabs, TabsContent } from "@/components/ui/tabs";
import PIDDashboard from "@/components/portal/PIDDashboard";
import PIDHistorico from "@/components/portal/PIDHistorico";
import SyncStatusHint from "@/components/portal/SyncStatusHint";
import PIDImportacao from "@/components/portal/PIDImportacao";
import EstudoBaseConteudo from "@/components/estudo-base/EstudoBaseConteudo";
import { GerenciarUsuariosCorretoraDialog } from "@/components/GerenciarUsuariosCorretoraDialog";
import BIAdminDashboard from "@/components/bi/BIAdminDashboard";
import { useBILayout } from "@/contexts/BILayoutContext";
import { useState } from "react";
import { Users, BarChart3, Calendar, Upload, Database } from "lucide-react";
export default function PID() {
  const { associacoes, selectedAssociacao, isAdminView } = useBILayout();
  const [usuariosDialogOpen, setUsuariosDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const selectedAssociacaoData = associacoes.find((c) => c.id === selectedAssociacao);
  const tabs = [
    { id: "dashboard", label: "Visão Geral", icon: BarChart3 },
    { id: "estudo-base", label: "Estudo de Base", icon: Database },
    { id: "historico", label: "Histórico", icon: Calendar },
    { id: "importacao", label: "Importação", icon: Upload },
  ];
  return (
    <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
      {isAdminView ? (
        <BIAdminDashboard />
      ) : (
        <>
          {/* Slot onde o Dashboard projeta a barra "Período de análise" (acima das abas) */}
          <div id="pid-filters-slot" className="empty:hidden" />
          {/* Abas + Gerenciar Usuários: tudo no mesmo padrão, centralizado */}
          <div className="overflow-x-auto scrollbar-hide -mx-1 px-1 flex justify-start lg:justify-center">
            <div className="inline-flex items-center gap-1 min-w-max">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-sm whitespace-nowrap transition-all duration-200 ${
                      isActive
                        ? "bg-card text-foreground font-semibold shadow-md"
                        : "text-muted-foreground font-medium hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
              {selectedAssociacao && (
                <button
                  onClick={() => setUsuariosDialogOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium whitespace-nowrap transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Gerenciar Usuários</span>
                </button>
              )}
            </div>
            {/* Carimbo em TODAS as telas do PID, no modulo da aba ativa: cada
                uma olha uma importacao diferente e elas sincronizam em momentos
                distintos, entao a data sem o modulo induziria a erro. */}
            {selectedAssociacao && (
              <div className="flex justify-end pr-1">
                <SyncStatusHint
                  corretoraId={selectedAssociacao}
                  modulo={activeTab === "estudo-base" ? "placas" : undefined}
                />
              </div>
            )}
          </div>
          {/* Tab contents */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="dashboard" className="space-y-4 mt-0">
              <PIDDashboard corretoraId={selectedAssociacao} />
            </TabsContent>
            <TabsContent value="estudo-base" className="space-y-4 mt-0">
              <EstudoBaseConteudo
                corretoraId={selectedAssociacao}
                corretoraNome={selectedAssociacaoData?.nome}
              />
            </TabsContent>
            <TabsContent value="historico" className="space-y-4 mt-0">
              <PIDHistorico corretoraId={selectedAssociacao} />
            </TabsContent>
            <TabsContent value="importacao" className="space-y-4 mt-0">
              <PIDImportacao corretoraId={selectedAssociacao} onImportSuccess={() => setActiveTab("dashboard")} />
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
