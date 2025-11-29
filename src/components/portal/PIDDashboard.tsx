import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import {
  DollarSign, TrendingUp, TrendingDown, Users, Car, AlertTriangle,
  CheckCircle2, XCircle, Activity, Percent, BarChart3
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

const COLORS = ["#2563eb", "#16a34a", "#eab308", "#dc2626", "#8b5cf6", "#ec4899"];

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
      // Buscar todos os meses do ano
      const { data: anoData, error } = await supabase
        .from("pid_operacional")
        .select("*")
        .eq("corretora_id", corretoraId)
        .eq("ano", parseInt(ano))
        .order("mes", { ascending: true });

      if (error) throw error;
      setDadosAno(anoData || []);

      // Último mês com dados
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
  }, [corretoraId, ano]);

  const chartData = dadosAno.map(d => ({
    mes: mesesNome[d.mes - 1],
    faturamento: d.faturamento_operacional || 0,
    recebido: d.total_recebido || 0,
    sinistralidade: (d.sinistralidade_financeira || 0) * 100,
    placas: d.placas_ativas || 0,
    cadastros: d.cadastros_realizados || 0,
    cancelamentos: d.cancelamentos || 0,
  }));

  const eventosData = dadosAtual ? [
    { name: "Parcial Assoc.", value: dadosAtual.pagamento_valor_parcial_associado || 0 },
    { name: "Parcial Terc.", value: dadosAtual.pagamento_valor_parcial_terceiro || 0 },
    { name: "Integral", value: (dadosAtual.pagamento_valor_integral_associado || 0) + (dadosAtual.pagamento_valor_integral_terceiro || 0) },
    { name: "Vidros", value: dadosAtual.pagamento_valor_vidros || 0 },
    { name: "Carro Reserva", value: dadosAtual.pagamento_valor_carro_reserva || 0 },
  ].filter(d => d.value > 0) : [];

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
          <p className="text-sm text-muted-foreground">Visão consolidada dos indicadores</p>
        </div>

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
                  <div className="text-xs text-muted-foreground">Recebido</div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">
                    {formatPercent(dadosAtual.sinistralidade_financeira || 0)}
                  </div>
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
                  <div className="text-2xl font-bold">
                    {formatPercent(dadosAtual.percentual_inadimplencia || 0)}
                  </div>
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
                  <div className={`text-2xl font-bold ${(dadosAtual.crescimento_liquido || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(dadosAtual.crescimento_liquido || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Crescimento</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gráficos */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Faturamento x Recebido */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Faturamento x Recebido</CardTitle>
              </CardHeader>
              <CardContent className="h-[280px]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                      <Area type="monotone" dataKey="faturamento" name="Faturamento" stroke="#2563eb" fill="url(#colorFat)" strokeWidth={2} />
                      <Area type="monotone" dataKey="recebido" name="Recebido" stroke="#16a34a" fill="url(#colorRec)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
                )}
              </CardContent>
            </Card>

            {/* Sinistralidade */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Sinistralidade (%)</CardTitle>
              </CardHeader>
              <CardContent className="h-[280px]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${v.toFixed(2)}%`} tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                      <Tooltip formatter={(value: any) => `${Number(value).toFixed(2)}%`} />
                      <Line 
                        type="monotone" 
                        dataKey="sinistralidade" 
                        name="Sinistralidade" 
                        stroke="#dc2626" 
                        strokeWidth={2.5}
                        dot={{ fill: "#dc2626", strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
                )}
              </CardContent>
            </Card>

            {/* Movimentação de Base */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Movimentação de Base</CardTitle>
              </CardHeader>
              <CardContent className="h-[280px]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="cadastros" name="Cadastros" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cancelamentos" name="Cancelamentos" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
                )}
              </CardContent>
            </Card>

            {/* Distribuição de Eventos */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Custos por Tipo de Evento</CardTitle>
              </CardHeader>
              <CardContent className="h-[280px]">
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
                  <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados de eventos</div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
