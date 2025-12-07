import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Bell, Clock } from "lucide-react";

interface ConfigurarAlertasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionarioId: string;
  funcionarioNome?: string;
}

const diasSemana = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const tiposAlerta = [
  { value: "lembrete_entrada", label: "Lembrete de Entrada" },
  { value: "lembrete_saida", label: "Lembrete de Saída" },
  { value: "lembrete_almoco", label: "Lembrete de Almoço" },
];

export default function ConfigurarAlertasDialog({
  open,
  onOpenChange,
  funcionarioId,
  funcionarioNome,
}: ConfigurarAlertasDialogProps) {
  const queryClient = useQueryClient();
  const [novoAlerta, setNovoAlerta] = useState({
    tipo: "lembrete_entrada",
    mensagem: "",
    horario: "08:00",
    diasSemana: [1, 2, 3, 4, 5] as number[],
    ativo: true,
  });

  // Fetch alertas existentes
  const { data: alertas, isLoading } = useQuery({
    queryKey: ["alertas_ponto", funcionarioId],
    queryFn: async () => {
      if (!funcionarioId) return [];
      const { data, error } = await supabase
        .from("alertas_ponto")
        .select("*")
        .eq("funcionario_id", funcionarioId)
        .order("horario_programado");
      if (error) throw error;
      return data;
    },
    enabled: open && !!funcionarioId,
  });

  // Criar alerta
  const criarAlerta = useMutation({
    mutationFn: async () => {
      if (!funcionarioId) throw new Error("Funcionário não selecionado");
      if (!novoAlerta.mensagem) throw new Error("Mensagem é obrigatória");

      const { error } = await supabase.from("alertas_ponto").insert({
        funcionario_id: funcionarioId,
        tipo: novoAlerta.tipo,
        mensagem: novoAlerta.mensagem,
        horario_programado: novoAlerta.horario,
        dias_semana: novoAlerta.diasSemana,
        ativo: novoAlerta.ativo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertas_ponto"] });
      toast.success("Alerta criado!");
      setNovoAlerta({
        tipo: "lembrete_entrada",
        mensagem: "",
        horario: "08:00",
        diasSemana: [1, 2, 3, 4, 5],
        ativo: true,
      });
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    },
  });

  // Toggle alerta
  const toggleAlerta = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("alertas_ponto")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertas_ponto"] });
    },
  });

  // Excluir alerta
  const excluirAlerta = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("alertas_ponto")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertas_ponto"] });
      toast.success("Alerta excluído!");
    },
  });

  const toggleDia = (dia: number) => {
    if (novoAlerta.diasSemana.includes(dia)) {
      setNovoAlerta({
        ...novoAlerta,
        diasSemana: novoAlerta.diasSemana.filter((d) => d !== dia),
      });
    } else {
      setNovoAlerta({
        ...novoAlerta,
        diasSemana: [...novoAlerta.diasSemana, dia].sort(),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configurar Alertas de Ponto
          </DialogTitle>
          <DialogDescription>
            {funcionarioNome
              ? `Configure lembretes para ${funcionarioNome}`
              : "Configure lembretes de ponto"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Novo Alerta */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Novo Alerta
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={novoAlerta.tipo}
                    onChange={(e) => setNovoAlerta({ ...novoAlerta, tipo: e.target.value })}
                  >
                    {tiposAlerta.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Horário</Label>
                  <Input
                    type="time"
                    value={novoAlerta.horario}
                    onChange={(e) => setNovoAlerta({ ...novoAlerta, horario: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Input
                  value={novoAlerta.mensagem}
                  onChange={(e) => setNovoAlerta({ ...novoAlerta, mensagem: e.target.value })}
                  placeholder="Ex: Hora de bater o ponto de entrada!"
                />
              </div>

              <div className="space-y-2">
                <Label>Dias da Semana</Label>
                <div className="flex gap-2 flex-wrap">
                  {diasSemana.map((dia) => (
                    <Button
                      key={dia.value}
                      variant={novoAlerta.diasSemana.includes(dia.value) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleDia(dia.value)}
                    >
                      {dia.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => criarAlerta.mutate()}
                disabled={criarAlerta.isPending}
                className="w-full"
              >
                {criarAlerta.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Adicionar Alerta
              </Button>
            </CardContent>
          </Card>

          {/* Lista de Alertas */}
          <div className="space-y-3">
            <h4 className="font-medium">Alertas Configurados</h4>
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">Carregando...</div>
            ) : alertas?.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                Nenhum alerta configurado
              </div>
            ) : (
              alertas?.map((alerta: any) => (
                <Card key={alerta.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={alerta.ativo}
                        onCheckedChange={(ativo) => toggleAlerta.mutate({ id: alerta.id, ativo })}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{alerta.horario_programado}</span>
                          <span className="text-sm text-muted-foreground capitalize">
                            - {alerta.tipo.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{alerta.mensagem}</p>
                        <div className="flex gap-1 mt-1">
                          {alerta.dias_semana?.map((d: number) => (
                            <span
                              key={d}
                              className="text-xs bg-muted px-1.5 py-0.5 rounded"
                            >
                              {diasSemana.find((dia) => dia.value === d)?.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => excluirAlerta.mutate(alerta.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
