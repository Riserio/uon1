import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, BarChart3, Target, Wallet, FileText, ArrowUpRight, ArrowDownLeft, Zap, Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format, subMonths, eachMonthOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  corretoraId: string;
}

const STATUS_COLORS: Record<string, string> = {
  pendente: "hsl(45, 93%, 47%)",
  aprovado: "hsl(217, 91%, 60%)",
  pago: "hsl(142, 71%, 45%)",
  rejeitado: "hsl(0, 72%, 51%)",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm p-3 shadow-lg">
      <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function FinanceiroVisaoGeral({ corretoraId }: Props) {
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [recentLancamentos, setRecentLancamentos] = useState<any[]>([]);
  const [kpis, setKpis] = useState({
    receitaTotal: 0, despesaTotal: 0, saldoTotal: 0,
    receitasMes: 0, despesasMes: 0,
    ticketMedioReceita: 0, ticketMedioDespesa: 0,
    totalLancamentos: 0, taxaPendente: 0,
  });

  useEffect(() => { if (corretoraId) fetchData(); }, [corretoraId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase.from("lancamentos_financeiros").select("*").order("data_lancamento", { ascending: false });
      if (corretoraId === "administradora") {
        query = query.is("corretora_id", null);
      } else {
        query = query.eq("corretora_id", corretoraId);
      }
      const { data: lancamentos } = await query;
      if (!lancamentos || lancamentos.length === 0) {
        setKpis({ receitaTotal: 0, despesaTotal: 0, saldoTotal: 0, receitasMes: 0, despesasMes: 0, ticketMedioReceita: 0, ticketMedioDespesa: 0, totalLancamentos: 0, taxaPendente: 0 });
        setMonthlyData([]);
        setCategoryData([]);
        setStatusData([]);
        setRecentLancamentos([]);
        setLoading(false);
        return;
      }

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const receitas = lancamentos.filter(l => l.tipo_lancamento === "receita");
      const despesas = lancamentos.filter(l => l.tipo_lancamento === "despesa");
      const receitaTotal = receitas.reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
      const despesaTotal = despesas.reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
      const pendentes = lancamentos.filter(l => l.status === "pendente").length;
      const receitasMes = lancamentos.filter(l => {
        const d = new Date(l.data_lancamento);
        return l.tipo_lancamento === "receita" && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }).reduce((sum, l) => sum + (l.valor_liquido || 0), 0);
      const despesasMes = lancamentos.filter(l => {
        const d = new Date(l.data_lancamento);
        return l.tipo_lancamento === "despesa" && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }).reduce((sum, l) => sum + (l.valor_liquido || 0), 0);

      setKpis({
        receitaTotal, despesaTotal, saldoTotal: receitaTotal - despesaTotal,
        receitasMes, despesasMes,
        ticketMedioReceita: receitas.length > 0 ? receitaTotal / receitas.length : 0,
        ticketMedioDespesa: despesas.length > 0 ? despesaTotal / despesas.length : 0,
        totalLancamentos: lancamentos.length,
        taxaPendente: lancamentos.length > 0 ? (pendentes / lancamentos.length) * 100 : 0,
      });

      // Monthly data
      const months = eachMonthOfInterval({ start: subMonths(now, 11), end: now });
      const monthlyMap: Record<string, { receitas: number; despesas: number }> = {};
      months.forEach(m => { monthlyMap[format(m, "MMM/yy", { locale: ptBR })] = { receitas: 0, despesas: 0 }; });
      lancamentos.forEach(l => {
        const key = format(new Date(l.data_lancamento), "MMM/yy", { locale: ptBR });
        if (monthlyMap[key]) {
          if (l.tipo_lancamento === "receita") monthlyMap[key].receitas += l.valor_liquido || 0;
          else monthlyMap[key].despesas += l.valor_liquido || 0;
        }
      });
      let runningBalance = 0;
      setMonthlyData(Object.entries(monthlyMap).map(([name, v]) => {
        runningBalance += v.receitas - v.despesas;
        return { name, ...v, saldo: runningBalance };
      }));

      // Category breakdown
      const categories: Record<string, number> = {};
      lancamentos.forEach(l => {
        const cat = l.categoria || "Outros";
        categories[cat] = (categories[cat] || 0) + (l.valor_liquido || 0);
      });
      setCategoryData(
        Object.entries(categories)
          .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 6)
      );

      // Status distribution
      const statusCounts: Record<string, number> = {};
      lancamentos.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
      setStatusData(Object.entries(statusCounts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })));

      setRecentLancamentos(lancamentos.slice(0, 6));
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

  const totalStatus = statusData.reduce((s, d) => s + d.value, 0);
  const CATEGORY_COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Receita Total</span>
          </div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(kpis.receitaTotal)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Mês: {formatCurrency(kpis.receitasMes)}</p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <ArrowUpRight className="h-3.5 w-3.5 text-rose-600" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Despesa Total</span>
          </div>
          <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{formatCurrency(kpis.despesaTotal)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Mês: {formatCurrency(kpis.despesasMes)}</p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Wallet className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Saldo</span>
          </div>
          <p className={`text-xl font-bold ${kpis.saldoTotal >= 0 ? "text-blue-600 dark:text-blue-400" : "text-rose-600"}`}>
            {formatCurrency(kpis.saldoTotal)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{kpis.totalLancamentos} lançamentos</p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Target className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Pendente</span>
          </div>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{kpis.taxaPendente.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Aguardando aprovação</p>
        </div>
      </div>

      {/* Saldo Acumulado - Area Chart */}
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Evolução do Saldo (12 meses)</h3>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={monthlyData}>
            <defs>
              <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#gradSaldo)" name="Saldo" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: "hsl(var(--background))", stroke: "hsl(var(--primary))" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Two-column: Receitas/Despesas bar + Status breakdown */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Monthly bar chart */}
        <div className="lg:col-span-3 rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Receitas vs Despesas</h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData} barGap={2} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="receitas" fill="#10b981" name="Receitas" radius={[6, 6, 0, 0]} />
              <Bar dataKey="despesas" fill="#f43f5e" name="Despesas" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Receitas
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-2.5 w-2.5 rounded-full bg-rose-500" />Despesas
            </div>
          </div>
        </div>

        {/* Status breakdown as horizontal bars */}
        <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Status</h3>
          </div>
          <div className="space-y-3">
            {statusData.map(s => {
              const pct = totalStatus > 0 ? (s.value / totalStatus) * 100 : 0;
              const color = STATUS_COLORS[s.name] || "hsl(var(--primary))";
              const label = s.name.charAt(0).toUpperCase() + s.name.slice(1);
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground">{s.value} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
            {statusData.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Sem dados</p>}
          </div>

          {/* Ticket médio */}
          <div className="mt-6 pt-4 border-t border-border/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Ticket médio receita</span>
              <span className="text-sm font-semibold text-emerald-600">{formatCurrency(kpis.ticketMedioReceita)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Ticket médio despesa</span>
              <span className="text-sm font-semibold text-rose-600">{formatCurrency(kpis.ticketMedioDespesa)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Categories + Recent */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Categories horizontal bars */}
        <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Por Categoria</h3>
          </div>
          <div className="space-y-3">
            {categoryData.map((c, i) => {
              const maxVal = categoryData[0]?.value || 1;
              const pct = (c.value / maxVal) * 100;
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium truncate max-w-[120px]">{c.name}</span>
                    <span className="text-muted-foreground">{formatCurrency(c.value)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                  </div>
                </div>
              );
            })}
            {categoryData.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Sem categorias</p>}
          </div>
        </div>

        {/* Recent transactions */}
        <div className="lg:col-span-3 rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Últimos Lançamentos</h3>
          </div>
          <div className="space-y-2">
            {recentLancamentos.map(l => (
              <div key={l.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${l.tipo_lancamento === "receita" ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
                    {l.tipo_lancamento === "receita"
                      ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                      : <TrendingDown className="h-3.5 w-3.5 text-rose-600" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{l.descricao || "Sem descrição"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(l.data_lancamento), "dd/MM/yyyy", { locale: ptBR })}
                      {l.categoria && ` · ${l.categoria}`}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className={`text-sm font-semibold ${l.tipo_lancamento === "receita" ? "text-emerald-600" : "text-rose-600"}`}>
                    {l.tipo_lancamento === "receita" ? "+" : "-"}{formatCurrency(l.valor_liquido)}
                  </p>
                  <Badge variant={l.status === "pago" ? "default" : l.status === "pendente" ? "secondary" : "destructive"} className="text-[10px] h-4">
                    {l.status}
                  </Badge>
                </div>
              </div>
            ))}
            {recentLancamentos.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum lançamento encontrado</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
