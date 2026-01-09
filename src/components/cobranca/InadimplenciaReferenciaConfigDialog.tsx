import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

interface InadimplenciaReferenciaConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  corretoraId: string;
  mesReferencia: string; // formato YYYY-MM
  onSave: () => void;
}

interface DiaConfig {
  dia: number;
  percentual: number;
}

export function InadimplenciaReferenciaConfigDialog({
  open,
  onOpenChange,
  corretoraId,
  mesReferencia,
  onSave,
}: InadimplenciaReferenciaConfigDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [diasConfig, setDiasConfig] = useState<DiaConfig[]>([]);

  // Calcular dias do mês
  const getDiasDoMes = () => {
    if (!mesReferencia) return 31;
    const [ano, mes] = mesReferencia.split("-").map(Number);
    return new Date(ano, mes, 0).getDate();
  };

  useEffect(() => {
    if (open && mesReferencia && corretoraId) {
      loadConfig();
    }
  }, [open, mesReferencia, corretoraId]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const diasDoMes = getDiasDoMes();
      
      // Buscar configurações existentes
      const { data, error } = await supabase
        .from("cobranca_inadimplencia_config")
        .select("dia, percentual_referencia")
        .eq("corretora_id", corretoraId)
        .eq("mes_referencia", mesReferencia);

      if (error) throw error;

      // Criar array com todos os dias, preenchendo com valores do banco ou padrão 30%
      const configMap = new Map(data?.map(d => [d.dia, d.percentual_referencia]) || []);
      const novaConfig: DiaConfig[] = [];
      
      for (let dia = 1; dia <= diasDoMes; dia++) {
        novaConfig.push({
          dia,
          percentual: configMap.get(dia) ?? 30,
        });
      }
      
      setDiasConfig(novaConfig);
    } catch (error) {
      console.error("Erro ao carregar configuração:", error);
      toast.error("Erro ao carregar configuração");
    } finally {
      setLoading(false);
    }
  };

  const handlePercentualChange = (dia: number, value: string) => {
    const numValue = Math.min(100, Math.max(0, Number(value) || 0));
    setDiasConfig(prev => 
      prev.map(d => d.dia === dia ? { ...d, percentual: numValue } : d)
    );
  };

  const handleSave = async () => {
    if (!corretoraId || !mesReferencia) return;
    
    setSaving(true);
    try {
      // Deletar configurações existentes para este mês
      await supabase
        .from("cobranca_inadimplencia_config")
        .delete()
        .eq("corretora_id", corretoraId)
        .eq("mes_referencia", mesReferencia);

      // Inserir novas configurações
      const inserts = diasConfig.map(d => ({
        corretora_id: corretoraId,
        mes_referencia: mesReferencia,
        dia: d.dia,
        percentual_referencia: d.percentual,
      }));

      const { error } = await supabase
        .from("cobranca_inadimplencia_config")
        .insert(inserts);

      if (error) throw error;

      toast.success("Configuração salva com sucesso!");
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

  const aplicarValorATodos = (valor: number) => {
    setDiasConfig(prev => prev.map(d => ({ ...d, percentual: valor })));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar Inadimplência Referência</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Configure o percentual de inadimplência referência para cada dia do mês.
            </div>

            {/* Aplicar a todos */}
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Label className="text-sm whitespace-nowrap">Aplicar a todos:</Label>
              <Input
                type="number"
                min={0}
                max={100}
                defaultValue={30}
                className="w-20 h-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    aplicarValorATodos(Number((e.target as HTMLInputElement).value) || 30);
                  }
                }}
              />
              <span className="text-sm text-muted-foreground">%</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  const input = (e.target as HTMLElement).parentElement?.querySelector("input");
                  if (input) {
                    aplicarValorATodos(Number(input.value) || 30);
                  }
                }}
              >
                Aplicar
              </Button>
            </div>

            <ScrollArea className="h-[300px] pr-4">
              <div className="grid grid-cols-2 gap-2">
                {diasConfig.map((config) => (
                  <div
                    key={config.dia}
                    className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg"
                  >
                    <span className="text-sm font-medium w-12">Dia {config.dia}</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={config.percentual}
                      onChange={(e) => handlePercentualChange(config.dia, e.target.value)}
                      className="w-16 h-8 text-center"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
