import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { format } from "date-fns";
import { RotateCcw, Trash2, Sparkles } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AjusteManualPontoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionarioId: string;
  funcionarioNome: string;
  registroExistente?: {
    id: string;
    tipo: string;
    data_hora: string;
    ajustado?: boolean;
    tipo_original?: string | null;
    data_hora_original?: string | null;
  } | null;
  defaultDate?: string; // yyyy-MM-dd: pré-preenche o dia ao adicionar
  funcionarioSchedule?: {
    horario_entrada?: string | null;
    horario_almoco_inicio?: string | null;
    horario_almoco_fim?: string | null;
    horario_saida?: string | null;
  } | null;
}

const tiposPonto = [
  { value: "entrada", label: "Entrada" },
  { value: "saida_almoco", label: "Saída Almoço" },
  { value: "volta_almoco", label: "Volta Almoço" },
  { value: "saida", label: "Saída" },
];

// Auto-detecta o tipo de ponto pelo horário, comparando com a escala do funcionário.
// Retorna o tipo cuja referência está mais próxima do horário informado.
function detectarTipoPorHorario(
  hora: string,
  schedule?: AjusteManualPontoDialogProps["funcionarioSchedule"],
): string {
  if (!hora) return "entrada";
  const [h, m] = hora.split(":").map(Number);
  const minutos = h * 60 + m;
  const def = {
    entrada: schedule?.horario_entrada || "08:00",
    saida_almoco: schedule?.horario_almoco_inicio || "12:00",
    volta_almoco: schedule?.horario_almoco_fim || "13:00",
    saida: schedule?.horario_saida || "18:00",
  };
  let best = "entrada";
  let bestDiff = Infinity;
  (Object.keys(def) as Array<keyof typeof def>).forEach((k) => {
    const [hh, mm] = def[k].split(":").map(Number);
    const ref = hh * 60 + mm;
    const diff = Math.abs(minutos - ref);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = k;
    }
  });
  return best;
}

