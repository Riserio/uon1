import { useState, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CalendarClock, Briefcase, Activity, LayoutDashboard } from "lucide-react";
import GestaoJornada from "@/components/gestao/GestaoJornada";
import AnaliseFuncionario from "@/components/gestao/AnaliseFuncionario";
import AdminJornadaDashboard from "@/components/gestao/AdminJornadaDashboard";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";

export default function Gestao() {
  const { userRole } = useAuth();
  const canSeeAdmin = userRole === "admin" || userRole === "administrativo" || userRole === "superintendente";
  const canSeeAnalise = canSeeAdmin;
  const [activeTab, setActiveTab] = useState(canSeeAdmin ? "dashboard" : "jornada");

  useEffect(() => {
    if ((activeTab === "analise" && !canSeeAnalise) || (activeTab === "dashboard" && !canSeeAdmin)) {
      setActiveTab("jornada");
    }
  }, [activeTab, canSeeAnalise, canSeeAdmin]);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, visible: canSeeAdmin, description: "Visão em tempo real da equipe", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { id: "jornada", label: "Jornada de Trabalho", icon: CalendarClock, visible: true, description: "Controle de ponto e banco de horas", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { id: "analise", label: "Análise de Funcionário", icon: Activity, visible: canSeeAnalise, description: "Desempenho e feedback individual", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  ].filter(tab => tab.visible);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 sm:px-6 space-y-6">
        <PageHeader
          icon={Briefcase}
          title="Gestão"
          subtitle="Central de gerenciamento do sistema"
        />

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${tabs.length >= 3 ? 'lg:grid-cols-3' : ''} gap-3`}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-left rounded-2xl border p-5 transition-all duration-200 ${
                  isActive 
                    ? "border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/20" 
                    : "border-border/50 bg-card hover:border-border hover:shadow-sm"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                    isActive ? "bg-primary text-primary-foreground" : tab.color.split(" ")[0] + " " + tab.color.split(" ").slice(1).join(" ")
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className={`font-semibold text-sm ${isActive ? "text-primary" : "text-foreground"}`}>
                      {tab.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {tab.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {canSeeAdmin && (
            <TabsContent value="dashboard" className="mt-0">
              <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 via-card to-card p-4 sm:p-6">
                <AdminJornadaDashboard />
              </div>
            </TabsContent>
          )}

          <TabsContent value="jornada" className="mt-0">
            <div className="rounded-2xl border border-border/50 bg-card p-4 sm:p-6">
              <GestaoJornada />
            </div>
          </TabsContent>

          {canSeeAnalise && (
            <TabsContent value="analise" className="mt-0">
              <div className="rounded-2xl border border-border/50 bg-card p-4 sm:p-6">
                <AnaliseFuncionario />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
