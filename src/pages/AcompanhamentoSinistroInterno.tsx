import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { CurrencyInput } from "@/components/ui/currency-input";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/formatters";
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
  ArrowLeft,
  RefreshCw,
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
  financeiro_comprovante_url?: string | null;
  desistencia?: boolean | null;
  desistencia_motivo?: string | null;
  desistencia_data?: string | null;
  finalizado?: boolean | null;
  finalizado_data?: string | null;
  finalizado_observacoes?: string | null;
  finalizado_por?: string | null;
  cilia_enviado?: boolean | null;
  cilia_enviado_em?: string | null;
  cilia_budget_id?: string | null;
  cilia_response?: any;
}

interface AtendimentoInfo {
  id: string;
  numero: number;
  assunto: string;
  corretora_id: string | null;
  created_at: string;
  status: string;
  corretora?: { nome: string } | null;
}

export default function AcompanhamentoSinistroInterno() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingToCilia, setSendingToCilia] = useState(false);
  const [sendingToSga, setSendingToSga] = useState(false);
  const [atendimento, setAtendimento] = useState<AtendimentoInfo | null>(null);
  const [data, setData] = useState<AcompanhamentoData>({
    atendimento_id: id || "",
  });

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      
      // Load atendimento info
      const { data: atendimentoData, error: atendimentoError } = await supabase
        .from("atendimentos")
        .select("id, numero, assunto, corretora_id, created_at, status, corretoras(nome)")
        .eq("id", id)
        .single();

      if (atendimentoError) throw atendimentoError;
      
      setAtendimento({
        ...atendimentoData,
        corretora: atendimentoData.corretoras as { nome: string } | null
      });

      // Load acompanhamento data
      const { data: acompData, error } = await supabase
        .from("sinistro_acompanhamento")
        .select("*")
        .eq("atendimento_id", id)
        .maybeSingle();

      if (error) throw error;

      if (acompData) {
        setData(acompData);
      } else {
        setData({ atendimento_id: id });
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados do acompanhamento");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!id) return;
    
    try {
      setSaving(true);

      const payload = {
        ...data,
        atendimento_id: id,
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
      loadData();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar acompanhamento");
    } finally {
      setSaving(false);
    }
  };

  const handleSendToCilia = async () => {
    if (!atendimento?.corretora_id) {
      toast.error("Corretora não identificada para este sinistro");
      return;
    }

    try {
      setSendingToCilia(true);

      const { data: integration, error: integrationError } = await supabase
        .from("api_integrations")
        .select("*")
        .eq("corretora_id", atendimento.corretora_id)
        .eq("tipo", "cilia")
        .eq("ativo", true)
        .maybeSingle();

      if (integrationError) throw integrationError;

      if (!integration) {
        toast.error("Nenhuma integração CILIA configurada para esta corretora");
        return;
      }

      const { data: result, error } = await supabase.functions.invoke("enviar-cilia", {
        body: {
          atendimento_id: id,
          integration_id: integration.id,
        },
      });

      if (error) throw error;

      if (result?.success) {
        toast.success("Sinistro enviado ao CILIA com sucesso");
        
        await supabase
          .from("sinistro_acompanhamento")
          .update({
            cilia_enviado: true,
            cilia_enviado_em: new Date().toISOString(),
            cilia_budget_id: result.budgetId,
            cilia_response: result.response,
          })
          .eq("atendimento_id", id);

        loadData();
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

  const handleSendToSga = async () => {
    if (!atendimento?.corretora_id) {
      toast.error("Corretora não identificada para este sinistro");
      return;
    }

    if (!data.finalizado) {
      toast.error("O sinistro precisa estar finalizado para enviar ao SGA");
      return;
    }

    try {
      setSendingToSga(true);

      const { data: integration, error: integrationError } = await supabase
        .from("api_integrations")
        .select("*")
        .eq("corretora_id", atendimento.corretora_id)
        .eq("tipo", "sga_hinova")
        .eq("ativo", true)
        .maybeSingle();

      if (integrationError) throw integrationError;

      if (!integration) {
        toast.error("Nenhuma integração SGA Hinova configurada para esta corretora");
        return;
      }

      const { data: result, error } = await supabase.functions.invoke("enviar-sga-hinova", {
        body: {
          atendimento_id: id,
          integration_id: integration.id,
        },
      });

      if (error) throw error;

      if (result?.success) {
        toast.success("Sinistro sincronizado com SGA Hinova com sucesso");
        loadData();
      } else {
        toast.error(result?.message || "Erro ao sincronizar com SGA Hinova");
      }
    } catch (error: any) {
      console.error("Erro ao enviar para SGA Hinova:", error);
      toast.error(error.message || "Erro ao sincronizar com SGA Hinova");
    } finally {
      setSendingToSga(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!atendimento) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Sinistro não encontrado</p>
        <Button onClick={() => navigate("/sinistros")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/sinistros")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">
                  Acompanhamento - SIN-{new Date(atendimento.created_at).getFullYear()}-{String(atendimento.numero).padStart(6, "0")}
                </h1>
                <p className="text-muted-foreground">
                  {atendimento.assunto} • {atendimento.corretora?.nome || "Sem corretora"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data.cilia_enviado && (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Enviado ao CILIA
                </Badge>
              )}
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs defaultValue="comite" className="w-full">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1 mb-6">
            <TabsTrigger value="comite" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Comitê</span>
            </TabsTrigger>
            <TabsTrigger value="cota" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <PieChart className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Cota</span>
            </TabsTrigger>
            <TabsTrigger value="custos" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <DollarSign className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Custos</span>
            </TabsTrigger>
            <TabsTrigger value="pecas" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Package className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Peças</span>
            </TabsTrigger>
            <TabsTrigger value="reparo" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Wrench className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Reparo</span>
            </TabsTrigger>
            <TabsTrigger value="oficina" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Building2 className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Oficina</span>
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CreditCard className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Financeiro</span>
            </TabsTrigger>
            <TabsTrigger value="status" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Status</span>
            </TabsTrigger>
            <TabsTrigger value="integracao" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <RefreshCw className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Integração</span>
            </TabsTrigger>
          </TabsList>

          {/* Comitê */}
          <TabsContent value="comite">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Comitê de Sinistros</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor da Cota</Label>
                    <CurrencyInput
                      value={data.cota_participacao?.toString() || ""}
                      onValueChange={(values) => setData({ ...data, cota_participacao: values.floatValue || 0 })}
                      placeholder="R$ 0,00"
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Custo de Peças</Label>
                    <CurrencyInput
                      value={data.custo_pecas?.toString() || ""}
                      onValueChange={(values) => setData({ ...data, custo_pecas: values.floatValue || 0 })}
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Custo de Mão de Obra</Label>
                    <CurrencyInput
                      value={data.custo_mao_obra?.toString() || ""}
                      onValueChange={(values) => setData({ ...data, custo_mao_obra: values.floatValue || 0 })}
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Custo de Serviços</Label>
                    <CurrencyInput
                      value={data.custo_servicos?.toString() || ""}
                      onValueChange={(values) => setData({ ...data, custo_servicos: values.floatValue || 0 })}
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Outros Custos</Label>
                    <CurrencyInput
                      value={data.custo_outros?.toString() || ""}
                      onValueChange={(values) => setData({ ...data, custo_outros: values.floatValue || 0 })}
                      placeholder="R$ 0,00"
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
                  <Label>Valor Total das Peças</Label>
                  <CurrencyInput
                    value={data.pecas_valor_total?.toString() || ""}
                    onValueChange={(values) => setData({ ...data, pecas_valor_total: values.floatValue || 0 })}
                    placeholder="R$ 0,00"
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      placeholder="Nome do autorizador"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observações do Reparo</Label>
                  <Textarea
                    value={data.reparo_observacoes || ""}
                    onChange={(e) => setData({ ...data, reparo_observacoes: e.target.value })}
                    placeholder="Observações sobre o reparo..."
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
                <CardTitle className="text-lg">Dados da Oficina</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome da Oficina</Label>
                    <Input
                      value={data.oficina_nome || ""}
                      onChange={(e) => setData({ ...data, oficina_nome: e.target.value })}
                      placeholder="Nome da oficina"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CNPJ</Label>
                    <Input
                      value={data.oficina_cnpj || ""}
                      onChange={(e) => setData({ ...data, oficina_cnpj: e.target.value })}
                      placeholder="00.000.000/0000-00"
                    />
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
                        <SelectItem value="credenciada">Credenciada</SelectItem>
                        <SelectItem value="referenciada">Referenciada</SelectItem>
                        <SelectItem value="livre_escolha">Livre Escolha</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Contato</Label>
                    <Input
                      value={data.oficina_contato || ""}
                      onChange={(e) => setData({ ...data, oficina_contato: e.target.value })}
                      placeholder="Telefone ou email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Textarea
                    value={data.oficina_endereco || ""}
                    onChange={(e) => setData({ ...data, oficina_endereco: e.target.value })}
                    placeholder="Endereço completo da oficina"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Financeiro */}
          <TabsContent value="financeiro">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informações Financeiras</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <SelectItem value="aprovado">Aprovado</SelectItem>
                        <SelectItem value="em_pagamento">Em Pagamento</SelectItem>
                        <SelectItem value="pago">Pago</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
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
                        <SelectItem value="transferencia">Transferência</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Aprovado</Label>
                    <CurrencyInput
                      value={data.financeiro_valor_aprovado?.toString() || ""}
                      onValueChange={(values) => setData({ ...data, financeiro_valor_aprovado: values.floatValue || 0 })}
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Pago</Label>
                    <CurrencyInput
                      value={data.financeiro_valor_pago?.toString() || ""}
                      onValueChange={(values) => setData({ ...data, financeiro_valor_pago: values.floatValue || 0 })}
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data do Pagamento</Label>
                    <Input
                      type="date"
                      value={data.financeiro_data_pagamento?.slice(0, 10) || ""}
                      onChange={(e) => setData({ ...data, financeiro_data_pagamento: e.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Status */}
          <TabsContent value="status">
            <div className="grid gap-6">
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
                      onCheckedChange={(checked) => setData({ ...data, desistencia: checked })}
                    />
                    <Label>Houve Desistência</Label>
                  </div>
                  {data.desistencia && (
                    <>
                      <div className="space-y-2">
                        <Label>Data da Desistência</Label>
                        <Input
                          type="date"
                          value={data.desistencia_data?.slice(0, 10) || ""}
                          onChange={(e) => setData({ ...data, desistencia_data: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Motivo da Desistência</Label>
                        <Textarea
                          value={data.desistencia_motivo || ""}
                          onChange={(e) => setData({ ...data, desistencia_motivo: e.target.value })}
                          placeholder="Descreva o motivo..."
                          rows={3}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Finalizado */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    Finalização
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={data.finalizado || false}
                      onCheckedChange={(checked) => setData({ ...data, finalizado: checked, finalizado_data: checked ? new Date().toISOString() : null })}
                    />
                    <Label>Sinistro Finalizado</Label>
                  </div>
                  {data.finalizado && (
                    <>
                      <div className="space-y-2">
                        <Label>Data da Finalização</Label>
                        <Input
                          type="date"
                          value={data.finalizado_data?.slice(0, 10) || ""}
                          onChange={(e) => setData({ ...data, finalizado_data: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Observações Finais</Label>
                        <Textarea
                          value={data.finalizado_observacoes || ""}
                          onChange={(e) => setData({ ...data, finalizado_observacoes: e.target.value })}
                          placeholder="Observações sobre a finalização..."
                          rows={3}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Integração */}
          <TabsContent value="integracao">
            <div className="grid gap-6">
              {/* CILIA */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Integração CILIA</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Status:</p>
                      {data.cilia_enviado ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Enviado em {data.cilia_enviado_em ? format(new Date(data.cilia_enviado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ""}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                          Não enviado
                        </Badge>
                      )}
                    </div>
                    <Button onClick={handleSendToCilia} disabled={sendingToCilia}>
                      {sendingToCilia ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      {data.cilia_enviado ? "Reenviar ao CILIA" : "Enviar ao CILIA"}
                    </Button>
                  </div>
                  {data.cilia_budget_id && (
                    <div>
                      <p className="text-sm text-muted-foreground">ID do Orçamento CILIA:</p>
                      <p className="font-mono">{data.cilia_budget_id}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* SGA Hinova */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Integração SGA Hinova</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    A sincronização com o SGA Hinova só está disponível após a finalização do sinistro.
                    Todos os dados do acompanhamento serão enviados ao sistema.
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Status do Sinistro:</p>
                      {data.finalizado ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Finalizado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                          Em andamento
                        </Badge>
                      )}
                    </div>
                    <Button 
                      onClick={handleSendToSga} 
                      disabled={sendingToSga || !data.finalizado}
                      variant={data.finalizado ? "default" : "secondary"}
                    >
                      {sendingToSga ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Sincronizar com SGA
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
