import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import {
  Users,
  PieChart,
  DollarSign,
  Package,
  Wrench,
  Building2,
  CreditCard,
  XCircle,
  CheckCircle2,
  Send,
  Loader2,
  Save,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AcompanhamentoData {
  id?: string;
  atendimento_id: string;
  comite_status?: string | null;
  comite_decisao?: string | null;
  comite_data?: string | null;
  comite_participantes?: string[] | null;
  comite_observacoes?: string | null;
  cota_participacao?: number | null;
  cota_percentual?: number | null;
  custo_pecas?: number | null;
  custo_mao_obra?: number | null;
  custo_servicos?: number | null;
  custo_outros?: number | null;
  pecas_descricao?: string | null;
  pecas_aprovadas?: boolean | null;
  pecas_valor_total?: number | null;
  reparo_autorizado?: boolean | null;
  reparo_data_autorizacao?: string | null;
  reparo_autorizado_por?: string | null;
  reparo_observacoes?: string | null;
  oficina_nome?: string | null;
  oficina_cnpj?: string | null;
  oficina_endereco?: string | null;
  oficina_contato?: string | null;
  oficina_tipo?: string | null;
  financeiro_status?: string | null;
  financeiro_valor_aprovado?: number | null;
  financeiro_valor_pago?: number | null;
  financeiro_data_pagamento?: string | null;
  financeiro_forma_pagamento?: string | null;
  desistencia?: boolean | null;
  desistencia_motivo?: string | null;
  desistencia_data?: string | null;
  finalizado?: boolean | null;
  finalizado_data?: string | null;
  finalizado_observacoes?: string | null;
  cilia_enviado?: boolean | null;
  cilia_enviado_em?: string | null;
  cilia_budget_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimentoId: string;
  sinistroNumero: number;
  corretoraId?: string;
  onUpdate?: () => void;
}

export function AcompanhamentoSinistroDialog({
  open,
  onOpenChange,
  atendimentoId,
  sinistroNumero,
  corretoraId,
  onUpdate,
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingToCilia, setSendingToCilia] = useState(false);
  const [data, setData] = useState<AcompanhamentoData>({
    atendimento_id: atendimentoId,
  });

  useEffect(() => {
    if (open && atendimentoId) {
      loadData();
    }
  }, [open, atendimentoId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: acompData, error } = await supabase
        .from("sinistro_acompanhamento")
        .select("*")
        .eq("atendimento_id", atendimentoId)
        .maybeSingle();

      if (error) throw error;

      if (acompData) {
        setData(acompData);
      } else {
        setData({ atendimento_id: atendimentoId });
      }
    } catch (error) {
      console.error("Erro ao carregar acompanhamento:", error);
      toast.error("Erro ao carregar dados de acompanhamento");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const payload = {
        ...data,
        atendimento_id: atendimentoId,
        updated_by: user?.id,
      };

      if (data.id) {
        const { error } = await supabase
          .from("sinistro_acompanhamento")
          .update(payload)
          .eq("id", data.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("sinistro_acompanhamento").insert({
          ...payload,
          created_by: user?.id,
        });

        if (error) throw error;
      }

      toast.success("Acompanhamento salvo com sucesso");
      onUpdate?.();
      loadData();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar acompanhamento");
    } finally {
      setSaving(false);
    }
  };

  const handleSendToCilia = async () => {
    if (!corretoraId) {
      toast.error("Corretora não identificada para este sinistro");
      return;
    }

    try {
      setSendingToCilia(true);

      // Verificar se existe integração CILIA para esta corretora
      const { data: integration, error: integrationError } = await supabase
        .from("api_integrations")
        .select("*")
        .eq("corretora_id", corretoraId)
        .eq("tipo", "cilia")
        .eq("ativo", true)
        .maybeSingle();

      if (integrationError) throw integrationError;

      if (!integration) {
        toast.error("Nenhuma integração CILIA configurada para esta corretora");
        return;
      }

      // Chamar edge function para enviar ao CILIA
      const { data: result, error } = await supabase.functions.invoke("enviar-cilia", {
        body: {
          atendimento_id: atendimentoId,
          integration_id: integration.id,
        },
      });

      if (error) throw error;

      if (result?.success) {
        toast.success("Sinistro enviado ao CILIA com sucesso");
        
        // Atualizar registro com dados do CILIA
        await supabase
          .from("sinistro_acompanhamento")
          .update({
            cilia_enviado: true,
            cilia_enviado_em: new Date().toISOString(),
            cilia_budget_id: result.budgetId,
            cilia_response: result.response,
          })
          .eq("atendimento_id", atendimentoId);

        loadData();
        onUpdate?.();
      } else {
        toast.error(result?.message || "Erro ao enviar para o CILIA");
      }
    } catch (error: any) {
      console.error("Erro ao enviar para CILIA:", error);
      toast.error(error.message || "Erro ao enviar para o CILIA");
    } finally {
      setSendingToCilia(false);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return "";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const parseCurrency = (value: string) => {
    const num = parseFloat(value.replace(/[^\d,.-]/g, "").replace(",", "."));
    return isNaN(num) ? 0 : num;
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Acompanhamento - SIN-{new Date().getFullYear()}-{String(sinistroNumero).padStart(6, "0")}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="comite" className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 mb-4">
            <TabsTrigger value="comite" className="text-xs">
              <Users className="h-3 w-3 mr-1" />
              Comitê
            </TabsTrigger>
            <TabsTrigger value="cota" className="text-xs">
              <PieChart className="h-3 w-3 mr-1" />
              Cota
            </TabsTrigger>
            <TabsTrigger value="custos" className="text-xs">
              <DollarSign className="h-3 w-3 mr-1" />
              Custos
            </TabsTrigger>
            <TabsTrigger value="pecas" className="text-xs">
              <Package className="h-3 w-3 mr-1" />
              Peças
            </TabsTrigger>
            <TabsTrigger value="reparo" className="text-xs">
              <Wrench className="h-3 w-3 mr-1" />
              Reparo
            </TabsTrigger>
            <TabsTrigger value="oficina" className="text-xs">
              <Building2 className="h-3 w-3 mr-1" />
              Oficina
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="text-xs">
              <CreditCard className="h-3 w-3 mr-1" />
              Financeiro
            </TabsTrigger>
            <TabsTrigger value="status" className="text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Status
            </TabsTrigger>
          </TabsList>

          {/* Comitê */}
          <TabsContent value="comite">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Comitê de Sinistros</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status do Comitê</Label>
                    <Select
                      value={data.comite_status || ""}
                      onValueChange={(value) => setData({ ...data, comite_status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="em_discussao">Em Discussão</SelectItem>
                        <SelectItem value="aprovado">Aprovado</SelectItem>
                        <SelectItem value="rejeitado">Rejeitado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data da Decisão</Label>
                    <Input
                      type="datetime-local"
                      value={data.comite_data?.slice(0, 16) || ""}
                      onChange={(e) => setData({ ...data, comite_data: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Decisão</Label>
                  <Textarea
                    value={data.comite_decisao || ""}
                    onChange={(e) => setData({ ...data, comite_decisao: e.target.value })}
                    placeholder="Descreva a decisão do comitê..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={data.comite_observacoes || ""}
                    onChange={(e) => setData({ ...data, comite_observacoes: e.target.value })}
                    placeholder="Observações adicionais..."
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cota de Participação */}
          <TabsContent value="cota">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cota de Participação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor da Cota (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={data.cota_participacao || ""}
                      onChange={(e) => setData({ ...data, cota_participacao: parseFloat(e.target.value) || 0 })}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Percentual (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={data.cota_percentual || ""}
                      onChange={(e) => setData({ ...data, cota_percentual: parseFloat(e.target.value) || 0 })}
                      placeholder="0,00"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Custos */}
          <TabsContent value="custos">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Custos Detalhados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Custo de Peças (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={data.custo_pecas || ""}
                      onChange={(e) => setData({ ...data, custo_pecas: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Custo de Mão de Obra (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={data.custo_mao_obra || ""}
                      onChange={(e) => setData({ ...data, custo_mao_obra: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Custo de Serviços (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={data.custo_servicos || ""}
                      onChange={(e) => setData({ ...data, custo_servicos: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Outros Custos (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={data.custo_outros || ""}
                      onChange={(e) => setData({ ...data, custo_outros: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <Separator />
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total:</p>
                  <p className="text-xl font-bold">
                    {formatCurrency(
                      (data.custo_pecas || 0) +
                      (data.custo_mao_obra || 0) +
                      (data.custo_servicos || 0) +
                      (data.custo_outros || 0)
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Peças */}
          <TabsContent value="pecas">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Peças</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Switch
                    checked={data.pecas_aprovadas || false}
                    onCheckedChange={(checked) => setData({ ...data, pecas_aprovadas: checked })}
                  />
                  <Label>Peças Aprovadas</Label>
                </div>
                <div className="space-y-2">
                  <Label>Valor Total das Peças (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={data.pecas_valor_total || ""}
                    onChange={(e) => setData({ ...data, pecas_valor_total: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição das Peças</Label>
                  <Textarea
                    value={data.pecas_descricao || ""}
                    onChange={(e) => setData({ ...data, pecas_descricao: e.target.value })}
                    placeholder="Liste as peças necessárias..."
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Autorização de Reparo */}
          <TabsContent value="reparo">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Autorização de Reparo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Switch
                    checked={data.reparo_autorizado || false}
                    onCheckedChange={(checked) => setData({ ...data, reparo_autorizado: checked })}
                  />
                  <Label>Reparo Autorizado</Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data da Autorização</Label>
                    <Input
                      type="datetime-local"
                      value={data.reparo_data_autorizacao?.slice(0, 16) || ""}
                      onChange={(e) => setData({ ...data, reparo_data_autorizacao: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Autorizado por</Label>
                    <Input
                      value={data.reparo_autorizado_por || ""}
                      onChange={(e) => setData({ ...data, reparo_autorizado_por: e.target.value })}
                      placeholder="Nome do responsável"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={data.reparo_observacoes || ""}
                    onChange={(e) => setData({ ...data, reparo_observacoes: e.target.value })}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Oficina */}
          <TabsContent value="oficina">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Oficina</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome da Oficina</Label>
                    <Input
                      value={data.oficina_nome || ""}
                      onChange={(e) => setData({ ...data, oficina_nome: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CNPJ</Label>
                    <Input
                      value={data.oficina_cnpj || ""}
                      onChange={(e) => setData({ ...data, oficina_cnpj: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Oficina</Label>
                  <Select
                    value={data.oficina_tipo || ""}
                    onValueChange={(value) => setData({ ...data, oficina_tipo: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="referenciada">Referenciada</SelectItem>
                      <SelectItem value="livre_escolha">Livre Escolha</SelectItem>
                      <SelectItem value="propria">Própria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Input
                    value={data.oficina_endereco || ""}
                    onChange={(e) => setData({ ...data, oficina_endereco: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contato</Label>
                  <Input
                    value={data.oficina_contato || ""}
                    onChange={(e) => setData({ ...data, oficina_contato: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Financeiro */}
          <TabsContent value="financeiro">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Financeiro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Status Financeiro</Label>
                  <Select
                    value={data.financeiro_status || ""}
                    onValueChange={(value) => setData({ ...data, financeiro_status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_processamento">Em Processamento</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor Aprovado (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={data.financeiro_valor_aprovado || ""}
                      onChange={(e) => setData({ ...data, financeiro_valor_aprovado: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Pago (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={data.financeiro_valor_pago || ""}
                      onChange={(e) => setData({ ...data, financeiro_valor_pago: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data do Pagamento</Label>
                    <Input
                      type="datetime-local"
                      value={data.financeiro_data_pagamento?.slice(0, 16) || ""}
                      onChange={(e) => setData({ ...data, financeiro_data_pagamento: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Forma de Pagamento</Label>
                    <Select
                      value={data.financeiro_forma_pagamento || ""}
                      onValueChange={(value) => setData({ ...data, financeiro_forma_pagamento: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="deposito">Depósito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Status (Desistência e Finalização) */}
          <TabsContent value="status">
            <div className="space-y-4">
              {/* Desistência */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-destructive" />
                    Desistência
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={data.desistencia || false}
                      onCheckedChange={(checked) => setData({ 
                        ...data, 
                        desistencia: checked,
                        desistencia_data: checked ? new Date().toISOString() : null
                      })}
                    />
                    <Label>Cliente desistiu do sinistro</Label>
                  </div>
                  {data.desistencia && (
                    <>
                      <div className="space-y-2">
                        <Label>Data da Desistência</Label>
                        <Input
                          type="datetime-local"
                          value={data.desistencia_data?.slice(0, 16) || ""}
                          onChange={(e) => setData({ ...data, desistencia_data: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Motivo</Label>
                        <Textarea
                          value={data.desistencia_motivo || ""}
                          onChange={(e) => setData({ ...data, desistencia_motivo: e.target.value })}
                          rows={2}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Finalização */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Finalização
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={data.finalizado || false}
                      onCheckedChange={(checked) => setData({ 
                        ...data, 
                        finalizado: checked,
                        finalizado_data: checked ? new Date().toISOString() : null
                      })}
                    />
                    <Label>Sinistro Finalizado</Label>
                  </div>
                  {data.finalizado && (
                    <>
                      <div className="space-y-2">
                        <Label>Data da Finalização</Label>
                        <Input
                          type="datetime-local"
                          value={data.finalizado_data?.slice(0, 16) || ""}
                          onChange={(e) => setData({ ...data, finalizado_data: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Observações Finais</Label>
                        <Textarea
                          value={data.finalizado_observacoes || ""}
                          onChange={(e) => setData({ ...data, finalizado_observacoes: e.target.value })}
                          rows={3}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Status CILIA */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Integração CILIA</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Status de Envio</p>
                      <p className="text-sm text-muted-foreground">
                        {data.cilia_enviado ? (
                          <span className="text-green-600">
                            Enviado em {data.cilia_enviado_em ? format(new Date(data.cilia_enviado_em), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "N/A"}
                          </span>
                        ) : (
                          "Não enviado"
                        )}
                      </p>
                      {data.cilia_budget_id && (
                        <p className="text-sm text-muted-foreground">
                          Budget ID: {data.cilia_budget_id}
                        </p>
                      )}
                    </div>
                    <Badge variant={data.cilia_enviado ? "default" : "secondary"}>
                      {data.cilia_enviado ? "Enviado" : "Pendente"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <Separator className="my-4" />

        <div className="flex justify-between gap-4">
          <Button
            variant="outline"
            onClick={handleSendToCilia}
            disabled={sendingToCilia}
            className="gap-2"
          >
            {sendingToCilia ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Sincronizar com CILIA
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
