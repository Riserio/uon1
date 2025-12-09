import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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

  const handleFluxoSelect = (fluxoId: string) => {
    setSelectedFluxo(fluxoId === selectedFluxo ? "" : fluxoId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Card Finalizado</DialogTitle>
          <DialogDescription>
            Este card chegou ao status final. Deseja direcioná-lo para outro fluxo?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-1">
            {fluxos.map((fluxo) => (
              <button
                key={fluxo.id}
                onClick={() => handleFluxoSelect(fluxo.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                  selectedFluxo === fluxo.id
                    ? "bg-primary/10"
                    : "hover:bg-muted/50"
                )}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: fluxo.cor || "#6b7280" }}
                />
                <span className="text-sm font-medium text-foreground">
                  {fluxo.nome}
                </span>
              </button>
            ))}
          </div>

          {selectedFluxo && statusOptions.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">Status inicial:</p>
              <div className="space-y-1">
                {statusOptions.map((status) => (
                  <button
                    key={status.id}
                    onClick={() => setSelectedStatus(status.nome)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                      selectedStatus === status.nome
                        ? "bg-primary/10"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: status.cor || "#6b7280" }}
                    />
                    <span className="text-sm text-foreground">
                      {status.nome}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleConcluirSemMover}
            className="flex-1"
          >
            Apenas finalizar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedFluxo || !selectedStatus || loading}
            className="flex-1"
          >
            {loading ? "Movendo..." : "Mover para fluxo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
