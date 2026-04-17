import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Paperclip, CalendarOff } from "lucide-react";
import AnexosPontoDialog from "./AnexosPontoDialog";
import GerenciarAusenciasDialog from "./GerenciarAusenciasDialog";
import { useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionarioId: string;
  funcionarioNome: string;
}

/**
 * Dialog unificado: combina "Anexos de Ponto" e "Abonos / Folgas / Férias"
 * em um único modal com abas para simplificar a UX.
 *
 * Reaproveita os componentes existentes renderizando-os "inline" via prop `open`
 * controlada pela aba ativa — assim a lógica/UI de cada um permanece intacta.
 */
export default function AnexosAbonosDialog({
  open,
  onOpenChange,
  funcionarioId,
  funcionarioNome,
}: Props) {
  const [tab, setTab] = useState<"anexos" | "abonos">("anexos");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Anexos & Abonos</DialogTitle>
          <DialogDescription>
            {funcionarioNome
              ? `Gestão de documentos, abonos, folgas e férias de ${funcionarioNome}`
              : "Gestão de documentos, abonos, folgas e férias"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "anexos" | "abonos")} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="anexos" className="gap-2">
                <Paperclip className="h-4 w-4" />
                Anexos de Ponto
              </TabsTrigger>
              <TabsTrigger value="abonos" className="gap-2">
                <CalendarOff className="h-4 w-4" />
                Abonos / Folgas / Férias
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="anexos" className="flex-1 overflow-y-auto px-2 mt-2">
            {/* Renderiza o conteúdo do AnexosPontoDialog em "modo embutido" */}
            <AnexosPontoDialog
              open={open && tab === "anexos"}
              onOpenChange={() => {}}
              funcionarioId={funcionarioId}
              funcionarioNome={funcionarioNome}
              embedded
            />
          </TabsContent>

          <TabsContent value="abonos" className="flex-1 overflow-y-auto px-2 mt-2">
            <GerenciarAusenciasDialog
              open={open && tab === "abonos"}
              onOpenChange={() => {}}
              funcionarioId={funcionarioId}
              funcionarioNome={funcionarioNome}
              embedded
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
