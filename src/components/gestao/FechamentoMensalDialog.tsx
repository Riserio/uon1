import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Lock, Unlock, Check, Clock, Calendar, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format, getDaysInMonth, isWeekend, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import SignaturePad from "@/components/SignaturePad";

interface FechamentoMensalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionarioId: string;
  funcionarioNome: string;
  funcionarioProfileId?: string;
}

const tiposPonto = [
  { value: "entrada", label: "Entrada", color: "text-green-600" },
  { value: "saida_almoco", label: "Saída Almoço", color: "text-amber-600" },
  { value: "volta_almoco", label: "Volta Almoço", color: "text-blue-600" },
  { value: "saida", label: "Saída", color: "text-red-600" },
];

// Feriados de BH
const getFeriadosBH = (year: number): string[] => {
  const feriados = [
    `${year}-01-01`, `${year}-04-21`, `${year}-05-01`, `${year}-09-07`,
    `${year}-10-12`, `${year}-11-02`, `${year}-11-15`, `${year}-12-25`,
    `${year}-08-15`, `${year}-12-08`
  ];
  return feriados;
};

const getBusinessDaysInMonth = (year: number, month: number): number => {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const feriadosBH = getFeriadosBH(year);
  let businessDays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!isWeekend(date) && !feriadosBH.includes(dateStr)) {
      businessDays++;
    }
  }
  return businessDays;
};

