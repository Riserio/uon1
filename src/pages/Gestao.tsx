import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileSignature, Users, Clock } from "lucide-react";
import GestaoContratos from "@/components/gestao/GestaoContratos";
import GestaoFuncionarios from "@/components/gestao/GestaoFuncionarios";
import GestaoJornada from "@/components/gestao/GestaoJornada";

export default function Gestao() {
  const [activeTab, setActiveTab] = useState("contratos");

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Gestão</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie contratos, funcionários e controle de jornada
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
            <TabsTrigger value="contratos" className="flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              <span className="hidden sm:inline">Uon1Sign</span>
              <span className="sm:hidden">Contratos</span>
            </TabsTrigger>
            <TabsTrigger value="funcionarios" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Funcionários</span>
              <span className="sm:hidden">RH</span>
            </TabsTrigger>
            <TabsTrigger value="jornada" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Jornada</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contratos" className="mt-6">
            <GestaoContratos />
          </TabsContent>

          <TabsContent value="funcionarios" className="mt-6">
            <GestaoFuncionarios />
          </TabsContent>

          <TabsContent value="jornada" className="mt-6">
            <GestaoJornada />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
