import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  BarChart3,
  PieChart,
  CalendarDays,
  Building2,
  Plus,
  Eye,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  CreditCard,
  Banknote,
  Receipt,
  RefreshCw
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart as RechartsPie, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Area, 
  AreaChart 
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, isAfter, isBefore, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// Components for each tab
import FinanceiroVisaoGeral from "@/components/financeiro/FinanceiroVisaoGeral";
import FinanceiroContasReceber from "@/components/financeiro/FinanceiroContasReceber";
import FinanceiroContasPagar from "@/components/financeiro/FinanceiroContasPagar";
import FinanceiroFluxoCaixa from "@/components/financeiro/FinanceiroFluxoCaixa";
import FinanceiroLancamentos from "@/components/financeiro/FinanceiroLancamentos";
import FinanceiroConciliacao from "@/components/financeiro/FinanceiroConciliacao";

export default function Financeiro() {
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>("administradora");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    saldo: 0,
    aReceber: 0,
    aPagar: 0,
    vencidos: 0,
    vencemHoje: 0,
  });

  useEffect(() => {
    fetchCorretoras();
  }, []);

  useEffect(() => {
    if (selectedCorretora) {
      fetchSummary();
    }
  }, [selectedCorretora]);

  const fetchCorretoras = async () => {
    const { data, error } = await supabase
      .from("corretoras")
      .select("id, nome")
      .order("nome");
    
    if (!error && data) {
      setCorretoras(data);
    }
    setLoading(false);
  };

  const fetchSummary = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      let query = supabase
        .from("lancamentos_financeiros")
        .select("tipo_lancamento, valor_liquido, status, data_vencimento");
      
      if (selectedCorretora === "administradora") {
        query = query.is("corretora_id", null);
      } else {
        query = query.eq("corretora_id", selectedCorretora);
      }
      
      const { data: lancamentos } = await query;

      if (lancamentos) {
        const receitas = lancamentos
          .filter(l => l.tipo_lancamento === "receita" && l.status === "aprovado")
          .reduce((sum, l) => sum + (l.valor_liquido || 0), 0);

        const despesas = lancamentos
          .filter(l => l.tipo_lancamento === "despesa" && l.status === "aprovado")
          .reduce((sum, l) => sum + (l.valor_liquido || 0), 0);

        const aReceber = lancamentos
          .filter(l => l.tipo_lancamento === "receita" && l.status === "pendente")
          .reduce((sum, l) => sum + (l.valor_liquido || 0), 0);

        const aPagar = lancamentos
          .filter(l => l.tipo_lancamento === "despesa" && l.status === "pendente")
          .reduce((sum, l) => sum + (l.valor_liquido || 0), 0);

        const vencidos = lancamentos
          .filter(l => l.status === "pendente" && l.data_vencimento && l.data_vencimento < today)
          .reduce((sum, l) => sum + (l.valor_liquido || 0), 0);

        const vencemHoje = lancamentos
          .filter(l => l.status === "pendente" && l.data_vencimento === today)
          .reduce((sum, l) => sum + (l.valor_liquido || 0), 0);

        setSummary({
          saldo: receitas - despesas,
          aReceber,
          aPagar,
          vencidos,
          vencemHoje,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar resumo:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Wallet className="h-12 w-12 animate-pulse mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Carregando módulo financeiro...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                <Wallet className="h-7 w-7 text-primary" />
              </div>
              Financeiro
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestão financeira completa da sua empresa
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-64">
              <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
                <SelectTrigger className="bg-background">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Selecione uma associação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administradora" className="font-semibold">
                    ADMINISTRADORA
                  </SelectItem>
                  {corretoras.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => {
                fetchSummary();
                toast.success("Dados atualizados!");
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Quick Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Saldo Atual</p>
                  <p className={`text-lg font-bold ${summary.saldo >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatCurrency(summary.saldo)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">A Receber</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatCurrency(summary.aReceber)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-green-500/20">
                  <ArrowDownLeft className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">A Pagar</p>
                  <p className="text-lg font-bold text-red-600">
                    {formatCurrency(summary.aPagar)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-red-500/20">
                  <ArrowUpRight className="h-5 w-5 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Vencidos</p>
                  <p className="text-lg font-bold text-orange-600">
                    {formatCurrency(summary.vencidos)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-orange-500/20">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Vencem Hoje</p>
                  <p className="text-lg font-bold text-yellow-600">
                    {formatCurrency(summary.vencemHoje)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
            <TabsTrigger 
              value="visao-geral" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger 
              value="a-receber" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-2"
            >
              <ArrowDownLeft className="h-4 w-4" />
              A Receber
            </TabsTrigger>
            <TabsTrigger 
              value="a-pagar" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-2"
            >
              <ArrowUpRight className="h-4 w-4" />
              A Pagar
            </TabsTrigger>
            <TabsTrigger 
              value="fluxo-caixa" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-2"
            >
              <TrendingUp className="h-4 w-4" />
              Fluxo de Caixa
            </TabsTrigger>
            <TabsTrigger 
              value="lancamentos" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-2"
            >
              <Receipt className="h-4 w-4" />
              Lançamentos
            </TabsTrigger>
            <TabsTrigger 
              value="conciliacao" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Conciliação
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visao-geral" className="space-y-4">
            <FinanceiroVisaoGeral corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="a-receber" className="space-y-4">
            <FinanceiroContasReceber corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="a-pagar" className="space-y-4">
            <FinanceiroContasPagar corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="fluxo-caixa" className="space-y-4">
            <FinanceiroFluxoCaixa corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="lancamentos" className="space-y-4">
            <FinanceiroLancamentos corretoraId={selectedCorretora} />
          </TabsContent>

          <TabsContent value="conciliacao" className="space-y-4">
            <FinanceiroConciliacao corretoraId={selectedCorretora} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
