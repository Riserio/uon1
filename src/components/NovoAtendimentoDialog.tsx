import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface NovoAtendimentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NovoAtendimentoDialog({ open, onOpenChange }: NovoAtendimentoDialogProps) {
  const navigate = useNavigate();

  const handleAberturaManual = () => {
    onOpenChange(false);
    navigate("/vistorias/nova/manual?returnTo=/atendimentos");
  };

  const handleAberturaDigital = () => {
    onOpenChange(false);
    navigate("/vistorias/nova/digital?returnTo=/atendimentos");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Atendimento</DialogTitle>
          <DialogDescription>
            Selecione o tipo de abertura que deseja realizar
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4 py-4">
          <Button
            variant="outline"
            className="h-32 flex flex-col items-center justify-center gap-3 hover:bg-primary/10 hover:border-primary transition-all"
            onClick={handleAberturaManual}
          >
            <FileText className="h-10 w-10 text-primary" />
            <div className="text-center">
              <p className="font-semibold">Abertura Manual</p>
              <p className="text-xs text-muted-foreground">Formulário interno</p>
            </div>
          </Button>
          
          <Button
            variant="outline"
            className="h-32 flex flex-col items-center justify-center gap-3 hover:bg-blue-500/10 hover:border-blue-500 transition-all"
            onClick={handleAberturaDigital}
          >
            <Smartphone className="h-10 w-10 text-blue-500" />
            <div className="text-center">
              <p className="font-semibold">Abertura Digital</p>
              <p className="text-xs text-muted-foreground">Link para cliente</p>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
