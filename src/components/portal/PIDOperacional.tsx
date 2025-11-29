import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { useMenuPermissions } from "@/hooks/useMenuPermissions";
import { useAuth } from "@/hooks/useAuth";
import { NumericFormat } from "react-number-format";
import {
  Save, TrendingUp, TrendingDown, Users, FileText, Car, Shield, Phone, MapPin,
  DollarSign, Percent, AlertTriangle, CheckCircle2, BarChart3, PieChart, Activity
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface PIDOperacionalData {
  id?: string;
  corretora_id: string;
  ano: number;
  mes: number;
  // Movimentação de Base
  placas_ativas: number;
  total_cotas: number;
  total_associados: number;
  cadastros_realizados: number;
  indice_crescimento_bruto: number;
  cancelamentos: number;
  inadimplentes: number;
  reativacao: number;
  churn: number;
  saldo_placas: number;
  percentual_inadimplencia: number;
  percentual_cancelamentos: number;
  percentual_adesoes: number;
  crescimento_liquido: number;
  // Indicadores Financeiros
  boletos_emitidos: number;
  boletos_liquidados: number;
  boletos_abertos: number;
  boletos_cancelados: number;
  faturamento_operacional: number;
  total_recebido: number;
  baixado_pendencia: number;
  valor_boletos_abertos: number;
  valor_boletos_cancelados: number;
  recebimento_operacional: number;
  arrecadamento_juros: number;
  descontado_banco: number;
  percentual_emissao_boleto: number;
  percentual_inadimplencia_boletos: number;
  percentual_cancelamento_boletos: number;
  ticket_medio_boleto: number;
  percentual_inadimplencia_financeira: number;
  percentual_arrecadacao_juros: number;
  percentual_descontado_banco: number;
  percentual_crescimento_faturamento: number;
  percentual_crescimento_recebido: number;
  // Eventos
  abertura_indenizacao_parcial_associado: number;
  abertura_indenizacao_parcial_terceiro: number;
  abertura_indenizacao_integral_associado: number;
  abertura_indenizacao_integral_terceiro: number;
  abertura_vidros: number;
  abertura_carro_reserva: number;
  abertura_total_eventos: number;
  pagamento_qtd_parcial_associado: number;
  pagamento_qtd_parcial_terceiro: number;
  pagamento_qtd_integral_associado: number;
  pagamento_qtd_integral_terceiro: number;
  pagamento_qtd_vidros: number;
  pagamento_qtd_carro_reserva: number;
  pagamento_valor_parcial_associado: number;
  pagamento_valor_parcial_terceiro: number;
  pagamento_valor_integral_associado: number;
  pagamento_valor_integral_terceiro: number;
  pagamento_valor_vidros: number;
  pagamento_valor_carro_reserva: number;
  custo_total_eventos: number;
  ticket_medio_parcial: number;
  ticket_medio_integral: number;
  ticket_medio_vidros: number;
  ticket_medio_carro_reserva: number;
  indice_dano_parcial: number;
  indice_dano_integral: number;
  sinistralidade_financeira: number;
  sinistralidade_geral: number;
  // Assistência
  acionamentos_assistencia: number;
  custo_assistencia: number;
  comprometimento_assistencia: number;
  // Rastreamento
  veiculos_rastreados: number;
  instalacoes_rastreamento: number;
  custo_rastreamento: number;
  comprometimento_rastreamento: number;
  // Rateio
  custo_total_rateavel: number;
  rateio_periodo: number;
  percentual_rateio: number;
  cme_explit: number;
}

const defaultData: Omit<PIDOperacionalData, 'corretora_id' | 'ano' | 'mes'> = {
  placas_ativas: 0,
  total_cotas: 0,
  total_associados: 0,
  cadastros_realizados: 0,
  indice_crescimento_bruto: 0,
  cancelamentos: 0,
  inadimplentes: 0,
  reativacao: 0,
  churn: 0,
  saldo_placas: 0,
  percentual_inadimplencia: 0,
  percentual_cancelamentos: 0,
  percentual_adesoes: 0,
  crescimento_liquido: 0,
  boletos_emitidos: 0,
  boletos_liquidados: 0,
  boletos_abertos: 0,
  boletos_cancelados: 0,
  faturamento_operacional: 0,
  total_recebido: 0,
  baixado_pendencia: 0,
  valor_boletos_abertos: 0,
  valor_boletos_cancelados: 0,
  recebimento_operacional: 0,
  arrecadamento_juros: 0,
  descontado_banco: 0,
  percentual_emissao_boleto: 0,
  percentual_inadimplencia_boletos: 0,
  percentual_cancelamento_boletos: 0,
  ticket_medio_boleto: 0,
  percentual_inadimplencia_financeira: 0,
  percentual_arrecadacao_juros: 0,
  percentual_descontado_banco: 0,
  percentual_crescimento_faturamento: 0,
  percentual_crescimento_recebido: 0,
  abertura_indenizacao_parcial_associado: 0,
  abertura_indenizacao_parcial_terceiro: 0,
  abertura_indenizacao_integral_associado: 0,
  abertura_indenizacao_integral_terceiro: 0,
  abertura_vidros: 0,
  abertura_carro_reserva: 0,
  abertura_total_eventos: 0,
  pagamento_qtd_parcial_associado: 0,
  pagamento_qtd_parcial_terceiro: 0,
  pagamento_qtd_integral_associado: 0,
  pagamento_qtd_integral_terceiro: 0,
  pagamento_qtd_vidros: 0,
  pagamento_qtd_carro_reserva: 0,
  pagamento_valor_parcial_associado: 0,
  pagamento_valor_parcial_terceiro: 0,
  pagamento_valor_integral_associado: 0,
  pagamento_valor_integral_terceiro: 0,
  pagamento_valor_vidros: 0,
  pagamento_valor_carro_reserva: 0,
  custo_total_eventos: 0,
  ticket_medio_parcial: 0,
  ticket_medio_integral: 0,
  ticket_medio_vidros: 0,
  ticket_medio_carro_reserva: 0,
  indice_dano_parcial: 0,
  indice_dano_integral: 0,
  sinistralidade_financeira: 0,
  sinistralidade_geral: 0,
  acionamentos_assistencia: 0,
  custo_assistencia: 0,
  comprometimento_assistencia: 0,
  veiculos_rastreados: 0,
  instalacoes_rastreamento: 0,
  custo_rastreamento: 0,
  comprometimento_rastreamento: 0,
  custo_total_rateavel: 0,
  rateio_periodo: 0,
  percentual_rateio: 0,
  cme_explit: 0,
};

const COLORS = ["#2563eb", "#16a34a", "#eab308", "#dc2626", "#8b5cf6", "#ec4899"];

export default function PIDOperacional({ corretoraId }: { corretoraId?: string }) {
  const { user } = useAuth();
  const { canEditMenu } = useMenuPermissions(user?.id);
  const canEdit = canEditMenu("pid");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PIDOperacionalData | null>(null);
  const [historico, setHistorico] = useState<PIDOperacionalData[]>([]);
  const [ano, setAno] = useState(new Date().getFullYear().toString());
  const [mes, setMes] = useState((new Date().getMonth() + 1).toString().padStart(2, "0"));

  const anos = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());
  const meses = [
    { value: "01", label: "Janeiro" },
    { value: "02", label: "Fevereiro" },
    { value: "03", label: "Março" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Maio" },
    { value: "06", label: "Junho" },
    { value: "07", label: "Julho" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  const fetchData = async () => {
    if (!corretoraId) return;
    setLoading(true);
    try {
      // Buscar dados do período selecionado
      const { data: result, error } = await supabase
        .from("pid_operacional")
        .select("*")
        .eq("corretora_id", corretoraId)
        .eq("ano", parseInt(ano))
        .eq("mes", parseInt(mes))
        .maybeSingle();

      if (error) throw error;
      
      if (result) {
        setData(result as unknown as PIDOperacionalData);
      } else {
        setData({
          ...defaultData,
          corretora_id: corretoraId,
          ano: parseInt(ano),
          mes: parseInt(mes),
        });
      }

      // Buscar histórico dos últimos 12 meses
      const dataInicio = new Date(parseInt(ano), parseInt(mes) - 12, 1);
      const { data: historicoData, error: histError } = await supabase
        .from("pid_operacional")
        .select("*")
        .eq("corretora_id", corretoraId)
        .gte("ano", dataInicio.getFullYear())
        .order("ano", { ascending: true })
        .order("mes", { ascending: true });

      if (!histError && historicoData) {
        setHistorico(historicoData as unknown as PIDOperacionalData[]);
      }
    } catch (error: any) {
      console.error("Error fetching PID data:", error);
      toast.error("Erro ao carregar dados do PID");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (corretoraId) {
      fetchData();
    }
  }, [corretoraId, ano, mes]);

  const handleSave = async () => {
    if (!data || !corretoraId || !user) return;
    setSaving(true);
    try {
      const saveData = {
        ...data,
        corretora_id: corretoraId,
        ano: parseInt(ano),
        mes: parseInt(mes),
        updated_by: user.id,
      };

      if (data.id) {
        const { error } = await supabase
          .from("pid_operacional")
          .update(saveData)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("pid_operacional")
          .insert({ ...saveData, created_by: user.id });
        if (error) throw error;
      }

      toast.success("Dados salvos com sucesso!");
      fetchData();
    } catch (error: any) {
      console.error("Error saving PID data:", error);
      toast.error("Erro ao salvar dados");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof PIDOperacionalData, value: number) => {
    if (!data) return;
    setData({ ...data, [field]: value });
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

  // Prepare chart data
  const historicoChartData = historico.map(h => ({
    periodo: `${h.mes.toString().padStart(2, '0')}/${h.ano}`,
    faturamento: h.faturamento_operacional,
    recebido: h.total_recebido,
    sinistralidade: h.sinistralidade_financeira * 100,
    placas: h.placas_ativas,
  }));

  const eventosChartData = data ? [
    { name: "Parcial Assoc.", value: data.pagamento_valor_parcial_associado },
    { name: "Parcial Terc.", value: data.pagamento_valor_parcial_terceiro },
    { name: "Integral Assoc.", value: data.pagamento_valor_integral_associado },
    { name: "Integral Terc.", value: data.pagamento_valor_integral_terceiro },
    { name: "Vidros", value: data.pagamento_valor_vidros },
    { name: "Carro Reserva", value: data.pagamento_valor_carro_reserva },
  ] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header com filtros */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold">PID Operacional - PPR</h2>
          <p className="text-sm text-muted-foreground">Programa de Preparação Regulatória</p>
        </div>

        <div className="flex gap-3 items-center">
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meses.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canEdit && (
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          )}
        </div>
      </div>

      {/* KPIs Principais */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        <MetricCard
          title="Placas Ativas"
          value={data.placas_ativas}
          icon={<Car className="h-4 w-4" />}
          trend={data.crescimento_liquido}
        />
        <MetricCard
          title="Faturamento"
          value={formatCurrency(data.faturamento_operacional)}
          icon={<DollarSign className="h-4 w-4" />}
          trend={data.percentual_crescimento_faturamento}
          isCurrency
        />
        <MetricCard
          title="Recebido"
          value={formatCurrency(data.total_recebido)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          trend={data.percentual_crescimento_recebido}
          isCurrency
        />
        <MetricCard
          title="Sinistralidade"
          value={formatPercent(data.sinistralidade_financeira)}
          icon={<AlertTriangle className="h-4 w-4" />}
          isPercent
          invertTrend
        />
        <MetricCard
          title="Inadimplência"
          value={formatPercent(data.percentual_inadimplencia)}
          icon={<TrendingDown className="h-4 w-4" />}
          isPercent
          invertTrend
        />
        <MetricCard
          title="Crescimento"
          value={formatPercent(data.crescimento_liquido)}
          icon={<TrendingUp className="h-4 w-4" />}
          isPercent
        />
      </div>

      {/* Tabs de seções */}
      <Tabs defaultValue="base" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/30 p-1">
          <TabsTrigger value="base" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Users className="h-4 w-4" />
            Base
          </TabsTrigger>
          <TabsTrigger value="financeiro" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <DollarSign className="h-4 w-4" />
            Financeiro
          </TabsTrigger>
          <TabsTrigger value="eventos" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Shield className="h-4 w-4" />
            Eventos
          </TabsTrigger>
          <TabsTrigger value="assistencia" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Phone className="h-4 w-4" />
            Assistência
          </TabsTrigger>
          <TabsTrigger value="rastreamento" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <MapPin className="h-4 w-4" />
            Rastreamento
          </TabsTrigger>
          <TabsTrigger value="graficos" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BarChart3 className="h-4 w-4" />
            Gráficos
          </TabsTrigger>
        </TabsList>

        {/* Tab: Movimentação de Base */}
        <TabsContent value="base" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Movimentação de Base</CardTitle>
              <CardDescription>Dados de placas, associados e movimentação</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InputField label="Placas Ativas" value={data.placas_ativas} onChange={(v) => updateField("placas_ativas", v)} disabled={!canEdit} type="number" />
                <InputField label="Total de Cotas" value={data.total_cotas} onChange={(v) => updateField("total_cotas", v)} disabled={!canEdit} type="decimal" />
                <InputField label="Total de Associados" value={data.total_associados} onChange={(v) => updateField("total_associados", v)} disabled={!canEdit} type="number" />
                <InputField label="Cadastros Realizados" value={data.cadastros_realizados} onChange={(v) => updateField("cadastros_realizados", v)} disabled={!canEdit} type="number" />
                <InputField label="Índice Crescimento Bruto (%)" value={data.indice_crescimento_bruto * 100} onChange={(v) => updateField("indice_crescimento_bruto", v / 100)} disabled={!canEdit} type="percent" />
                <InputField label="Cancelamentos" value={data.cancelamentos} onChange={(v) => updateField("cancelamentos", v)} disabled={!canEdit} type="number" />
                <InputField label="Inadimplentes" value={data.inadimplentes} onChange={(v) => updateField("inadimplentes", v)} disabled={!canEdit} type="number" />
                <InputField label="Reativação" value={data.reativacao} onChange={(v) => updateField("reativacao", v)} disabled={!canEdit} type="number" />
                <InputField label="Churn (%)" value={data.churn * 100} onChange={(v) => updateField("churn", v / 100)} disabled={!canEdit} type="percent" />
                <InputField label="Saldo de Placas" value={data.saldo_placas} onChange={(v) => updateField("saldo_placas", v)} disabled={!canEdit} type="number" />
                <InputField label="% Inadimplência" value={data.percentual_inadimplencia * 100} onChange={(v) => updateField("percentual_inadimplencia", v / 100)} disabled={!canEdit} type="percent" />
                <InputField label="% Cancelamentos" value={data.percentual_cancelamentos * 100} onChange={(v) => updateField("percentual_cancelamentos", v / 100)} disabled={!canEdit} type="percent" />
                <InputField label="% Adesões" value={data.percentual_adesoes * 100} onChange={(v) => updateField("percentual_adesoes", v / 100)} disabled={!canEdit} type="percent" />
                <InputField label="Crescimento Líquido (%)" value={data.crescimento_liquido * 100} onChange={(v) => updateField("crescimento_liquido", v / 100)} disabled={!canEdit} type="percent" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Indicadores Financeiros */}
        <TabsContent value="financeiro" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Indicadores Financeiros</CardTitle>
              <CardDescription>Boletos, faturamento e recebimentos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InputField label="Boletos Emitidos" value={data.boletos_emitidos} onChange={(v) => updateField("boletos_emitidos", v)} disabled={!canEdit} type="number" />
                <InputField label="Boletos Liquidados" value={data.boletos_liquidados} onChange={(v) => updateField("boletos_liquidados", v)} disabled={!canEdit} type="number" />
                <InputField label="Boletos em Aberto" value={data.boletos_abertos} onChange={(v) => updateField("boletos_abertos", v)} disabled={!canEdit} type="number" />
                <InputField label="Boletos Cancelados" value={data.boletos_cancelados} onChange={(v) => updateField("boletos_cancelados", v)} disabled={!canEdit} type="number" />
                <InputField label="Faturamento Operacional" value={data.faturamento_operacional} onChange={(v) => updateField("faturamento_operacional", v)} disabled={!canEdit} type="currency" />
                <InputField label="Total Recebido" value={data.total_recebido} onChange={(v) => updateField("total_recebido", v)} disabled={!canEdit} type="currency" />
                <InputField label="Baixado com Pendência" value={data.baixado_pendencia} onChange={(v) => updateField("baixado_pendencia", v)} disabled={!canEdit} type="currency" />
                <InputField label="Valor Boletos em Aberto" value={data.valor_boletos_abertos} onChange={(v) => updateField("valor_boletos_abertos", v)} disabled={!canEdit} type="currency" />
                <InputField label="Valor Boletos Cancelados" value={data.valor_boletos_cancelados} onChange={(v) => updateField("valor_boletos_cancelados", v)} disabled={!canEdit} type="currency" />
                <InputField label="Recebimento Operacional" value={data.recebimento_operacional} onChange={(v) => updateField("recebimento_operacional", v)} disabled={!canEdit} type="currency" />
                <InputField label="Arrecadamento Juros" value={data.arrecadamento_juros} onChange={(v) => updateField("arrecadamento_juros", v)} disabled={!canEdit} type="currency" />
                <InputField label="Descontado Banco" value={data.descontado_banco} onChange={(v) => updateField("descontado_banco", v)} disabled={!canEdit} type="currency" />
                <InputField label="% Emissão Boleto" value={data.percentual_emissao_boleto * 100} onChange={(v) => updateField("percentual_emissao_boleto", v / 100)} disabled={!canEdit} type="percent" />
                <InputField label="% Inadimplência Boletos" value={data.percentual_inadimplencia_boletos * 100} onChange={(v) => updateField("percentual_inadimplencia_boletos", v / 100)} disabled={!canEdit} type="percent" />
                <InputField label="% Cancelamento Boletos" value={data.percentual_cancelamento_boletos * 100} onChange={(v) => updateField("percentual_cancelamento_boletos", v / 100)} disabled={!canEdit} type="percent" />
                <InputField label="Ticket Médio Boleto" value={data.ticket_medio_boleto} onChange={(v) => updateField("ticket_medio_boleto", v)} disabled={!canEdit} type="currency" />
                <InputField label="% Inadimplência Financeira" value={data.percentual_inadimplencia_financeira * 100} onChange={(v) => updateField("percentual_inadimplencia_financeira", v / 100)} disabled={!canEdit} type="percent" />
                <InputField label="% Crescimento Faturamento" value={data.percentual_crescimento_faturamento * 100} onChange={(v) => updateField("percentual_crescimento_faturamento", v / 100)} disabled={!canEdit} type="percent" />
                <InputField label="% Crescimento Recebido" value={data.percentual_crescimento_recebido * 100} onChange={(v) => updateField("percentual_crescimento_recebido", v / 100)} disabled={!canEdit} type="percent" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Eventos/Sinistros */}
        <TabsContent value="eventos" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Abertura de Eventos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField label="Indenização Parcial Associado" value={data.abertura_indenizacao_parcial_associado} onChange={(v) => updateField("abertura_indenizacao_parcial_associado", v)} disabled={!canEdit} type="number" />
                  <InputField label="Indenização Parcial Terceiro" value={data.abertura_indenizacao_parcial_terceiro} onChange={(v) => updateField("abertura_indenizacao_parcial_terceiro", v)} disabled={!canEdit} type="number" />
                  <InputField label="Indenização Integral Associado" value={data.abertura_indenizacao_integral_associado} onChange={(v) => updateField("abertura_indenizacao_integral_associado", v)} disabled={!canEdit} type="number" />
                  <InputField label="Indenização Integral Terceiro" value={data.abertura_indenizacao_integral_terceiro} onChange={(v) => updateField("abertura_indenizacao_integral_terceiro", v)} disabled={!canEdit} type="number" />
                  <InputField label="Vidros" value={data.abertura_vidros} onChange={(v) => updateField("abertura_vidros", v)} disabled={!canEdit} type="number" />
                  <InputField label="Carro Reserva" value={data.abertura_carro_reserva} onChange={(v) => updateField("abertura_carro_reserva", v)} disabled={!canEdit} type="number" />
                  <InputField label="Total de Eventos" value={data.abertura_total_eventos} onChange={(v) => updateField("abertura_total_eventos", v)} disabled={!canEdit} type="number" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pagamentos - Quantidade</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField label="Parcial Associado" value={data.pagamento_qtd_parcial_associado} onChange={(v) => updateField("pagamento_qtd_parcial_associado", v)} disabled={!canEdit} type="number" />
                  <InputField label="Parcial Terceiro" value={data.pagamento_qtd_parcial_terceiro} onChange={(v) => updateField("pagamento_qtd_parcial_terceiro", v)} disabled={!canEdit} type="number" />
                  <InputField label="Integral Associado" value={data.pagamento_qtd_integral_associado} onChange={(v) => updateField("pagamento_qtd_integral_associado", v)} disabled={!canEdit} type="number" />
                  <InputField label="Integral Terceiro" value={data.pagamento_qtd_integral_terceiro} onChange={(v) => updateField("pagamento_qtd_integral_terceiro", v)} disabled={!canEdit} type="number" />
                  <InputField label="Vidros" value={data.pagamento_qtd_vidros} onChange={(v) => updateField("pagamento_qtd_vidros", v)} disabled={!canEdit} type="number" />
                  <InputField label="Carro Reserva" value={data.pagamento_qtd_carro_reserva} onChange={(v) => updateField("pagamento_qtd_carro_reserva", v)} disabled={!canEdit} type="number" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pagamentos - Valores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField label="Parcial Associado" value={data.pagamento_valor_parcial_associado} onChange={(v) => updateField("pagamento_valor_parcial_associado", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Parcial Terceiro" value={data.pagamento_valor_parcial_terceiro} onChange={(v) => updateField("pagamento_valor_parcial_terceiro", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Integral Associado" value={data.pagamento_valor_integral_associado} onChange={(v) => updateField("pagamento_valor_integral_associado", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Integral Terceiro" value={data.pagamento_valor_integral_terceiro} onChange={(v) => updateField("pagamento_valor_integral_terceiro", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Vidros" value={data.pagamento_valor_vidros} onChange={(v) => updateField("pagamento_valor_vidros", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Carro Reserva" value={data.pagamento_valor_carro_reserva} onChange={(v) => updateField("pagamento_valor_carro_reserva", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Custo Total Eventos" value={data.custo_total_eventos} onChange={(v) => updateField("custo_total_eventos", v)} disabled={!canEdit} type="currency" className="sm:col-span-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tickets Médios e Índices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField label="TM Parcial" value={data.ticket_medio_parcial} onChange={(v) => updateField("ticket_medio_parcial", v)} disabled={!canEdit} type="currency" />
                  <InputField label="TM Integral" value={data.ticket_medio_integral} onChange={(v) => updateField("ticket_medio_integral", v)} disabled={!canEdit} type="currency" />
                  <InputField label="TM Vidros" value={data.ticket_medio_vidros} onChange={(v) => updateField("ticket_medio_vidros", v)} disabled={!canEdit} type="currency" />
                  <InputField label="TM Carro Reserva" value={data.ticket_medio_carro_reserva} onChange={(v) => updateField("ticket_medio_carro_reserva", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Índice Dano Parcial (%)" value={data.indice_dano_parcial * 100} onChange={(v) => updateField("indice_dano_parcial", v / 100)} disabled={!canEdit} type="percent" />
                  <InputField label="Índice Dano Integral (%)" value={data.indice_dano_integral * 100} onChange={(v) => updateField("indice_dano_integral", v / 100)} disabled={!canEdit} type="percent" />
                  <InputField label="Sinistralidade Financeira (%)" value={data.sinistralidade_financeira * 100} onChange={(v) => updateField("sinistralidade_financeira", v / 100)} disabled={!canEdit} type="percent" />
                  <InputField label="Sinistralidade Geral (%)" value={data.sinistralidade_geral * 100} onChange={(v) => updateField("sinistralidade_geral", v / 100)} disabled={!canEdit} type="percent" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Assistência */}
        <TabsContent value="assistencia" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assistência 24 Horas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InputField label="Acionamentos" value={data.acionamentos_assistencia} onChange={(v) => updateField("acionamentos_assistencia", v)} disabled={!canEdit} type="number" />
                <InputField label="Custo Total" value={data.custo_assistencia} onChange={(v) => updateField("custo_assistencia", v)} disabled={!canEdit} type="currency" />
                <InputField label="% Comprometimento" value={data.comprometimento_assistencia * 100} onChange={(v) => updateField("comprometimento_assistencia", v / 100)} disabled={!canEdit} type="percent" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Rastreamento */}
        <TabsContent value="rastreamento" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Rastreamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField label="Veículos Rastreados" value={data.veiculos_rastreados} onChange={(v) => updateField("veiculos_rastreados", v)} disabled={!canEdit} type="number" />
                  <InputField label="Instalações Realizadas" value={data.instalacoes_rastreamento} onChange={(v) => updateField("instalacoes_rastreamento", v)} disabled={!canEdit} type="number" />
                  <InputField label="Custo Total" value={data.custo_rastreamento} onChange={(v) => updateField("custo_rastreamento", v)} disabled={!canEdit} type="currency" />
                  <InputField label="% Comprometimento" value={data.comprometimento_rastreamento * 100} onChange={(v) => updateField("comprometimento_rastreamento", v / 100)} disabled={!canEdit} type="percent" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Rateio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField label="Custo Total Rateável" value={data.custo_total_rateavel} onChange={(v) => updateField("custo_total_rateavel", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Rateio do Período" value={data.rateio_periodo} onChange={(v) => updateField("rateio_periodo", v)} disabled={!canEdit} type="currency" />
                  <InputField label="% Rateio (Base TM)" value={data.percentual_rateio * 100} onChange={(v) => updateField("percentual_rateio", v / 100)} disabled={!canEdit} type="percent" />
                  <InputField label="CME Explit (%)" value={data.cme_explit * 100} onChange={(v) => updateField("cme_explit", v / 100)} disabled={!canEdit} type="percent" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Gráficos */}
        <TabsContent value="graficos" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Evolução Faturamento x Recebido</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {historicoChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historicoChartData}>
                      <defs>
                        <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                      <Area type="monotone" dataKey="faturamento" name="Faturamento" stroke="#2563eb" fill="url(#colorFat)" />
                      <Area type="monotone" dataKey="recebido" name="Recebido" stroke="#16a34a" fill="url(#colorRec)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados históricos</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Distribuição de Eventos por Tipo</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {eventosChartData.some(e => e.value > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={eventosChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {eventosChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados de eventos</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Evolução Sinistralidade (%)</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {historicoChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicoChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => `${Number(value).toFixed(2)}%`} />
                      <Line type="monotone" dataKey="sinistralidade" name="Sinistralidade" stroke="#dc2626" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados históricos</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Evolução Base de Placas</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {historicoChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={historicoChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="placas" name="Placas Ativas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados históricos</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Componente de Card de Métrica
function MetricCard({ 
  title, 
  value, 
  icon, 
  trend, 
  isCurrency, 
  isPercent, 
  invertTrend 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ReactNode; 
  trend?: number; 
  isCurrency?: boolean; 
  isPercent?: boolean;
  invertTrend?: boolean;
}) {
  const trendValue = trend ? trend * 100 : 0;
  const isPositive = invertTrend ? trendValue < 0 : trendValue > 0;
  
  return (
    <Card className="border-muted/40">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{title}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="mt-2 text-xl font-bold">{value}</div>
        {trend !== undefined && trend !== 0 && (
          <div className={`mt-1 text-xs flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trendValue).toFixed(2)}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Componente de Campo de Input
function InputField({ 
  label, 
  value, 
  onChange, 
  disabled, 
  type = "text",
  className = ""
}: { 
  label: string; 
  value: number; 
  onChange: (value: number) => void; 
  disabled?: boolean; 
  type?: "number" | "decimal" | "currency" | "percent" | "text";
  className?: string;
}) {
  const formatValue = (val: number) => {
    if (type === "currency") {
      return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (type === "percent" || type === "decimal") {
      return val.toFixed(2);
    }
    return val.toString();
  };

  const parseValue = (val: string) => {
    const cleaned = val.replace(/[^\d,.-]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  };

  if (type === "currency") {
    return (
      <div className={`space-y-1 ${className}`}>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <NumericFormat
          value={value}
          onValueChange={(values) => onChange(values.floatValue || 0)}
          disabled={disabled}
          thousandSeparator="."
          decimalSeparator=","
          prefix="R$ "
          decimalScale={2}
          allowNegative={false}
          customInput={Input}
          className="h-9 text-sm text-right"
        />
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="text"
        value={formatValue(value)}
        onChange={(e) => onChange(parseValue(e.target.value))}
        disabled={disabled}
        className={`h-9 text-sm`}
      />
    </div>
  );
}