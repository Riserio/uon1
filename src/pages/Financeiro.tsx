import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  BarChart3,
  Building2,
  FileText,
  Clock,
  AlertCircle,
  CreditCard,
  Receipt,
  RefreshCw,
  History
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

import FinanceiroVisaoGeral from "@/components/financeiro/FinanceiroVisaoGeral";
import FinanceiroContasReceber from "@/components/financeiro/FinanceiroContasReceber";
import FinanceiroContasPagar from "@/components/financeiro/FinanceiroContasPagar";
import FinanceiroFluxoCaixa from "@/components/financeiro/FinanceiroFluxoCaixa";
import FinanceiroLancamentos from "@/components/financeiro/FinanceiroLancamentos";
import FinanceiroConciliacao from "@/components/financeiro/FinanceiroConciliacao";
import FinanceiroHistorico from "@/components/financeiro/FinanceiroHistorico";
import FinanceiroNotasFiscais from "@/components/financeiro/FinanceiroNotasFiscais";

interface SummaryKPI {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

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
    if (selectedCorretora) fetchSummary();
  }, [selectedCorretora]);

  const fetchCorretoras = async () => {
    const { data, error } = await supabase
      .from("corretoras")
      .select("id, nome")
      .order("nome");
    if (!error && data) setCorretoras(data);
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
          .filter(l => l.tipo_lancamento === "receita" && l.status === "pago")
          .reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
        const despesas = lancamentos
          .filter(l => l.tipo_lancamento === "despesa" && l.status === "pago")
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

        setSummary({ saldo: receitas - despesas, aReceber, aPagar, vencidos, vencemHoje });
      }
    } catch (error) {
      console.error("Erro ao carregar resumo:", error);
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel('financeiro-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos_financeiros' }, () => fetchSummary())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedCorretora]);

  const kpis: SummaryKPI[] = [
    { label: "Saldo Atual", value: summary.saldo, icon: DollarSign, color: summary.saldo >= 0 ? "text-primary" : "text-destructive", bgColor: "bg-primary/10" },
    { label: "A Receber", value: summary.aReceber, icon: ArrowDownLeft, color: "text-emerald-600", bgColor: "bg-emerald-500/10" },
    { label: "A Pagar", value: summary.aPagar, icon: ArrowUpRight, color: "text-destructive", bgColor: "bg-destructive/10" },
    { label: "Vencidos", value: summary.vencidos, icon: AlertCircle, color: "text-amber-600", bgColor: "bg-amber-500/10" },
    { label: "Vencem Hoje", value: summary.vencemHoje, icon: Clock, color: "text-orange-600", bgColor: "bg-orange-500/10" },
  ];

  const tabs = [
    { value: "visao-geral", label: "Visão Geral", icon: BarChart3 },
    { value: "a-receber", label: "A Receber", icon: ArrowDownLeft },
    { value: "a-pagar", label: "A Pagar", icon: ArrowUpRight },
    { value: "fluxo-caixa", label: "Fluxo de Caixa", icon: TrendingUp },
    { value: "lancamentos", label: "Lançamentos", icon: Receipt },
    { value: "conciliacao", label: "Conciliação", icon: CreditCard },
    { value: "historico", label: "Histórico", icon: History },
    { value: "notas-fiscais", label: "Nota Fiscal", icon: FileText },
  ];

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
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primary/10">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Financeiro</h1>
              <p className="text-sm text-muted-foreground">Gestão financeira completa</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
              <SelectTrigger className="w-56 rounded-xl bg-card">
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Associação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="administradora" className="font-semibold">ADMINISTRADORA</SelectItem>
                {corretoras.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="icon"
              className="rounded-xl shrink-0"
              onClick={() => { fetchSummary(); toast.success("Dados atualizados!"); }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                  <div className={`p-1.5 rounded-lg ${kpi.bgColor}`}>
                    <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  </div>
                </div>
                <p className={`text-lg sm:text-xl font-bold ${kpi.color} truncate`}>
                  {formatCurrency(kpi.value)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="bg-muted/50 p-1 rounded-xl h-auto inline-flex w-auto min-w-full sm:min-w-0">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="gap-1.5 rounded-lg text-xs sm:text-sm whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm px-3 py-2"
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="visao-geral"><FinanceiroVisaoGeral corretoraId={selectedCorretora} /></TabsContent>
          <TabsContent value="a-receber"><FinanceiroContasReceber corretoraId={selectedCorretora} /></TabsContent>
          <TabsContent value="a-pagar"><FinanceiroContasPagar corretoraId={selectedCorretora} /></TabsContent>
          <TabsContent value="fluxo-caixa"><FinanceiroFluxoCaixa corretoraId={selectedCorretora} /></TabsContent>
          <TabsContent value="lancamentos"><FinanceiroLancamentos corretoraId={selectedCorretora} /></TabsContent>
          <TabsContent value="conciliacao"><FinanceiroConciliacao corretoraId={selectedCorretora} /></TabsContent>
          <TabsContent value="historico"><FinanceiroHistorico corretoraId={selectedCorretora} /></TabsContent>
          <TabsContent value="notas-fiscais"><FinanceiroNotasFiscais corretoraId={selectedCorretora} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
