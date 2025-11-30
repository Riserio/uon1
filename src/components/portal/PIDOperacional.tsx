import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency, formatPercent, calcPercent } from "@/lib/formatters";
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

  // Calcular porcentagens automaticamente
  const calculatedData = useMemo(() => {
    if (!data) return null;

    const placas = data.placas_ativas || 1;
    const boletosEmitidos = data.boletos_emitidos || 1;
    const faturamento = data.faturamento_operacional || 1;
    const totalRecebido = data.total_recebido || 1;
    const totalAssociados = data.total_associados || 1;

    // Cálculos automáticos de porcentagens
    const percentual_inadimplencia = calcPercent(data.inadimplentes, placas);
    const percentual_cancelamentos = calcPercent(data.cancelamentos, placas);
    const percentual_adesoes = calcPercent(data.cadastros_realizados, placas);
    const crescimento_liquido = calcPercent(data.cadastros_realizados - data.cancelamentos, placas);
    const churn = calcPercent(data.cancelamentos, placas);
    const saldo_placas = data.cadastros_realizados - data.cancelamentos + data.reativacao;
    const indice_crescimento_bruto = calcPercent(data.cadastros_realizados, placas);
    
    // Novos cálculos
    const indice_veiculos_por_associado = totalAssociados > 0 ? placas / totalAssociados : 0;
    const indice_novos_cadastros = calcPercent(data.cadastros_realizados, placas);
    const permanencia = (data.cadastros_realizados + data.reativacao) - (data.cancelamentos + data.inadimplentes);
    const indice_permanencia = calcPercent(permanencia, data.cadastros_realizados + data.reativacao);

    // Indicadores Financeiros
    const percentual_emissao_boleto = calcPercent(data.boletos_liquidados, boletosEmitidos);
    const percentual_inadimplencia_boletos = calcPercent(data.boletos_abertos, boletosEmitidos);
    const percentual_cancelamento_boletos = calcPercent(data.boletos_cancelados, boletosEmitidos);
    const ticket_medio_boleto = data.boletos_liquidados > 0 ? totalRecebido / data.boletos_liquidados : 0;
    const percentual_inadimplencia_financeira = calcPercent(data.valor_boletos_abertos, faturamento);
    const percentual_arrecadacao_juros = calcPercent(data.arrecadamento_juros, totalRecebido);
    const percentual_descontado_banco = calcPercent(data.descontado_banco, totalRecebido);

    // Eventos - Total automático
    const abertura_total_eventos = 
      data.abertura_indenizacao_parcial_associado + 
      data.abertura_indenizacao_parcial_terceiro + 
      data.abertura_indenizacao_integral_associado + 
      data.abertura_indenizacao_integral_terceiro + 
      data.abertura_vidros + 
      data.abertura_carro_reserva;

    // Custo total eventos
    const custo_total_eventos = 
      data.pagamento_valor_parcial_associado + 
      data.pagamento_valor_parcial_terceiro + 
      data.pagamento_valor_integral_associado + 
      data.pagamento_valor_integral_terceiro + 
      data.pagamento_valor_vidros + 
      data.pagamento_valor_carro_reserva;

    // Total pagamentos quantidade
    const pagamento_total_qtd = 
      data.pagamento_qtd_parcial_associado + 
      data.pagamento_qtd_parcial_terceiro + 
      data.pagamento_qtd_integral_associado + 
      data.pagamento_qtd_integral_terceiro + 
      data.pagamento_qtd_vidros + 
      data.pagamento_qtd_carro_reserva;

    // Tickets médios
    const qtd_parcial = data.pagamento_qtd_parcial_associado + data.pagamento_qtd_parcial_terceiro;
    const qtd_integral = data.pagamento_qtd_integral_associado + data.pagamento_qtd_integral_terceiro;
    const valor_parcial = data.pagamento_valor_parcial_associado + data.pagamento_valor_parcial_terceiro;
    const valor_integral = data.pagamento_valor_integral_associado + data.pagamento_valor_integral_terceiro;

    const ticket_medio_parcial = qtd_parcial > 0 ? valor_parcial / qtd_parcial : 0;
    const ticket_medio_integral = qtd_integral > 0 ? valor_integral / qtd_integral : 0;
    const ticket_medio_vidros = data.pagamento_qtd_vidros > 0 ? data.pagamento_valor_vidros / data.pagamento_qtd_vidros : 0;
    const ticket_medio_carro_reserva = data.pagamento_qtd_carro_reserva > 0 ? data.pagamento_valor_carro_reserva / data.pagamento_qtd_carro_reserva : 0;

    // Índices
    const indice_dano_parcial = calcPercent(qtd_parcial, placas);
    const indice_dano_integral = calcPercent(qtd_integral, placas);
    const sinistralidade_financeira = calcPercent(custo_total_eventos, totalRecebido);
    const sinistralidade_geral = calcPercent(abertura_total_eventos, placas);

    // Assistência
    const comprometimento_assistencia = calcPercent(data.custo_assistencia, totalRecebido);

    // Rastreamento
    const comprometimento_rastreamento = calcPercent(data.custo_rastreamento, totalRecebido);

    // Rateio
    const custo_total_rateavel = custo_total_eventos + data.custo_assistencia + data.custo_rastreamento;
    const percentual_rateio = ticket_medio_boleto > 0 ? calcPercent(custo_total_rateavel / placas, ticket_medio_boleto) : 0;

    return {
      ...data,
      percentual_inadimplencia,
      percentual_cancelamentos,
      percentual_adesoes,
      crescimento_liquido,
      churn,
      saldo_placas,
      indice_crescimento_bruto,
      indice_veiculos_por_associado,
      indice_novos_cadastros,
      permanencia,
      indice_permanencia,
      percentual_emissao_boleto,
      percentual_inadimplencia_boletos,
      percentual_cancelamento_boletos,
      ticket_medio_boleto,
      percentual_inadimplencia_financeira,
      percentual_arrecadacao_juros,
      percentual_descontado_banco,
      abertura_total_eventos,
      custo_total_eventos,
      pagamento_total_qtd,
      ticket_medio_parcial,
      ticket_medio_integral,
      ticket_medio_vidros,
      ticket_medio_carro_reserva,
      indice_dano_parcial,
      indice_dano_integral,
      sinistralidade_financeira,
      sinistralidade_geral,
      comprometimento_assistencia,
      comprometimento_rastreamento,
      custo_total_rateavel,
      percentual_rateio,
    };
  }, [data]);

  const fetchData = async () => {
    if (!corretoraId) return;
    setLoading(true);
    try {
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
    if (!calculatedData || !corretoraId || !user) return;
    setSaving(true);
    try {
      const saveData = {
        ...calculatedData,
        corretora_id: corretoraId,
        ano: parseInt(ano),
        mes: parseInt(mes),
        updated_by: user.id,
      };

      if (calculatedData.id) {
        const { error } = await supabase
          .from("pid_operacional")
          .update(saveData)
          .eq("id", calculatedData.id);
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

  // Prepare chart data
  const historicoChartData = historico.map(h => ({
    periodo: `${h.mes.toString().padStart(2, '0')}/${h.ano}`,
    faturamento: h.faturamento_operacional,
    recebido: h.total_recebido,
    sinistralidade: h.sinistralidade_financeira * 100,
    placas: h.placas_ativas,
  }));

  const eventosChartData = calculatedData ? [
    { name: "Parcial Assoc.", value: calculatedData.pagamento_valor_parcial_associado },
    { name: "Parcial Terc.", value: calculatedData.pagamento_valor_parcial_terceiro },
    { name: "Integral Assoc.", value: calculatedData.pagamento_valor_integral_associado },
    { name: "Integral Terc.", value: calculatedData.pagamento_valor_integral_terceiro },
    { name: "Vidros", value: calculatedData.pagamento_valor_vidros },
    { name: "Carro Reserva", value: calculatedData.pagamento_valor_carro_reserva },
  ] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!calculatedData) return null;

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
          value={calculatedData.placas_ativas}
          icon={<Car className="h-4 w-4" />}
          trend={calculatedData.crescimento_liquido}
        />
        <MetricCard
          title="Faturamento"
          value={formatCurrency(calculatedData.faturamento_operacional)}
          icon={<DollarSign className="h-4 w-4" />}
          trend={calculatedData.percentual_crescimento_faturamento}
          isCurrency
        />
        <MetricCard
          title="Recebido"
          value={formatCurrency(calculatedData.total_recebido)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          trend={calculatedData.percentual_crescimento_recebido}
          isCurrency
        />
        <MetricCard
          title="Sinistralidade"
          value={formatPercent(calculatedData.sinistralidade_financeira)}
          icon={<AlertTriangle className="h-4 w-4" />}
          isPercent
          invertTrend
        />
        <MetricCard
          title="Inadimplência"
          value={formatPercent(calculatedData.percentual_inadimplencia)}
          icon={<TrendingDown className="h-4 w-4" />}
          isPercent
          invertTrend
        />
        <MetricCard
          title="Crescimento"
          value={formatPercent(calculatedData.crescimento_liquido)}
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
                <InputField label="Placas Ativas" value={data?.placas_ativas || 0} onChange={(v) => updateField("placas_ativas", v)} disabled={!canEdit} type="number" />
                <InputField label="Total de Cotas" value={data?.total_cotas || 0} onChange={(v) => updateField("total_cotas", v)} disabled={!canEdit} type="decimal" />
                <InputField label="Total de Associados" value={data?.total_associados || 0} onChange={(v) => updateField("total_associados", v)} disabled={!canEdit} type="number" />
                <InputField label="Cadastros Realizados" value={data?.cadastros_realizados || 0} onChange={(v) => updateField("cadastros_realizados", v)} disabled={!canEdit} type="number" />
                <PercentDisplayField label="Índice Crescimento Bruto" value={calculatedData.indice_crescimento_bruto} />
                <InputField label="Cancelamentos" value={data?.cancelamentos || 0} onChange={(v) => updateField("cancelamentos", v)} disabled={!canEdit} type="number" />
                <InputField label="Inadimplentes" value={data?.inadimplentes || 0} onChange={(v) => updateField("inadimplentes", v)} disabled={!canEdit} type="number" />
                <InputField label="Reativação" value={data?.reativacao || 0} onChange={(v) => updateField("reativacao", v)} disabled={!canEdit} type="number" />
                <PercentDisplayField label="Churn" value={calculatedData.churn} />
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Saldo de Placas</Label>
                  <div className="h-10 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-medium">
                    {calculatedData.saldo_placas}
                  </div>
                </div>
                <PercentDisplayField label="% Inadimplência" value={calculatedData.percentual_inadimplencia} />
                <PercentDisplayField label="% Cancelamentos" value={calculatedData.percentual_cancelamentos} />
                <PercentDisplayField label="% Adesões" value={calculatedData.percentual_adesoes} />
                <PercentDisplayField label="Crescimento Líquido" value={calculatedData.crescimento_liquido} />
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
                <InputField label="Boletos Emitidos" value={data?.boletos_emitidos || 0} onChange={(v) => updateField("boletos_emitidos", v)} disabled={!canEdit} type="number" />
                <InputField label="Boletos Liquidados" value={data?.boletos_liquidados || 0} onChange={(v) => updateField("boletos_liquidados", v)} disabled={!canEdit} type="number" />
                <InputField label="Boletos em Aberto" value={data?.boletos_abertos || 0} onChange={(v) => updateField("boletos_abertos", v)} disabled={!canEdit} type="number" />
                <InputField label="Boletos Cancelados" value={data?.boletos_cancelados || 0} onChange={(v) => updateField("boletos_cancelados", v)} disabled={!canEdit} type="number" />
                <InputField label="Faturamento Operacional" value={data?.faturamento_operacional || 0} onChange={(v) => updateField("faturamento_operacional", v)} disabled={!canEdit} type="currency" />
                <InputField label="Total Recebido" value={data?.total_recebido || 0} onChange={(v) => updateField("total_recebido", v)} disabled={!canEdit} type="currency" />
                <InputField label="Baixado com Pendência" value={data?.baixado_pendencia || 0} onChange={(v) => updateField("baixado_pendencia", v)} disabled={!canEdit} type="currency" />
                <InputField label="Valor Boletos em Aberto" value={data?.valor_boletos_abertos || 0} onChange={(v) => updateField("valor_boletos_abertos", v)} disabled={!canEdit} type="currency" />
                <InputField label="Valor Boletos Cancelados" value={data?.valor_boletos_cancelados || 0} onChange={(v) => updateField("valor_boletos_cancelados", v)} disabled={!canEdit} type="currency" />
                <InputField label="Recebimento Operacional" value={data?.recebimento_operacional || 0} onChange={(v) => updateField("recebimento_operacional", v)} disabled={!canEdit} type="currency" />
                <InputField label="Arrecadamento Juros" value={data?.arrecadamento_juros || 0} onChange={(v) => updateField("arrecadamento_juros", v)} disabled={!canEdit} type="currency" />
                <InputField label="Descontado Banco" value={data?.descontado_banco || 0} onChange={(v) => updateField("descontado_banco", v)} disabled={!canEdit} type="currency" />
                <PercentDisplayField label="% Emissão Boleto" value={calculatedData.percentual_emissao_boleto} />
                <PercentDisplayField label="% Inadimplência Boletos" value={calculatedData.percentual_inadimplencia_boletos} />
                <PercentDisplayField label="% Cancelamento Boletos" value={calculatedData.percentual_cancelamento_boletos} />
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Ticket Médio Boleto</Label>
                  <div className="h-10 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-medium">
                    {formatCurrency(calculatedData.ticket_medio_boleto)}
                  </div>
                </div>
                <PercentDisplayField label="% Inadimplência Financeira" value={calculatedData.percentual_inadimplencia_financeira} />
                <PercentDisplayField label="% Arrecadação Juros" value={calculatedData.percentual_arrecadacao_juros} />
                <PercentDisplayField label="% Descontado Banco" value={calculatedData.percentual_descontado_banco} />
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
                  <InputField label="Indenização Parcial Associado" value={data?.abertura_indenizacao_parcial_associado || 0} onChange={(v) => updateField("abertura_indenizacao_parcial_associado", v)} disabled={!canEdit} type="number" />
                  <InputField label="Indenização Parcial Terceiro" value={data?.abertura_indenizacao_parcial_terceiro || 0} onChange={(v) => updateField("abertura_indenizacao_parcial_terceiro", v)} disabled={!canEdit} type="number" />
                  <InputField label="Indenização Integral Associado" value={data?.abertura_indenizacao_integral_associado || 0} onChange={(v) => updateField("abertura_indenizacao_integral_associado", v)} disabled={!canEdit} type="number" />
                  <InputField label="Indenização Integral Terceiro" value={data?.abertura_indenizacao_integral_terceiro || 0} onChange={(v) => updateField("abertura_indenizacao_integral_terceiro", v)} disabled={!canEdit} type="number" />
                  <InputField label="Vidros" value={data?.abertura_vidros || 0} onChange={(v) => updateField("abertura_vidros", v)} disabled={!canEdit} type="number" />
                  <InputField label="Carro Reserva" value={data?.abertura_carro_reserva || 0} onChange={(v) => updateField("abertura_carro_reserva", v)} disabled={!canEdit} type="number" />
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-sm font-medium">Total de Eventos (automático)</Label>
                    <div className="h-10 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-medium">
                      {calculatedData.abertura_total_eventos}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pagamentos - Quantidade</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField label="Parcial Associado" value={data?.pagamento_qtd_parcial_associado || 0} onChange={(v) => updateField("pagamento_qtd_parcial_associado", v)} disabled={!canEdit} type="number" />
                  <InputField label="Parcial Terceiro" value={data?.pagamento_qtd_parcial_terceiro || 0} onChange={(v) => updateField("pagamento_qtd_parcial_terceiro", v)} disabled={!canEdit} type="number" />
                  <InputField label="Integral Associado" value={data?.pagamento_qtd_integral_associado || 0} onChange={(v) => updateField("pagamento_qtd_integral_associado", v)} disabled={!canEdit} type="number" />
                  <InputField label="Integral Terceiro" value={data?.pagamento_qtd_integral_terceiro || 0} onChange={(v) => updateField("pagamento_qtd_integral_terceiro", v)} disabled={!canEdit} type="number" />
                  <InputField label="Vidros" value={data?.pagamento_qtd_vidros || 0} onChange={(v) => updateField("pagamento_qtd_vidros", v)} disabled={!canEdit} type="number" />
                  <InputField label="Carro Reserva" value={data?.pagamento_qtd_carro_reserva || 0} onChange={(v) => updateField("pagamento_qtd_carro_reserva", v)} disabled={!canEdit} type="number" />
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
                  <InputField label="Parcial Associado" value={data?.pagamento_valor_parcial_associado || 0} onChange={(v) => updateField("pagamento_valor_parcial_associado", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Parcial Terceiro" value={data?.pagamento_valor_parcial_terceiro || 0} onChange={(v) => updateField("pagamento_valor_parcial_terceiro", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Integral Associado" value={data?.pagamento_valor_integral_associado || 0} onChange={(v) => updateField("pagamento_valor_integral_associado", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Integral Terceiro" value={data?.pagamento_valor_integral_terceiro || 0} onChange={(v) => updateField("pagamento_valor_integral_terceiro", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Vidros" value={data?.pagamento_valor_vidros || 0} onChange={(v) => updateField("pagamento_valor_vidros", v)} disabled={!canEdit} type="currency" />
                  <InputField label="Carro Reserva" value={data?.pagamento_valor_carro_reserva || 0} onChange={(v) => updateField("pagamento_valor_carro_reserva", v)} disabled={!canEdit} type="currency" />
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-sm font-medium">Custo Total Eventos (automático)</Label>
                    <div className="h-10 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-medium">
                      {formatCurrency(calculatedData.custo_total_eventos)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tickets Médios e Índices (automáticos)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">TM Parcial</Label>
                    <div className="h-10 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-medium">
                      {formatCurrency(calculatedData.ticket_medio_parcial)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">TM Integral</Label>
                    <div className="h-10 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-medium">
                      {formatCurrency(calculatedData.ticket_medio_integral)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">TM Vidros</Label>
                    <div className="h-10 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-medium">
                      {formatCurrency(calculatedData.ticket_medio_vidros)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">TM Carro Reserva</Label>
                    <div className="h-10 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-medium">
                      {formatCurrency(calculatedData.ticket_medio_carro_reserva)}
                    </div>
                  </div>
                  <PercentDisplayField label="Índice Dano Parcial" value={calculatedData.indice_dano_parcial} />
                  <PercentDisplayField label="Índice Dano Integral" value={calculatedData.indice_dano_integral} />
                  <PercentDisplayField label="Sinistralidade Financeira" value={calculatedData.sinistralidade_financeira} />
                  <PercentDisplayField label="Sinistralidade Geral" value={calculatedData.sinistralidade_geral} />
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
                <InputField label="Acionamentos" value={data?.acionamentos_assistencia || 0} onChange={(v) => updateField("acionamentos_assistencia", v)} disabled={!canEdit} type="number" />
                <InputField label="Custo Total" value={data?.custo_assistencia || 0} onChange={(v) => updateField("custo_assistencia", v)} disabled={!canEdit} type="currency" />
                <PercentDisplayField label="% Comprometimento (automático)" value={calculatedData.comprometimento_assistencia} />
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
                  <InputField label="Veículos Rastreados" value={data?.veiculos_rastreados || 0} onChange={(v) => updateField("veiculos_rastreados", v)} disabled={!canEdit} type="number" />
                  <InputField label="Instalações Realizadas" value={data?.instalacoes_rastreamento || 0} onChange={(v) => updateField("instalacoes_rastreamento", v)} disabled={!canEdit} type="number" />
                  <InputField label="Custo Total" value={data?.custo_rastreamento || 0} onChange={(v) => updateField("custo_rastreamento", v)} disabled={!canEdit} type="currency" />
                  <PercentDisplayField label="% Comprometimento (automático)" value={calculatedData.comprometimento_rastreamento} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Rateio (automático)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Custo Total Rateável</Label>
                    <div className="h-10 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-medium">
                      {formatCurrency(calculatedData.custo_total_rateavel)}
                    </div>
                  </div>
                  <InputField label="Rateio do Período" value={data?.rateio_periodo || 0} onChange={(v) => updateField("rateio_periodo", v)} disabled={!canEdit} type="currency" />
                  <PercentDisplayField label="% Rateio (Base TM)" value={calculatedData.percentual_rateio} />
                  <InputField label="CME Explit" value={(data?.cme_explit || 0) * 100} onChange={(v) => updateField("cme_explit", v / 100)} disabled={!canEdit} type="percent" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Gráficos */}
        <TabsContent value="graficos" className="space-y-6">
          {/* MOVIMENTAÇÃO DE BASE */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Movimentação de Base
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1 */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Placas Ativas x Cotas</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Período', placas: calculatedData.placas_ativas, cotas: calculatedData.total_cotas }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="placas" name="Placas Ativas" fill="#2563eb" />
                        <Bar dataKey="cotas" name="Total Cotas" fill="#16a34a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Associados x Índice Veículos/Associado</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Período', associados: calculatedData.total_associados, indice: calculatedData.indice_veiculos_por_associado }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="associados" name="Total Associados" fill="#8b5cf6" />
                        <Bar yAxisId="right" dataKey="indice" name="Índice Veíc./Assoc." fill="#ec4899" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              {/* Row 2 */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Cadastros x Índice Novos Cadastros</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Período', cadastros: calculatedData.cadastros_realizados, indice: calculatedData.indice_novos_cadastros * 100 }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(2)}%`} />
                        <Tooltip formatter={(value: any, name: string) => name === 'Índice Novos Cad.' ? `${Number(value).toFixed(2)}%` : value} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="cadastros" name="Cadastros" fill="#2563eb" />
                        <Line yAxisId="right" type="monotone" dataKey="indice" name="Índice Novos Cad." stroke="#dc2626" strokeWidth={2} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Crescimento Bruto x Líquido</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Período', bruto: calculatedData.indice_crescimento_bruto * 100, liquido: calculatedData.crescimento_liquido * 100 }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(2)}%`} />
                        <Tooltip formatter={(value: any) => `${Number(value).toFixed(2)}%`} />
                        <Legend />
                        <Bar dataKey="bruto" name="Índice Cresc. Bruto" fill="#16a34a" />
                        <Bar dataKey="liquido" name="Crescimento Líquido" fill="#eab308" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              {/* Row 3 */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Cancelamentos x Inadimplentes</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Período', cancelamentos: calculatedData.cancelamentos, inadimplentes: calculatedData.inadimplentes }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="cancelamentos" name="Cancelamentos" fill="#dc2626" />
                        <Bar dataKey="inadimplentes" name="Inadimplentes" fill="#f97316" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Reativações x Churn</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Período', reativacao: calculatedData.reativacao, churn: calculatedData.churn * 100 }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(2)}%`} />
                        <Tooltip formatter={(value: any, name: string) => name === 'Churn %' ? `${Number(value).toFixed(2)}%` : value} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="reativacao" name="Reativações" fill="#16a34a" />
                        <Bar yAxisId="right" dataKey="churn" name="Churn %" fill="#dc2626" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              {/* Row 4 - Permanência */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Permanência x Índice de Permanência</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Período', permanencia: calculatedData.permanencia, indice: calculatedData.indice_permanencia * 100 }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(2)}%`} />
                        <Tooltip formatter={(value: any, name: string) => name === 'Índice Permanência' ? `${Number(value).toFixed(2)}%` : value} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="permanencia" name="Permanência" fill="#8b5cf6" />
                        <Bar yAxisId="right" dataKey="indice" name="Índice Permanência" fill="#06b6d4" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                {/* Gráfico de Rosca - Permanência */}
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Distribuição de Permanência (Rosca)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={[
                            { name: 'Entradas', value: calculatedData.cadastros_realizados + calculatedData.reativacao },
                            { name: 'Perdas', value: calculatedData.cancelamentos + calculatedData.inadimplentes }
                          ]}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                        >
                          <Cell fill="#16a34a" />
                          <Cell fill="#dc2626" />
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* CONTAS A PAGAR / INDICADORES FINANCEIROS */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Indicadores Financeiros
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Boletos Quantidade */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Boletos - Quantidade</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Período', emitidos: calculatedData.boletos_emitidos, liquidados: calculatedData.boletos_liquidados, abertos: calculatedData.boletos_abertos, cancelados: calculatedData.boletos_cancelados }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Bar dataKey="emitidos" name="Emitidos" fill="#2563eb" />
                        <Bar dataKey="liquidados" name="Liquidados" fill="#16a34a" />
                        <Bar dataKey="abertos" name="Em Aberto" fill="#eab308" />
                        <Bar dataKey="cancelados" name="Cancelados" fill="#dc2626" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                {/* Valores Financeiros */}
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Valores Financeiros (R$)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={[{ 
                          name: 'Período', 
                          faturamento: calculatedData.faturamento_operacional,
                          recebido: calculatedData.total_recebido,
                          pendencia: calculatedData.baixado_pendencia,
                          abertos: calculatedData.valor_boletos_abertos,
                          cancelados: calculatedData.valor_boletos_cancelados,
                          operacional: calculatedData.recebimento_operacional,
                          juros: calculatedData.arrecadamento_juros,
                          banco: calculatedData.descontado_banco
                        }]}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                        <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                        <Legend wrapperStyle={{ fontSize: '9px' }} />
                        <Bar dataKey="faturamento" name="Faturamento" fill="#2563eb" />
                        <Bar dataKey="recebido" name="Recebido" fill="#16a34a" />
                        <Bar dataKey="operacional" name="Rec. Operac." fill="#8b5cf6" />
                        <Bar dataKey="abertos" name="Bol. Abertos" fill="#eab308" />
                        <Bar dataKey="cancelados" name="Cancelados" fill="#dc2626" />
                        <Bar dataKey="banco" name="Desc. Banco" fill="#f97316" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              {/* Índices Financeiros */}
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">% Inadimpl. Boletos</div>
                  <div className="text-lg font-bold">{formatPercent(calculatedData.percentual_inadimplencia_boletos)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">% Cancel. Boletos</div>
                  <div className="text-lg font-bold">{formatPercent(calculatedData.percentual_cancelamento_boletos)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">% Inadimpl. Financeira</div>
                  <div className="text-lg font-bold">{formatPercent(calculatedData.percentual_inadimplencia_financeira)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">Ticket Médio Boleto</div>
                  <div className="text-lg font-bold">{formatCurrency(calculatedData.ticket_medio_boleto)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">% Arrecad. Juros</div>
                  <div className="text-lg font-bold">{formatPercent(calculatedData.percentual_arrecadacao_juros)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">% Descontado Banco</div>
                  <div className="text-lg font-bold">{formatPercent(calculatedData.percentual_descontado_banco)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">% Cresc. Faturamento</div>
                  <div className="text-lg font-bold">{formatPercent(calculatedData.percentual_crescimento_faturamento)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">% Cresc. Recebido</div>
                  <div className="text-lg font-bold">{formatPercent(calculatedData.percentual_crescimento_recebido)}</div>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* EVENTOS */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Eventos / Sinistros
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Abertura de Eventos */}
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Abertura de Eventos</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={[{ 
                          name: 'Abertura',
                          parcialAssoc: calculatedData.abertura_indenizacao_parcial_associado,
                          parcialTerc: calculatedData.abertura_indenizacao_parcial_terceiro,
                          integralAssoc: calculatedData.abertura_indenizacao_integral_associado,
                          integralTerc: calculatedData.abertura_indenizacao_integral_terceiro,
                          vidros: calculatedData.abertura_vidros,
                          carroReserva: calculatedData.abertura_carro_reserva,
                          total: calculatedData.abertura_total_eventos
                        }]}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 9 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={50} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '8px' }} />
                        <Bar dataKey="parcialAssoc" name="Parcial Assoc." fill="#2563eb" stackId="a" />
                        <Bar dataKey="parcialTerc" name="Parcial Terc." fill="#16a34a" stackId="a" />
                        <Bar dataKey="integralAssoc" name="Integral Assoc." fill="#8b5cf6" stackId="a" />
                        <Bar dataKey="integralTerc" name="Integral Terc." fill="#ec4899" stackId="a" />
                        <Bar dataKey="vidros" name="Vidros" fill="#eab308" stackId="a" />
                        <Bar dataKey="carroReserva" name="Carro Reserva" fill="#f97316" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                {/* Qtd Eventos Pagos */}
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Qtd Eventos Pagos</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={[{ 
                          name: 'Pagamentos',
                          parcialAssoc: calculatedData.pagamento_qtd_parcial_associado,
                          parcialTerc: calculatedData.pagamento_qtd_parcial_terceiro,
                          integralAssoc: calculatedData.pagamento_qtd_integral_associado,
                          integralTerc: calculatedData.pagamento_qtd_integral_terceiro,
                          vidros: calculatedData.pagamento_qtd_vidros,
                          carroReserva: calculatedData.pagamento_qtd_carro_reserva
                        }]}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 9 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '8px' }} />
                        <Bar dataKey="parcialAssoc" name="Parcial Assoc." fill="#2563eb" stackId="a" />
                        <Bar dataKey="parcialTerc" name="Parcial Terc." fill="#16a34a" stackId="a" />
                        <Bar dataKey="integralAssoc" name="Integral Assoc." fill="#8b5cf6" stackId="a" />
                        <Bar dataKey="integralTerc" name="Integral Terc." fill="#ec4899" stackId="a" />
                        <Bar dataKey="vidros" name="Vidros" fill="#eab308" stackId="a" />
                        <Bar dataKey="carroReserva" name="Carro Reserva" fill="#f97316" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                {/* Valor Eventos Pagos */}
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Valor Eventos Pagos (R$)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={[
                            { name: 'Parcial Assoc.', value: calculatedData.pagamento_valor_parcial_associado },
                            { name: 'Parcial Terc.', value: calculatedData.pagamento_valor_parcial_terceiro },
                            { name: 'Integral Assoc.', value: calculatedData.pagamento_valor_integral_associado },
                            { name: 'Integral Terc.', value: calculatedData.pagamento_valor_integral_terceiro },
                            { name: 'Vidros', value: calculatedData.pagamento_valor_vidros },
                            { name: 'Carro Reserva', value: calculatedData.pagamento_valor_carro_reserva }
                          ].filter(d => d.value > 0)}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={65}
                          paddingAngle={2}
                        >
                          {COLORS.map((color, index) => (
                            <Cell key={`cell-${index}`} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                        <Legend wrapperStyle={{ fontSize: '9px' }} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              {/* Índices de Eventos */}
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">% Sinistral. Financeira</div>
                  <div className="text-lg font-bold">{formatPercent(calculatedData.sinistralidade_financeira)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">% Sinistral. Geral</div>
                  <div className="text-lg font-bold">{formatPercent(calculatedData.sinistralidade_geral)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">% Índice Dano Parcial</div>
                  <div className="text-lg font-bold">{formatPercent(calculatedData.indice_dano_parcial)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">% Índice Dano Integral</div>
                  <div className="text-lg font-bold">{formatPercent(calculatedData.indice_dano_integral)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">TM Indeniz. Parcial</div>
                  <div className="text-lg font-bold">{formatCurrency(calculatedData.ticket_medio_parcial)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">TM Indeniz. Integral</div>
                  <div className="text-lg font-bold">{formatCurrency(calculatedData.ticket_medio_integral)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">TM Vidros</div>
                  <div className="text-lg font-bold">{formatCurrency(calculatedData.ticket_medio_vidros)}</div>
                </Card>
                <Card className="bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">TM Carro Reserva</div>
                  <div className="text-lg font-bold">{formatCurrency(calculatedData.ticket_medio_carro_reserva)}</div>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* ASSISTÊNCIA */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Assistência 24 Horas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">Total Acionamentos</div>
                  <div className="text-2xl font-bold">{calculatedData.acionamentos_assistencia}</div>
                </Card>
                <Card className="bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">Custo Total</div>
                  <div className="text-2xl font-bold">{formatCurrency(calculatedData.custo_assistencia)}</div>
                </Card>
                <Card className="bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">% Comprometimento</div>
                  <div className="text-2xl font-bold">{formatPercent(calculatedData.comprometimento_assistencia)}</div>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* RASTREAMENTO */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Rastreamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-4">
                <Card className="bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">Veículos Rastreados</div>
                  <div className="text-2xl font-bold">{calculatedData.veiculos_rastreados}</div>
                </Card>
                <Card className="bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">Instalações Feitas</div>
                  <div className="text-2xl font-bold">{calculatedData.instalacoes_rastreamento}</div>
                </Card>
                <Card className="bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">Custo Total</div>
                  <div className="text-2xl font-bold">{formatCurrency(calculatedData.custo_rastreamento)}</div>
                </Card>
                <Card className="bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">% Comprometimento</div>
                  <div className="text-2xl font-bold">{formatPercent(calculatedData.comprometimento_rastreamento)}</div>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* RATEIO */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Rateio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Custo Rateável x Cotas</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Período', custo: calculatedData.custo_total_rateavel, cotas: calculatedData.total_cotas }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(value: any, name: string) => name === 'Custo Rateável' ? formatCurrency(Number(value)) : value} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="custo" name="Custo Rateável" fill="#dc2626" />
                        <Bar yAxisId="right" dataKey="cotas" name="Total Cotas" fill="#16a34a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <div className="grid gap-4 grid-cols-2">
                  <Card className="bg-muted/30 p-4">
                    <div className="text-sm text-muted-foreground">Rateio no Período</div>
                    <div className="text-2xl font-bold">{formatCurrency(calculatedData.rateio_periodo)}</div>
                  </Card>
                  <Card className="bg-muted/30 p-4">
                    <div className="text-sm text-muted-foreground">% Rateio (Base TM)</div>
                    <div className="text-2xl font-bold">{formatPercent(calculatedData.percentual_rateio)}</div>
                  </Card>
                  <Card className="bg-muted/30 p-4 col-span-2">
                    <div className="text-sm text-muted-foreground">CME - Contribuição Mensal de Estabilização</div>
                    <div className="text-2xl font-bold">{formatPercent(calculatedData.cme_explit)}</div>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Componente para exibir porcentagens calculadas automaticamente
function PercentDisplayField({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="h-10 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-medium">
        {formatPercent(value)}
      </div>
    </div>
  );
}

// Componente MetricCard
function MetricCard({
  title,
  value,
  icon,
  trend,
  isCurrency,
  isPercent,
  invertTrend,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: number;
  isCurrency?: boolean;
  isPercent?: boolean;
  invertTrend?: boolean;
}) {
  const trendColor = trend !== undefined 
    ? (invertTrend ? (trend < 0 ? "text-green-600" : "text-red-600") : (trend >= 0 ? "text-green-600" : "text-red-600"))
    : "";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{icon}</span>
          {trend !== undefined && (
            <span className={`text-xs ${trendColor}`}>
              {trend >= 0 ? "+" : ""}{formatPercent(trend)}
            </span>
          )}
        </div>
        <div className="mt-2">
          <div className="text-xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{title}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// Componente InputField
function InputField({
  label,
  value,
  onChange,
  disabled,
  type,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  type: "number" | "currency" | "percent" | "decimal";
  className?: string;
}) {
  if (type === "currency") {
    return (
      <div className={`space-y-2 ${className || ""}`}>
        <Label className="text-sm font-medium">{label}</Label>
        <NumericFormat
          value={value}
          onValueChange={(values) => onChange(values.floatValue || 0)}
          thousandSeparator="."
          decimalSeparator=","
          prefix="R$ "
          decimalScale={2}
          allowNegative={false}
          disabled={disabled}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    );
  }

  if (type === "percent") {
    return (
      <div className={`space-y-2 ${className || ""}`}>
        <Label className="text-sm font-medium">{label}</Label>
        <NumericFormat
          value={value}
          onValueChange={(values) => onChange(values.floatValue || 0)}
          thousandSeparator="."
          decimalSeparator=","
          suffix="%"
          decimalScale={2}
          allowNegative={true}
          disabled={disabled}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    );
  }

  if (type === "decimal") {
    return (
      <div className={`space-y-2 ${className || ""}`}>
        <Label className="text-sm font-medium">{label}</Label>
        <NumericFormat
          value={value}
          onValueChange={(values) => onChange(values.floatValue || 0)}
          thousandSeparator="."
          decimalSeparator=","
          decimalScale={2}
          allowNegative={false}
          disabled={disabled}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className || ""}`}>
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        disabled={disabled}
      />
    </div>
  );
}
