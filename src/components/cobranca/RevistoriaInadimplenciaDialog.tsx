import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
 import { Loader2, AlertTriangle, CheckCircle2, SearchCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inadimplentes: Array<{
    nome: string;
    placas: string;
    voluntario?: string;
    valor?: number;
    qtde_dias_atraso_vencimento_original?: number;
    cooperativa?: string;
    regional_boleto?: string;
  }>;
  corretoraId: string;
}

export default function RevistoriaInadimplenciaDialog({ open, onOpenChange, inadimplentes, corretoraId }: Props) {
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState<Array<{ nome: string; placa: string; status: "ok" | "erro" | "duplicado"; msg?: string }>>([]);
  const [step, setStep] = useState<"confirm" | "results">("confirm");

  const uniqueByPlaca = inadimplentes.reduce((acc, curr) => {
    const placa = (curr.placas || "").trim().toUpperCase();
    if (placa && !acc.find(a => (a.placas || "").trim().toUpperCase() === placa)) {
      acc.push(curr);
    }
    return acc;
  }, [] as typeof inadimplentes);

  const handleCreate = async () => {
    setCreating(true);
    const resultList: typeof results = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Usuário não autenticado"); return; }

      // Get first active fluxo
      const { data: fluxos } = await supabase.from("fluxos").select("id").eq("ativo", true).order("ordem").limit(1);
      const fluxoId = fluxos?.[0]?.id;

      let firstStatus = "Novo";
      if (fluxoId) {
        const { data: statusList } = await supabase.from("status_config").select("nome").eq("fluxo_id", fluxoId).eq("ativo", true).order("ordem").limit(1);
        if (statusList?.[0]) firstStatus = statusList[0].nome;
      }

      for (const item of uniqueByPlaca) {
        const placa = (item.placas || "").trim().toUpperCase();
        try {
          // Check for existing pending revistoria for this plate
          const { data: existing } = await supabase
            .from("vistorias")
            .select("id")
            .eq("veiculo_placa", placa)
            .eq("tipo_vistoria", "reativacao")
            .in("status", ["aguardando_fotos", "em_analise", "pendente"])
            .limit(1);

          if (existing && existing.length > 0) {
            resultList.push({ nome: item.nome || "", placa, status: "duplicado", msg: "Já existe revistoria pendente" });
            continue;
          }

          // Create vistoria
          const { data: vistoria, error: vErr } = await supabase.from("vistorias").insert({
            tipo_abertura: "digital",
            tipo_vistoria: "reativacao",
            status: "aguardando_fotos",
            created_by: user.id,
            corretora_id: corretoraId,
            veiculo_placa: placa,
            cliente_nome: item.nome || null,
          }).select("id, numero").single();

          if (vErr) throw vErr;

          // Create linked atendimento
          if (fluxoId && vistoria) {
            await supabase.from("atendimentos").insert({
              id: vistoria.id,
              assunto: `Revistoria Inadimplência - ${item.nome || placa}`,
              user_id: user.id,
              tipo_atendimento: "sinistro",
              corretora_id: corretoraId,
              fluxo_id: fluxoId,
              status: firstStatus,
              veiculo_marca: null,
              veiculo_modelo: null,
            });
          }

          resultList.push({ nome: item.nome || "", placa, status: "ok" });
        } catch (err: any) {
          resultList.push({ nome: item.nome || "", placa, status: "erro", msg: err.message });
        }
      }
    } catch (err: any) {
      toast.error("Erro geral: " + err.message);
    } finally {
      setResults(resultList);
      setStep("results");
      setCreating(false);

      const ok = resultList.filter(r => r.status === "ok").length;
      if (ok > 0) toast.success(`${ok} revistoria(s) criada(s) com sucesso!`);
    }
  };

  const handleClose = () => {
    setStep("confirm");
    setResults([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <SearchCheck className="h-5 w-5 text-primary" />
             Revistoria por Inadimplência
           </DialogTitle>
          <DialogDescription>
            {step === "confirm" 
              ? `Criar revistorias para ${uniqueByPlaca.length} veículo(s) inadimplente(s)`
              : "Resultado da criação das revistorias"
            }
          </DialogDescription>
        </DialogHeader>

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Será criada uma vistoria de <strong>reativação</strong> para cada veículo. Duplicatas serão ignoradas automaticamente.
              </p>
            </div>

            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {uniqueByPlaca.slice(0, 50).map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl border border-border/50 bg-muted/20">
                    <div>
                      <p className="text-sm font-medium">{item.nome || "—"}</p>
                      <p className="text-xs text-muted-foreground">{item.placas}</p>
                    </div>
                    <div className="text-right">
                      {item.qtde_dias_atraso_vencimento_original && item.qtde_dias_atraso_vencimento_original > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          {item.qtde_dias_atraso_vencimento_original}d atraso
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {uniqueByPlaca.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    ... e mais {uniqueByPlaca.length - 50} veículos
                  </p>
                )}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={creating} className="gap-2">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar {uniqueByPlaca.length} Revistoria(s)
              </Button>
            </div>
          </div>
        )}

        {step === "results" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-xl bg-emerald-500/10">
                <p className="text-lg font-bold text-emerald-600">{results.filter(r => r.status === "ok").length}</p>
                <p className="text-[10px] text-muted-foreground">Criadas</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-amber-500/10">
                <p className="text-lg font-bold text-amber-600">{results.filter(r => r.status === "duplicado").length}</p>
                <p className="text-[10px] text-muted-foreground">Duplicadas</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-red-500/10">
                <p className="text-lg font-bold text-red-600">{results.filter(r => r.status === "erro").length}</p>
                <p className="text-[10px] text-muted-foreground">Erros</p>
              </div>
            </div>

            <ScrollArea className="max-h-[250px]">
              <div className="space-y-1.5">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-border/40">
                    <div className="flex items-center gap-2">
                      {r.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      {r.status === "duplicado" && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                      {r.status === "erro" && <AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
                      <span className="text-xs">{r.placa} — {r.nome}</span>
                    </div>
                    {r.msg && <span className="text-[10px] text-muted-foreground">{r.msg}</span>}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end">
              <Button onClick={handleClose}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
