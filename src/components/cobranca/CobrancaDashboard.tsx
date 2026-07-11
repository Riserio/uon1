import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, ComposedChart, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, DollarSign, AlertCircle, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Settings, TrendingDown } from "lucide-react";
import { InadimplenciaReferenciaConfigDialog } from "./InadimplenciaReferenciaConfigDialog";
import { supabase } from "@/integrations/supabase/client";

// NOTE (escalabilidade): este componente NÃO recebe mais a lista crua de
// boletos (poderia ser 500k+ linhas para associações grandes como a
// VALECAR). Toda a agregação (totais, rankings, séries por dia) é feita
// no banco pela RPC `get_dashboard_cobranca_cached` (que por sua vez
// delega para `calcular_dashboard_cobranca`) e chega pronta em `stats`.
// A única coisa que ainda é calculada/mesclada no cliente é a config de
// referência de inadimplência e o histórico de snapshots diários — dados
// pequenos (1 linha por dia do mês), não derivados dos boletos.
interface CobrancaDashboardProps {
  stats: any;
  loading: boolean;
  corretoraId?: string;
  mesReferencia?: string;
  isPortalAccess?: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

const formatCompactCurrency = (value: number) => {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}k`;
  }
  return `R$ ${(value || 0).toFixed(0)}`;
};

const formatPercent = (value: number) => {
  return `${(value || 0).toFixed(2)}%`;
};

// Custom tooltip
const CustomTooltip = ({ active, payload, label, isCurrency = false, isPercent = false }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {isPercent ? formatPercent(entry.value) : isCurrency ? formatCurrency(entry.value) : entry.value.toLocaleString('pt-BR')}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function CobrancaDashboard({ stats, loading, corretoraId, mesReferencia, isPortalAccess }: CobrancaDashboardProps) {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [inadimplenciaConfig, setInadimplenciaConfig] = useState<Map<number, number>>(new Map());
  const [inadimplenciaHistorico, setInadimplenciaHistorico] = useState<Map<number, number>>(new Map());
  const inadimplenciaScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicators, setShowScrollIndicators] = useState({ left: false, right: false });
  const snapshotSavedRef = useRef(false);
  const retroativoGeradoRef = useRef(false);
  // Serialized keys for stable useMemo deps (avoid new Map reference triggering re-renders)
  const [configVersion, setConfigVersion] = useState(0);
  const [historicoVersion, setHistoricoVersion] = useState(0);

  // Carregar configuração de inadimplência do banco
  const loadInadimplenciaConfig = async () => {
    if (!corretoraId || !mesReferencia) return;

    try {
      const { data, error } = await supabase
        .from("cobranca_inadimplencia_config")
        .select("dia, percentual_referencia")
        .eq("corretora_id", corretoraId)
        .eq("mes_referencia", mesReferencia);

      if (error) throw error;

      const configMap = new Map<number, number>();
      data?.forEach(d => {
        configMap.set(d.dia, Number(d.percentual_referencia));
      });
      setInadimplenciaConfig(configMap);
      setConfigVersion(v => v + 1);
    } catch (error) {
      console.error("Erro ao carregar config inadimplência:", error);
    }
  };

  // Carregar histórico de inadimplência (snapshot mais recente diferente de hoje ou de ontem)
  const loadInadimplenciaHistorico = async () => {
    if (!corretoraId || !mesReferencia) return;

    try {
      const hoje = new Date();
      const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;

      // Primeiro, tentar buscar registros de dias anteriores
      let { data, error } = await supabase
        .from("cobranca_inadimplencia_historico")
        .select("dia, percentual_inadimplencia, data_registro")
        .eq("corretora_id", corretoraId)
        .eq("mes_referencia", mesReferencia)
        .lt("data_registro", hojeStr)
        .order("data_registro", { ascending: false })
        .limit(31);

      if (error) throw error;

      // Se não houver dados de dias anteriores, buscar qualquer dado disponível para visualização
      if (!data || data.length === 0) {
        const { data: todayData, error: todayError } = await supabase
          .from("cobranca_inadimplencia_historico")
          .select("dia, percentual_inadimplencia, data_registro")
          .eq("corretora_id", corretoraId)
          .eq("mes_referencia", mesReferencia)
          .order("data_registro", { ascending: false })
          .limit(31);

        if (!todayError && todayData && todayData.length > 0) {
          data = todayData;
          console.log("Usando histórico do dia atual como referência inicial");
        }
      }

      const historicoMap = new Map<number, number>();
      const dataRegistroMaisRecente = data?.[0]?.data_registro;

      // Filtrar apenas os registros desta data mais recente
      data?.filter(d => d.data_registro === dataRegistroMaisRecente).forEach(d => {
        historicoMap.set(d.dia, Number(d.percentual_inadimplencia));
      });

      console.log("Histórico carregado:", historicoMap.size, "dias, data:", dataRegistroMaisRecente);
      setInadimplenciaHistorico(historicoMap);
      setHistoricoVersion(v => v + 1);
    } catch (error) {
      console.error("Erro ao carregar histórico inadimplência:", error);
    }
  };

  // Salvar snapshot diário de inadimplência
  const saveInadimplenciaSnapshot = async (inadimplenciaPorDia: Array<{ dia: number; inadimplenciaReal: number; qtdeVencidos: number; qtdeEmitidos: number }>) => {
    if (!corretoraId || !mesReferencia || isPortalAccess) return;

    try {
      const hoje = new Date();
      const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;

      // Preparar dados para upsert
      const registros = inadimplenciaPorDia.map(item => ({
        corretora_id: corretoraId,
        mes_referencia: mesReferencia,
        dia: item.dia,
        data_registro: hojeStr,
        percentual_inadimplencia: item.inadimplenciaReal,
        qtde_abertos: item.qtdeVencidos,
        qtde_emitidos: item.qtdeEmitidos
      }));

      // Upsert para evitar duplicatas
      const { error } = await supabase
        .from("cobranca_inadimplencia_historico")
        .upsert(registros, {
          onConflict: "corretora_id,mes_referencia,dia,data_registro"
        });

      if (error) {
        console.error("Erro ao salvar histórico inadimplência:", error);
      } else {
        console.log("Snapshot salvo com sucesso:", registros.length, "registros para", hojeStr);
      }
    } catch (error) {
      console.error("Erro ao salvar histórico inadimplência:", error);
    }
  };

  // Gerar histórico retroativo para todos os dias passados do mês.
  // Antes isto recalculava tudo a partir do array cru de boletos no
  // cliente (O(dias × boletos), inviável para associações grandes). Agora
  // reaproveita `stats.inadimplenciaPorDia`, que a RPC já calcula
  // corretamente (mesma fórmula) no servidor para cada dia do mês.
  const generateHistoricoRetroativo = async () => {
    if (!corretoraId || !mesReferencia || isPortalAccess || !stats?.inadimplenciaPorDia?.length) return;

    try {
      const hoje = new Date();
      const anoAtual = hoje.getFullYear();
      const mesAtual = hoje.getMonth();
      const diaHoje = hoje.getDate();

      // Verificar se já existe histórico para este mês
      const { data: existingData, error: checkError } = await supabase
        .from("cobranca_inadimplencia_historico")
        .select("id")
        .eq("corretora_id", corretoraId)
        .eq("mes_referencia", mesReferencia)
        .limit(1);

      if (checkError) throw checkError;

      // Se já existe histórico, não gerar novamente
      if (existingData && existingData.length > 0) {
        console.log("Histórico já existe para este mês");
        return;
      }

      const registrosHistorico = stats.inadimplenciaPorDia
        .filter((item: any) => item.dia < diaHoje)
        .map((item: any) => ({
          corretora_id: corretoraId,
          mes_referencia: mesReferencia,
          dia: item.dia,
          data_registro: `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}-${String(item.dia).padStart(2, '0')}`,
          percentual_inadimplencia: item.inadimplenciaReal,
          qtde_abertos: item.qtdeVencidos,
          qtde_emitidos: item.qtdeEmitidos
        }));

      if (registrosHistorico.length > 0) {
        const { error } = await supabase
          .from("cobranca_inadimplencia_historico")
          .upsert(registrosHistorico, {
            onConflict: "corretora_id,mes_referencia,dia,data_registro"
          });

        if (error) {
          console.error("Erro ao gerar histórico retroativo:", error);
        } else {
          console.log("Histórico retroativo gerado:", registrosHistorico.length, "dias");
        }
      }
    } catch (error) {
      console.error("Erro ao gerar histórico retroativo:", error);
    }
  };

  useEffect(() => {
    snapshotSavedRef.current = false;
    retroativoGeradoRef.current = false;
    loadInadimplenciaConfig();
    loadInadimplenciaHistorico();
  }, [corretoraId, mesReferencia]);

  // Gerar histórico retroativo quando os stats carregam
  useEffect(() => {
    if (stats?.totalBoletos > 0 && corretoraId && mesReferencia && !retroativoGeradoRef.current) {
      // Debounce: evita disparar durante navegação rápida entre abas/filtros
      const timer = setTimeout(() => {
        retroativoGeradoRef.current = true;
        generateHistoricoRetroativo();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [stats?.totalBoletos, corretoraId, mesReferencia]);

  // Function to update scroll indicators
  const updateScrollIndicators = () => {
    const el = inadimplenciaScrollRef.current;
    if (el) {
      const canScrollLeft = el.scrollLeft > 10;
      const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 10;
      setShowScrollIndicators({ left: canScrollLeft, right: canScrollRight });
    }
  };

  // Handle manual scroll
  const handleScroll = (direction: 'left' | 'right') => {
    const el = inadimplenciaScrollRef.current;
    if (el) {
      const scrollAmount = 300;
      el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  // Mescla a série `inadimplenciaPorDia` vinda do servidor com a config de
  // referência e o histórico de snapshot (ambos pequenos, carregados à
  // parte acima) — reproduz exatamente o merge que antes acontecia dentro
  // do useMemo de `stats` no cliente.
  const inadimplenciaPorDiaMerged = useMemo(() => {
    if (!stats?.inadimplenciaPorDia) return [];
    return stats.inadimplenciaPorDia.map((item: any) => ({
      ...item,
      inadimplenciaReferencia: inadimplenciaConfig.get(item.dia) ?? 30,
      inadimplenciaHistorico: inadimplenciaHistorico.get(item.dia),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.inadimplenciaPorDia, configVersion, historicoVersion]);

  // Salvar snapshot diário quando os dados mudam (apenas uma vez por sessão)
  useEffect(() => {
    if (stats?.inadimplenciaPorDia && corretoraId && mesReferencia && !isPortalAccess && !snapshotSavedRef.current) {
      snapshotSavedRef.current = true;
      saveInadimplenciaSnapshot(stats.inadimplenciaPorDia);
    }
  }, [stats?.inadimplenciaPorDia, corretoraId, mesReferencia, isPortalAccess]);

  // Center on current day when data loads
  useEffect(() => {
    const el = inadimplenciaScrollRef.current;
    if (!el || !stats) return;

    const hoje = new Date();
    const diaHoje = hoje.getDate();

    // Find index of today in the data
    const targetIndex = inadimplenciaPorDiaMerged.findIndex((d: any) => d.dia === diaHoje);
    if (targetIndex !== -1) {
      const itemWidth = 30;
      const targetScroll = Math.max(0, (targetIndex * itemWidth) - (el.clientWidth / 2) + (itemWidth / 2));
      el.scrollTo({ left: targetScroll, behavior: 'auto' });
    }

    setTimeout(updateScrollIndicators, 100);
  }, [inadimplenciaPorDiaMerged, stats]);

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats || !stats.totalBoletos) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum Dado Disponível</h3>
          <p className="text-muted-foreground">
            Importe uma planilha de boletos para visualizar os dashboards.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 w-full max-w-full overflow-x-hidden min-w-0">
      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[
          { label: "Boletos Emitidos", value: stats.totalBoletos.toLocaleString('pt-BR'), sub: formatCurrency(stats.totalValor), cls: "text-primary bg-primary/5 border-primary/20" },
          { label: "Boletos Pagos", value: stats.qtdePagos.toLocaleString('pt-BR'), sub: formatCurrency(stats.totalPago), cls: "text-emerald-600 bg-emerald-500/5 border-emerald-500/20" },
          { label: "Em Aberto", value: stats.qtdeAbertos.toLocaleString('pt-BR'), sub: formatCurrency(stats.totalAberto), cls: "text-red-600 bg-red-500/5 border-red-500/20" },
          { label: "Inadimplência", value: formatPercent(stats.percentualInadimplencia), sub: "do total emitido", cls: "text-amber-600 bg-amber-500/5 border-amber-500/20" },
        ].map(({ label, value, sub, cls }) => (
          <Card key={label} className={`rounded-2xl border ${cls}`}>
            <CardContent className="p-4">
              <div className={`text-[11px] font-medium mb-1 ${cls.split(" ")[0]}`}>{label}</div>
              <div className="text-xl font-bold tracking-tight">{value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Boletos por Dia de Vencimento Veículo */}
      {(() => {
        const activeData = stats.diasVencimentoData || [];

        return (
          <Card className="rounded-2xl overflow-hidden border-border/40">
            <CardHeader className="pb-0 pt-4 px-5">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Calendar className="h-4 w-4 text-primary" />
                Boletos por Dia de Vencimento
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Totais */}
              <div className="grid grid-cols-3 divide-x divide-border/40 border-b border-border/40 px-1 py-4">
                <div className="px-5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Emitidos</p>
                  <p className="text-2xl font-bold text-primary tabular-nums">{stats.totalBoletos.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-primary/70 mt-0.5">{formatCurrency(stats.totalValor)}</p>
                </div>
                <div className="px-5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Pagos</p>
                  <p className="text-2xl font-bold text-emerald-600 tabular-nums">{stats.qtdePagos.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-emerald-600/70 mt-0.5">{formatCurrency(stats.totalPago)}</p>
                </div>
                <div className="px-5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Em Aberto</p>
                  <p className="text-2xl font-bold text-destructive tabular-nums">{stats.qtdeAbertos.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-destructive/70 mt-0.5">{formatCurrency(stats.totalAberto)}</p>
                </div>
              </div>

              {/* Gráfico de barras */}
              {activeData.length > 0 && (
                <div className="px-4 pt-4 pb-1 overflow-x-auto scrollbar-hide">
                  <div style={{ minWidth: Math.max(500, activeData.length * 52) + 'px' }}>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart
                        data={activeData}
                        margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
                        barCategoryGap="25%"
                        barGap={2}
                      >
                        <defs>
                          <linearGradient id="gradEmitidos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.85} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                          </linearGradient>
                          <linearGradient id="gradPagos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.3} />
                          </linearGradient>
                          <linearGradient id="gradAbertos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="dia" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => v.replace('Dia ', '')} />
                        <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={30} />
                        <Tooltip
                          contentStyle={{ borderRadius: 10, fontSize: 11, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}
                          labelStyle={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}
                          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                          formatter={(v: any, name: string) => [v.toLocaleString('pt-BR'), name]}
                        />
                        <Bar dataKey="qtde" name="Emitidos" fill="url(#gradEmitidos)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                        <Bar dataKey="pagos" name="Pagos" fill="url(#gradPagos)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                        <Bar dataKey="abertos" name="Em Aberto" fill="url(#gradAbertos)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-5 justify-center pb-3 mt-2">
                    {[
                      { label: "Emitidos", color: "hsl(var(--primary))" },
                      { label: "Pagos", color: "#22c55e" },
                      { label: "Em Aberto", color: "#ef4444" },
                    ].map(({ label, color }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                        <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabela compacta */}
              <div className="max-h-[280px] overflow-y-auto border-t border-border/40">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Dia</th>
                      <th className="text-center px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Emitidos</th>
                      <th className="text-center px-3 py-2 text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Pagos</th>
                      <th className="text-center px-3 py-2 text-[11px] font-semibold text-red-600 uppercase tracking-wide">Aberto</th>
                      <th className="text-right px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Taxa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeData.map((item: any, index: number) => {
                      const taxaPagamento = item.qtde > 0 ? (item.pagos / item.qtde) * 100 : 0;
                      const taxaColor = taxaPagamento >= 95 ? 'text-emerald-600' : taxaPagamento >= 51 ? 'text-amber-600' : 'text-red-600';
                      const barColor = taxaPagamento >= 95 ? 'bg-emerald-500' : taxaPagamento >= 51 ? 'bg-amber-500' : 'bg-red-500';

                      return (
                        <tr key={item.dia} className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${index % 2 === 0 ? '' : 'bg-muted/5'}`}>
                          <td className="px-4 py-2"><span className="font-semibold text-sm">{item.dia}</span></td>
                          <td className="px-3 py-2 text-center"><span className="font-medium text-sm">{item.qtde.toLocaleString('pt-BR')}</span></td>
                          <td className="px-3 py-2 text-center"><span className="font-medium text-sm text-emerald-600">{item.pagos.toLocaleString('pt-BR')}</span></td>
                          <td className="px-3 py-2 text-center">
                            {item.abertos > 0
                              ? <span className="font-medium text-sm text-red-600">{item.abertos.toLocaleString('pt-BR')}</span>
                              : <span className="text-emerald-500 text-sm">✓</span>
                            }
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, taxaPagamento)}%` }} />
                              </div>
                              <span className={`text-[11px] font-bold tabular-nums w-10 text-right ${taxaColor}`}>{taxaPagamento.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Gráfico de Inadimplência - 3 linhas */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Inadimplência por Dia</CardTitle>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Legenda inline */}
              <div className="flex items-center gap-3">
                {[
                  { color: "#3b82f6", label: "Real" },
                  { color: "#10b981", label: "Referência", dash: true },
                  { color: "#f59e0b", label: "Histórico", dash: true },
                ].map(({ color, label, dash }) => (
                  <div key={label} className="flex items-center gap-1">
                    <svg width="16" height="8">
                      {dash
                        ? <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
                        : <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth="2" />
                      }
                    </svg>
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
              {!isPortalAccess && corretoraId && mesReferencia && (
                <Button variant="outline" size="sm" onClick={() => setConfigDialogOpen(true)} className="gap-1.5 h-7 text-xs">
                  <Settings className="h-3.5 w-3.5" />
                  Referência
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="relative">
            {showScrollIndicators.left && (
              <button onClick={() => handleScroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-card/90 border shadow-md rounded-full p-1.5">
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            {showScrollIndicators.right && (
              <button onClick={() => handleScroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-card/90 border shadow-md rounded-full p-1.5">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <div className="overflow-x-auto scrollbar-hide" ref={inadimplenciaScrollRef} onScroll={updateScrollIndicators}>
              <div style={{ minWidth: Math.max(700, inadimplenciaPorDiaMerged.length * 28) + 'px' }}>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={inadimplenciaPorDiaMerged} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                    <defs>
                      <linearGradient id="gradInadimplencia" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="diaLabel" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, 100]} width={36} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, fontSize: 11, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                      formatter={(v: any, name: string) => [formatPercent(Number(v)), name]}
                      labelFormatter={(label) => {
                        const d = inadimplenciaPorDiaMerged.find((x: any) => x.diaLabel === label);
                        return d ? `Dia ${label} · ${d.qtdeVencidos} ab. de ${d.qtdeEmitidos}` : `Dia ${label}`;
                      }}
                    />
                    <Area type="monotone" dataKey="inadimplenciaReal" stroke="#3b82f6" fill="url(#gradInadimplencia)" strokeWidth={2} name="Real" dot={false} connectNulls />
                    <Line type="monotone" dataKey="inadimplenciaReferencia" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 4" name="Referência" dot={false} connectNulls />
                    {inadimplenciaHistorico.size > 0 && (
                      <Line type="monotone" dataKey="inadimplenciaHistorico" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" name="Histórico" dot={false} connectNulls />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1">← Arraste para navegar →</p>
          </div>
        </CardContent>
      </Card>

      {/* Arrecadação Projetada x Recebida */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Arrecadação: Vencimentos vs Pagamentos</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto scrollbar-hide">
            <div style={{ minWidth: Math.max(600, (stats.arrecadacaoData?.length || 0) * 44) + 'px' }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.arrecadacaoData || []} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={2}>
                  <XAxis dataKey="diaLabel" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => v.replace('Dia ', '')} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={formatCompactCurrency} width={48} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, fontSize: 11, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    formatter={(v: any, name: string) => [formatCurrency(v), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="projetado" fill="hsl(var(--primary))" name="Vencimentos" radius={[3, 3, 0, 0]} fillOpacity={0.7} />
                  <Bar dataKey="recebido" fill="#22c55e" name="Recebido" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rankings de Inadimplência - modernos com barras de progresso */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Menor Inadimplência por Regional */}
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-sm font-semibold">Menor Inadimplência — Regional</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!stats.regionaisMenorInadimplencia?.length ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sem dados suficientes</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {stats.regionaisMenorInadimplencia.slice(0, 8).map((item: any, i: number) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, item.percentual)}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-emerald-600 tabular-nums w-12 text-right">{item.percentual.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Maior Inadimplência por Regional */}
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <CardTitle className="text-sm font-semibold">Maior Inadimplência — Regional</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!stats.regionaisMaiorInadimplencia?.length ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sem dados suficientes</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {stats.regionaisMaiorInadimplencia.slice(0, 8).map((item: any, i: number) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{item.abertos}/{item.total}</span>
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, item.percentual)}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-red-600 tabular-nums w-12 text-right">{item.percentual.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Menor Inadimplência por Cooperativa */}
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-sm font-semibold">Menor Inadimplência — Cooperativa</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!stats.cooperativasMenorInadimplencia?.length ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sem dados suficientes</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {stats.cooperativasMenorInadimplencia.slice(0, 8).map((item: any, i: number) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, item.percentual)}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-emerald-600 tabular-nums w-12 text-right">{item.percentual.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Maior Inadimplência por Cooperativa */}
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <CardTitle className="text-sm font-semibold">Maior Inadimplência — Cooperativa</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!stats.cooperativasMaiorInadimplencia?.length ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sem dados suficientes</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {stats.cooperativasMaiorInadimplencia.slice(0, 8).map((item: any, i: number) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{item.abertos}/{item.total}</span>
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, item.percentual)}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-red-600 tabular-nums w-12 text-right">{item.percentual.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rankings Regionais/Cooperativas: Pagos vs Abertos */}
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { title: "Regionais — Mais Pagos", data: stats.regionaisPagosData || [], isGreen: true },
          { title: "Regionais — Mais Abertos", data: stats.regionaisAbertosData || [], isGreen: false },
        ].map(({ title, data, isGreen }) => (
          <Card key={title} className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {data.slice(0, 10).map((item: any, i: number) => {
                  const maxVal = data[0]?.valor || 1;
                  const pct = (item.valor / maxVal) * 100;
                  return (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                      <span className="text-[10px] text-muted-foreground">{item.qtde} bol.</span>
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${isGreen ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums w-16 text-right ${isGreen ? 'text-emerald-600' : 'text-red-600'}`}>{formatCompactCurrency(item.valor)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {[
          { title: "Cooperativas — Mais Pagas", data: stats.cooperativasPagosData || [], isGreen: true },
          { title: "Cooperativas — Mais Abertas", data: stats.cooperativasAbertosData || [], isGreen: false },
        ].map(({ title, data, isGreen }) => (
          <Card key={title} className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {data.slice(0, 10).map((item: any, i: number) => {
                  const maxVal = data[0]?.valor || 1;
                  const pct = (item.valor / maxVal) * 100;
                  return (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                      <span className="text-[10px] text-muted-foreground">{item.qtde} bol.</span>
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${isGreen ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums w-16 text-right ${isGreen ? 'text-emerald-600' : 'text-red-600'}`}>{formatCompactCurrency(item.valor)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog de configuração */}
      {corretoraId && mesReferencia && (
        <InadimplenciaReferenciaConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          corretoraId={corretoraId}
          mesReferencia={mesReferencia}
          onSave={loadInadimplenciaConfig}
        />
      )}
    </div>
  );
}
