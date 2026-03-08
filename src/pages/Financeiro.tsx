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
  trend?: "up" | "down" | "neutral";
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

  useEffect(() => { fetchCorretoras(); }, []);
  useEffect(() => { if (selectedCorretora) fetchSummary(); }, [selectedCorretora]);

  const fetchCorretoras = async () => {
    const { data, error } = await supabase.from("corretoras").select("id, nome").order("nome");
    if (!error && data) setCorretoras(data);
    setLoading(false);
  };

  const fetchSummary = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      let query = supabase.from("lancamentos_financeiros").select("tipo_lancamento, valor_liquido, status, data_vencimento");
      if (selectedCorretora === "administradora") {
        query = query.is("corretora_id", null);
      } else {
        query = query.eq("corretora_id", selectedCorretora);
      }
      const { data: lancamentos } = await query;
      if (lancamentos) {
        const receitas = lancamentos.filter(l => l.tipo_lancamento === "receita" && l.status === "pago").reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
        const despesas = lancamentos.filter(l => l.tipo_lancamento === "despesa" && l.status === "pago").reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
        const aReceber = lancamentos.filter(l => l.tipo_lancamento === "receita" && l.status === "pendente").reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
        const aPagar = lancamentos.filter(l => l.tipo_lancamento === "despesa" && l.status === "pendente").reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
        const vencidos = lancamentos.filter(l => l.status === "pendente" && l.data_vencimento && l.data_vencimento < today).reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
        const vencemHoje = lancamentos.filter(l => l.status === "pendente" && l.data_vencimento === today).reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
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
    { label: "Saldo Atual", value: summary.saldo, icon: DollarSign, trend: summary.saldo >= 0 ? "up" : "down" },
    { label: "A Receber", value: summary.aReceber, icon: ArrowDownLeft, trend: "up" },
    { label: "A Pagar", value: summary.aPagar, icon: ArrowUpRight, trend: "down" },
    { label: "Vencidos", value: summary.vencidos, icon: AlertCircle, trend: "down" },
    { label: "Vencem Hoje", value: summary.vencemHoje, icon: Clock, trend: "neutral" },
  ];

  const kpiStyles = [
    { bg: "bg-blue-500/8", iconBg: "bg-blue-500/15", iconColor: "text-blue-600 dark:text-blue-400", valueColor: "text-blue-700 dark:text-blue-300" },
    { bg: "bg-emerald-500/8", iconBg: "bg-emerald-500/15", iconColor: "text-emerald-600 dark:text-emerald-400", valueColor: "text-emerald-700 dark:text-emerald-300" },
    { bg: "bg-rose-500/8", iconBg: "bg-rose-500/15", iconColor: "text-rose-600 dark:text-rose-400", valueColor: "text-rose-700 dark:text-rose-300" },
    { bg: "bg-amber-500/8", iconBg: "bg-amber-500/15", iconColor: "text-amber-600 dark:text-amber-400", valueColor: "text-amber-700 dark:text-amber-300" },
    { bg: "bg-orange-500/8", iconBg: "bg-orange-500/15", iconColor: "text-orange-600 dark:text-orange-400", valueColor: "text-orange-700 dark:text-orange-300" },
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Financeiro</h1>
              <p className="text-sm text-muted-foreground">Gestão financeira completa</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
              <SelectTrigger className="w-52 h-9 rounded-xl text-sm">
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
              className="rounded-xl shrink-0 h-9 w-9"
              onClick={() => { fetchSummary(); toast.success("Dados atualizados!"); }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* KPI Cards - Widget Style */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map((kpi, idx) => {
            const style = kpiStyles[idx];
            return (
              <div 
                key={kpi.label} 
                className={`${style.bg} rounded-2xl p-4 border border-transparent hover:border-border/30 transition-all duration-200`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`h-9 w-9 rounded-xl ${style.iconBg} flex items-center justify-center`}>
                    <kpi.icon className={`h-4.5 w-4.5 ${style.iconColor}`} />
                  </div>
                </div>
                <p className={`text-lg sm:text-xl font-bold ${style.valueColor} truncate leading-tight`}>
                  {formatCurrency(kpi.value)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
              </div>
            );
          })}
        </div>

        {/* Tabs - Widget Style */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-2xl w-fit min-w-full sm:min-w-0">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
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
