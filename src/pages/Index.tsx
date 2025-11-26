import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ColorSelector } from "./ColorSelector"; // ou defina no mesmo arquivo

interface WorkflowConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigChange?: () => void;
}

type Fluxo = {
  id: string;
  nome: string;
  cor: string | null;
  ordem: number;
};

type StatusConfig = {
  id: string;
  nome: string;
  cor: string | null;
  fluxo_id: string;
  ordem: number;
  is_final: boolean;
};

export function WorkflowConfigDialog({ open, onOpenChange, onConfigChange }: WorkflowConfigDialogProps) {
  const [tab, setTab] = useState<"fluxos" | "status">("fluxos");
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: fluxosData, error: fluxosError } = await supabase
        .from("fluxos")
        .select("*")
        .order("ordem", { ascending: true });

      if (fluxosError) throw fluxosError;

      const { data: statusData, error: statusError } = await supabase
        .from("status_config")
        .select("*")
        .order("fluxo_id", { ascending: true })
        .order("ordem", { ascending: true });

      if (statusError) throw statusError;

      setFluxos(fluxosData as Fluxo[]);
      setStatuses(statusData as StatusConfig[]);
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao carregar fluxos e status");
    } finally {
      setLoading(false);
    }
  };

  const handleAddFluxo = () => {
    setFluxos((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        nome: "Novo fluxo",
        cor: "#0ea5e9",
        ordem: prev.length + 1,
      },
    ]);
  };

  const handleAddStatus = () => {
    if (!fluxos.length) {
      toast.warning("Crie ao menos um fluxo antes de adicionar status.");
      return;
    }

    setStatuses((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        nome: "Novo status",
        cor: "#22c55e",
        fluxo_id: fluxos[0].id,
        ordem: prev.length + 1,
        is_final: false,
      },
    ]);
  };

  const handleSave = async () => {
    try {
      setLoading(true);

      // Aqui você adapta para seu esquema de upsert/insert/update real
      // Exemplo simples (cuidado com deletados na prática):
      const { error: fluxoError } = await supabase.from("fluxos").upsert(
        fluxos.map((f) => ({
          id: f.id,
          nome: f.nome,
          cor: f.cor,
          ordem: f.ordem,
        })),
      );
      if (fluxoError) throw fluxoError;

      const { error: statusError } = await supabase.from("status_config").upsert(
        statuses.map((s) => ({
          id: s.id,
          nome: s.nome,
          cor: s.cor,
          fluxo_id: s.fluxo_id,
          ordem: s.ordem,
          is_final: s.is_final,
        })),
      );
      if (statusError) throw statusError;

      toast.success("Fluxos e status salvos com sucesso!");
      onConfigChange?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] w-[95vw]">
        <DialogHeader>
          <DialogTitle>Configuração de Fluxos e Status</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="fluxos">Fluxos</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
          </TabsList>

          {/* ---------- ABA FLUXOS ---------- */}
          <TabsContent value="fluxos" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Configure os fluxos de trabalho</h3>
              <Button size="sm" onClick={handleAddFluxo}>
                Novo fluxo
              </Button>
            </div>

            <ScrollArea className="h-[360px] pr-3">
              <div className="space-y-4">
                {fluxos.map((fluxo, index) => (
                  <div key={fluxo.id} className="rounded-lg border bg-card p-4 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 space-y-2">
                        <Label>Nome do fluxo</Label>
                        <Input
                          value={fluxo.nome}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFluxos((prev) => prev.map((f) => (f.id === fluxo.id ? { ...f, nome: value } : f)));
                          }}
                        />
                      </div>

                      <div className="w-40 space-y-2">
                        <Label>Cor do fluxo</Label>
                        <ColorSelector
                          value={fluxo.cor || undefined}
                          onChange={(color) =>
                            setFluxos((prev) => prev.map((f) => (f.id === fluxo.id ? { ...f, cor: color } : f)))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {fluxos.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum fluxo cadastrado. Clique em <span className="font-semibold">Novo fluxo</span> para começar.
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ---------- ABA STATUS ---------- */}
          <TabsContent value="status" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Configure os status de cada fluxo</h3>
              <Button size="sm" onClick={handleAddStatus}>
                Novo status
              </Button>
            </div>

            <ScrollArea className="h-[360px] pr-3">
              <div className="space-y-4">
                {statuses.map((status) => (
                  <div key={status.id} className="rounded-lg border bg-card p-4 space-y-3 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-[2fr,2fr,1.5fr] gap-4">
                      <div className="space-y-2">
                        <Label>Nome do status</Label>
                        <Input
                          value={status.nome}
                          onChange={(e) => {
                            const value = e.target.value;
                            setStatuses((prev) => prev.map((s) => (s.id === status.id ? { ...s, nome: value } : s)));
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Fluxo</Label>
                        <select
                          className="border rounded-md px-3 py-2 text-sm bg-background"
                          value={status.fluxo_id}
                          onChange={(e) => {
                            const value = e.target.value;
                            setStatuses((prev) =>
                              prev.map((s) => (s.id === status.id ? { ...s, fluxo_id: value } : s)),
                            );
                          }}
                        >
                          {fluxos.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.nome}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label>Cor do status</Label>
                        {/* MESMO MODELO DE CORES DOS FLUXOS */}
                        <ColorSelector
                          value={status.cor || undefined}
                          onChange={(color) =>
                            setStatuses((prev) => prev.map((s) => (s.id === status.id ? { ...s, cor: color } : s)))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {statuses.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum status cadastrado. Clique em <span className="font-semibold">Novo status</span> para começar.
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={loading}>
            {loading ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
