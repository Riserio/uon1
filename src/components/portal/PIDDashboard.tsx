import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency, formatPercent, calcPercent } from "@/lib/formatters";
import {
  DollarSign,
  Car,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Percent,
  BarChart3,
  CreditCard,
  PieChart as PieIcon,
  Truck,
  MapPin,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  // PieChart,
  // Pie,
  // Cell,
  ComposedChart,
} from "recharts";

interface PIDDashboardProps {
  corretoraId?: string;
}

const mesesNome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6"];

const EmptyChart = () => (
  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem dados disponíveis</div>
);

/**
 * Tooltip base para todos os gráficos, seguindo o padrão visual
 * do tooltip de "Abertura de Eventos no Período".
 */
const DefaultTooltipContent = ({
  active,
  payload,
  label,
  formatter,
  showTotal = false,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  formatter?: (value: number) => string;
  showTotal?: boolean;
}) => {
  if (!active || !payload || !payload.length) return null;

  const total = payload.reduce((acc, item) => acc + (item.value || 0), 0);

  return (
    <div className="rounded-md border bg-background px-3 py-2 shadow-sm text-xs">
      {label && <div className="font-semibold mb-1">{label}</div>}

      {payload.map((item: any) => {
        const value = item.value || 0;
        const color = item.color || item.stroke || item.fill || "#6b7280";

        return (
          <div key={item.dataKey} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <span>{item.name || item.dataKey}</span>
            </span>
            <span>{formatter ? formatter(value) : value.toLocaleString("pt-BR")}</span>
          </div>
        );
      })}

      {showTotal && (
        <div className="mt-1 border-t pt-1 flex items-center justify-between font-semibold">
          <span>Total :</span>
          <span>{formatter ? formatter(total) : total.toLocaleString("pt-BR")}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Tooltip para gráficos EMPILHADOS de QUANTIDADE de eventos
 * (Abertura de Eventos e Quantidade Eventos Pagos)
 * Mostra cada linha + TOTAL de eventos no rodapé.
 */
const EventosStackedTooltip = (props: any) => (
  <DefaultTooltipContent {...props} formatter={(value: number) => (value || 0).toLocaleString("pt-BR")} showTotal />
);

/**
 * Tooltip para gráfico de VALOR de eventos pagos
 * (Valor de Eventos Pagos no Período (R$))
 * Mostra cada linha em R$ + TOTAL em R$ no rodapé.
 */
const ValorEventosTooltip = (props: any) => (
  <DefaultTooltipContent {...props} formatter={(value: number) => formatCurrency(value || 0)} showTotal />
);

/**
 * Tooltip específico para Permanência - Entrada vs Perdas
 * Mostra Entrada, Perdas, Saldo e % Variação do Saldo.
 */
const PermanenciaTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  const entradaItem = payload.find((p: any) => p.dataKey === "entrada");
  const perdasItem = payload.find((p: any) => p.dataKey === "perdas");
  const variacaoItem = payload.find((p: any) => p.dataKey === "variacao_permanencia");

  const entrada = entradaItem?.value || 0;
  const perdas = perdasItem?.value || 0;
  const saldo = entrada - perdas;
  const variacao = variacaoItem?.value || 0;

  return (
    <div className="rounded-md border bg-background px-3 py-2 shadow-sm text-xs">
      <div className="font-semibold mb-1">{label}</div>

      {entradaItem && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: entradaItem.color || entradaItem.fill || "#16a34a" }}
            />
            <span>Entrada</span>
          </span>
          <span>{entrada.toLocaleString("pt-BR")}</span>
        </div>
      )}

      {perdasItem && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: perdasItem.color || perdasItem.fill || "#dc2626" }}
            />
            <span>Perdas</span>
          </span>
          <span>{perdas.toLocaleString("pt-BR")}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 font-semibold mt-1 border-t pt-1">
        <span>Saldo (Entrada - Perdas)</span>
        <span>{saldo.toLocaleString("pt-BR")}</span>
      </div>

      {variacaoItem && (
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: variacaoItem.color || variacaoItem.stroke || "#2563eb" }}
            />
            <span>% Var. Saldo vs mês anterior</span>
          </span>
          <span>{formatPercent(variacao || 0)}</span>
        </div>
      )}
    </div>
  );
};

