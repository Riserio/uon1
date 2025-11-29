import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency, formatPercent } from "@/lib/formatters";
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
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface PIDDashboardProps {
  corretoraId?: string;
}

const COLORS = ["#2563eb", "#16a34a", "#eab308", "#dc2626", "#8b5cf6", "#ec4899", "#0ea5e9"];

const mesesNome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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

  const chartData = dadosAno.map((d) => ({
    mes: mesesNome[d.mes - 1],
    faturamento: d.faturamento_operacional || 0,
    recebido: d.total_recebido || 0,
    recebimento_operacional: d.recebimento_operacional || 0,
    sinistralidade_fin: (d.sinistralidade_financeira || 0) * 100,
    sinistralidade_geral: (d.sinistralidade_geral || 0) * 100,
    placas: d.placas_ativas || 0,
    cadastros: d.cadastros_realizados || 0,
    cancelamentos: d.cancelamentos || 0,
    boletos_emitidos: d.boletos_emitidos || 0,
    inadimplencia: (d.percentual_inadimplencia || 0) * 100,
    ticket_medio: d.ticket_medio_boletos || 0,
    crescimento_bruto: (d.crescimento_bruto || 0) * 100,
    crescimento_liquido: (d.crescimento_liquido || 0) * 100,
    crescimento_faturamento: (d.crescimento_faturamento || 0) * 100,
    crescimento_recebido: (d.crescimento_valor_recebido || 0) * 100,
    abertura_eventos: d.abertura_eventos || 0,
    custo_total_eventos: d.custo_total_eventos || 0,
    custo_total_rateavel: d.custo_total_rateavel || 0,
    rateio_periodo: d.rateio_periodo || 0,
  }));

  const eventosData = dadosAtual
    ? [
        { name: "Parcial Assoc.", value: dadosAtual.pagamento_valor_parcial_associado || 0 },
        { name: "Parcial Terc.", value: dadosAtual.pagamento_valor_parcial_terceiro || 0 },
        {
          name: "Integral",
          value:
            (dadosAtual.pagamento_valor_integral_associado || 0) + (dadosAtual.pagamento_valor_integral_terceiro || 0),
        },
        { name: "Vidros", value: dadosAtual.pagamento_valor_vidros || 0 },
        { name: "Carro Reserva", value: dadosAtual.pagamento_valor_carro_reserva || 0 },
      ].filter((d) => d.value > 0)
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            {/* Placas ativas */}
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
                  <div className="text-xs text-muted-foreground">Placas Ativas no Período</div>
                </div>
              </CardContent>
            </Card>

            {/* Faturamento operacional */}
            <Card className="bg-gradient-to-br from-green-500/10 to-transparent border-green-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <DollarSign className="h-5 w-5 text-green-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{formatCurrency(dadosAtual.faturamento_operacional)}</div>
                  <div className="text-xs text-muted-foreground">Faturamento Operacional</div>
                </div>
              </CardContent>
            </Card>

            {/* Total recebido */}
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

            {/* Sinistralidade financeira */}
            <Card className="bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{formatPercent(dadosAtual.sinistralidade_financeira || 0)}</div>
                  <div className="text-xs text-muted-foreground">Sinistralidade Financeira</div>
                </div>
              </CardContent>
            </Card>

            {/* Inadimplência */}
            <Card className="bg-gradient-to-br from-red-500/10 to-transparent border-red-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Percent className="h-5 w-5 text-red-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{formatPercent(dadosAtual.percentual_inadimplencia || 0)}</div>
                  <div className="text-xs text-muted-foreground">Inadimplência de Boletos</div>
                </div>
              </CardContent>
            </Card>

            {/* Crescimento líquido */}
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
                    {formatPercent(dadosAtual.crescimento_liquido || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Crescimento Líquido</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* KPIs Secundários */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {/* Boletos emitidos */}
            <Card className="border-primary/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold">{(dadosAtual.boletos_emitidos || 0).toLocaleString("pt-BR")}</div>
                  <div className="text-xs text-muted-foreground">Boletos Emitidos no Período</div>
                </div>
              </CardContent>
            </Card>

            {/* Ticket médio geral por boletos */}
            <Card className="border-primary/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold">{formatCurrency(dadosAtual.ticket_medio_boletos || 0)}</div>
                  <div className="text-xs text-muted-foreground">Ticket Médio (Boletos)</div>
                </div>
              </CardContent>
            </Card>

            {/* Custo total de eventos */}
            <Card className="border-primary/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold">{formatCurrency(dadosAtual.custo_total_eventos || 0)}</div>
                  <div className="text-xs text-muted-foreground">Custo Total de Eventos</div>
                </div>
              </CardContent>
            </Card>

            {/* Custo total rateável */}
            <Card className="border-primary/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <PieIcon className="h-5 w-5 text-violet-600" />
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold">{formatCurrency(dadosAtual.custo_total_rateavel || 0)}</div>
                  <div className="text-xs text-muted-foreground">Custo Total Rateável</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* GRÁFICOS – EM ORDEM EXATA DA SUA LISTA */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* 1. Total placas ativas no período */}
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
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="placas"
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

            {/* 2. Cadastros realizados no período */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Cadastros Realizados no Período</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="cadastros" name="Cadastros" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </CardContent>
            </Card>

            {/* 3. Índice de crescimento bruto */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Índice de Crescimento Bruto</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => `${Number(value).toFixed(2).replace(".", ",")}%`} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="crescimento_bruto"
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

            {/* 4. Crescimento líquido */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Crescimento Líquido</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => `${Number(value).toFixed(2).replace(".", ",")}%`} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="crescimento_liquido"
                        name="Crescimento Líquido"
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

            {/* 5. Número de boletos emitidos */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Número de Boletos Emitidos</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="boletos_emitidos" name="Boletos Emitidos" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </CardContent>
            </Card>

            {/* 6. Recebimento operacional */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Recebimento Operacional</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorRecOp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="recebimento_operacional"
                        name="Recebimento Operacional"
                        stroke="#eab308"
                        fill="url(#colorRecOp)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </CardContent>
            </Card>

            {/* 7. Total recebido */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Total Recebido</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorTotalRec" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="recebido"
                        name="Total Recebido"
                        stroke="#16a34a"
                        fill="url(#colorTotalRec)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </CardContent>
            </Card>

            {/* 8. Inadimplência de boletos */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Inadimplência de Boletos</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => `${Number(value).toFixed(2).replace(".", ",")}%`} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="inadimplencia"
                        name="Inadimplência"
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

            {/* 9. Ticket médio geral por boletos */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Ticket Médio Geral por Boletos</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="ticket_medio"
                        name="Ticket Médio (R$)"
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

            {/* 10. Crescimento de faturamento */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Crescimento de Faturamento</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => `${Number(value).toFixed(2).replace(".", ",")}%`} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="crescimento_faturamento"
                        name="Cresc. Faturamento"
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

            {/* 11. Crescimento de valor recebido */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Crescimento de Valor Recebido</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => `${Number(value).toFixed(2).replace(".", ",")}%`} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="crescimento_recebido"
                        name="Cresc. Valor Recebido"
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

            {/* 12. Abertura - total de eventos */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Abertura - Total de Eventos</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="abertura_eventos" name="Eventos Abertos" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </CardContent>
            </Card>

            {/* 13. Sinistralidade geral */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Sinistralidade Geral</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => `${Number(value).toFixed(2).replace(".", ",")}%`} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="sinistralidade_geral"
                        name="Sinistralidade Geral"
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

            {/* 14. Custo total de eventos */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Custo Total de Eventos</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                      <Bar
                        dataKey="custo_total_eventos"
                        name="Custo Total Eventos"
                        fill="#f97316"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </CardContent>
            </Card>

            {/* 15. Sinistralidade financeira */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Sinistralidade Financeira</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => `${Number(value).toFixed(2).replace(".", ",")}%`} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="sinistralidade_fin"
                        name="Sinistralidade Financeira"
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

            {/* 16. Custo total rateável no período */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Custo Total Rateável no Período</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                      <Bar
                        dataKey="custo_total_rateavel"
                        name="Custo Total Rateável"
                        fill="#6366f1"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </CardContent>
            </Card>

            {/* 17. Rateio no período (AGORA EM LINHA) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Rateio no Período</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="rateio_periodo"
                        name="Rateio"
                        stroke="#22c55e"
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

          {/* Extra: Custos por tipo de evento (mantido) */}
          <div className="grid gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Custos por Tipo de Evento</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {eventosData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={eventosData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={3}
                      >
                        {eventosData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="Sem dados de eventos" />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyChart({ text = "Sem dados" }: { text?: string }) {
  return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{text}</div>;
}
