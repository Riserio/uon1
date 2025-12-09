import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, CheckCircle2, Workflow } from "lucide-react";

interface ConcluirFluxoManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimentoId: string;
  currentFluxoId: string;
  currentStatus: string;
  onConfirm: (fluxoId: string | null, status: string | null) => void;
}

interface Fluxo {
  id: string;
  nome: string;
  cor: string | null;
}

interface StatusConfig {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
}

export function ConcluirFluxoManualDialog({
  open,
  onOpenChange,
  atendimentoId,
  currentFluxoId,
  currentStatus,
  onConfirm,
}: ConcluirFluxoManualDialogProps) {
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusConfig[]>([]);
  const [selectedFluxo, setSelectedFluxo] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadFluxos();
      setSelectedFluxo("");
      setSelectedStatus("");
    }
  }, [open]);

  useEffect(() => {
    if (selectedFluxo) {
      loadStatusForFluxo(selectedFluxo);
    } else {
      setStatusOptions([]);
      setSelectedStatus("");
    }
  }, [selectedFluxo]);

  const loadFluxos = async () => {
    const { data } = await supabase
      .from("fluxos")
      .select("id, nome, cor")
      .eq("ativo", true)
      .neq("id", currentFluxoId)
      .order("ordem");

    if (data) {
      setFluxos(data);
    }
  };

  const loadStatusForFluxo = async (fluxoId: string) => {
    const { data } = await supabase
      .from("status_config")
      .select("id, nome, cor, ordem")
      .eq("fluxo_id", fluxoId)
      .eq("ativo", true)
      .order("ordem");

    if (data) {
      setStatusOptions(data);
      if (data.length > 0) {
        setSelectedStatus(data[0].nome);
      }
    }
  };

  const handleConfirm = () => {
    setLoading(true);
    onConfirm(selectedFluxo || null, selectedStatus || null);
    setLoading(false);
    onOpenChange(false);
  };

  const handleConcluirSemMover = () => {
    onConfirm(null, null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Card Finalizado</DialogTitle>
          <DialogDescription>
            Este card chegou ao status final do fluxo atual. Deseja direcioná-lo
            para outro fluxo?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          <Button
            variant="outline"
            className="h-32 flex flex-col items-center justify-center gap-3 hover:bg-green-500/10 hover:border-green-500 transition-all"
            onClick={handleConcluirSemMover}
          >
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <div className="text-center">
              <p className="font-semibold">Apenas Finalizar</p>
              <p className="text-xs text-muted-foreground">Manter no fluxo atual</p>
            </div>
          </Button>

          <div className="h-32 flex flex-col items-center justify-center gap-3 border rounded-md border-dashed border-primary/50 bg-primary/5">
            <Workflow className="h-10 w-10 text-primary" />
            <div className="text-center">
              <p className="font-semibold text-sm">Mover para Fluxo</p>
              <p className="text-xs text-muted-foreground">Selecione abaixo</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Select value={selectedFluxo} onValueChange={setSelectedFluxo}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um fluxo" />
            </SelectTrigger>
            <SelectContent>
              {fluxos.map((fluxo) => (
                <SelectItem key={fluxo.id} value={fluxo.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: fluxo.cor || "#6b7280" }}
                    />
                    {fluxo.nome}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedFluxo && statusOptions.length > 0 && (
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status.id} value={status.nome}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: status.cor || "#6b7280" }}
                      />
                      {status.nome}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {selectedFluxo && selectedStatus && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span>
                Mover para{" "}
                <strong className="text-foreground">
                  {fluxos.find((f) => f.id === selectedFluxo)?.nome}
                </strong>{" "}
                → <strong className="text-foreground">{selectedStatus}</strong>
              </span>
            </div>
          )}

          {selectedFluxo && selectedStatus && (
            <Button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full"
            >
              {loading ? "Movendo..." : "Confirmar e Mover"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
