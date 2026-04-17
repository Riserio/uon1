import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CalendarOff } from "lucide-react";
import GerenciarAusenciasDialog from "./GerenciarAusenciasDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionarioId: string;
  funcionarioNome: string;
}

/**
 * Dialog unificado: gerencia abonos, folgas e férias do funcionário,
 * com possibilidade de anexar arquivo (atestado, comprovante, etc.) diretamente
 * no formulário de cada registro.
 */
export default function AnexosAbonosDialog({
  open,
  onOpenChange,
  funcionarioId,
  funcionarioNome,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-primary" />
            Abonos, folgas e férias
          </DialogTitle>
          <DialogDescription>
            {funcionarioNome
              ? `Gerenciando ausências de ${funcionarioNome}`
              : "Selecione o tipo, período e (opcionalmente) anexe um documento."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <GerenciarAusenciasDialog
            open={open}
            onOpenChange={() => {}}
            funcionarioId={funcionarioId}
            funcionarioNome={funcionarioNome}
            embedded
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