// Componente de variação responsivo
interface VariationIndicatorProps {
  current: number;
  previous: number | null | undefined;
  format?: "number" | "currency" | "percent";
}

const VariationIndicator = ({ current, previous, format = "number" }: VariationIndicatorProps) => {
  // Quando não há dados anteriores, mostra indicador neutro
  if (previous === null || previous === undefined) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
        <Minus className="h-3 w-3" />
        <span>—</span>
      </div>
    );
  }
  
  const diff = current - previous;
  const percentChange = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : (current > 0 ? 100 : 0);
  const isPositive = diff > 0;
  const isNeutral = diff === 0;

  const formatDiff = () => {
    switch (format) {
      case "currency":
        return formatCurrency(Math.abs(diff));
      case "percent":
        // Para porcentagem, o diff já está em pontos percentuais
        return Math.abs(diff).toFixed(2).replace('.', ',') + ' p.p.';
      default:
        return Math.abs(diff).toLocaleString("pt-BR");
    }
  };

  const colorClass = isNeutral 
    ? "text-muted-foreground" 
    : isPositive 
      ? "text-green-600" 
      : "text-red-600";

  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;

  return (
    <div className={`flex items-center gap-1 text-xs mt-1 ${colorClass}`}>
      <Icon className="h-3 w-3" />
      {/* Apenas percentual em telas pequenas */}
      <span className="sm:hidden">
        {isPositive ? "+" : isNeutral ? "" : "-"}{Math.abs(percentChange).toFixed(1)}%
      </span>
      {/* Valor absoluto + percentual em telas maiores */}
      <span className="hidden sm:inline">
        {isPositive ? "+" : isNeutral ? "" : "-"}{formatDiff()} ({isPositive ? "+" : ""}{percentChange.toFixed(1)}%)
      </span>
    </div>
  );
};

