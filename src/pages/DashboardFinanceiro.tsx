import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, DollarSign, FileText, Clock, CheckCircle, XCircle, BarChart3, ArrowLeft } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import { useNavigate } from "react-router-dom";

interface DashboardStats {
  totalReceitas: number;
  totalDespesas: number;
  saldo: number;
  totalLancamentos: number;
  pendentes: number;
  aprovados: number;
  rejeitados: number;
  receitasMes: number;
  despesasMes: number;
}

interface ChartData {
  name: string;
  receitas: number;
  despesas: number;
}

interface CategoryData {
  name: string;
  value: number;
}

interface StatusData {
  name: string;
  value: number;
  color: string;
}

export default function DashboardFinanceiro() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalReceitas: 0,
    totalDespesas: 0,
    saldo: 0,
    totalLancamentos: 0,
    pendentes: 0,
    aprovados: 0,
    rejeitados: 0,
    receitasMes: 0,
    despesasMes: 0,
  });
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>("todos");
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);

  useEffect(() => {
    fetchCorretoras();
    fetchStats();
  }, [selectedCorretora]);

  const fetchCorretoras = async () => {
    const { data, error } = await supabase
      .from("corretoras")
      .select("id, nome")
      .order("nome");
    if (!error && data) setCorretoras(data);
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Buscar lançamentos financeiros
      let queryLancamentos = supabase
        .from("lancamentos_financeiros")
        .select("tipo_lancamento, valor_liquido, status, data_lancamento, categoria");

      if (selectedCorretora !== "todos") {
        queryLancamentos = queryLancamentos.eq("corretora_id", selectedCorretora);
      }

      const { data: lancamentosData, error: lancamentosError } = await queryLancamentos;
      
      if (lancamentosError) throw lancamentosError;

      // Buscar custos de sinistros
      let querySinistros = supabase
        .from("vistorias")
        .select(`
          custo_oficina,
          custo_reparo,
          custo_acordo,
          custo_terceiros,
          custo_perda_total,
          custo_perda_parcial,
          valor_franquia,
          valor_indenizacao,
          created_at,
          atendimentos!inner(corretora_id)
        `);

      if (selectedCorretora !== "todos") {
        querySinistros = querySinistros.eq("atendimentos.corretora_id", selectedCorretora);
      }

      const { data: sinistrosData, error: sinistrosError } = await querySinistros;
      
      if (sinistrosError) throw sinistrosError;

      // Preparar dados para gráfico de evolução mensal (últimos 6 meses)
      const monthlyData: { [key: string]: { receitas: number; despesas: number } } = {};
      const now = new Date();
      
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        monthlyData[monthKey] = { receitas: 0, despesas: 0 };
      }

      lancamentosData?.forEach((lancamento) => {
        const date = new Date(lancamento.data_lancamento);
        const monthKey = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        
        if (monthlyData[monthKey]) {
          if (lancamento.tipo_lancamento === 'receita') {
            monthlyData[monthKey].receitas += lancamento.valor_liquido || 0;
          } else {
            monthlyData[monthKey].despesas += lancamento.valor_liquido || 0;
          }
        }
      });

      const chartDataArray = Object.entries(monthlyData).map(([name, values]) => ({
        name,
        receitas: values.receitas,
        despesas: values.despesas,
      }));

      setChartData(chartDataArray);

      // Preparar dados por categoria
      const categoryMap: { [key: string]: number } = {};
      lancamentosData?.forEach((lancamento) => {
        const cat = lancamento.categoria || 'Sem categoria';
        categoryMap[cat] = (categoryMap[cat] || 0) + Math.abs(lancamento.valor_liquido || 0);
      });

      const categoryDataArray = Object.entries(categoryMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      setCategoryData(categoryDataArray);

      // Preparar dados por status
      const statusMap = {
        pendente: { count: 0, color: '#eab308' },
        aprovado: { count: 0, color: '#16a34a' },
        rejeitado: { count: 0, color: '#dc2626' },
      };

      lancamentosData?.forEach((lancamento) => {
        if (lancamento.status && statusMap[lancamento.status as keyof typeof statusMap]) {
          statusMap[lancamento.status as keyof typeof statusMap].count++;
        }
      });

      const statusDataArray = Object.entries(statusMap)
        .filter(([_, value]) => value.count > 0)
        .map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value: value.count,
          color: value.color,
        }));

      setStatusData(statusDataArray);

      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const receitas = lancamentosData
        ?.filter((l) => l.tipo_lancamento === "receita")
        .reduce((sum, l) => sum + (l.valor_liquido || 0), 0) || 0;

      const despesas = lancamentosData
        ?.filter((l) => l.tipo_lancamento === "despesa")
        .reduce((sum, l) => sum + (l.valor_liquido || 0), 0) || 0;

      // Adicionar custos de sinistros às despesas
      const custosSinistros = sinistrosData?.reduce((sum, s) => {
        return sum + 
          (s.custo_oficina || 0) +
          (s.custo_reparo || 0) +
          (s.custo_acordo || 0) +
          (s.custo_terceiros || 0) +
          (s.custo_perda_total || 0) +
          (s.custo_perda_parcial || 0) +
          (s.valor_franquia || 0) +
          (s.valor_indenizacao || 0);
      }, 0) || 0;

      const despesasTotais = despesas + custosSinistros;

      const receitasMes = lancamentosData
        ?.filter((l) => {
          const dataLancamento = new Date(l.data_lancamento);
          return (
            l.tipo_lancamento === "receita" &&
            dataLancamento.getMonth() === currentMonth &&
            dataLancamento.getFullYear() === currentYear
          );
        })
        .reduce((sum, l) => sum + (l.valor_liquido || 0), 0) || 0;

      const despesasMes = lancamentosData
        ?.filter((l) => {
          const dataLancamento = new Date(l.data_lancamento);
          return (
            l.tipo_lancamento === "despesa" &&
            dataLancamento.getMonth() === currentMonth &&
            dataLancamento.getFullYear() === currentYear
          );
        })
        .reduce((sum, l) => sum + (l.valor_liquido || 0), 0) || 0;

      const pendentes = lancamentosData?.filter((l) => l.status === "pendente").length || 0;
      const aprovados = lancamentosData?.filter((l) => l.status === "aprovado").length || 0;
      const rejeitados = lancamentosData?.filter((l) => l.status === "rejeitado").length || 0;

      setStats({
        totalReceitas: receitas,
        totalDespesas: despesasTotais,
        saldo: receitas - despesasTotais,
        totalLancamentos: lancamentosData?.length || 0,
        pendentes,
        aprovados,
        rejeitados,
        receitasMes,
        despesasMes: despesasMes + custosSinistros,
      });
    } catch (error) {
      toast.error("Erro ao carregar estatísticas");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 animate-pulse mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BarChart3 className="h-7 w-7 text-primary" />
              </div>
              Dashboard Financeiro
            </h1>
            <p className="text-muted-foreground mt-1">Visão geral dos lançamentos e performance</p>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-full md:w-64">
              <Label>Filtrar por Corretora</Label>
              <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as Corretoras</SelectItem>
                  {corretoras.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => navigate("/lancamentos-financeiros")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Receitas</CardTitle>
              <div className="p-2 rounded-lg bg-green-500/10">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.totalReceitas)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Mês atual: {formatCurrency(stats.receitasMes)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Despesas</CardTitle>
              <div className="p-2 rounded-lg bg-red-500/10">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(stats.totalDespesas)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Mês atual: {formatCurrency(stats.despesasMes)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Saldo</CardTitle>
              <div className={`p-2 rounded-lg ${stats.saldo >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                <DollarSign className={`h-5 w-5 ${stats.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  stats.saldo >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatCurrency(stats.saldo)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Mês atual: {formatCurrency(stats.receitasMes - stats.despesasMes)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Lançamentos</CardTitle>
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalLancamentos}</div>
              <p className="text-xs text-muted-foreground mt-2">Todos os períodos</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{stats.pendentes}</div>
              <p className="text-xs text-muted-foreground mt-2">Aguardando aprovação</p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Aprovados</CardTitle>
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.aprovados}</div>
              <p className="text-xs text-muted-foreground mt-2">Lançamentos confirmados</p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Rejeitados</CardTitle>
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{stats.rejeitados}</div>
              <p className="text-xs text-muted-foreground mt-2">Lançamentos recusados</p>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Gráfico de Evolução Temporal */}
          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
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
                  <YAxis className="text-xs" tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="receitas" 
                    stroke="#16a34a" 
                    fillOpacity={1} 
                    fill="url(#colorReceitas)" 
                    name="Receitas"
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="despesas" 
                    stroke="#dc2626" 
                    fillOpacity={1} 
                    fill="url(#colorDespesas)" 
                    name="Despesas"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gráfico de Categorias */}
          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Top 5 Categorias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" tickFormatter={(value) => formatCurrency(value)} />
                  <YAxis dataKey="name" type="category" className="text-xs" width={120} />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" name="Valor Total" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gráfico de Status */}
          <Card className="border-2 hover:border-primary/40 transition-colors lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Distribuição por Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    innerRadius={60}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
