import { useState, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Clock, UserCircle, Briefcase, Users, CalendarClock, Shield } from "lucide-react";
import GestaoJornada from "@/components/gestao/GestaoJornada";
import Usuarios from "@/pages/Usuarios";
import { useAuth } from "@/hooks/useAuth";

export default function Gestao() {
  const { userRole } = useAuth();
  const canManageUsers = userRole === "admin" || userRole === "administrativo" || userRole === "superintendente";
  const defaultTab = canManageUsers ? "usuarios" : "jornada";
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    if (activeTab !== "jornada" && activeTab !== "usuarios") {
      setActiveTab(defaultTab);
    }
  }, [activeTab, defaultTab]);

  const tabs = [
    { id: "usuarios", label: "Usuários", icon: UserCircle, visible: canManageUsers, description: "Gerenciar usuários, permissões e acessos", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { id: "jornada", label: "Jornada de Trabalho", icon: CalendarClock, visible: true, description: "Controle de ponto e banco de horas", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  ].filter(tab => tab.visible);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 sm:px-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Briefcase className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Gestão</h1>
            <p className="text-sm text-muted-foreground">Central de gerenciamento do sistema</p>
          </div>
        </div>

        {/* Navigation Cards - Widget Style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        {/* Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsContent value="jornada" className="mt-0">
            <div className="rounded-2xl border border-border/50 bg-card p-4 sm:p-6">
              <GestaoJornada />
            </div>
          </TabsContent>

          {canManageUsers && (
            <TabsContent value="usuarios" className="mt-0">
              <div className="rounded-2xl border border-border/50 bg-card p-4 sm:p-6">
                <Usuarios />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
