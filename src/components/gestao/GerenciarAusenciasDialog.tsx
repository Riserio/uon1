import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarOff, Plus, Trash2, Plane, Coffee, FileCheck2, PartyPopper, Clock } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  funcionarioId: string;
  funcionarioNome?: string;
  /** Se true, renderiza apenas o conteúdo (sem o wrapper Dialog) — para uso embutido em outro dialog. */
  embedded?: boolean;
}

const TIPOS = [
  { value: "abono", label: "Dia abonado", icon: FileCheck2, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { value: "folga", label: "Folga", icon: Coffee, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { value: "ferias", label: "Férias", icon: Plane, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { value: "feriado", label: "Feriado individual", icon: PartyPopper, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
] as const;

export default function GerenciarAusenciasDialog({ open, onOpenChange, funcionarioId, funcionarioNome, embedded = false }: Props) {
  const qc = useQueryClient();
  const [tipoAbono, setTipoAbono] = useState<"dia" | "hora">("dia");
  const [tipo, setTipo] = useState<string>("abono");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [horas, setHoras] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setTipoAbono("dia");
      setTipo("abono");
      setDataInicio("");
      setDataFim("");
      setHoras("1");
      setMotivo("");
    }
  }, [open]);

  const { data: ausencias, refetch } = useQuery({
    queryKey: ["ausencias_funcionario", funcionarioId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ausencias_funcionario")
        .select("*")
        .eq("funcionario_id", funcionarioId)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!funcionarioId && open,
  });

  const handleSave = async () => {
    if (!dataInicio) {
      toast.error("Informe a data");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();

    let payload: any;
    if (tipoAbono === "hora") {
      const horasNum = parseFloat(horas);
      if (!horasNum || horasNum <= 0) {
        toast.error("Informe a quantidade de horas");
        setSaving(false);
        return;
      }
      payload = {
        funcionario_id: funcionarioId,
        tipo: "abono",
        tipo_abono: "hora",
        horas_abonadas: horasNum,
        data_referencia: dataInicio,
        data_inicio: dataInicio,
        data_fim: dataInicio,
        motivo: motivo || null,
        created_by: userData.user?.id,
      };
    } else {
      const fim = dataFim || dataInicio;
      if (fim < dataInicio) {
        toast.error("Data fim não pode ser anterior à data início");
        setSaving(false);
        return;
      }
      payload = {
        funcionario_id: funcionarioId,
        tipo,
        tipo_abono: "dia",
        data_inicio: dataInicio,
        data_fim: fim,
        motivo: motivo || null,
        created_by: userData.user?.id,
      };
    }

    const { error } = await (supabase as any).from("ausencias_funcionario").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro ao registrar: " + error.message);
      return;
    }
    toast.success("Registro salvo");
    setDataInicio("");
    setDataFim("");
    setHoras("1");
    setMotivo("");
    refetch();
    qc.invalidateQueries({ queryKey: ["abonados"] });
    qc.invalidateQueries({ queryKey: ["analise_registros"] });
    qc.invalidateQueries({ queryKey: ["ausencias_funcionario_periodo"] });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este registro?")) return;
    const { error } = await (supabase as any).from("ausencias_funcionario").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover");
      return;
    }
    toast.success("Removido");
    refetch();
    qc.invalidateQueries({ queryKey: ["abonados"] });
    qc.invalidateQueries({ queryKey: ["analise_registros"] });
    qc.invalidateQueries({ queryKey: ["ausencias_funcionario_periodo"] });
  };

  const tipoMeta = (t: string) => TIPOS.find((x) => x.value === t) || TIPOS[0];

  const body = (
    <div className="space-y-4 overflow-y-auto pr-1">
          {/* Form */}
          <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
            {/* Toggle dia / hora */}
            <RadioGroup
              value={tipoAbono}
              onValueChange={(v) => setTipoAbono(v as "dia" | "hora")}
              className="grid grid-cols-2 gap-2"
            >
              <Label
                htmlFor="abono-dia"
                className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition ${
                  tipoAbono === "dia" ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <RadioGroupItem value="dia" id="abono-dia" />
                <span className="text-sm">Dia(s) inteiro(s)</span>
              </Label>
              <Label
                htmlFor="abono-hora"
                className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition ${
                  tipoAbono === "hora" ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <RadioGroupItem value="hora" id="abono-hora" />
                <span className="text-sm">Abonar horas</span>
              </Label>
            </RadioGroup>

            {tipoAbono === "dia" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => {
                        const Icon = t.icon;
                        return (
                          <SelectItem key={t.value} value={t.value}>
                            <span className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {t.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="hidden sm:block" />
                <div className="space-y-1.5">
                  <Label>Data início</Label>
                  <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Data fim <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                  <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                </div>
              </div>
            )}

            {tipoAbono === "hora" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Data</Label>
                  <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Horas a abonar</Label>
                  <Input
                    type="number"
                    step="0.25"
                    min="0.25"
                    value={horas}
                    onChange={(e) => setHoras(e.target.value)}
                    placeholder="Ex.: 1.5"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Motivo / observação</Label>
              <Textarea
                rows={2}
                placeholder="Ex.: Atestado médico, férias programadas, recesso..."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Plus className="h-4 w-4 mr-2" />
                {saving ? "Salvando..." : "Adicionar"}
              </Button>
            </div>
          </div>

          {/* Lista */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Histórico</h4>
            <ScrollArea className="h-[280px] rounded-lg border">
              <div className="divide-y">
                {(ausencias || []).length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhuma ausência registrada.
                  </div>
                )}
                {(ausencias || []).map((a) => {
                  const isHora = a.tipo_abono === "hora";
                  const meta = tipoMeta(a.tipo);
                  const Icon = isHora ? Clock : meta.icon;
                  const sameDay = a.data_inicio === a.data_fim;
                  return (
                    <div key={a.id} className="flex items-start gap-3 p-3">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isHora ? "bg-primary/10 text-primary" : meta.color
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="font-normal">
                            {isHora ? `${a.horas_abonadas}h abonadas` : meta.label}
                          </Badge>
                          <span className="text-sm font-medium">
                            {isHora && a.data_referencia
                              ? format(parseISO(a.data_referencia), "dd 'de' MMM yyyy", { locale: ptBR })
                              : sameDay
                                ? format(parseISO(a.data_inicio), "dd 'de' MMM yyyy", { locale: ptBR })
                                : `${format(parseISO(a.data_inicio), "dd/MM/yyyy")} → ${format(parseISO(a.data_fim), "dd/MM/yyyy")}`}
                          </span>
                        </div>
                        {a.motivo && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.motivo}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(a.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
  );

  if (embedded) {
    return <div className="px-4 pb-4">{body}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-primary" />
            Abonos, folgas e férias
          </DialogTitle>
          <DialogDescription>
            {funcionarioNome ? `Gerenciando ausências de ${funcionarioNome}` : "Selecione o tipo e o período da ausência."}
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

