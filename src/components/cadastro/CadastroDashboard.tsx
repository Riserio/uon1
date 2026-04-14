import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Car, MapPin, TrendingUp, Shield, Building2, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface Props {
  registros: any[];
  loading: boolean;
}

const CORES = ["#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm p-3 shadow-lg">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      {payload.map((e: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-semibold">{e.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function CadastroDashboard({ registros, loading }: Props) {
  const stats = useMemo(() => {
    const total = registros.length;
    const ativos = registros.filter(r => (r.situacao || "").toUpperCase().includes("ATIV")).length;
    const inativos = registros.filter(r => (r.situacao || "").toUpperCase().includes("INATIV") || (r.situacao || "").toUpperCase().includes("CANCEL")).length;
    const placasUnicas = new Set(registros.map(r => r.placa).filter(Boolean)).size;
    const valorTotal = registros.reduce((s, r) => s + (r.valor_protegido || 0), 0);

    // Por situação
    const situacaoMap = new Map<string, number>();
    registros.forEach(r => {
      const sit = r.situacao || "NÃO INFORMADO";
      situacaoMap.set(sit, (situacaoMap.get(sit) || 0) + 1);
    });
    const porSituacao = Array.from(situacaoMap.entries())
      .map(([name, value], i) => ({ name, value, fill: CORES[i % CORES.length] }))
      .sort((a, b) => b.value - a.value);

    // Por regional
    const regionalMap = new Map<string, number>();
    registros.forEach(r => {
      const reg = r.regional || "NÃO INFORMADO";
      regionalMap.set(reg, (regionalMap.get(reg) || 0) + 1);
    });
    const porRegional = Array.from(regionalMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);

    // Por cooperativa
    const coopMap = new Map<string, number>();
    registros.forEach(r => {
      const coop = r.cooperativa || "NÃO INFORMADO";
      coopMap.set(coop, (coopMap.get(coop) || 0) + 1);
    });
    const porCooperativa = Array.from(coopMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Por marca
    const marcaMap = new Map<string, number>();
    registros.forEach(r => {
      const marca = r.marca_veiculo || "NÃO INFORMADO";
      marcaMap.set(marca, (marcaMap.get(marca) || 0) + 1);
    });
    const porMarca = Array.from(marcaMap.entries())
      .map(([name, value], i) => ({ name, value, fill: CORES[i % CORES.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return { total, ativos, inativos, placasUnicas, valorTotal, porSituacao, porRegional, porCooperativa, porMarca };
  }, [registros]);

  if (loading) {
    return <div className="grid grid-cols-1 md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Card key={i}><CardContent className="h-24 animate-pulse bg-muted" /></Card>)}</div>;
  }

  if (!registros.length) {
    return (
      <Card className="py-12 text-center">
        <CardContent>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum Dado de Cadastro</h3>
          <p className="text-muted-foreground">Importe uma planilha de cadastro para visualizar os indicadores.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Cadastros", value: stats.total.toLocaleString(), icon: Users, color: "text-primary" },
          { label: "Ativos", value: stats.ativos.toLocaleString(), icon: Shield, color: "text-emerald-600" },
          { label: "Inativos", value: stats.inativos.toLocaleString(), icon: AlertCircle, color: "text-red-600" },
          { label: "Veículos Únicos", value: stats.placasUnicas.toLocaleString(), icon: Car, color: "text-blue-600" },
          { label: "Valor Protegido", value: formatCurrency(stats.valorTotal), icon: TrendingUp, color: "text-violet-600" },
        ].map((kpi, i) => (
          <Card key={i} className="rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-xl font-bold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Situação */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Distribuição por Situação</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.porSituacao} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                    label={({ name, percent }) => `${name.slice(0, 15)} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {stats.porSituacao.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Regional */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Top Regionais</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.porRegional} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" width={120} className="text-xs" tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Cadastros" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Marcas */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Top Marcas</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.porMarca}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis className="text-xs" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Veículos" radius={[4, 4, 0, 0]}>
                    {stats.porMarca.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Cooperativas */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Top Cooperativas</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.porCooperativa} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" width={140} className="text-xs" tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Cadastros" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
