import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface DashboardStats {
  totalReceitas: number;
  totalDespesas: number;
  saldo: number;
  totalLancamentos: number;
  pendentes: number;
  aprovados: number;
  rejeitados: number;
}

export default function FinancialDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalReceitas: 0,
    totalDespesas: 0,
    saldo: 0,
    totalLancamentos: 0,
    pendentes: 0,
    aprovados: 0,
    rejeitados: 0,
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
        .select("tipo_lancamento, valor_liquido, status");

      if (selectedCorretora !== "todos") {
        query = query.eq("corretora_id", selectedCorretora);
      }

      const { data, error } = await query;

      if (error) throw error;

      const receitas = data
        ?.filter((l) => l.tipo_lancamento === "receita")
        .reduce((sum, l) => sum + (l.valor_liquido || 0), 0) || 0;

      const despesas = data
        ?.filter((l) => l.tipo_lancamento === "despesa")
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
      });
    } catch (error) {
      toast.error("Erro ao carregar estatísticas");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (loading) {
    return <div className="p-8 text-center">Carregando...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Dashboard Financeiro</h2>
        <div className="w-64">
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Receitas</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.totalReceitas)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Despesas</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.totalDespesas)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saldo</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                stats.saldo >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(stats.saldo)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Lançamentos</CardTitle>
            <FileText className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLancamentos}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pendentes}</div>
            <p className="text-xs text-muted-foreground mt-1">Aguardando aprovação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Aprovados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.aprovados}</div>
            <p className="text-xs text-muted-foreground mt-1">Lançamentos aprovados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Rejeitados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejeitados}</div>
            <p className="text-xs text-muted-foreground mt-1">Lançamentos rejeitados</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
