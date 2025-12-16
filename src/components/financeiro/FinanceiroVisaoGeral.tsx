import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  BarChart3,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Calendar
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
  ResponsiveContainer 
} from "recharts";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  corretoraId: string;
}

export default function FinanceiroVisaoGeral({ corretoraId }: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalReceitas: 0,
    totalDespesas: 0,
    receitasMes: 0,
    despesasMes: 0,
    pendentes: 0,
    aprovados: 0,
    rejeitados: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [recentLancamentos, setRecentLancamentos] = useState<any[]>([]);

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

      if (lancamentos) {
        // Calculate stats
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const receitas = lancamentos
          .filter(l => l.tipo_lancamento === "receita")
          .reduce((sum, l) => sum + (l.valor_liquido || 0), 0);

        const despesas = lancamentos
          .filter(l => l.tipo_lancamento === "despesa")
          .reduce((sum, l) => sum + (l.valor_liquido || 0), 0);

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

        setStats({
          totalReceitas: receitas,
          totalDespesas: despesas,
          receitasMes,
          despesasMes,
          pendentes: lancamentos.filter(l => l.status === "pendente").length,
          aprovados: lancamentos.filter(l => l.status === "aprovado").length,
          rejeitados: lancamentos.filter(l => l.status === "rejeitado").length,
        });

        // Chart data - last 6 months
        const monthlyData: Record<string, { receitas: number; despesas: number }> = {};
        for (let i = 5; i >= 0; i--) {
          const date = subMonths(now, i);
          const key = format(date, "MMM/yy", { locale: ptBR });
          monthlyData[key] = { receitas: 0, despesas: 0 };
        }

        lancamentos.forEach(l => {
          const date = new Date(l.data_lancamento);
          const key = format(date, "MMM/yy", { locale: ptBR });
          if (monthlyData[key]) {
            if (l.tipo_lancamento === "receita") {
              monthlyData[key].receitas += l.valor_liquido || 0;
            } else {
              monthlyData[key].despesas += l.valor_liquido || 0;
            }
          }
        });

        setChartData(
          Object.entries(monthlyData).map(([name, values]) => ({
            name,
            ...values,
          }))
        );

        // Category data
        const categories: Record<string, number> = {};
        lancamentos.forEach(l => {
          const cat = l.categoria || "Outros";
          categories[cat] = (categories[cat] || 0) + Math.abs(l.valor_liquido || 0);
        });

        setCategoryData(
          Object.entries(categories)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
        );

        // Status data
        const statusCounts = {
          Pendente: { value: stats.pendentes, color: "#eab308" },
          Aprovado: { value: stats.aprovados, color: "#16a34a" },
          Rejeitado: { value: stats.rejeitados, color: "#dc2626" },
        };

        setStatusData(
          Object.entries(statusCounts)
            .filter(([_, data]) => data.value > 0)
            .map(([name, data]) => ({ name, ...data }))
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

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <BarChart3 className="h-8 w-8 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Receitas</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.totalReceitas)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Mês atual: {formatCurrency(stats.receitasMes)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Despesas</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.totalDespesas)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Mês atual: {formatCurrency(stats.despesasMes)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saldo</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.totalReceitas - stats.totalDespesas >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(stats.totalReceitas - stats.totalDespesas)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Mês atual: {formatCurrency(stats.receitasMes - stats.despesasMes)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendentes}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Aguardando aprovação
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Area Chart - Monthly Evolution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5 text-primary" />
              Evolução Mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="receitas" 
                  stroke="#16a34a" 
                  fillOpacity={1}
                  fill="url(#colorReceitas)"
                  name="Receitas"
                />
                <Area 
                  type="monotone" 
                  dataKey="despesas" 
                  stroke="#dc2626" 
                  fillOpacity={1}
                  fill="url(#colorDespesas)"
                  name="Despesas"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bar Chart - Top Categories */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5 text-primary" />
              Top Categorias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {categoryData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
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
                    variant={l.status === 'aprovado' ? 'default' : l.status === 'pendente' ? 'secondary' : 'destructive'}
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
    </div>
  );
}