export default function PIDDashboard({ corretoraId }: PIDDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState(new Date().getFullYear().toString());
  const [dadosAno, setDadosAno] = useState<any[]>([]);
  const [dadosAtual, setDadosAtual] = useState<any>(null);
  const [dadosAnterior, setDadosAnterior] = useState<any>(null);

  const anos = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());

  const fetchDados = async () => {
    if (!corretoraId) return;
    setLoading(true);
    try {
      const { data: anoData, error } = await supabase
        .from("pid_operacional")
        .select("*")
        .eq("corretora_id", corretoraId)
        .eq("ano", parseInt(ano))
        .order("mes", { ascending: true });

      if (error) throw error;
      setDadosAno(anoData || []);

      if (anoData && anoData.length > 0) {
        // Dados do mês mais recente
        setDadosAtual(anoData[anoData.length - 1]);
        // Dados do mês anterior (se existir)
        if (anoData.length > 1) {
          setDadosAnterior(anoData[anoData.length - 2]);
        } else {
          setDadosAnterior(null);
        }
      } else {
        setDadosAtual(null);
        setDadosAnterior(null);
      }
    } catch (error: any) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (corretoraId) {
      fetchDados();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corretoraId, ano]);

  // Dados calculados automaticamente
  const chartData = useMemo(() => {
    return dadosAno.map((d) => {
      // Cálculos automáticos de percentuais
      const indiceVeiculosPorAssociado = d.total_associados > 0 ? (d.placas_ativas || 0) / d.total_associados : 0;

      const indiceNovosCadastros = d.placas_ativas > 0 ? calcPercent(d.cadastros_realizados, d.placas_ativas) : 0;

      const totalEntrada = (d.cadastros_realizados || 0) + (d.reativacao || 0);
      const totalPerdas = (d.cancelamentos || 0) + (d.inadimplentes || 0);
      const permanencia = totalEntrada - totalPerdas;
      const indicePermanencia = d.placas_ativas > 0 ? calcPercent(permanencia, d.placas_ativas) : 0;

      const inadimplenciaBoletos = calcPercent(d.boletos_abertos, d.boletos_emitidos);
      const cancelamentoBoletos = calcPercent(d.boletos_cancelados, d.boletos_emitidos);
      const inadimplenciaFinanceira = calcPercent(d.valor_boletos_abertos, d.faturamento_operacional);
      const arrecadacaoJuros = calcPercent(d.arrecadamento_juros, d.total_recebido);
      const descontadoBanco = calcPercent(d.descontado_banco, d.total_recebido);

      return {
        mes: mesesNome[d.mes - 1],
        // Movimentação de Base
        placas_ativas: d.placas_ativas || 0,
        total_cotas: d.total_cotas || 0,
        total_associados: d.total_associados || 0,
        indice_veiculos_por_associado: indiceVeiculosPorAssociado,
        cadastros_realizados: d.cadastros_realizados || 0,
        indice_novos_cadastros: indiceNovosCadastros,
        indice_crescimento_bruto: (d.indice_crescimento_bruto || 0) * 100,
        crescimento_liquido: d.crescimento_liquido || 0,
        cancelamentos: d.cancelamentos || 0,
        inadimplentes: d.inadimplentes || 0,
        reativacao: d.reativacao || 0,
        churn: (d.churn || 0) * 100,
        permanencia: permanencia,
        indice_permanencia: indicePermanencia,

        // Contas a Pagar - Boletos (quantidade)
        boletos_emitidos: d.boletos_emitidos || 0,
        boletos_liquidados: d.boletos_liquidados || 0,
        boletos_abertos: d.boletos_abertos || 0,
        boletos_cancelados: d.boletos_cancelados || 0,

        // Contas a Pagar - Valores ($)
        faturamento_operacional: d.faturamento_operacional || 0,
        total_recebido: d.total_recebido || 0,
        baixado_pendencia: d.baixado_pendencia || 0,
        valor_boletos_abertos: d.valor_boletos_abertos || 0,
        valor_boletos_cancelados: d.valor_boletos_cancelados || 0,
        recebimento_operacional: d.recebimento_operacional || 0,
        arrecadamento_juros: d.arrecadamento_juros || 0,
        descontado_banco: d.descontado_banco || 0,

        // Contas a Pagar - Índices (%)
        percentual_inadimplencia_boletos: inadimplenciaBoletos,
        percentual_cancelamento_boletos: cancelamentoBoletos,
        percentual_inadimplencia_financeira: inadimplenciaFinanceira,
        ticket_medio_boleto: d.ticket_medio_boleto || 0,
        percentual_arrecadacao_juros: arrecadacaoJuros,
        percentual_descontado_banco: descontadoBanco,
        percentual_crescimento_faturamento: (d.percentual_crescimento_faturamento || 0) * 100,
        percentual_crescimento_recebido: (d.percentual_crescimento_recebido || 0) * 100,

        // Eventos - Abertura
        abertura_parcial_associado: d.abertura_indenizacao_parcial_associado || 0,
        abertura_parcial_terceiro: d.abertura_indenizacao_parcial_terceiro || 0,
        abertura_integral_associado: d.abertura_indenizacao_integral_associado || 0,
        abertura_integral_terceiro: d.abertura_indenizacao_integral_terceiro || 0,
        abertura_vidros: d.abertura_vidros || 0,
        abertura_carro_reserva: d.abertura_carro_reserva || 0,
        abertura_total_eventos: d.abertura_total_eventos || 0,

        // Eventos - Pagamento (quantidade)
        pagamento_qtd_parcial_associado: d.pagamento_qtd_parcial_associado || 0,
        pagamento_qtd_parcial_terceiro: d.pagamento_qtd_parcial_terceiro || 0,
        pagamento_qtd_integral_associado: d.pagamento_qtd_integral_associado || 0,
        pagamento_qtd_integral_terceiro: d.pagamento_qtd_integral_terceiro || 0,
        pagamento_qtd_vidros: d.pagamento_qtd_vidros || 0,
        pagamento_qtd_carro_reserva: d.pagamento_qtd_carro_reserva || 0,

        // Eventos - Pagamento (valores)
        custo_total_eventos: d.custo_total_eventos || 0,
        pagamento_valor_parcial_associado: d.pagamento_valor_parcial_associado || 0,
        pagamento_valor_parcial_terceiro: d.pagamento_valor_parcial_terceiro || 0,
        pagamento_valor_integral_associado: d.pagamento_valor_integral_associado || 0,
        pagamento_valor_integral_terceiro: d.pagamento_valor_integral_terceiro || 0,
        pagamento_valor_vidros: d.pagamento_valor_vidros || 0,
        pagamento_valor_carro_reserva: d.pagamento_valor_carro_reserva || 0,

        // Eventos - Índices
        sinistralidade_financeira: (d.sinistralidade_financeira || 0) * 100,
        sinistralidade_geral: (d.sinistralidade_geral || 0) * 100,
        indice_dano_parcial: (d.indice_dano_parcial || 0) * 100,
        indice_dano_integral: (d.indice_dano_integral || 0) * 100,
        ticket_medio_parcial: d.ticket_medio_parcial || 0,
        ticket_medio_integral: d.ticket_medio_integral || 0,
        ticket_medio_vidros: d.ticket_medio_vidros || 0,
        ticket_medio_carro_reserva: d.ticket_medio_carro_reserva || 0,

        // Assistência
        acionamentos_assistencia: d.acionamentos_assistencia || 0,
        custo_assistencia: d.custo_assistencia || 0,
        comprometimento_assistencia: (d.comprometimento_assistencia || 0) * 100,

        // Rastreamento
        veiculos_rastreados: d.veiculos_rastreados || 0,
        instalacoes_rastreamento: d.instalacoes_rastreamento || 0,
        custo_rastreamento: d.custo_rastreamento || 0,
        comprometimento_rastreamento: (d.comprometimento_rastreamento || 0) * 100,

        // Rateio
        custo_total_rateavel: d.custo_total_rateavel || 0,
        rateio_periodo: d.rateio_periodo || 0,
        percentual_rateio: (d.percentual_rateio || 0) * 100,
        cme_explit: d.cme_explit || 0,
      };
    });
  }, [dadosAno]);

  // Série de Permanência mês a mês: Entrada, Perdas, Saldo e % variação do saldo
  const permanenciaSeries = useMemo(() => {
    if (!dadosAno || !dadosAno.length) return [];

    return dadosAno.map((d, index) => {
      const entrada = (d.cadastros_realizados || 0) + (d.reativacao || 0);
      const perdas = (d.cancelamentos || 0) + (d.inadimplentes || 0);
      const saldo = entrada - perdas;

      let variacao = 0;
      if (index > 0) {
        const prev = dadosAno[index - 1];
        const prevEntrada = (prev.cadastros_realizados || 0) + (prev.reativacao || 0);
        const prevPerdas = (prev.cancelamentos || 0) + (prev.inadimplentes || 0);
        const prevSaldo = prevEntrada - prevPerdas;

        if (prevSaldo !== 0) {
          variacao = calcPercent(saldo - prevSaldo, prevSaldo);
        } else {
          variacao = 0;
        }
      }

      return {
        mes: mesesNome[d.mes - 1],
        entrada,
        perdas,
        saldo,
        variacao_permanencia: variacao, // em %
      };
    });
  }, [dadosAno]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Dashboard PID
          </h2>
          <p className="text-sm text-muted-foreground">
            Visão consolidada dos indicadores operacionais, financeiros e de sinistros
          </p>
        </div>

        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anos.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!dadosAtual ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum dado encontrado para {ano}. Cadastre informações na aba Operacional.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs Principais */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <Card className="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Car className="h-5 w-5 text-blue-500" />
                  <Badge variant="outline" className="text-[10px]">
                    {mesesNome[dadosAtual.mes - 1]}
                  </Badge>
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{dadosAtual.placas_ativas?.toLocaleString("pt-BR")}</div>
                  <div className="text-xs text-muted-foreground">Placas Ativas</div>
                  <VariationIndicator
                    current={dadosAtual.placas_ativas || 0}
                    previous={dadosAnterior?.placas_ativas}
                    format="number"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/10 to-transparent border-green-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <DollarSign className="h-5 w-5 text-green-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{formatCurrency(dadosAtual.faturamento_operacional)}</div>
                  <div className="text-xs text-muted-foreground">Faturamento</div>
                  <VariationIndicator
                    current={dadosAtual.faturamento_operacional || 0}
                    previous={dadosAnterior?.faturamento_operacional}
                    format="currency"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{formatCurrency(dadosAtual.total_recebido)}</div>
                  <div className="text-xs text-muted-foreground">Total Recebido</div>
                  <VariationIndicator
                    current={dadosAtual.total_recebido || 0}
                    previous={dadosAnterior?.total_recebido}
                    format="currency"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{formatPercent(dadosAtual.sinistralidade_financeira || 0)}</div>
                  <div className="text-xs text-muted-foreground">Sinistralidade</div>
                  <VariationIndicator
                    current={(dadosAtual.sinistralidade_financeira || 0) * 100}
                    previous={dadosAnterior ? (dadosAnterior.sinistralidade_financeira || 0) * 100 : null}
                    format="percent"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-500/10 to-transparent border-red-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Percent className="h-5 w-5 text-red-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{formatPercent(dadosAtual.percentual_inadimplencia || 0)}</div>
                  <div className="text-xs text-muted-foreground">Inadimplência</div>
                  <VariationIndicator
                    current={(dadosAtual.percentual_inadimplencia || 0) * 100}
                    previous={dadosAnterior ? (dadosAnterior.percentual_inadimplencia || 0) * 100 : null}
                    format="percent"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500/10 to-transparent border-purple-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Activity className="h-5 w-5 text-purple-500" />
                </div>
                <div className="mt-2">
                  <div
                    className={`text-2xl font-bold ${
                      (dadosAtual.crescimento_liquido || 0) >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {dadosAtual.crescimento_liquido?.toLocaleString("pt-BR")}
                  </div>
                  <div className="text-xs text-muted-foreground">Crescimento Líquido</div>
                  <VariationIndicator
                    current={dadosAtual.crescimento_liquido || 0}
                    previous={dadosAnterior?.crescimento_liquido}
                    format="number"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ===================== MOVIMENTAÇÃO DE BASE ===================== */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Car className="h-5 w-5" />
                Movimentação de Base
              </h3>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* 1. Total Placas Ativas - Total de Cotas */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Total Placas Ativas no Período</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="placas_ativas"
                          name="Placas Ativas"
                          stroke="#2563eb"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Total de Cotas no Período</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="total_cotas"
                          name="Total Cotas"
                          stroke="#16a34a"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              {/* 2. Total Associados - Índice Veículos por Associado */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Total de Associados no Período</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar dataKey="total_associados" name="Total Associados" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Índice de Veículos por Associado</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => v.toFixed(2)} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => Number(value).toFixed(2).replace(".", ",")}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="indice_veiculos_por_associado"
                          name="Veículos/Associado"
                          stroke="#0ea5e9"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              {/* 3. Cadastros Realizados - Índice Novos Cadastros */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Cadastros Realizados</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar dataKey="cadastros_realizados" name="Cadastros" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Índice de Novos Cadastros (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="indice_novos_cadastros"
                          name="% Novos Cadastros"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              {/* 4. Índice Crescimento Bruto - Crescimento Líquido */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Índice de Crescimento Bruto (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="indice_crescimento_bruto"
                          name="Crescimento Bruto"
                          stroke="#8b5cf6"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Crescimento Líquido</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar
                          dataKey="crescimento_liquido"
                          name="Crescimento Líquido"
                          fill="#16a34a"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              {/* 5. Volume Cancelamentos - Volume Inadimplentes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Volume de Cancelamentos</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar dataKey="cancelamentos" name="Cancelamentos" fill="#dc2626" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Volume de Veículos Inadimplentes</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar dataKey="inadimplentes" name="Inadimplentes" fill="#f97316" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              {/* 6. Volume Reativações - Churn */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Volume de Reativações</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar dataKey="reativacao" name="Reativações" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Churn (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="churn"
                          name="Churn"
                          stroke="#dc2626"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              {/* 7. Permanência - Índice Permanência */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Permanência (Crescimento de Cadastros)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar dataKey="permanencia" name="Permanência" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Índice de Permanência (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="indice_permanencia"
                          name="% Permanência"
                          stroke="#16a34a"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ===================== CONTAS A PAGAR ===================== */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Contas a Pagar
              </h3>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Gráfico Combinado - Boletos (Quantidade) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Boletos no Período (Quantidade)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="boletos_emitidos" name="Emitidos" fill="#2563eb" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="boletos_liquidados" name="Liquidados" fill="#16a34a" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="boletos_abertos" name="Em Aberto" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="boletos_cancelados" name="Cancelados" fill="#dc2626" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              {/* Gráfico Combinado - Valores Financeiros */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Valores Financeiros (R$)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent formatter={(value: number) => formatCurrency(Number(value))} />
                          }
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line
                          type="monotone"
                          dataKey="faturamento_operacional"
                          name="Faturamento"
                          stroke="#2563eb"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="total_recebido"
                          name="Total Recebido"
                          stroke="#16a34a"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="baixado_pendencia"
                          name="Baixado c/ Pendência"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="valor_boletos_abertos"
                          name="Boletos em Aberto"
                          stroke="#dc2626"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="recebimento_operacional"
                          name="Receb. Operacional"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="arrecadamento_juros"
                          name="Juros"
                          stroke="#0ea5e9"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="descontado_banco"
                          name="Descontado Banco"
                          stroke="#ec4899"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              {/* Índices lado a lado */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Inadimplência de Boletos (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="percentual_inadimplencia_boletos"
                          name="% Inadimplência"
                          stroke="#dc2626"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Cancelamento de Boletos (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="percentual_cancelamento_boletos"
                          name="% Cancelamento"
                          stroke="#f97316"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Inadimplência Financeira (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="percentual_inadimplencia_financeira"
                          name="% Inadimpl. Financeira"
                          stroke="#dc2626"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Ticket Médio Geral por Boleto (R$)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent formatter={(value: number) => formatCurrency(Number(value))} />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="ticket_medio_boleto"
                          name="Ticket Médio"
                          stroke="#16a34a"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Arrecadação Juros (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="percentual_arrecadacao_juros"
                          name="% Juros"
                          stroke="#0ea5e9"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Descontado Banco (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="percentual_descontado_banco"
                          name="% Descontado"
                          stroke="#ec4899"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Crescimento de Faturamento (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="percentual_crescimento_faturamento"
                          name="% Cresc. Faturamento"
                          stroke="#2563eb"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Crescimento de Valor Recebido (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="percentual_crescimento_recebido"
                          name="% Cresc. Recebido"
                          stroke="#16a34a"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ===================== EVENTOS ===================== */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Eventos
              </h3>
            </div>

            <div className="grid gap-6">
              {/* Gráfico Combinado - Abertura de Eventos */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Abertura de Eventos no Período</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip content={<EventosStackedTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="abertura_parcial_associado" name="Parcial Associado" fill="#2563eb" stackId="a" />
                        <Bar dataKey="abertura_parcial_terceiro" name="Parcial Terceiro" fill="#0ea5e9" stackId="a" />
                        <Bar
                          dataKey="abertura_integral_associado"
                          name="Integral Associado"
                          fill="#8b5cf6"
                          stackId="a"
                        />
                        <Bar dataKey="abertura_integral_terceiro" name="Integral Terceiro" fill="#a855f7" stackId="a" />
                        <Bar dataKey="abertura_vidros" name="Vidros" fill="#f59e0b" stackId="a" />
                        <Bar dataKey="abertura_carro_reserva" name="Carro Reserva" fill="#14b8a6" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Quantidade Eventos Pagos */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Quantidade Eventos Pagos no Período</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip content={<EventosStackedTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                          <Bar
                            dataKey="pagamento_qtd_parcial_associado"
                            name="Parcial Assoc."
                            fill="#2563eb"
                            stackId="b"
                          />
                          <Bar
                            dataKey="pagamento_qtd_parcial_terceiro"
                            name="Parcial Terc."
                            fill="#0ea5e9"
                            stackId="b"
                          />
                          <Bar
                            dataKey="pagamento_qtd_integral_associado"
                            name="Integral Assoc."
                            fill="#8b5cf6"
                            stackId="b"
                          />
                          <Bar
                            dataKey="pagamento_qtd_integral_terceiro"
                            name="Integral Terc."
                            fill="#a855f7"
                            stackId="b"
                          />
                          <Bar dataKey="pagamento_qtd_vidros" name="Vidros" fill="#f59e0b" stackId="b" />
                          <Bar dataKey="pagamento_qtd_carro_reserva" name="Carro Reserva" fill="#14b8a6" stackId="b" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart />
                    )}
                  </CardContent>
                </Card>

                {/* Valor Eventos Pagos */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Valor de Eventos Pagos no Período (R$)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                          <Tooltip content={<ValorEventosTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                          <Line
                            type="monotone"
                            dataKey="pagamento_valor_parcial_associado"
                            name="Parcial Assoc."
                            stroke="#2563eb"
                            strokeWidth={1.5}
                          />
                          <Line
                            type="monotone"
                            dataKey="pagamento_valor_parcial_terceiro"
                            name="Parcial Terc."
                            stroke="#0ea5e9"
                            strokeWidth={1.5}
                          />
                          <Line
                            type="monotone"
                            dataKey="pagamento_valor_integral_associado"
                            name="Integral Assoc."
                            stroke="#8b5cf6"
                            strokeWidth={1.5}
                          />
                          <Line
                            type="monotone"
                            dataKey="pagamento_valor_integral_terceiro"
                            name="Integral Terc."
                            stroke="#a855f7"
                            strokeWidth={1.5}
                          />
                          <Line
                            type="monotone"
                            dataKey="pagamento_valor_vidros"
                            name="Vidros"
                            stroke="#f59e0b"
                            strokeWidth={1.5}
                          />
                          <Line
                            type="monotone"
                            dataKey="pagamento_valor_carro_reserva"
                            name="Carro Reserva"
                            stroke="#14b8a6"
                            strokeWidth={1.5}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart />
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Índices de Eventos lado a lado */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Sinistralidade Financeira (%)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[260px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                          <Tooltip
                            content={
                              <DefaultTooltipContent
                                formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                              />
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="sinistralidade_financeira"
                            name="% Sinistral. Financeira"
                            stroke="#dc2626"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Sinistralidade Geral (%)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[260px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                          <Tooltip
                            content={
                              <DefaultTooltipContent
                                formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                              />
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="sinistralidade_geral"
                            name="% Sinistral. Geral"
                            stroke="#8b5cf6"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Índice de Dano Parcial (%)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[260px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                          <Tooltip
                            content={
                              <DefaultTooltipContent
                                formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                              />
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="indice_dano_parcial"
                            name="% Dano Parcial"
                            stroke="#f59e0b"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Índice de Dano Integral (%)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[260px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                          <Tooltip
                            content={
                              <DefaultTooltipContent
                                formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                              />
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="indice_dano_integral"
                            name="% Dano Integral"
                            stroke="#dc2626"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Ticket Médio - Indenização Parcial (R$)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[260px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                          <Tooltip
                            content={
                              <DefaultTooltipContent formatter={(value: number) => formatCurrency(Number(value))} />
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="ticket_medio_parcial"
                            name="TM Parcial"
                            stroke="#2563eb"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Ticket Médio - Indenização Integral (R$)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[260px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                          <Tooltip
                            content={
                              <DefaultTooltipContent formatter={(value: number) => formatCurrency(Number(value))} />
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="ticket_medio_integral"
                            name="TM Integral"
                            stroke="#8b5cf6"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Ticket Médio - Vidros (R$)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[260px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                          <Tooltip
                            content={
                              <DefaultTooltipContent formatter={(value: number) => formatCurrency(Number(value))} />
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="ticket_medio_vidros"
                            name="TM Vidros"
                            stroke="#f59e0b"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">Ticket Médio - Carro Reserva (R$)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[260px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                          <Tooltip
                            content={
                              <DefaultTooltipContent formatter={(value: number) => formatCurrency(Number(value))} />
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="ticket_medio_carro_reserva"
                            name="TM Carro Reserva"
                            stroke="#14b8a6"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* ===================== ASSISTÊNCIA ===================== */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Assistência 24 Horas
              </h3>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Total de Acionamentos</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar
                          dataKey="acionamentos_assistencia"
                          name="Acionamentos"
                          fill="#0ea5e9"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Custo Total Assistência (R$)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorAssist" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent formatter={(value: number) => formatCurrency(Number(value))} />
                          }
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="custo_assistencia"
                          name="Custo Assistência"
                          stroke="#0ea5e9"
                          fill="url(#colorAssist)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Comprometimento de Custo (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="comprometimento_assistencia"
                          name="% Comprometimento"
                          stroke="#f97316"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ===================== RASTREAMENTO ===================== */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Rastreamento
              </h3>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Total Veículos Rastreados</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="veiculos_rastreados"
                          name="Veículos Rastreados"
                          stroke="#16a34a"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Total Instalações Feitas</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar
                          dataKey="instalacoes_rastreamento"
                          name="Instalações"
                          fill="#8b5cf6"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Custo Total Rastreamento (R$)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorRastr" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent formatter={(value: number) => formatCurrency(Number(value))} />
                          }
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="custo_rastreamento"
                          name="Custo Rastreamento"
                          stroke="#8b5cf6"
                          fill="url(#colorRastr)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Comprometimento de Custo (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="comprometimento_rastreamento"
                          name="% Comprometimento"
                          stroke="#f97316"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ===================== RATEIO ===================== */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <PieIcon className="h-5 w-5" />
                Rateio
              </h3>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Custo Total Rateável no Período (R$)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorRateavel" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent formatter={(value: number) => formatCurrency(Number(value))} />
                          }
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="custo_total_rateavel"
                          name="Custo Rateável"
                          stroke="#6366f1"
                          fill="url(#colorRateavel)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Total de Cotas no Período</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="total_cotas"
                          name="Total Cotas"
                          stroke="#16a34a"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Rateio no Período (R$)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent formatter={(value: number) => formatCurrency(Number(value))} />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="rateio_periodo"
                          name="Rateio"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Percentual de Rateio (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent
                              formatter={(value: number) => `${value.toFixed(2).replace(".", ",")}%`}
                            />
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="percentual_rateio"
                          name="% Rateio"
                          stroke="#8b5cf6"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">
                    CME - Contribuição Mensal de Estabilização (R$)
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorCME" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                        <Tooltip
                          content={
                            <DefaultTooltipContent formatter={(value: number) => formatCurrency(Number(value))} />
                          }
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="cme_explit"
                          name="CME"
                          stroke="#ec4899"
                          fill="url(#colorCME)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ===================== GRÁFICO EXTRA - PERMANÊNCIA MÊS A MÊS ===================== */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Análise de Permanência
              </h3>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Permanência - Entrada vs Perdas (Mês a Mês)</CardTitle>
              </CardHeader>
              <CardContent className="h-[350px]">
                {permanenciaSeries.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={permanenciaSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickFormatter={(v) => `${v.toFixed(2)}%`}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip content={<PermanenciaTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar
                        yAxisId="left"
                        dataKey="entrada"
                        name="Entrada (Cadastros + Reativ.)"
                        fill="#16a34a"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="perdas"
                        name="Perdas (Cancelamentos + Inadimpl.)"
                        fill="#dc2626"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="variacao_permanencia"
                        name="% Var. Saldo"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