export default function FechamentoMensalDialog({
  open,
  onOpenChange,
  funcionarioId,
  funcionarioNome,
  funcionarioProfileId,
}: FechamentoMensalDialogProps) {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [showSignature, setShowSignature] = useState(false);

  const canManage = userRole === "admin" || userRole === "superintendente" || userRole === "administrativo";
  const isOwnRecord = user?.id === funcionarioProfileId;

  // Fetch fechamentos do funcionário
  const { data: fechamentos, isLoading } = useQuery({
    queryKey: ["fechamentos_ponto", funcionarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fechamentos_ponto")
        .select("*")
        .eq("funcionario_id", funcionarioId)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: open && !!funcionarioId,
  });

  // Fetch registros para calcular dados
  const { data: registros } = useQuery({
    queryKey: ["registros_ponto_all", funcionarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registros_ponto")
        .select("*")
        .eq("funcionario_id", funcionarioId)
        .order("data_hora", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: open && !!funcionarioId,
  });

  // Fetch atestados para calcular dias abonados
  const { data: atestados } = useQuery({
    queryKey: ["anexos_ponto_atestados", funcionarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("anexos_ponto")
        .select("*")
        .eq("funcionario_id", funcionarioId)
        .eq("tipo", "atestado");

      if (error) throw error;
      return data;
    },
    enabled: open && !!funcionarioId,
  });

  // Agrupar registros por mês
  const registrosPorMes = registros?.reduce((acc: any, reg: any) => {
    const date = new Date(reg.data_hora);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(reg);
    return acc;
  }, {});

  // Calcular estatísticas do mês
  const calcularEstatisticas = (ano: number, mes: number) => {
    const key = `${ano}-${String(mes).padStart(2, '0')}`;
    const regs = registrosPorMes?.[key] || [];
    const diasUteis = getBusinessDaysInMonth(ano, mes);
    
    // Agrupar por dia
    const porDia: Record<string, any[]> = {};
    regs.forEach((r: any) => {
      const dia = format(new Date(r.data_hora), "yyyy-MM-dd");
      if (!porDia[dia]) porDia[dia] = [];
      porDia[dia].push(r);
    });

    const diasTrabalhados = Object.keys(porDia).length;
    
    // Calcular horas
    let totalMinutos = 0;
    Object.values(porDia).forEach((regsDay: any[]) => {
      const entrada = regsDay.find((r) => r.tipo === "entrada");
      const saida = regsDay.find((r) => r.tipo === "saida");
      if (entrada && saida) {
        const diff = new Date(saida.data_hora).getTime() - new Date(entrada.data_hora).getTime();
        totalMinutos += diff / (1000 * 60);
      }
    });

    // Calcular dias de atestado no mês
    const diasAtestado = atestados?.reduce((sum: number, at: any) => {
      if (at.data_referencia) {
        const atDate = new Date(at.data_referencia);
        if (atDate.getFullYear() === ano && atDate.getMonth() + 1 === mes) {
          return sum + (at.dias_abonados || 0);
        }
      }
      return sum;
    }, 0) || 0;

    return {
      diasUteis,
      diasTrabalhados,
      horasTrabalhadas: totalMinutos / 60,
      diasAtestado,
      registros: porDia,
    };
  };

  // Criar ou atualizar fechamento
  const salvarFechamento = useMutation({
    mutationFn: async ({ ano, mes, fechar }: { ano: number; mes: number; fechar: boolean }) => {
      const stats = calcularEstatisticas(ano, mes);
      
      const fechamentoExistente = fechamentos?.find(
        (f: any) => f.ano === ano && f.mes === mes
      );

      const dados = {
        funcionario_id: funcionarioId,
        ano,
        mes,
        dias_trabalhados: stats.diasTrabalhados,
        dias_uteis: stats.diasUteis,
        horas_trabalhadas: stats.horasTrabalhadas,
        dias_atestado: stats.diasAtestado,
        status: fechar ? "fechado" : "aberto",
        fechado_por: fechar ? user?.id : null,
        fechado_em: fechar ? new Date().toISOString() : null,
      };

      if (fechamentoExistente) {
        const { error } = await supabase
          .from("fechamentos_ponto")
          .update(dados)
          .eq("id", fechamentoExistente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("fechamentos_ponto")
          .insert(dados);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["fechamentos_ponto"] });
      toast.success(
        variables.fechar 
          ? "Mês fechado com sucesso!" 
          : "Fechamento salvo!"
      );
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    },
  });

  // Assinar fechamento
  const assinarFechamento = useMutation({
    mutationFn: async ({ fechamentoId, assinaturaUrl }: { fechamentoId: string; assinaturaUrl: string }) => {
      const { error } = await supabase
        .from("fechamentos_ponto")
        .update({
          assinatura_funcionario_url: assinaturaUrl,
          assinado_em: new Date().toISOString(),
          ip_assinatura: "", // Would need an API to get real IP
          status: "assinado",
        })
        .eq("id", fechamentoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fechamentos_ponto"] });
      toast.success("Fechamento assinado com sucesso!");
      setShowSignature(false);
    },
    onError: (error) => {
      toast.error("Erro ao assinar: " + error.message);
    },
  });

  // Gerar lista de meses disponíveis
  const mesesDisponiveis = () => {
    const meses: { ano: number; mes: number }[] = [];
    const hoje = new Date();
    
    for (let i = 0; i < 12; i++) {
      const date = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push({ ano: date.getFullYear(), mes: date.getMonth() + 1 });
    }
    
    return meses;
  };

  const handleSignature = async (signatureDataUrl: string, fechamentoId: string) => {
    // Upload signature
    const base64Data = signatureDataUrl.split(",")[1];
    const blob = await fetch(signatureDataUrl).then((r) => r.blob());
    const filePath = `assinaturas/${funcionarioId}/${fechamentoId}.png`;

    const { error: uploadError } = await supabase.storage
      .from("ponto-documentos")
      .upload(filePath, blob, { upsert: true });

    if (uploadError) {
      toast.error("Erro ao salvar assinatura");
      return;
    }

    const { data: urlData } = supabase.storage
      .from("ponto-documentos")
      .getPublicUrl(filePath);

    assinarFechamento.mutate({
      fechamentoId,
      assinaturaUrl: urlData.publicUrl,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Fechamento Mensal - {funcionarioNome}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Carregando...
          </div>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {mesesDisponiveis().map(({ ano, mes }) => {
              const stats = calcularEstatisticas(ano, mes);
              const fechamento = fechamentos?.find(
                (f: any) => f.ano === ano && f.mes === mes
              );
              const mesNome = format(new Date(ano, mes - 1), "MMMM yyyy", { locale: ptBR });

              return (
                <AccordionItem key={`${ano}-${mes}`} value={`${ano}-${mes}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <span className="capitalize font-medium">{mesNome}</span>
                      <div className="flex items-center gap-2">
                        {fechamento?.status === "assinado" && (
                          <Badge variant="default" className="bg-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            Assinado
                          </Badge>
                        )}
                        {fechamento?.status === "fechado" && (
                          <Badge variant="secondary">
                            <Lock className="h-3 w-3 mr-1" />
                            Fechado
                          </Badge>
                        )}
                        {(!fechamento || fechamento.status === "aberto") && (
                          <Badge variant="outline">
                            <Unlock className="h-3 w-3 mr-1" />
                            Aberto
                          </Badge>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {stats.diasTrabalhados}/{stats.diasUteis} dias
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-4">
                      {/* Resumo */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                          <CardContent className="pt-4">
                            <p className="text-sm text-muted-foreground">Dias Trabalhados</p>
                            <p className="text-2xl font-bold">{stats.diasTrabalhados}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <p className="text-sm text-muted-foreground">Dias Úteis</p>
                            <p className="text-2xl font-bold">{stats.diasUteis}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <p className="text-sm text-muted-foreground">Horas Trabalhadas</p>
                            <p className="text-2xl font-bold">
                              {Math.floor(stats.horasTrabalhadas)}h
                            </p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <p className="text-sm text-muted-foreground">Dias Atestado</p>
                            <p className="text-2xl font-bold text-amber-600">
                              {stats.diasAtestado}
                            </p>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Registros do mês */}
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm">Registros do Mês</CardTitle>
                        </CardHeader>
                        <CardContent className="max-h-60 overflow-y-auto">
                          {Object.keys(stats.registros).length === 0 ? (
                            <p className="text-center text-muted-foreground py-4">
                              Nenhum registro neste mês
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {Object.entries(stats.registros)
                                .sort((a, b) => b[0].localeCompare(a[0]))
                                .map(([dia, regs]: [string, any]) => (
                                  <div
                                    key={dia}
                                    className="flex items-center justify-between p-2 bg-muted/50 rounded"
                                  >
                                    <span className="font-medium text-sm">
                                      {format(parseISO(dia), "dd/MM - EEEE", { locale: ptBR })}
                                    </span>
                                    <div className="flex gap-2">
                                      {regs
                                        .sort((a: any, b: any) => 
                                          new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()
                                        )
                                        .map((r: any) => {
                                          const tipo = tiposPonto.find((t) => t.value === r.tipo);
                                          return (
                                            <Badge
                                              key={r.id}
                                              variant="outline"
                                              className={`text-xs ${r.ajustado ? "border-amber-500" : ""}`}
                                            >
                                              {tipo?.label}: {format(new Date(r.data_hora), "HH:mm")}
                                              {r.ajustado && <Pencil className="h-3 w-3 ml-1" />}
                                            </Badge>
                                          );
                                        })}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Assinatura se fechado */}
                      {fechamento?.status === "assinado" && fechamento.assinatura_funcionario_url && (
                        <Card>
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Check className="h-4 w-4 text-green-600" />
                              Assinatura do Funcionário
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <img
                              src={fechamento.assinatura_funcionario_url}
                              alt="Assinatura"
                              className="max-h-20 border rounded"
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                              Assinado em: {format(new Date(fechamento.assinado_em), "dd/MM/yyyy HH:mm")}
                            </p>
                          </CardContent>
                        </Card>
                      )}

                      {/* Ações */}
                      <div className="flex flex-wrap gap-2 justify-end pt-2">
                        {canManage && (!fechamento || fechamento.status === "aberto") && (
                          <Button
                            variant="outline"
                            onClick={() => salvarFechamento.mutate({ ano, mes, fechar: false })}
                            disabled={salvarFechamento.isPending}
                          >
                            Salvar Dados
                          </Button>
                        )}
                        {canManage && (!fechamento || fechamento.status === "aberto") && (
                          <Button
                            onClick={() => salvarFechamento.mutate({ ano, mes, fechar: true })}
                            disabled={salvarFechamento.isPending}
                          >
                            <Lock className="h-4 w-4 mr-2" />
                            Fechar Mês
                          </Button>
                        )}
                        {fechamento?.status === "fechado" && isOwnRecord && (
                          <Button
                            onClick={() => setShowSignature(true)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Assinar Fechamento
                          </Button>
                        )}
                      </div>

                      {/* Modal de assinatura */}
                      {showSignature && fechamento && (
                        <Card className="border-2 border-primary">
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm">Assinatura Digital</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground mb-4">
                              Desenhe sua assinatura abaixo para confirmar o aceite do fechamento de {mesNome}
                            </p>
                            <SignaturePad
                              onSave={(signature) => handleSignature(signature, fechamento.id)}
                            />
                            <Button
                              variant="outline"
                              onClick={() => setShowSignature(false)}
                              className="mt-2"
                            >
                              Cancelar
                            </Button>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </DialogContent>
    </Dialog>
  );
}
