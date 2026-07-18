import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  FileSpreadsheet,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Search,
  Download,
  Check,
  X,
  Loader2,
  ChevronDown,
  Building2,
  Truck,
  Car,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// NOTE (escalabilidade): este relatório não recebe mais o array cru de
// lançamentos MGF. Os KPIs/gráficos vêm de uma chamada "leve" à RPC
// `calcular_relatorio_eventos_mgf` (sem busca, só os filtros globais) que
// só é refeita quando os filtros globais mudam — evitando recalcular tudo a
// cada tecla digitada na busca da tabela de detalhamento. A tabela de
// detalhamento (com busca + paginação de 20/página) chama a MESMA RPC de
// novo, agora com `p_search`/`p_page`, e usa `rows`/`totalCount`
// retornados. A busca é debounced em 300ms.
interface MGFRelatorioEventosProps {
  corretoraId: string;
  operacoes: string[] | null;
  subOperacoes: string[] | null;
  baseData?: string;
  situacao: string | null;
  cooperativa: string | null;
  regional: string | null;
  formaPagamento: string | null;
  tipoVeiculo: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  loading: boolean;
  refreshToken?: number;
}

const COLORS_RATEAVEL = ["#22c55e", "#f97316"]; // Verde para rateável, laranja para não rateável

const PAGE_SIZE = 20;
// Cap de exportação: nunca busca o dataset filtrado inteiro de uma vez.
const EXPORT_CAP = 20000;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
};

const formatFullCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const CustomTooltip = ({ active, payload, label, isCurrency = false }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {isCurrency ? formatFullCurrency(entry.value) : entry.value?.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const truncateText = (text: string, maxLength: number = 20) => {
  if (!text) return "-";
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
};

const KPI_SCAN_CAP = 20000;

// Agrega os KPIs e as séries dos gráficos a partir das linhas retornadas.
// Mantém exatamente o formato que os gráficos já consomem.
// deno-lint-ignore no-explicit-any
function agregarKpis(linhas: any[]) {
  const mapaSub = new Map<string, { rateavel: number; naoRateavel: number; countRateavel: number; countNaoRateavel: number }>();
  const mapaCoop = new Map<string, { rateavel: number; naoRateavel: number }>();
  const mapaMes = new Map<string, { rateavel: number; naoRateavel: number }>();
  const mapaForn = new Map<string, { rateavel: number; naoRateavel: number }>();
  const mapaVeic = new Map<string, { eventos: number; valor: number }>();

  let totalRateaveis = 0, totalNaoRateaveis = 0, valorRateaveis = 0, valorNaoRateaveis = 0;

  for (const l of linhas) {
    const valor = Number(l?.valor) || 0;
    const rateavel = !!l?.is_rateavel;
    if (rateavel) { totalRateaveis++; valorRateaveis += valor; }
    else { totalNaoRateaveis++; valorNaoRateaveis += valor; }

    const sub = (l?.sub_operacao || "").toString().trim() || "Sem subOperação";
    const s0 = mapaSub.get(sub) ?? { rateavel: 0, naoRateavel: 0, countRateavel: 0, countNaoRateavel: 0 };
    if (rateavel) { s0.rateavel += valor; s0.countRateavel++; } else { s0.naoRateavel += valor; s0.countNaoRateavel++; }
    mapaSub.set(sub, s0);

    const coop = (l?.cooperativa || "").toString().trim() || "Sem cooperativa";
    const c0 = mapaCoop.get(coop) ?? { rateavel: 0, naoRateavel: 0 };
    if (rateavel) c0.rateavel += valor; else c0.naoRateavel += valor;
    mapaCoop.set(coop, c0);

    const forn = (l?.fornecedor || l?.nome_fantasia_fornecedor || "").toString().trim() || "Sem fornecedor";
    const f0 = mapaForn.get(forn) ?? { rateavel: 0, naoRateavel: 0 };
    if (rateavel) f0.rateavel += valor; else f0.naoRateavel += valor;
    mapaForn.set(forn, f0);

    const veic = (l?.veiculo_evento || l?.placa || "").toString().trim().toUpperCase();
    if (veic) {
      const v0 = mapaVeic.get(veic) ?? { eventos: 0, valor: 0 };
      v0.eventos += 1;
      v0.valor += valor;
      mapaVeic.set(veic, v0);
    }

    const dataRef: string | null = l?.data_evento || l?.data_vencimento || null;
    const mes = dataRef ? String(dataRef).slice(0, 7) : null; // YYYY-MM
    if (mes) {
      const m0 = mapaMes.get(mes) ?? { rateavel: 0, naoRateavel: 0 };
      if (rateavel) m0.rateavel += valor; else m0.naoRateavel += valor;
      mapaMes.set(mes, m0);
    }
  }

  const top10 = (m: Map<string, any>) =>
    [...m.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (b.rateavel + b.naoRateavel) - (a.rateavel + a.naoRateavel))
      .slice(0, 10);

  return {
    totalEventos: linhas.length,
    totalRateaveis,
    totalNaoRateaveis,
    valorTotalEventos: valorRateaveis + valorNaoRateaveis,
    valorRateaveis,
    valorNaoRateaveis,
    subOperacaoData: top10(mapaSub),
    cooperativaData: top10(mapaCoop),
    fornecedorData: top10(mapaForn),
    veiculoData: [...mapaVeic.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.eventos - a.eventos)
      .slice(0, 10),
    evolucaoData: [...mapaMes.entries()]
      .map(([mes, v]) => ({ mes, ...v }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}

// Widget de gráfico: cabeçalho padronizado (ícone em quadradinho, título e
// um valor-resumo à direita) + área do gráfico com altura fixa. Mantém todos
// os cards visualmente iguais.
function ChartWidget({
  icon: Icon,
  title,
  subtitle,
  resumo,
  children,
  className,
}: {
  // deno-lint-ignore no-explicit-any
  icon: any;
  title: string;
  subtitle?: string;
  resumo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-2xl border-border/60 shadow-sm overflow-hidden", className)}>
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold truncate">{title}</CardTitle>
              {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
            </div>
          </div>
          {resumo && (
            <span className="text-xs font-semibold tabular-nums text-muted-foreground whitespace-nowrap">
              {resumo}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-4">
        <div className="h-[280px]">{children}</div>
      </CardContent>
    </Card>
  );
}

const EMPTY_KPI = {
  totalEventos: 0,
  totalRateaveis: 0,
  totalNaoRateaveis: 0,
  valorTotalEventos: 0,
  valorRateaveis: 0,
  valorNaoRateaveis: 0,
  subOperacaoData: [] as any[],
  cooperativaData: [] as any[],
  evolucaoData: [] as any[],
  fornecedorData: [] as any[],
  veiculoData: [] as any[],
};

// Quando o filtro múltiplo tem exatamente 1 item, repassa ele para as RPCs
// que só aceitam valor único; com 2+ seleções cai em "todas".
const unicoOuNulo = (arr?: string[] | null) => (arr && arr.length === 1 ? arr[0] : null);

export default function MGFRelatorioEventos({
  corretoraId, operacoes, subOperacoes, baseData, situacao, cooperativa, regional, formaPagamento, tipoVeiculo,
  dataInicio, dataFim, loading, refreshToken,
}: MGFRelatorioEventosProps) {
  // Detalhamento começa recolhido: a lista é longa (milhares de linhas) e
  // os gráficos/KPIs é que devem aparecer primeiro.
  const [detalhesAberto, setDetalhesAberto] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [kpiData, setKpiData] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(true);

  const [rows, setRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [tableLoading, setTableLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const kpiFetchIdRef = useRef(0);
  const tableFetchIdRef = useRef(0);

  // Debounce da busca (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // KPIs/gráficos — chamada "leve" (sem busca), só depende dos filtros globais.
  useEffect(() => {
    if (!corretoraId) {
      setKpiData(null);
      setKpiLoading(false);
      return;
    }
    const myId = ++kpiFetchIdRef.current;
    setKpiLoading(true);
    (async () => {
      try {
        // Os KPIs/gráficos são calculados AQUI, a partir das próprias linhas.
        // Antes dependiam de campos agregados que a RPC não devolve (vinham
        // zerados, deixando todos os gráficos vazios). Buscamos o conjunto
        // filtrado (com teto) e agregamos no cliente — mesma fonte da tabela,
        // então os números sempre batem.
        const { data, error } = await supabase.rpc("calcular_relatorio_eventos_mgf", {
          p_corretora_id: corretoraId,
          p_operacao: unicoOuNulo(operacoes),
          p_sub_operacao: unicoOuNulo(subOperacoes),
          p_situacao: situacao,
          p_cooperativa: cooperativa,
          p_regional: regional,
          p_forma_pagamento: formaPagamento,
          p_tipo_veiculo: tipoVeiculo,
          p_data_inicio: dataInicio,
          p_data_fim: dataFim,
          p_page: 1,
          p_page_size: KPI_SCAN_CAP,
        } as any);
        if (myId !== kpiFetchIdRef.current) return;
        if (error) throw error;
        setKpiData(agregarKpis(((data as any)?.rows ?? []) as any[]));
      } catch (error) {
        console.error("Erro ao calcular relatório de eventos MGF:", error);
        if (myId === kpiFetchIdRef.current) setKpiData(null);
      } finally {
        if (myId === kpiFetchIdRef.current) setKpiLoading(false);
      }
    })();
  }, [corretoraId, operacoes?.join(","), subOperacoes?.join(","), baseData, situacao, cooperativa, regional, formaPagamento, tipoVeiculo, dataInicio, dataFim, refreshToken]);

  // Tabela de detalhamento — chamada com busca + paginação.
  useEffect(() => {
    if (!corretoraId) {
      setRows([]);
      setTotalCount(0);
      setTableLoading(false);
      return;
    }
    const myId = ++tableFetchIdRef.current;
    setTableLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("calcular_relatorio_eventos_mgf", {
          p_corretora_id: corretoraId,
          // calcular_relatorio_eventos_mgf só aceita valor único — com 2+
          // seleções cai em "todas" (mesmo critério da outra chamada abaixo).
          p_operacao: unicoOuNulo(operacoes),
          p_sub_operacao: unicoOuNulo(subOperacoes),
          p_situacao: situacao,
          p_cooperativa: cooperativa,
          p_regional: regional,
          p_forma_pagamento: formaPagamento,
          p_tipo_veiculo: tipoVeiculo,
          p_data_inicio: dataInicio,
          p_data_fim: dataFim,
          p_search: debouncedSearch.trim() || null,
          p_page: page,
          p_page_size: PAGE_SIZE,
        } as any);
        if (myId !== tableFetchIdRef.current) return;
        if (error) throw error;
        const result = (data as any) || {};
        setRows(result.rows || []);
        setTotalCount(result.totalCount || 0);
      } catch (error) {
        console.error("Erro ao carregar detalhamento de eventos MGF:", error);
        if (myId === tableFetchIdRef.current) {
          toast.error("Erro ao carregar a tabela de eventos. Tente novamente.");
        }
      } finally {
        if (myId === tableFetchIdRef.current) setTableLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corretoraId, operacoes?.join(","), subOperacoes?.join(","), baseData, situacao, cooperativa, regional, formaPagamento, tipoVeiculo, dataInicio, dataFim, debouncedSearch, page, refreshToken]);

  // Reset de página quando filtros/busca mudam
  useEffect(() => {
    setPage(1);
  }, [corretoraId, operacoes?.join(","), subOperacoes?.join(","), baseData, situacao, cooperativa, regional, formaPagamento, tipoVeiculo, dataInicio, dataFim, debouncedSearch, refreshToken]);

  const kpi = kpiData || EMPTY_KPI;

  const percentualRateaveis = kpi.totalEventos > 0 ? (kpi.totalRateaveis / kpi.totalEventos) * 100 : 0;
  const percentualValorRateaveis = kpi.valorTotalEventos > 0 ? (kpi.valorRateaveis / kpi.valorTotalEventos) * 100 : 0;

  const pieData = useMemo(
    () => [
      { name: "Rateáveis", value: kpi.valorRateaveis, count: kpi.totalRateaveis },
      { name: "Não Rateáveis", value: kpi.valorNaoRateaveis, count: kpi.totalNaoRateaveis },
    ],
    [kpi.valorRateaveis, kpi.valorNaoRateaveis, kpi.totalRateaveis, kpi.totalNaoRateaveis],
  );

  // A RPC retorna o nome completo em subOperacaoData/cooperativaData — o
  // truncamento pra exibição continua sendo feito no cliente, igual antes.
  const subOperacaoData = useMemo(
    () =>
      (kpi.subOperacaoData || []).map((d: any) => ({
        fullName: d.name,
        name: truncateText(d.name, 25),
        rateavel: d.rateavel,
        naoRateavel: d.naoRateavel,
        countRateavel: d.countRateavel,
        countNaoRateavel: d.countNaoRateavel,
      })),
    [kpi.subOperacaoData],
  );

  const cooperativaData = useMemo(
    () =>
      (kpi.cooperativaData || []).map((d: any) => ({
        fullName: d.name,
        name: truncateText(d.name, 20),
        rateavel: d.rateavel,
        naoRateavel: d.naoRateavel,
      })),
    [kpi.cooperativaData],
  );

  const fornecedorData = useMemo(
    () =>
      (kpi.fornecedorData || []).map((d: any) => ({
        fullName: d.name,
        name: truncateText(d.name, 22),
        rateavel: d.rateavel,
        naoRateavel: d.naoRateavel,
      })),
    [kpi.fornecedorData],
  );

  const veiculoData = useMemo(
    () =>
      (kpi.veiculoData || []).map((d: any) => ({
        fullName: d.name,
        name: d.name,
        eventos: d.eventos,
        valor: d.valor,
      })),
    [kpi.veiculoData],
  );

  const evolucaoData = useMemo(
    () =>
      (kpi.evolucaoData || []).map((d: any) => ({
        ...d,
        mesLabel: d.mes.split("-").reverse().join("/"),
      })),
    [kpi.evolucaoData],
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Exportar para Excel — busca até EXPORT_CAP linhas (sem busca) com os
  // mesmos filtros globais ativos, em vez de exportar um array em memória.
  const handleExportExcel = async () => {
    if (!corretoraId) return;
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("calcular_relatorio_eventos_mgf", {
        p_corretora_id: corretoraId,
        p_operacao: unicoOuNulo(operacoes),
        p_sub_operacao: unicoOuNulo(subOperacoes),
        p_situacao: situacao,
        p_cooperativa: cooperativa,
        p_regional: regional,
        p_forma_pagamento: formaPagamento,
        p_tipo_veiculo: tipoVeiculo,
        p_data_inicio: dataInicio,
        p_data_fim: dataFim,
        p_page: 1,
        p_page_size: EXPORT_CAP,
      } as any);
      if (error) throw error;
      const result = (data as any) || {};
      const exportRows = result.rows || [];
      const exportTotal = result.totalCount || 0;

      if (exportTotal > EXPORT_CAP) {
        toast.warning(
          `Exportação limitada aos primeiros ${EXPORT_CAP.toLocaleString('pt-BR')} de ${exportTotal.toLocaleString('pt-BR')} eventos filtrados. Refine os filtros para exportar um subconjunto menor.`
        );
      }

      const exportData = exportRows.map((item: any) => ({
        "SubOperação": item.sub_operacao || "",
        "Descrição": item.descricao || "",
        "Veículo Evento": item.veiculo_evento || "",
        "Fornecedor": item.fornecedor || "",
        "Cooperativa": item.cooperativa || "",
        "Valor": item.valor || 0,
        "Rateável": item.is_rateavel ? "Sim" : "Não",
        "Data Evento": item.data_evento || "",
        "Protocolo": item.protocolo_evento || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Eventos");
      XLSX.writeFile(wb, `relatorio_eventos_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error("Erro ao exportar relatório de eventos MGF:", error);
      toast.error("Erro ao exportar os dados. Tente novamente.");
    } finally {
      setExporting(false);
    }
  };

  if (loading || (kpiLoading && !kpiData)) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!corretoraId) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum dado disponível para o relatório de eventos.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs — padrão widget */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><FileSpreadsheet className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total de Eventos</p>
              <p className="text-xl font-bold leading-tight">{kpi.totalEventos.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground truncate">{formatCurrency(kpi.valorTotalEventos)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0"><Check className="h-5 w-5 text-emerald-600" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Eventos Rateáveis</p>
              <p className="text-xl font-bold text-emerald-600 leading-tight">{kpi.totalRateaveis.toLocaleString()}</p>
              <p className="text-[11px] text-emerald-600/80 truncate">{formatCurrency(kpi.valorRateaveis)} · {percentualRateaveis.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0"><X className="h-5 w-5 text-orange-600" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Não Rateáveis</p>
              <p className="text-xl font-bold text-orange-600 leading-tight">{kpi.totalNaoRateaveis.toLocaleString()}</p>
              <p className="text-[11px] text-orange-600/80 truncate">{formatCurrency(kpi.valorNaoRateaveis)} · {(100 - percentualRateaveis).toFixed(1)}%</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0"><TrendingUp className="h-5 w-5 text-blue-600" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">% Valor Rateável</p>
              <p className="text-xl font-bold text-blue-600 leading-tight">{percentualValorRateaveis.toFixed(1)}%</p>
              <p className="text-[11px] text-muted-foreground truncate">do valor total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos — widgets padronizados */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartWidget
          icon={DollarSign}
          title="Distribuição de Valores"
          subtitle="Rateáveis x Não rateáveis"
          resumo={formatFullCurrency(kpi.valorTotalEventos)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={96}
                paddingAngle={4}
                dataKey="value"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS_RATEAVEL[index % COLORS_RATEAVEL.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip isCurrency />} />
              <Legend verticalAlign="bottom" height={24} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </ChartWidget>

        <ChartWidget
          icon={TrendingUp}
          title="Evolução Mensal"
          subtitle="Valor por mês do evento"
          resumo={`${evolucaoData.length} meses`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={evolucaoData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="mesLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={64} />
              <Tooltip content={<CustomTooltip isCurrency />} />
              <Legend verticalAlign="bottom" height={24} iconType="circle" />
              <Bar dataKey="rateavel" name="Rateáveis" fill="#22c55e" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="naoRateavel" name="Não Rateáveis" fill="#f97316" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartWidget>

        <ChartWidget
          icon={FileSpreadsheet}
          title="Por SubOperação"
          subtitle="Top 10 por valor"
          resumo={`${subOperacaoData.length} itens`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={subOperacaoData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip isCurrency />} />
              <Legend verticalAlign="bottom" height={24} iconType="circle" />
              <Bar dataKey="rateavel" name="Rateáveis" fill="#22c55e" stackId="a" radius={[0, 4, 4, 0]} maxBarSize={18} />
              <Bar dataKey="naoRateavel" name="Não Rateáveis" fill="#f97316" stackId="a" radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartWidget>

        {cooperativaData.length > 0 && (
          <ChartWidget icon={Building2} title="Por Cooperativa" subtitle="Top 10 por valor" resumo={`${cooperativaData.length} itens`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cooperativaData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip isCurrency />} />
                <Legend verticalAlign="bottom" height={24} iconType="circle" />
                <Bar dataKey="rateavel" name="Rateáveis" fill="#22c55e" stackId="a" radius={[0, 4, 4, 0]} maxBarSize={18} />
                <Bar dataKey="naoRateavel" name="Não Rateáveis" fill="#f97316" stackId="a" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartWidget>
        )}

        {/* NOVO: fornecedores que mais pesam no custo de eventos */}
        {fornecedorData.length > 0 && (
          <ChartWidget icon={Truck} title="Por Fornecedor" subtitle="Top 10 por valor" resumo={`${fornecedorData.length} itens`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fornecedorData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip isCurrency />} />
                <Legend verticalAlign="bottom" height={24} iconType="circle" />
                <Bar dataKey="rateavel" name="Rateáveis" fill="#22c55e" stackId="a" radius={[0, 4, 4, 0]} maxBarSize={18} />
                <Bar dataKey="naoRateavel" name="Não Rateáveis" fill="#f97316" stackId="a" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartWidget>
        )}

        {/* NOVO: veículos com mais eventos (reincidência) */}
        {veiculoData.length > 0 && (
          <ChartWidget icon={Car} title="Veículos com mais eventos" subtitle="Top 10 por quantidade" resumo={`${veiculoData.length} placas`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={veiculoData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: any, n: any) => (n === "eventos" ? [`${v} evento(s)`, "Eventos"] : [v, n])}
                />
                <Bar dataKey="eventos" name="Eventos" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartWidget>
        )}
      </div>

      {/* Tabela de Detalhes — recolhível */}
      <Collapsible open={detalhesAberto} onOpenChange={setDetalhesAberto}>
      <Card className="rounded-2xl border-border/40">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-2 text-left group">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <CardTitle className="flex items-center gap-2">
                  Detalhamento de Eventos ({totalCount.toLocaleString()} registros)
                </CardTitle>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    detalhesAberto && "rotate-180",
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SubOperação</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Cooperativa</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Rateável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableLoading ? (
                  [...Array(6)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum evento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((item, idx) => (
                    <TableRow key={item.id || idx}>
                      <TableCell className="max-w-[200px] truncate" title={item.sub_operacao}>
                        {truncateText(item.sub_operacao || "-", 30)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={item.descricao}>
                        {truncateText(item.descricao || "-", 30)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {item.veiculo_evento || "-"}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={item.fornecedor}>
                        {truncateText(item.fornecedor || "-", 20)}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={item.cooperativa}>
                        {truncateText(item.cooperativa || "-", 20)}
                      </TableCell>
                      <TableCell className="text-right text-blue-600 font-medium">
                        {formatFullCurrency(item.valor || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.is_rateavel ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-200">Sim</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-200">Não</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || tableLoading}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || tableLoading}
                >
                  Próximo
                </Button>
              </div>
            </div>
          )}
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>
    </div>
  );
}
