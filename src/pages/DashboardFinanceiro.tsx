import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, DollarSign, FileText, Clock, CheckCircle, XCircle, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

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

export default function DashboardFinanceiro() {
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
      let query = supabase
        .from("lancamentos_financeiros")
        .select("tipo_lancamento, valor_liquido, status, data_lancamento");

      if (selectedCorretora !== "todos") {
        query = query.eq("corretora_id", selectedCorretora);
      }

      const { data, error } = await query;

      if (error) throw error;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const receitas = data
        ?.filter((l) => l.tipo_lancamento === "receita")
        .reduce((sum, l) => sum + (l.valor_liquido || 0), 0) || 0;

      const despesas = data
        ?.filter((l) => l.tipo_lancamento === "despesa")
        .reduce((sum, l) => sum + (l.valor_liquido || 0), 0) || 0;

      const receitasMes = data
        ?.filter((l) => {
          const dataLancamento = new Date(l.data_lancamento);
          return (
            l.tipo_lancamento === "receita" &&
            dataLancamento.getMonth() === currentMonth &&
            dataLancamento.getFullYear() === currentYear
          );
        })
        .reduce((sum, l) => sum + (l.valor_liquido || 0), 0) || 0;

      const despesasMes = data
        ?.filter((l) => {
          const dataLancamento = new Date(l.data_lancamento);
          return (
            l.tipo_lancamento === "despesa" &&
            dataLancamento.getMonth() === currentMonth &&
            dataLancamento.getFullYear() === currentYear
          );
        })
        .reduce((sum, l) => sum + (l.valor_liquido || 0), 0) || 0;

      const pendentes = data?.filter((l) => l.status === "pendente").length || 0;
      const aprovados = data?.filter((l) => l.status === "aprovado").length || 0;
      const rejeitados = data?.filter((l) => l.status === "rejeitado").length || 0;

      setStats({
        totalReceitas: receitas,
        totalDespesas: despesas,
        saldo: receitas - despesas,
        totalLancamentos: data?.length || 0,
        pendentes,
        aprovados,
        rejeitados,
        receitasMes,
        despesasMes,
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
      </div>
    </div>
  );
}
