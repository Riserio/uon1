import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
  Building2,
  FileText,
  Clock,
  AlertCircle,
  CreditCard,
  Receipt,
  RefreshCw,
  History,
  Eye,
  ChevronRight,
  Banknote,
  PiggyBank,
  ShieldAlert
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

export default function Financeiro() {
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>("administradora");
  const [selectedCorretoraName, setSelectedCorretoraName] = useState("ADMINISTRADORA");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    saldo: 0,
    aReceber: 0,
    aPagar: 0,
    vencidos: 0,
    vencemHoje: 0,
    totalLancamentos: 0,
  });

  useEffect(() => { fetchCorretoras(); }, []);
  useEffect(() => { 
    if (selectedCorretora) {
      fetchSummary();
      const name = selectedCorretora === "administradora" 
        ? "ADMINISTRADORA" 
        : corretoras.find(c => c.id === selectedCorretora)?.nome || "";
      setSelectedCorretoraName(name);
    }
  }, [selectedCorretora, corretoras]);

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
        setSummary({ saldo: receitas - despesas, aReceber, aPagar, vencidos, vencemHoje, totalLancamentos: lancamentos.length });
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
    <div className="min-h-screen bg-background">
      <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
        {/* Header - Conta Azul style */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Financeiro</h1>
                <Badge variant="outline" className="text-xs font-normal hidden sm:flex">
                  {selectedCorretoraName}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Gestão financeira completa</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
              <SelectTrigger className="w-56 h-9 rounded-xl text-sm border-border/60 bg-card">
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Associação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="administradora" className="font-semibold">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-primary" />
                    ADMINISTRADORA
                  </div>
                </SelectItem>
                {corretoras.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="icon"
              className="rounded-xl shrink-0 h-9 w-9 border-border/60"
              onClick={() => { fetchSummary(); toast.success("Dados atualizados!"); }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main KPI Widget - Conta Azul inspired */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border/40">
            {/* Saldo */}
            <button 
              onClick={() => setActiveTab("visao-geral")}
              className="p-5 hover:bg-muted/30 transition-colors text-left group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Saldo</span>
              </div>
              <p className={`text-xl font-bold tracking-tight ${summary.saldo >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                {formatCurrency(summary.saldo)}
              </p>
              <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <Eye className="h-3 w-3" />
                Ver detalhes
              </div>
            </button>

            {/* A Receber */}
            <button 
              onClick={() => setActiveTab("a-receber")}
              className="p-5 hover:bg-muted/30 transition-colors text-left group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">A receber</span>
              </div>
              <p className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatCurrency(summary.aReceber)}
              </p>
              <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="h-3 w-3" />
                Ver contas
              </div>
            </button>

            {/* A Pagar */}
            <button 
              onClick={() => setActiveTab("a-pagar")}
              className="p-5 hover:bg-muted/30 transition-colors text-left group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-xl bg-rose-500/10 flex items-center justify-center">
                  <ArrowUpRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">A pagar</span>
              </div>
              <p className="text-xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                {formatCurrency(summary.aPagar)}
              </p>
              <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="h-3 w-3" />
                Ver contas
              </div>
            </button>

            {/* Vencidos */}
            <button 
              onClick={() => setActiveTab("a-pagar")}
              className="p-5 hover:bg-muted/30 transition-colors text-left group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Vencidos</span>
              </div>
              <p className="text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                {formatCurrency(summary.vencidos)}
              </p>
              {summary.vencidos > 0 && (
                <p className="text-[10px] text-amber-600/70 mt-1">Ação necessária</p>
              )}
            </button>

            {/* Vencem Hoje */}
            <button 
              onClick={() => setActiveTab("lancamentos")}
              className="p-5 hover:bg-muted/30 transition-colors text-left group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Vencem hoje</span>
              </div>
              <p className="text-xl font-bold tracking-tight text-orange-600 dark:text-orange-400">
                {formatCurrency(summary.vencemHoje)}
              </p>
              <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="h-3 w-3" />
                Ver lançamentos
              </div>
            </button>
          </div>
        </div>

        {/* Quick Actions - Conta Azul style shortcut cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button 
            onClick={() => setActiveTab("fluxo-caixa")}
            className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-200 text-left ${
              activeTab === "fluxo-caixa" 
                ? "border-primary/40 bg-primary/5 shadow-sm" 
                : "border-border/40 bg-card hover:border-border hover:shadow-sm"
            }`}
          >
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">Fluxo de Caixa</p>
              <p className="text-[10px] text-muted-foreground">Projeção financeira</p>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab("conciliacao")}
            className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-200 text-left ${
              activeTab === "conciliacao" 
                ? "border-primary/40 bg-primary/5 shadow-sm" 
                : "border-border/40 bg-card hover:border-border hover:shadow-sm"
            }`}
          >
            <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <CreditCard className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">Conciliação</p>
              <p className="text-[10px] text-muted-foreground">Importar OFX/QFX</p>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab("notas-fiscais")}
            className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-200 text-left ${
              activeTab === "notas-fiscais" 
                ? "border-primary/40 bg-primary/5 shadow-sm" 
                : "border-border/40 bg-card hover:border-border hover:shadow-sm"
            }`}
          >
            <div className="h-9 w-9 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">Notas Fiscais</p>
              <p className="text-[10px] text-muted-foreground">Emissão e controle</p>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab("historico")}
            className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-200 text-left ${
              activeTab === "historico" 
                ? "border-primary/40 bg-primary/5 shadow-sm" 
                : "border-border/40 bg-card hover:border-border hover:shadow-sm"
            }`}
          >
            <div className="h-9 w-9 rounded-xl bg-slate-500/10 flex items-center justify-center shrink-0">
              <History className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">Histórico</p>
              <p className="text-[10px] text-muted-foreground">Auditoria completa</p>
            </div>
          </button>
        </div>

        {/* Navigation Pills */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-2xl w-fit min-w-full sm:min-w-0 backdrop-blur-sm">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                      isActive 
                        ? "bg-card text-foreground shadow-sm border border-border/50" 
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
