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
  const [motivo, setMotivo] = useState("");

  const ajustarPonto = useMutation({
    mutationFn: async () => {
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
      toast.success(registroExistente ? "Ponto ajustado com sucesso!" : "Ponto manual registrado!");
      onOpenChange(false);
      // Reset form
      setTipo("entrada");
      setData(format(new Date(), "yyyy-MM-dd"));
      setHora("08:00");
      setMotivo("");
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {registroExistente ? "Ajustar Ponto" : "Registro Manual de Ponto"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">{funcionarioNome}</p>
          </div>

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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <Input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Motivo {registroExistente ? "(opcional)" : "*"}
            </Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                registroExistente
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
