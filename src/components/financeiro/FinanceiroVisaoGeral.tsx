import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3,
  PieChart as PieChartIcon,
  Target,
  Wallet,
  FileText,
  ArrowUpRight,
  ArrowDownLeft
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ComposedChart,
  Line
} from "recharts";
import { format, subMonths, eachMonthOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  corretoraId: string;
}

export default function FinanceiroVisaoGeral({ corretoraId }: Props) {
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [balanceData, setBalanceData] = useState<any[]>([]);
  const [recentLancamentos, setRecentLancamentos] = useState<any[]>([]);
  const [kpis, setKpis] = useState({
    receitaTotal: 0,
    despesaTotal: 0,
    saldoTotal: 0,
    receitasMes: 0,
    despesasMes: 0,
    ticketMedioReceita: 0,
    ticketMedioDespesa: 0,
    totalLancamentos: 0,
    taxaPendente: 0,
    maiorReceita: 0,
    maiorDespesa: 0,
  });

  useEffect(() => {
    if (corretoraId) {
      fetchData();
    }
  }, [corretoraId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: lancamentos } = await supabase
        .from("lancamentos_financeiros")
        .select("*")
        .eq("corretora_id", corretoraId)
        .order("data_lancamento", { ascending: false });

      if (lancamentos && lancamentos.length > 0) {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const receitas = lancamentos.filter(l => l.tipo_lancamento === "receita");
        const despesas = lancamentos.filter(l => l.tipo_lancamento === "despesa");
        
        const receitaTotal = receitas.reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
        const despesaTotal = despesas.reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
        const pendentes = lancamentos.filter(l => l.status === "pendente").length;

        const receitasMes = lancamentos
          .filter(l => {
            const date = new Date(l.data_lancamento);
            return l.tipo_lancamento === "receita" && 
              date.getMonth() === currentMonth && 
              date.getFullYear() === currentYear;
          })
          .reduce((sum, l) => sum + (l.valor_liquido || 0), 0);

        const despesasMes = lancamentos
          .filter(l => {
            const date = new Date(l.data_lancamento);
            return l.tipo_lancamento === "despesa" && 
              date.getMonth() === currentMonth && 
              date.getFullYear() === currentYear;
          })
          .reduce((sum, l) => sum + (l.valor_liquido || 0), 0);

        setKpis({
          receitaTotal,
          despesaTotal,
          saldoTotal: receitaTotal - despesaTotal,
          receitasMes,
          despesasMes,
          ticketMedioReceita: receitas.length > 0 ? receitaTotal / receitas.length : 0,
          ticketMedioDespesa: despesas.length > 0 ? despesaTotal / despesas.length : 0,
          totalLancamentos: lancamentos.length,
          taxaPendente: lancamentos.length > 0 ? (pendentes / lancamentos.length) * 100 : 0,
          maiorReceita: receitas.length > 0 ? Math.max(...receitas.map(l => l.valor_liquido || 0)) : 0,
          maiorDespesa: despesas.length > 0 ? Math.max(...despesas.map(l => l.valor_liquido || 0)) : 0,
        });

        // Monthly data - last 12 months
        const months = eachMonthOfInterval({
          start: subMonths(now, 11),
          end: now,
        });

        const monthlyMap: Record<string, { receitas: number; despesas: number; saldo: number }> = {};
        months.forEach(m => {
          const key = format(m, "MMM/yy", { locale: ptBR });
          monthlyMap[key] = { receitas: 0, despesas: 0, saldo: 0 };
        });

        lancamentos.forEach(l => {
          const date = new Date(l.data_lancamento);
          const key = format(date, "MMM/yy", { locale: ptBR });
          if (monthlyMap[key]) {
            if (l.tipo_lancamento === "receita") {
              monthlyMap[key].receitas += l.valor_liquido || 0;
            } else {
              monthlyMap[key].despesas += l.valor_liquido || 0;
            }
            monthlyMap[key].saldo = monthlyMap[key].receitas - monthlyMap[key].despesas;
          }
        });

        setMonthlyData(
          Object.entries(monthlyMap).map(([name, values]) => ({
            name,
            ...values,
          }))
        );

        // Category breakdown
        const categories: Record<string, { receitas: number; despesas: number }> = {};
        lancamentos.forEach(l => {
          const cat = l.categoria || "Outros";
          if (!categories[cat]) categories[cat] = { receitas: 0, despesas: 0 };
          if (l.tipo_lancamento === "receita") {
            categories[cat].receitas += l.valor_liquido || 0;
          } else {
            categories[cat].despesas += l.valor_liquido || 0;
          }
        });

        setCategoryData(
          Object.entries(categories)
            .map(([name, values]) => ({ 
              name: name.charAt(0).toUpperCase() + name.slice(1), 
              ...values,
              total: values.receitas + values.despesas
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 6)
        );

        // Status distribution
        const statusCounts = {
          pendente: lancamentos.filter(l => l.status === "pendente").length,
          aprovado: lancamentos.filter(l => l.status === "aprovado").length,
          pago: lancamentos.filter(l => l.status === "pago").length,
          rejeitado: lancamentos.filter(l => l.status === "rejeitado").length,
        };

        setStatusData([
          { name: "Pendente", value: statusCounts.pendente, fill: "#eab308" },
          { name: "Aprovado", value: statusCounts.aprovado, fill: "#3b82f6" },
          { name: "Pago", value: statusCounts.pago, fill: "#16a34a" },
          { name: "Rejeitado", value: statusCounts.rejeitado, fill: "#dc2626" },
        ].filter(s => s.value > 0));

        // Balance evolution
        let runningBalance = 0;
        setBalanceData(
          Object.entries(monthlyMap).map(([name, values]) => {
            runningBalance += values.saldo;
            return { name, saldo: runningBalance };
          })
        );

        // Recent transactions
        setRecentLancamentos(lancamentos.slice(0, 5));
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <BarChart3 className="h-8 w-8 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Receita Total</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {formatCurrency(kpis.receitaTotal)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Mês atual: {formatCurrency(kpis.receitasMes)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-green-500/20">
                <ArrowDownLeft className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Despesa Total</p>
                <p className="text-2xl font-bold text-red-600 mt-1">
                  {formatCurrency(kpis.despesaTotal)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Mês atual: {formatCurrency(kpis.despesasMes)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-red-500/20">
                <ArrowUpRight className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Saldo Total</p>
                <p className={`text-2xl font-bold mt-1 ${kpis.saldoTotal >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {formatCurrency(kpis.saldoTotal)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis.totalLancamentos} lançamentos
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/20">
                <Wallet className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Taxa Pendente</p>
                <p className="text-2xl font-bold text-yellow-600 mt-1">
                  {kpis.taxaPendente.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Aguardando aprovação
                </p>
              </div>
              <div className="p-3 rounded-xl bg-yellow-500/20">
                <Target className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Composed Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-primary" />
            Receitas vs Despesas (Últimos 12 meses)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={monthlyData}>
              <defs>
                <linearGradient id="gradientReceitas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16a34a" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0.1}/>
                </linearGradient>
                <linearGradient id="gradientDespesas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc2626" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#dc2626" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar dataKey="receitas" fill="url(#gradientReceitas)" name="Receitas" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesas" fill="url(#gradientDespesas)" name="Despesas" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="saldo" stroke="#3b82f6" strokeWidth={2} name="Saldo" dot={{ fill: '#3b82f6' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Secondary Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Balance Evolution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-primary" />
              Evolução do Saldo Acumulado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={balanceData}>
                <defs>
                  <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="saldo" 
                  stroke="hsl(var(--primary))" 
                  fillOpacity={1}
                  fill="url(#colorSaldo)"
                  name="Saldo Acumulado"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Distribuição por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-primary" />
            Receitas e Despesas por Categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} className="text-xs" />
              <YAxis dataKey="name" type="category" width={100} className="text-xs" />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar dataKey="receitas" fill="#16a34a" name="Receitas" radius={[0, 4, 4, 0]} />
              <Bar dataKey="despesas" fill="#dc2626" name="Despesas" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recent Transactions & Summary */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Transactions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-primary" />
              Últimos Lançamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentLancamentos.map((l) => (
                <div 
                  key={l.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${l.tipo_lancamento === 'receita' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      {l.tipo_lancamento === 'receita' ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{l.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(l.data_lancamento), "dd/MM/yyyy", { locale: ptBR })}
                        {l.categoria && ` • ${l.categoria}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${l.tipo_lancamento === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                      {l.tipo_lancamento === 'receita' ? '+' : '-'}{formatCurrency(l.valor_liquido)}
                    </p>
                    <Badge 
                      variant={l.status === 'aprovado' || l.status === 'pago' ? 'default' : l.status === 'pendente' ? 'secondary' : 'destructive'}
                      className="text-xs"
                    >
                      {l.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {recentLancamentos.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum lançamento encontrado
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Maior Receita Única
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(kpis.maiorReceita)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Maior Despesa Única
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(kpis.maiorDespesa)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ticket Médio Receita
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(kpis.ticketMedioReceita)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ticket Médio Despesa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-red-600">
                {formatCurrency(kpis.ticketMedioDespesa)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
