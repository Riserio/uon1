import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Paperclip, CalendarOff, FileText } from "lucide-react";
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
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Anexos & Abonos
          </DialogTitle>
          <DialogDescription>
            {funcionarioNome
              ? `Documentos, abonos, folgas e férias de ${funcionarioNome}`
              : "Documentos, abonos, folgas e férias"}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "anexos" | "abonos")}
          className="flex-1 flex flex-col overflow-hidden"
        >
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

          <TabsContent value="anexos" className="flex-1 overflow-y-auto mt-2">
            <AnexosPontoDialog
              open={open}
              onOpenChange={() => {}}
              funcionarioId={funcionarioId}
              funcionarioNome={funcionarioNome}
              embedded
            />
          </TabsContent>

          <TabsContent value="abonos" className="flex-1 overflow-y-auto mt-2">
            <GerenciarAusenciasDialog
              open={open}
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
