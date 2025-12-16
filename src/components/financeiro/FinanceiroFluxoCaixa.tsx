import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Calendar,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine
} from "recharts";
import { format, subMonths, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  corretoraId: string;
}

export default function FinanceiroFluxoCaixa({ corretoraId }: Props) {
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"diario" | "mensal">("mensal");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [chartData, setChartData] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    entradas: 0,
    saidas: 0,
    saldoInicial: 0,
    saldoFinal: 0,
  });

  useEffect(() => {
    if (corretoraId) {
      fetchData();
    }
  }, [corretoraId, viewMode, currentDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("lancamentos_financeiros")
        .select("*")
        .eq("status", "aprovado")
        .order("data_lancamento", { ascending: true });
      
      if (corretoraId === "administradora") {
        query = query.is("corretora_id", null);
      } else {
        query = query.eq("corretora_id", corretoraId);
      }
      
      const { data: lancamentos } = await query;

      if (!lancamentos) return;

      if (viewMode === "mensal") {
        // Monthly view - show 12 months
        const months: Record<string, { entradas: number; saidas: number; saldo: number }> = {};
        
        for (let i = 11; i >= 0; i--) {
          const date = subMonths(currentDate, i);
          const key = format(date, "MMM/yy", { locale: ptBR });
          months[key] = { entradas: 0, saidas: 0, saldo: 0 };
        }

        let runningBalance = 0;
        lancamentos.forEach(l => {
          const date = new Date(l.data_lancamento);
          const key = format(date, "MMM/yy", { locale: ptBR });
          
          if (months[key]) {
            if (l.tipo_lancamento === "receita") {
              months[key].entradas += l.valor_liquido || 0;
              runningBalance += l.valor_liquido || 0;
            } else {
              months[key].saidas += l.valor_liquido || 0;
              runningBalance -= l.valor_liquido || 0;
            }
            months[key].saldo = runningBalance;
          }
        });

        const data = Object.entries(months).map(([name, values]) => ({
          name,
          ...values,
        }));

        setChartData(data);

        // Calculate summary for current month
        const currentMonthKey = format(currentDate, "MMM/yy", { locale: ptBR });
        const currentMonthData = months[currentMonthKey] || { entradas: 0, saidas: 0 };
        
        setSummary({
          entradas: currentMonthData.entradas,
          saidas: currentMonthData.saidas,
          saldoInicial: runningBalance - (currentMonthData.entradas - currentMonthData.saidas),
          saldoFinal: runningBalance,
        });

      } else {
        // Daily view - show current month
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);
        const days = eachDayOfInterval({ start, end });

        const dailyData: Record<string, { entradas: number; saidas: number; saldo: number }> = {};
        
        days.forEach(day => {
          const key = format(day, "dd", { locale: ptBR });
          dailyData[key] = { entradas: 0, saidas: 0, saldo: 0 };
        });

        let runningBalance = 0;
        
        // Calculate initial balance (before current month)
        lancamentos
          .filter(l => new Date(l.data_lancamento) < start)
          .forEach(l => {
            if (l.tipo_lancamento === "receita") {
              runningBalance += l.valor_liquido || 0;
            } else {
              runningBalance -= l.valor_liquido || 0;
            }
          });

        const saldoInicial = runningBalance;

        // Calculate daily data
        lancamentos
          .filter(l => {
            const date = new Date(l.data_lancamento);
            return date >= start && date <= end;
          })
          .forEach(l => {
            const date = new Date(l.data_lancamento);
            const key = format(date, "dd", { locale: ptBR });
            
            if (dailyData[key]) {
              if (l.tipo_lancamento === "receita") {
                dailyData[key].entradas += l.valor_liquido || 0;
                runningBalance += l.valor_liquido || 0;
              } else {
                dailyData[key].saidas += l.valor_liquido || 0;
                runningBalance -= l.valor_liquido || 0;
              }
              dailyData[key].saldo = runningBalance;
            }
          });

        // Fill in running balance for days without transactions
        let lastSaldo = saldoInicial;
        Object.keys(dailyData).forEach(key => {
          if (dailyData[key].entradas === 0 && dailyData[key].saidas === 0) {
            dailyData[key].saldo = lastSaldo;
          } else {
            lastSaldo = dailyData[key].saldo;
          }
        });

        const data = Object.entries(dailyData).map(([name, values]) => ({
          name,
          ...values,
        }));

        setChartData(data);

        const totalEntradas = Object.values(dailyData).reduce((sum, d) => sum + d.entradas, 0);
        const totalSaidas = Object.values(dailyData).reduce((sum, d) => sum + d.saidas, 0);

        setSummary({
          entradas: totalEntradas,
          saidas: totalSaidas,
          saldoInicial,
          saldoFinal: runningBalance,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar fluxo de caixa:", error);
    } finally {
      setLoading(false);
    }
  };

  const navigateDate = (direction: "prev" | "next") => {
    if (viewMode === "mensal") {
      setCurrentDate(direction === "prev" ? subMonths(currentDate, 12) : addMonths(currentDate, 12));
    } else {
      setCurrentDate(direction === "prev" ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateDate("prev")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-4 py-2 bg-muted rounded-lg font-medium">
            {viewMode === "mensal" 
              ? `${format(subMonths(currentDate, 11), "MMM/yy", { locale: ptBR })} - ${format(currentDate, "MMM/yy", { locale: ptBR })}`
              : format(currentDate, "MMMM yyyy", { locale: ptBR })
            }
          </div>
          <Button variant="outline" size="icon" onClick={() => navigateDate("next")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Select value={viewMode} onValueChange={(v: "diario" | "mensal") => setViewMode(v)}>
          <SelectTrigger className="w-40">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mensal">Mensal</SelectItem>
            <SelectItem value="diario">Diário</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Saldo Inicial</span>
            </div>
            <p className={`text-xl font-bold ${summary.saldoInicial >= 0 ? 'text-foreground' : 'text-red-600'}`}>
              {formatCurrency(summary.saldoInicial)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Entradas</span>
            </div>
            <p className="text-xl font-bold text-green-600">
              +{formatCurrency(summary.entradas)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <TrendingDown className="h-4 w-4" />
              <span className="text-xs">Saídas</span>
            </div>
            <p className="text-xl font-bold text-red-600">
              -{formatCurrency(summary.saidas)}
            </p>
          </CardContent>
        </Card>

        <Card className={summary.saldoFinal >= 0 ? "border-blue-500/30" : "border-red-500/30"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Saldo Final</span>
            </div>
            <p className={`text-xl font-bold ${summary.saldoFinal >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(summary.saldoFinal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fluxo de Caixa</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-muted-foreground">Carregando...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis 
                  className="text-xs" 
                  tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} 
                />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    formatCurrency(value), 
                    name === "saldo" ? "Saldo" : name === "entradas" ? "Entradas" : "Saídas"
                  ]}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))' 
                  }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Area 
                  type="monotone" 
                  dataKey="saldo" 
                  stroke="#3b82f6" 
                  fillOpacity={1}
                  fill="url(#colorSaldo)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>Saldo Acumulado</span>
        </div>
      </div>
    </div>
  );
}
