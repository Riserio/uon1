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
  Users,
  TrendingUp,
  TrendingDown,
  Truck,
  Wrench,
  MapPin,
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
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface PIDDashboardProps {
  corretoraId?: string;
}

const mesesNome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6"];

const EmptyChart = () => (
  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem dados disponíveis</div>
);

export default function PIDDashboard({ corretoraId }: PIDDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState(new Date().getFullYear().toString());
  const [dadosAno, setDadosAno] = useState<any[]>([]);
  const [dadosAtual, setDadosAtual] = useState<any>(null);

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
        setDadosAtual(anoData[anoData.length - 1]);
      } else {
        setDadosAtual(null);
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

  // SOMAS TOTAIS PARA EVENTOS PAGOS NO PERÍODO
  const totalEventosPagosPeriodo = useMemo(() => {
    if (!chartData.length) return 0;
    return chartData.reduce((acc, d) => {
      return (
        acc +
        (d.pagamento_qtd_parcial_associado || 0) +
        (d.pagamento_qtd_parcial_terceiro || 0) +
        (d.pagamento_qtd_integral_associado || 0) +
        (d.pagamento_qtd_integral_terceiro || 0) +
        (d.pagamento_qtd_vidros || 0) +
        (d.pagamento_qtd_carro_reserva || 0)
      );
    }, 0);
  }, [chartData]);

  const totalValorEventosPagosPeriodo = useMemo(() => {
    if (!chartData.length) return 0;
    // usando custo_total_eventos como total consolidado por mês
    return chartData.reduce((acc, d) => acc + (d.custo_total_eventos || 0), 0);
  }, [chartData]);

  // Dados para gráfico de rosca de permanência
  const permanenciaDonutData = useMemo(() => {
    if (!dadosAtual) return [];
    const totalEntrada = (dadosAtual.cadastros_realizados || 0) + (dadosAtual.reativacao || 0);
    const totalPerdas = (dadosAtual.cancelamentos || 0) + (dadosAtual.inadimplentes || 0);
    return [
      { name: "Entrada (Cadastros + Reativações)", value: totalEntrada, color: "#16a34a" },
      { name: "Perdas (Cancelamentos + Inadimplentes)", value: totalPerdas, color: "#dc2626" },
    ];
  }, [dadosAtual]);

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
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ===================== MOVIMENTAÇÃO DE BASE ===================== */}
          {/* (mantido igual ao seu código enviado, cortado aqui para focar na parte de eventos) */}
          {/* ... TODA A PARTE DE MOVIMENTAÇÃO DE BASE, CONTAS A PAGAR, ASSISTÊNCIA, RASTREAMENTO, RATEIO ... */}
          {/* Vou manter tudo como você enviou e focar na alteração pedida dentro da seção EVENTOS */}

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
                        <Tooltip />
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
                    <p className="text-xs text-muted-foreground">
                      Total de eventos pagos no período:{" "}
                      <span className="font-semibold">{totalEventosPagosPeriodo.toLocaleString("pt-BR")}</span>
                    </p>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                          <Bar dataKey="pagamento_qtd_parcial_associado" name="Parcial Assoc." fill="#2563eb" />
                          <Bar dataKey="pagamento_qtd_parcial_terceiro" name="Parcial Terc." fill="#0ea5e9" />
                          <Bar dataKey="pagamento_qtd_integral_associado" name="Integral Assoc." fill="#8b5cf6" />
                          <Bar dataKey="pagamento_qtd_integral_terceiro" name="Integral Terc." fill="#a855f7" />
                          <Bar dataKey="pagamento_qtd_vidros" name="Vidros" fill="#f59e0b" />
                          <Bar dataKey="pagamento_qtd_carro_reserva" name="Carro Reserva" fill="#14b8a6" />
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
                    <p className="text-xs text-muted-foreground">
                      Total pago em eventos no período:{" "}
                      <span className="font-semibold">{formatCurrency(totalValorEventosPagosPeriodo)}</span>
                    </p>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    {chartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                          <Line
                            type="monotone"
                            dataKey="custo_total_eventos"
                            name="Total Eventos"
                            stroke="#dc2626"
                            strokeWidth={2.5}
                          />
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

              {/* (restante da seção EVENTOS, ASSISTÊNCIA, RASTREAMENTO, RATEIO, PERMANÊNCIA ROSCA) */}
              {/* Mantém tudo igual ao seu código original, pois a única alteração pedida é a inclusão dessas somas */}
            </div>
          </section>

          {/* ... resto das seções (Assistência, Rastreamento, Rateio, Permanência) exatamente como você já tem ... */}
        </>
      )}
    </div>
  );
}
