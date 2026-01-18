import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  LabelList,
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
  const [ano, setAno] = useState<string>("");
  const [mes, setMes] = useState<string>("");
  const [todoPeriodo, setTodoPeriodo] = useState(true);
  const [dadosAno, setDadosAno] = useState<any[]>([]);
  const [dadosAtual, setDadosAtual] = useState<any>(null);
  const [dadosAnterior, setDadosAnterior] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);
  const [ultimoMesComDados, setUltimoMesComDados] = useState<{ ano: string; mes: string } | null>(null);

  // Anos: atual + 4 anteriores + próximo ano (2026)
  const currentYear = new Date().getFullYear();
  const anos = Array.from({ length: 6 }, (_, i) => (currentYear + 1 - i).toString());
  
  const mesesOptions = [
    { value: "1", label: "Janeiro" },
    { value: "2", label: "Fevereiro" },
    { value: "3", label: "Março" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Maio" },
    { value: "6", label: "Junho" },
    { value: "7", label: "Julho" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  // Fetch most recent period with meaningful data
  const fetchMostRecentPeriod = async () => {
    if (!corretoraId) return;
    try {
      // Buscar registros ordenados por data, filtrando por registros com dados significativos
      const { data: results, error } = await supabase
        .from("pid_operacional")
        .select("ano, mes, placas_ativas, faturamento_operacional, total_recebido")
        .eq("corretora_id", corretoraId)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false })
        .limit(12);

      if (error) throw error;
      
      if (results && results.length > 0) {
        // Encontrar o primeiro registro com dados significativos
        const registroComDados = results.find(r => 
          (r.placas_ativas && r.placas_ativas > 0) || 
          (r.faturamento_operacional && r.faturamento_operacional > 0) ||
          (r.total_recebido && r.total_recebido > 0)
        );
        
        const result = registroComDados || results[0];
        const anoStr = result.ano.toString();
        const mesStr = result.mes.toString();
        setAno(anoStr);
        setMes(mesStr);
        setUltimoMesComDados({ ano: anoStr, mes: mesStr });
      } else {
        // No data, use current month
        const anoStr = new Date().getFullYear().toString();
        const mesStr = (new Date().getMonth() + 1).toString();
        setAno(anoStr);
        setMes(mesStr);
        setUltimoMesComDados(null);
      }
      setInitialized(true);
    } catch (error: any) {
      console.error("Error fetching most recent period:", error);
      const anoStr = new Date().getFullYear().toString();
      const mesStr = (new Date().getMonth() + 1).toString();
      setAno(anoStr);
      setMes(mesStr);
      setUltimoMesComDados(null);
      setInitialized(true);
    }
  };

  // Handler for toggling "Todo Período"
  const handleTodoPeriodoToggle = () => {
    if (todoPeriodo) {
      // Switching from "Todo Período" to specific month - use last month with data
      if (ultimoMesComDados) {
        setAno(ultimoMesComDados.ano);
        setMes(ultimoMesComDados.mes);
      }
    }
    setTodoPeriodo(!todoPeriodo);
  };

  const fetchDados = async () => {
    if (!corretoraId) return;
    setLoading(true);
    try {
      let query = supabase
        .from("pid_operacional")
        .select("*")
        .eq("corretora_id", corretoraId)
        .order("ano", { ascending: true })
        .order("mes", { ascending: true });

      // Se não for todo período, aplica filtros
      if (!todoPeriodo && ano && mes) {
        query = query.eq("ano", parseInt(ano)).eq("mes", parseInt(mes));
      }

      const { data: anoData, error } = await query;

      if (error) throw error;
      setDadosAno(anoData || []);

      if (anoData && anoData.length > 0) {
        // Pega o último registro COM DADOS como atual (prioriza registros com placas_ativas ou faturamento)
        // Isso evita mostrar meses "vazios" criados por engano
        const registrosComDados = anoData.filter(d => 
          (d.placas_ativas && d.placas_ativas > 0) || 
          (d.faturamento_operacional && d.faturamento_operacional > 0) ||
          (d.total_recebido && d.total_recebido > 0)
        );
        const dadoAtual = registrosComDados.length > 0 
          ? registrosComDados[registrosComDados.length - 1] 
          : anoData[anoData.length - 1];
        setDadosAtual(dadoAtual);
        
        // Buscar mês anterior para comparação
        const mesAtual = dadoAtual.mes;
        const anoAtual = dadoAtual.ano;
        const mesAnterior = mesAtual - 1;
        if (mesAnterior >= 1) {
          const { data: prevData } = await supabase
            .from("pid_operacional")
            .select("*")
            .eq("corretora_id", corretoraId)
            .eq("ano", anoAtual)
            .eq("mes", mesAnterior)
            .single();
          setDadosAnterior(prevData || null);
        } else {
          // Janeiro - buscar dezembro do ano anterior
          const { data: prevData } = await supabase
            .from("pid_operacional")
            .select("*")
            .eq("corretora_id", corretoraId)
            .eq("ano", anoAtual - 1)
            .eq("mes", 12)
            .single();
          setDadosAnterior(prevData || null);
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

  // Initialize with most recent period
  useEffect(() => {
    if (corretoraId && !initialized) {
      fetchMostRecentPeriod();
    }
  }, [corretoraId]);

  // Fetch data when period changes
  useEffect(() => {
    if (corretoraId && initialized) {
      fetchDados();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corretoraId, ano, mes, todoPeriodo, initialized]);

  // Dados calculados automaticamente
  const chartData = useMemo(() => {
    return dadosAno.map((d, index) => {
      const prev = index > 0 ? dadosAno[index - 1] : null;

      const currFaturamento = Number(d.faturamento_operacional ?? 0);
      const currRecebido = Number(d.total_recebido ?? 0);
      const prevFaturamento = Number(prev?.faturamento_operacional ?? 0);
      const prevRecebido = Number(prev?.total_recebido ?? 0);

      // Crescimento mês a mês (%): calculado dinamicamente pois o campo no banco está 0 em vários períodos
      const crescimentoFaturamento = prev && prevFaturamento > 0 ? ((currFaturamento - prevFaturamento) / prevFaturamento) * 100 : 0;
      const crescimentoRecebido = prev && prevRecebido > 0 ? ((currRecebido - prevRecebido) / prevRecebido) * 100 : 0;

      // Cálculos automáticos de percentuais
      const indiceVeiculosPorAssociado = d.total_associados > 0 ? (d.placas_ativas || 0) / d.total_associados : 0;

      const indiceNovosCadastros = d.placas_ativas > 0 ? calcPercent(d.cadastros_realizados, d.placas_ativas) : 0;

      const totalEntrada = (d.cadastros_realizados || 0) + (d.reativacao || 0);
      const totalPerdas = (d.cancelamentos || 0) + (d.inadimplentes || 0);
      const permanencia = totalEntrada - totalPerdas;
      const indicePermanencia = d.placas_ativas > 0 ? calcPercent(permanencia, d.placas_ativas) : 0;

      // Usar valores salvos no banco para consistência com Operacional
      // Fallback para cálculo apenas se não houver valor salvo ou valor for 0
      const inadimplenciaBoletos = d.percentual_inadimplencia_boletos || calcPercent(d.boletos_abertos, d.boletos_emitidos);
      const cancelamentoBoletos = d.percentual_cancelamento_boletos || calcPercent(d.boletos_cancelados, d.boletos_emitidos);
      const inadimplenciaFinanceira = d.percentual_inadimplencia_financeira || calcPercent(d.valor_boletos_abertos, d.faturamento_operacional);
      // Para Arrecadação Juros e Descontado Banco: SEMPRE calcular dinamicamente
      // Os valores salvos no banco estão em formato inconsistente, então usamos os valores brutos
      const arrecadacaoJuros = d.arrecadamento_juros && currRecebido ? (Number(d.arrecadamento_juros || 0) / currRecebido) * 100 : 0;
      const descontadoBanco = d.descontado_banco && currRecebido ? (Number(d.descontado_banco || 0) / currRecebido) * 100 : 0;

      // Sinistralidade - usar valores do banco se disponíveis, senão calcular
      const custoTotalEventos = d.custo_total_eventos ?? (
        (d.pagamento_valor_parcial_associado || 0) +
        (d.pagamento_valor_parcial_terceiro || 0) +
        (d.pagamento_valor_integral_associado || 0) +
        (d.pagamento_valor_integral_terceiro || 0) +
        (d.pagamento_valor_vidros || 0) +
        (d.pagamento_valor_carro_reserva || 0)
      );
      const sinistroFinanceiro = d.sinistralidade_financeira ?? calcPercent(custoTotalEventos, d.total_recebido);
      const sinistroGeral = d.sinistralidade_geral ?? calcPercent(d.abertura_total_eventos, d.placas_ativas);

      // Label: se todo período, mostra Mês/Ano, senão só mês
      const mesLabel = todoPeriodo 
        ? `${mesesNome[d.mes - 1]}/${String(d.ano).slice(-2)}`
        : mesesNome[d.mes - 1];

      return {
        mes: mesLabel,
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
        percentual_crescimento_faturamento: crescimentoFaturamento,
        percentual_crescimento_recebido: crescimentoRecebido,


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

        // Eventos - Índices (usar valores calculados com fallback)
        sinistralidade_financeira: sinistroFinanceiro * 100,
        sinistralidade_geral: sinistroGeral * 100,
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
  }, [dadosAno, todoPeriodo]);

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

      // Label: se todo período, mostra Mês/Ano, senão só mês
      const mesLabel = todoPeriodo 
        ? `${mesesNome[d.mes - 1]}/${String(d.ano).slice(-2)}`
        : mesesNome[d.mes - 1];

      return {
        mes: mesLabel,
        entrada,
        perdas,
        saldo,
        variacao_permanencia: variacao, // em %
      };
    });
  }, [dadosAno, todoPeriodo]);

  // Cálculo de médias para "Todo Período"
  const mediasConsolidadas = useMemo(() => {
    if (!todoPeriodo || !dadosAno || dadosAno.length === 0) return null;
    
    const count = dadosAno.length;
    const sum = (field: string) => dadosAno.reduce((acc, d) => acc + (d[field] || 0), 0);
    const avg = (field: string) => sum(field) / count;
    
    return {
      sinistralidade_geral: avg("sinistralidade_geral"),
      sinistralidade_financeira: avg("sinistralidade_financeira"),
      percentual_inadimplencia: avg("percentual_inadimplencia"),
      percentual_inadimplencia_boletos: avg("percentual_inadimplencia_boletos"),
      percentual_inadimplencia_financeira: avg("percentual_inadimplencia_financeira"),
    };
  }, [todoPeriodo, dadosAno]);

  // Label do mês atual para exibição nos cards
  const mesAtualLabel = useMemo(() => {
    if (todoPeriodo) {
      // Em "Todo Período", mostrar o mês do dado mais recente
      if (dadosAtual) {
        return mesesNome[dadosAtual.mes - 1];
      }
      return "";
    } else {
      // Quando um mês específico é selecionado, mostrar o mês selecionado
      const mesIndex = parseInt(mes) - 1;
      return mesesNome[mesIndex] || "";
    }
  }, [todoPeriodo, mes, dadosAtual]);

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
            Dashboard BI
          </h2>
          <p className="text-sm text-muted-foreground">
            Visão consolidada dos indicadores operacionais, financeiros e de sinistros
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={todoPeriodo ? "default" : "outline"}
            size="sm"
            onClick={handleTodoPeriodoToggle}
            className="whitespace-nowrap"
          >
            Todo Período
          </Button>
          
          <Select value={mes} onValueChange={(v) => { setMes(v); setTodoPeriodo(false); }} disabled={todoPeriodo}>
            <SelectTrigger className={`w-40 ${todoPeriodo ? 'opacity-50' : ''}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mesesOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={ano} onValueChange={(v) => { setAno(v); setTodoPeriodo(false); }} disabled={todoPeriodo}>
            <SelectTrigger className={`w-24 ${todoPeriodo ? 'opacity-50' : ''}`}>
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
      </div>

      {!dadosAtual ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {todoPeriodo 
              ? "Nenhum dado histórico encontrado. Cadastre informações na aba Operacional."
              : `Nenhum dado encontrado para ${mesesOptions.find(m => m.value === mes)?.label} de ${ano}. Cadastre informações na aba Operacional.`
            }
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs Principais - Linha 1 */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <Card className="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Car className="h-5 w-5 text-blue-500" />
                  {mesAtualLabel && (
                    <Badge variant="outline" className="text-[10px]">
                      {mesAtualLabel}
                    </Badge>
                  )}
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

            <Card className="bg-gradient-to-br from-cyan-500/10 to-transparent border-cyan-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <CreditCard className="h-5 w-5 text-cyan-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{formatCurrency(dadosAtual.ticket_medio_boleto || 0)}</div>
                  <div className="text-xs text-muted-foreground">Ticket Médio</div>
                  <VariationIndicator
                    current={dadosAtual.ticket_medio_boleto || 0}
                    previous={dadosAnterior?.ticket_medio_boleto}
                    format="currency"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* KPIs Sinistralidade e Inadimplência - Linha 2 */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card className="bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  {todoPeriodo && <Badge variant="secondary" className="text-[9px]">Média</Badge>}
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">
                    {formatPercent(todoPeriodo && mediasConsolidadas 
                      ? mediasConsolidadas.sinistralidade_geral 
                      : (dadosAtual.sinistralidade_geral || 0)
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">Sinistralidade Geral</div>
                  {!todoPeriodo && (
                    <VariationIndicator
                      current={(dadosAtual.sinistralidade_geral || 0) * 100}
                      previous={dadosAnterior ? (dadosAnterior.sinistralidade_geral || 0) * 100 : null}
                      format="percent"
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-500/10 to-transparent border-red-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Percent className="h-5 w-5 text-red-500" />
                  {todoPeriodo && <Badge variant="secondary" className="text-[9px]">Média</Badge>}
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">
                    {formatPercent(todoPeriodo && mediasConsolidadas 
                      ? mediasConsolidadas.percentual_inadimplencia_boletos 
                      : (dadosAtual.percentual_inadimplencia_boletos || 0)
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">Inadimplência Boletos</div>
                  {!todoPeriodo && (
                    <VariationIndicator
                      current={(dadosAtual.percentual_inadimplencia_boletos || 0) * 100}
                      previous={dadosAnterior ? (dadosAnterior.percentual_inadimplencia_boletos || 0) * 100 : null}
                      format="percent"
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-rose-500/10 to-transparent border-rose-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Percent className="h-5 w-5 text-rose-500" />
                  {todoPeriodo && <Badge variant="secondary" className="text-[9px]">Média</Badge>}
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">
                    {formatPercent(todoPeriodo && mediasConsolidadas 
                      ? mediasConsolidadas.percentual_inadimplencia_financeira 
                      : (dadosAtual.percentual_inadimplencia_financeira || 0)
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">Inadimplência Financeira</div>
                  {!todoPeriodo && (
                    <VariationIndicator
                      current={(dadosAtual.percentual_inadimplencia_financeira || 0) * 100}
                      previous={dadosAnterior ? (dadosAnterior.percentual_inadimplencia_financeira || 0) * 100 : null}
                      format="percent"
                    />
                  )}
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
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#2563eb" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            // Mostrar apenas a cada 2 pontos para evitar sobreposição
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text
                                x={x}
                                y={y - 10}
                                textAnchor="middle"
                                fontSize={10}
                                fontWeight={500}
                                fill="#2563eb"
                              >
                                {value?.toLocaleString("pt-BR")}
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar 
                          dataKey="total_associados" 
                          name="Total Associados" 
                          fill="#8b5cf6" 
                          radius={[4, 4, 0, 0]}
                          label={({ x, y, value, index, width }: { x: number; y: number; value: number; index: number; width: number }) => {
                            // Mostrar apenas a cada 2 pontos para evitar sobreposição
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text
                                x={x + width / 2}
                                y={y - 8}
                                textAnchor="middle"
                                fontSize={10}
                                fontWeight={500}
                                fill="#8b5cf6"
                              >
                                {value?.toLocaleString("pt-BR")}
                              </text>
                            );
                          }}
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
                  <CardTitle className="text-base font-medium">Índice de Veículos por Associado</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#0ea5e9" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#0ea5e9">
                                {Number(value).toFixed(2).replace(".", ",")}
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar 
                          dataKey="cadastros_realizados" 
                          name="Cadastros" 
                          fill="#16a34a" 
                          radius={[4, 4, 0, 0]}
                          label={({ x, y, value, index, width }: { x: number; y: number; value: number; index: number; width: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={10} fontWeight={500} fill="#16a34a">
                                {value?.toLocaleString("pt-BR")}
                              </text>
                            );
                          }}
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
                  <CardTitle className="text-base font-medium">Índice de Novos Cadastros (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#f59e0b" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#f59e0b">
                                {Number(value).toFixed(2).replace(".", ",")}%
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#8b5cf6" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#8b5cf6">
                                {Number(value).toFixed(2).replace(".", ",")}%
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
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
                          label={({ x, y, value, index, width }: { x: number; y: number; value: number; index: number; width: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={10} fontWeight={500} fill="#16a34a">
                                {value?.toLocaleString("pt-BR")}
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar 
                          dataKey="cancelamentos" 
                          name="Cancelamentos" 
                          fill="#dc2626" 
                          radius={[4, 4, 0, 0]}
                          label={({ x, y, value, index, width }: { x: number; y: number; value: number; index: number; width: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={10} fontWeight={500} fill="#dc2626">
                                {value?.toLocaleString("pt-BR")}
                              </text>
                            );
                          }}
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
                  <CardTitle className="text-base font-medium">Volume de Veículos Inadimplentes</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar 
                          dataKey="inadimplentes" 
                          name="Inadimplentes" 
                          fill="#f97316" 
                          radius={[4, 4, 0, 0]}
                          label={({ x, y, value, index, width }: { x: number; y: number; value: number; index: number; width: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={10} fontWeight={500} fill="#f97316">
                                {value?.toLocaleString("pt-BR")}
                              </text>
                            );
                          }}
                        />
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
                <CardContent className="h-[300px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar 
                          dataKey="reativacao" 
                          name="Reativações" 
                          fill="#14b8a6" 
                          radius={[4, 4, 0, 0]}
                          label={({ x, y, value, index, width }: { x: number; y: number; value: number; index: number; width: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={10} fontWeight={500} fill="#14b8a6">
                                {value?.toLocaleString("pt-BR")}
                              </text>
                            );
                          }}
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
                  <CardTitle className="text-base font-medium">Churn (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#dc2626" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#dc2626">
                                {Number(value).toFixed(2).replace(".", ",")}%
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<DefaultTooltipContent />} />
                        <Legend />
                        <Bar 
                          dataKey="permanencia" 
                          name="Permanência" 
                          fill="#8b5cf6" 
                          radius={[4, 4, 0, 0]}
                          label={({ x, y, value, index, width }: { x: number; y: number; value: number; index: number; width: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={10} fontWeight={500} fill="#8b5cf6">
                                {value?.toLocaleString("pt-BR")}
                              </text>
                            );
                          }}
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
                  <CardTitle className="text-base font-medium">Índice de Permanência (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#16a34a" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#16a34a">
                                {Number(value).toFixed(2).replace(".", ",")}%
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#dc2626" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#dc2626">
                                {Number(value).toFixed(2).replace(".", ",")}%
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#f97316" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#f97316">
                                {Number(value).toFixed(2).replace(".", ",")}%
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#dc2626" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#dc2626">
                                {Number(value).toFixed(2).replace(".", ",")}%
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#16a34a" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={9} fontWeight={500} fill="#16a34a">
                                {formatCurrency(Number(value))}
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#0ea5e9" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#0ea5e9">
                                {Number(value).toFixed(2).replace(".", ",")}%
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#ec4899" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#ec4899">
                                {Number(value).toFixed(2).replace(".", ",")}%
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#2563eb" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#2563eb">
                                {Number(value).toFixed(2).replace(".", ",")}%
                              </text>
                            );
                          }}
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
                <CardContent className="h-[300px]">
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
                          dot={{ r: 4, fill: "#16a34a" }}
                          label={({ x, y, value, index }: { x: number; y: number; value: number; index: number }) => {
                            if (index % 2 !== 0 && index !== chartData.length - 1) return null;
                            return (
                              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={500} fill="#16a34a">
                                {Number(value).toFixed(2).replace(".", ",")}%
                              </text>
                            );
                          }}
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
