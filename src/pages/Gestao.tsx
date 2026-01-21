import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Settings, UserCircle, Briefcase } from "lucide-react";
import GestaoJornada from "@/components/gestao/GestaoJornada";
import Usuarios from "@/pages/Usuarios";
import Configuracoes from "@/pages/Configuracoes";
import { useAuth } from "@/hooks/useAuth";

export default function Gestao() {
  const { userRole } = useAuth();

  const isAdmin = userRole === "admin" || userRole === "superintendente";
  const canManageUsers = userRole === "admin" || userRole === "administrativo" || userRole === "superintendente";

  const defaultTab = canManageUsers ? "usuarios" : "jornada";
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    if (!isAdmin && activeTab !== "jornada" && activeTab !== "usuarios") {
      setActiveTab("jornada");
    }
  }, [isAdmin, activeTab]);

  const tabs = [
    { id: "usuarios", label: "Usuários", shortLabel: "Usuários", icon: UserCircle, visible: canManageUsers, description: "Gerenciar usuários e funcionários" },
    { id: "jornada", label: "Jornada", shortLabel: "Jornada", icon: Clock, visible: true, description: "Controle de ponto" },
    { id: "configuracoes", label: "Configurações", shortLabel: "Config", icon: Settings, visible: isAdmin, description: "Ajustes do sistema" },
  ].filter(tab => tab.visible);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Briefcase className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Gestão</h1>
              <p className="text-muted-foreground">Central de gerenciamento do sistema</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className={`grid grid-cols-2 lg:grid-cols-${tabs.length} gap-4 mb-8`}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Card 
                key={tab.id}
                className={`cursor-pointer transition-all duration-200 hover:shadow-md border-border/50 ${
                  isActive ? 'ring-2 ring-primary/50 bg-primary/5' : 'bg-card/50 backdrop-blur-sm'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className={`font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}>
                        {tab.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tab.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="hidden">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="jornada" className="mt-0 animate-in fade-in-50 duration-300">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
              <CardContent className="p-6">
                <GestaoJornada />
              </CardContent>
            </Card>
          </TabsContent>

          {canManageUsers && (
            <TabsContent value="usuarios" className="mt-0 animate-in fade-in-50 duration-300">
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-6">
                  <Usuarios />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="configuracoes" className="mt-0 animate-in fade-in-50 duration-300">
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-6">
                  <Configuracoes />
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