export default function AjusteManualPontoDialog({
  open,
  onOpenChange,
  funcionarioId,
  funcionarioNome,
  registroExistente,
  defaultDate,
  funcionarioSchedule,
}: AjusteManualPontoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // modo: "ponto" = registro de ponto comum | "abono_horas" = abono de horas
  const [modo, setModo] = useState<"ponto" | "abono_horas">("ponto");
  const [tipo, setTipo] = useState(registroExistente?.tipo || "entrada");
  const [tipoTocado, setTipoTocado] = useState(false);
  const [data, setData] = useState(
    registroExistente 
      ? format(new Date(registroExistente.data_hora), "yyyy-MM-dd") 
      : (defaultDate || format(new Date(), "yyyy-MM-dd"))
  );
  const [hora, setHora] = useState(
    registroExistente 
      ? format(new Date(registroExistente.data_hora), "HH:mm") 
      : "08:00"
  );
  const [horasAbonadas, setHorasAbonadas] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  // Auto-detecção do tipo conforme o horário (somente se o usuário não trocou manualmente)
  const handleHoraChange = (novaHora: string) => {
    setHora(novaHora);
    if (!tipoTocado && !registroExistente) {
      setTipo(detectarTipoPorHorario(novaHora, funcionarioSchedule));
    }
  };

  const ajustarPonto = useMutation({
    mutationFn: async () => {
      // Modo abono de horas → grava em ausencias_funcionario
      if (modo === "abono_horas") {
        const horasNum = parseFloat(horasAbonadas);
        if (!horasNum || horasNum <= 0) {
          throw new Error("Informe a quantidade de horas a abonar");
        }
        if (!motivo.trim()) {
          throw new Error("Informe o motivo do abono de horas");
        }
        const { error } = await (supabase as any).from("ausencias_funcionario").insert({
          funcionario_id: funcionarioId,
          tipo: "abono",
          tipo_abono: "hora",
          horas_abonadas: horasNum,
          data_referencia: data,
          data_inicio: data,
          data_fim: data,
          motivo: motivo.trim(),
          created_by: user?.id,
        });
        if (error) throw error;
        return;
      }

      // Motivo é obrigatório apenas para registros novos. Para edição, é opcional.
      if (!registroExistente && !motivo.trim()) {
        throw new Error("Informe o motivo do registro manual");
      }

      const dataHora = new Date(`${data}T${hora}:00`);

      if (registroExistente) {
        // Preserva a batida original na 1ª edição
        const preservaOriginal =
          !registroExistente.tipo_original && !registroExistente.data_hora_original;
        // Atualizar registro existente
        const { error } = await supabase
          .from("registros_ponto")
          .update({
            tipo,
            data_hora: dataHora.toISOString(),
            ajustado: true,
            ajustado_por: user?.id,
            ajustado_em: new Date().toISOString(),
            motivo_ajuste: motivo.trim() || "Ajuste sem justificativa",
            ...(preservaOriginal
              ? {
                  tipo_original: registroExistente.tipo,
                  data_hora_original: registroExistente.data_hora,
                }
              : {}),
          })
          .eq("id", registroExistente.id);

        if (error) throw error;
      } else {
        // Criar novo registro manual
        const { error } = await supabase
          .from("registros_ponto")
          .insert({
            funcionario_id: funcionarioId,
            tipo,
            data_hora: dataHora.toISOString(),
            ajustado: true,
            ajustado_por: user?.id,
            ajustado_em: new Date().toISOString(),
            motivo_ajuste: motivo,
            dispositivo: "manual",
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registros_ponto"] });
      queryClient.invalidateQueries({ queryKey: ["ausencias_funcionario"] });
      queryClient.invalidateQueries({ queryKey: ["ausencias_funcionario_periodo"] });
      queryClient.invalidateQueries({ queryKey: ["analise_registros"] });
      toast.success(
        modo === "abono_horas"
          ? "Abono de horas registrado!"
          : registroExistente ? "Ponto ajustado com sucesso!" : "Ponto manual registrado!"
      );
      onOpenChange(false);
      // Reset form
      setModo("ponto");
      setTipo("entrada");
      setData(defaultDate || format(new Date(), "yyyy-MM-dd"));
      setHora("08:00");
      setHorasAbonadas("1");
      setMotivo("");
      setTipoTocado(false);
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    },
  });

  // Restaurar a batida original (descarta o ajuste mantendo o registro)
  const restaurarOriginal = useMutation({
    mutationFn: async () => {
      if (!registroExistente?.tipo_original || !registroExistente?.data_hora_original) {
        throw new Error("Este registro não possui batida original armazenada");
      }
      const { error } = await supabase
        .from("registros_ponto")
        .update({
          tipo: registroExistente.tipo_original,
          data_hora: registroExistente.data_hora_original,
          ajustado: false,
          ajustado_por: null,
          ajustado_em: null,
          motivo_ajuste: null,
          tipo_original: null,
          data_hora_original: null,
        })
        .eq("id", registroExistente.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registros_ponto"] });
      queryClient.invalidateQueries({ queryKey: ["analise_registros"] });
      toast.success("Batida original restaurada");
      setConfirmRestore(false);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    },
  });

  // Excluir o registro completamente
  const excluirRegistro = useMutation({
    mutationFn: async () => {
      if (!registroExistente?.id) throw new Error("Registro inválido");
      const { error } = await supabase
        .from("registros_ponto")
        .delete()
        .eq("id", registroExistente.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registros_ponto"] });
      queryClient.invalidateQueries({ queryKey: ["analise_registros"] });
      toast.success("Registro excluído");
      setConfirmDelete(false);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    },
  });

  const isAbonoHoras = modo === "abono_horas";
  const temBatidaOriginal = !!(
    registroExistente?.tipo_original && registroExistente?.data_hora_original
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {registroExistente
              ? "Ajustar Ponto"
              : isAbonoHoras
                ? "Abonar Horas"
                : "Registro Manual de Ponto"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">{funcionarioNome}</p>
            {registroExistente?.ajustado && temBatidaOriginal && (
              <p className="text-xs text-amber-600 mt-1">
                Original: {tiposPonto.find((t) => t.value === registroExistente.tipo_original)?.label} às{" "}
                {format(new Date(registroExistente.data_hora_original!), "dd/MM HH:mm")}
              </p>
            )}
          </div>

          {/* Toggle modo apenas em criação (não edição) */}
          {!registroExistente && (
            <RadioGroup
              value={modo}
              onValueChange={(v) => setModo(v as "ponto" | "abono_horas")}
              className="grid grid-cols-2 gap-2"
            >
              <Label
                htmlFor="modo-ponto"
                className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition ${
                  !isAbonoHoras ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <RadioGroupItem value="ponto" id="modo-ponto" />
                <span className="text-sm">Registro de ponto</span>
              </Label>
              <Label
                htmlFor="modo-abono"
                className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition ${
                  isAbonoHoras ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <RadioGroupItem value="abono_horas" id="modo-abono" />
                <span className="text-sm">Abono de horas</span>
              </Label>
            </RadioGroup>
          )}

          {!isAbonoHoras && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Tipo de Registro</Label>
                {!registroExistente && (
                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> auto-detectado pela hora
                  </span>
                )}
              </div>
              <Select
                value={tipo}
                onValueChange={(v) => {
                  setTipo(v);
                  setTipoTocado(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tiposPonto.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            {isAbonoHoras ? (
              <div className="space-y-2">
                <Label>Horas a abonar</Label>
                <Input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={horasAbonadas}
                  onChange={(e) => setHorasAbonadas(e.target.value)}
                  placeholder="Ex.: 1.5"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input
                  type="time"
                  value={hora}
                  onChange={(e) => handleHoraChange(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Motivo {registroExistente && !isAbonoHoras ? "(opcional)" : "*"}
            </Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                isAbonoHoras
                  ? "Justifique o abono de horas (ex.: consulta médica, deslocamento autorizado...)"
                  : registroExistente
                    ? "Opcional: descreva o motivo da edição..."
                    : "Descreva o motivo do registro manual..."
              }
              rows={3}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
            <div className="flex gap-2">
              {registroExistente && temBatidaOriginal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmRestore(true)}
                  disabled={restaurarOriginal.isPending}
                  className="gap-1.5"
                  title="Restaurar batida original"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restaurar original
                </Button>
              )}
              {registroExistente && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  disabled={excluirRegistro.isPending}
                  className="gap-1.5 text-destructive hover:text-destructive"
                  title="Excluir este registro"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => ajustarPonto.mutate()}
                disabled={ajustarPonto.isPending}
              >
                {ajustarPonto.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove permanentemente esta batida de ponto. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluirRegistro.mutate()}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar batida original?</AlertDialogTitle>
            <AlertDialogDescription>
              O ajuste manual será descartado e a batida voltará ao tipo e horário originais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => restaurarOriginal.mutate()}>
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
