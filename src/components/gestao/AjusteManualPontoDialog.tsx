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

interface AjusteManualPontoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionarioId: string;
  funcionarioNome: string;
  registroExistente?: {
    id: string;
    tipo: string;
    data_hora: string;
  } | null;
}

const tiposPonto = [
  { value: "entrada", label: "Entrada" },
  { value: "saida_almoco", label: "Saída Almoço" },
  { value: "volta_almoco", label: "Volta Almoço" },
  { value: "saida", label: "Saída" },
];

export default function AjusteManualPontoDialog({
  open,
  onOpenChange,
  funcionarioId,
  funcionarioNome,
  registroExistente,
}: AjusteManualPontoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // modo: "ponto" = registro de ponto comum | "abono_horas" = abono de horas
  const [modo, setModo] = useState<"ponto" | "abono_horas">("ponto");
  const [tipo, setTipo] = useState(registroExistente?.tipo || "entrada");
  const [data, setData] = useState(
    registroExistente 
      ? format(new Date(registroExistente.data_hora), "yyyy-MM-dd") 
      : format(new Date(), "yyyy-MM-dd")
  );
  const [hora, setHora] = useState(
    registroExistente 
      ? format(new Date(registroExistente.data_hora), "HH:mm") 
      : "08:00"
  );
  const [horasAbonadas, setHorasAbonadas] = useState("1");
  const [motivo, setMotivo] = useState("");

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
      setData(format(new Date(), "yyyy-MM-dd"));
      setHora("08:00");
      setHorasAbonadas("1");
      setMotivo("");
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    },
  });

  const isAbonoHoras = modo === "abono_horas";

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
              <Label>Tipo de Registro</Label>
              <Select value={tipo} onValueChange={setTipo}>
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
                  onChange={(e) => setHora(e.target.value)}
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

          <div className="flex justify-end gap-2 pt-4">
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
      </DialogContent>
    </Dialog>
  );
}
