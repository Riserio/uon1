import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileSignature, Users, Clock, Megaphone, Settings, UserCircle } from "lucide-react";
import GestaoContratos from "@/components/gestao/GestaoContratos";
import GestaoFuncionarios from "@/components/gestao/GestaoFuncionarios";
import GestaoJornada from "@/components/gestao/GestaoJornada";
import Usuarios from "@/pages/Usuarios";
import Comunicados from "@/pages/Comunicados";
import Configuracoes from "@/pages/Configuracoes";
import { useAuth } from "@/hooks/useAuth";

export default function Gestao() {
  const { userRole } = useAuth();

  const isAdmin = userRole === "admin" || userRole === "superintendente";
  const canManageUsers = userRole === "admin" || userRole === "administrativo" || userRole === "superintendente";

  // For non-admin users, default to jornada tab
  const defaultTab = isAdmin ? "contratos" : "jornada";
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Update tab when role changes
  useEffect(() => {
    if (!isAdmin && activeTab !== "jornada") {
      setActiveTab("jornada");
    }
  }, [isAdmin]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Gestão</h1>
          <p className="text-muted-foreground mt-1">
            Central de gerenciamento do sistema
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 w-full lg:w-auto lg:inline-flex bg-muted/50 p-1">
            {isAdmin && (
              <TabsTrigger value="contratos" className="flex items-center gap-2 data-[state=active]:bg-background">
                <FileSignature className="h-4 w-4" />
                <span className="hidden sm:inline">Uon1Sign</span>
                <span className="sm:hidden">Sign</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="funcionarios" className="flex items-center gap-2 data-[state=active]:bg-background">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Funcionários</span>
                <span className="sm:hidden">RH</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="jornada" className="flex items-center gap-2 data-[state=active]:bg-background">
              <Clock className="h-4 w-4" />
              <span>Jornada</span>
            </TabsTrigger>
            {canManageUsers && (
              <TabsTrigger value="usuarios" className="flex items-center gap-2 data-[state=active]:bg-background">
                <UserCircle className="h-4 w-4" />
                <span>Usuários</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="comunicados" className="flex items-center gap-2 data-[state=active]:bg-background">
                <Megaphone className="h-4 w-4" />
                <span className="hidden sm:inline">Comunicados</span>
                <span className="sm:hidden">Com.</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="configuracoes" className="flex items-center gap-2 data-[state=active]:bg-background">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Configurações</span>
                <span className="sm:hidden">Config</span>
              </TabsTrigger>
            )}
          </TabsList>

          {isAdmin && (
            <TabsContent value="contratos" className="mt-6">
              <GestaoContratos />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="funcionarios" className="mt-6">
              <GestaoFuncionarios />
            </TabsContent>
          )}

          <TabsContent value="jornada" className="mt-6">
            <GestaoJornada />
          </TabsContent>

          {canManageUsers && (
            <TabsContent value="usuarios" className="mt-6">
              <Usuarios />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="comunicados" className="mt-6">
              <Comunicados />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="configuracoes" className="mt-6">
              <Configuracoes />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
