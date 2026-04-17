import { useEffect, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Settings, Bell, Clock, MessageCircle, Loader2, Info } from "lucide-react";
import { toast } from "sonner";

interface JornadaConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function JornadaConfigDialog({ open, onOpenChange }: JornadaConfigDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ["jornada_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jornada_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  useEffect(() => {
    if (config) setForm({ ...config });
  }, [config]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form?.id) throw new Error("Configuração não carregada");
      const { error } = await supabase
        .from("jornada_config")
        .update({
          tolerancia_atraso_minutos: form.tolerancia_atraso_minutos,
          lembretes_automaticos_ativos: form.lembretes_automaticos_ativos,
          horario_entrada_padrao: form.horario_entrada_padrao,
          horario_saida_almoco_padrao: form.horario_saida_almoco_padrao,
          horario_volta_almoco_padrao: form.horario_volta_almoco_padrao,
          horario_saida_padrao: form.horario_saida_padrao,
          mensagem_entrada: form.mensagem_entrada,
          mensagem_saida_almoco: form.mensagem_saida_almoco,
          mensagem_volta_almoco: form.mensagem_volta_almoco,
          mensagem_saida: form.mensagem_saida,
        })
        .eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jornada_config"] });
      toast.success("Configurações salvas!");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Settings className="h-4 w-4 text-primary" />
            </div>
            Configurações da Jornada
          </DialogTitle>
          <DialogDescription>
            Configurações globais aplicadas a todos os funcionários.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !form ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="tolerancia" className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="tolerancia" className="gap-2">
                <Clock className="h-4 w-4" /> Tolerância
              </TabsTrigger>
              <TabsTrigger value="lembretes" className="gap-2">
                <Bell className="h-4 w-4" /> Lembretes
              </TabsTrigger>
              <TabsTrigger value="mensagens" className="gap-2">
                <MessageCircle className="h-4 w-4" /> Mensagens
              </TabsTrigger>
            </TabsList>

            {/* TOLERÂNCIA */}
            <TabsContent value="tolerancia" className="space-y-4 mt-4">
              <Card className="border-border/60">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A tolerância "perdoa" pequenos atrasos diários, conforme a CLT (Art. 58, §1º — até 10 minutos diários).
                      Atrasos acima desse valor serão descontados do banco de horas.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Tolerância de atraso (minutos)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      value={form.tolerancia_atraso_minutos}
                      onChange={(e) => upd("tolerancia_atraso_minutos", parseInt(e.target.value) || 0)}
                      className="w-32"
                    />
                    <p className="text-xs text-muted-foreground">
                      Padrão: 10 minutos (CLT). Aplica-se a todos os funcionários.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* LEMBRETES */}
            <TabsContent value="lembretes" className="space-y-4 mt-4">
              <Card className="border-border/60">
                <CardContent className="p-5 space-y-5">
                  <div className="flex items-center justify-between p-4 rounded-xl border bg-card">
                    <div className="space-y-1">
                      <Label className="text-base font-medium">Lembretes automáticos</Label>
                      <p className="text-xs text-muted-foreground">
                        Todos os funcionários receberão lembretes automáticos de bater o ponto, baseados na sua jornada cadastrada.
                      </p>
                    </div>
                    <Switch
                      checked={form.lembretes_automaticos_ativos}
                      onCheckedChange={(v) => upd("lembretes_automaticos_ativos", v)}
                    />
                  </div>

                  <div className="space-y-3 pt-2 border-t">
                    <p className="text-sm font-medium">Horários padrão</p>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Usados quando o funcionário não tem horários definidos.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Entrada</Label>
                        <Input
                          type="time"
                          value={form.horario_entrada_padrao}
                          onChange={(e) => upd("horario_entrada_padrao", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Saída almoço</Label>
                        <Input
                          type="time"
                          value={form.horario_saida_almoco_padrao}
                          onChange={(e) => upd("horario_saida_almoco_padrao", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Volta almoço</Label>
                        <Input
                          type="time"
                          value={form.horario_volta_almoco_padrao}
                          onChange={(e) => upd("horario_volta_almoco_padrao", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Saída</Label>
                        <Input
                          type="time"
                          value={form.horario_saida_padrao}
                          onChange={(e) => upd("horario_saida_padrao", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* MENSAGENS */}
            <TabsContent value="mensagens" className="space-y-4 mt-4">
              <Card className="border-border/60">
                <CardContent className="p-5 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Lembrete de entrada</Label>
                    <Input value={form.mensagem_entrada} onChange={(e) => upd("mensagem_entrada", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Lembrete de saída para almoço</Label>
                    <Input value={form.mensagem_saida_almoco} onChange={(e) => upd("mensagem_saida_almoco", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Lembrete de volta do almoço</Label>
                    <Input value={form.mensagem_volta_almoco} onChange={(e) => upd("mensagem_volta_almoco", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Lembrete de saída</Label>
                    <Input value={form.mensagem_saida} onChange={(e) => upd("mensagem_saida", e.target.value)} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !form}>
            {salvar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar configurações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
