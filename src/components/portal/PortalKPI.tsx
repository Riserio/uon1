import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type Kpis = {
  faturamento: number;
  comissoes: number;
  repassePrevisto: number;
  repassePago: number;
  repassePendente: number;
};

export default function PortalKPI({ corretoraId }: { corretoraId?: string }) {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [ano, setAno] = useState(new Date().getFullYear().toString());
  const [mes, setMes] = useState((new Date().getMonth() + 1).toString().padStart(2, "0"));

  const fetchKPIs = async () => {
    if (!corretoraId) return; // Aguardar seleção de corretora

    setLoading(true);
    try {
      const lastDayOfMonth = new Date(parseInt(ano), parseInt(mes), 0).getDate();

      const { data: producao, error } = await supabase
        .from("producao_financeira")
        .select("*")
        .eq("corretora_id", corretoraId)
        .gte("competencia", `${ano}-${mes}-01`)
        .lte("competencia", `${ano}-${mes}-${lastDayOfMonth}`);

      if (error) throw error;

      const faturamento = producao?.reduce((sum, p) => sum + (p.premio_total || 0), 0) || 0;
      const comissoes = producao?.reduce((sum, p) => sum + (p.valor_comissao || 0), 0) || 0;
      const repassePrevisto = producao?.reduce((sum, p) => sum + (p.repasse_previsto || 0), 0) || 0;
      const repassePago = producao?.reduce((sum, p) => sum + (p.repasse_pago || 0), 0) || 0;
      const repassePendente = repassePrevisto - repassePago;

      setKpis({
        faturamento,
        comissoes,
        repassePrevisto,
        repassePago,
        repassePendente,
      });
    } catch (error: any) {
      console.error("Error fetching KPIs:", error);
      toast.error("Erro ao carregar KPIs");
      setKpis(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (corretoraId) {
      fetchKPIs();
    }
  }, [ano, mes, corretoraId]);

  // Anos: próximo ano + atuais (inclui 2026)
  const currentYear = new Date().getFullYear();
  const anos = Array.from({ length: 6 }, (_, i) => (currentYear + 1 - i).toString());

  const meses = [
    { value: "01", label: "Janeiro" },
    { value: "02", label: "Fevereiro" },
    { value: "03", label: "Março" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Maio" },
    { value: "06", label: "Junho" },
    { value: "07", label: "Julho" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  const COLORS = ["#2c50bb", "#22c55e", "#eab308", "#ef4444"];

  const repasseDonutData =
    kpis && (kpis.repassePrevisto > 0 || kpis.repassePago > 0)
      ? [
          {
            name: "Pago",
            value: kpis.repassePago < 0 ? 0 : kpis.repassePago,
          },
          {
            name: "Pendente",
            value: kpis.repassePendente < 0 ? 0 : kpis.repassePendente,
          },
        ]
      : [];

  const metricsBarData = kpis
    ? [
        {
          name: "Faturamento",
          valor: kpis.faturamento,
        },
        {
          name: "Comissões",
          valor: kpis.comissoes,
        },
        {
          name: "Repasse Previsto",
          valor: kpis.repassePrevisto,
        },
        {
          name: "Repasse Pago",
          valor: kpis.repassePago,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header e filtros */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Painel Financeiro da Corretora</h2>
          <p className="text-sm text-muted-foreground">
            Visão consolidada de faturamento, comissões e repasses do período.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-24 sm:w-32">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-28 sm:w-40">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              {meses.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards de KPIs */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-muted/40">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-7 w-32 rounded bg-muted animate-pulse" />
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : kpis ? (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card className="border-muted/40">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg sm:text-2xl font-bold truncate">{formatCurrency(kpis.faturamento)}</div>
                <p className="text-xs text-muted-foreground">Prêmio total do período</p>
              </CardContent>
            </Card>

            <Card className="border-muted/40">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Comissões</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg sm:text-2xl font-bold truncate">{formatCurrency(kpis.comissoes)}</div>
                <p className="text-xs text-muted-foreground">Total de comissões do período</p>
              </CardContent>
            </Card>

            <Card className="border-muted/40">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Repasse Previsto</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg sm:text-2xl font-bold truncate">{formatCurrency(kpis.repassePrevisto)}</div>
                <p className="text-xs text-muted-foreground">A receber no período</p>
              </CardContent>
            </Card>

            <Card className="border-muted/40">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Repasse Pago</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(kpis.repassePago)}</div>
                <p className="text-xs text-muted-foreground">Pendente: {formatCurrency(kpis.repassePendente)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Linha de gráficos */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Gráfico de rosca - Repasse Pago x Pendente */}
            <Card className="border-muted/40">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Distribuição de Repasse (Pago x Pendente)</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {repasseDonutData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Sem dados de repasse para o período selecionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={repasseDonutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                      >
                        {repasseDonutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Gráfico de barras - Comparativo de métricas */}
            <Card className="border-muted/40">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Comparativo de Valores do Período</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {metricsBarData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Sem dados financeiros para o período selecionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metricsBarData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(value) => `R$ ${value / 1000}k`} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                      <Bar dataKey="valor" radius={[6, 6, 0, 0]} fill={COLORS[0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Nenhum dado encontrado para o período selecionado.</div>
      )}
    </div>
  );
}
