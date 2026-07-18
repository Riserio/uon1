import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Upload,
  Database,
  BarChart3,
  History,
  Filter,
  X,
  Calendar,
  MapPin,
  CreditCard,
  FileSpreadsheet,
  LogOut,
  Building2,
  Activity,
  DollarSign,
  TrendingUp,
  ArrowLeftRight,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import MGFDashboard from "@/components/mgf/MGFDashboard";
import MGFImportacao from "@/components/mgf/MGFImportacao";
import MGFTabela from "@/components/mgf/MGFTabela";
import MGFRelatorioEventos from "@/components/mgf/MGFRelatorioEventos";
import { BIAuditLogDialog } from "@/components/BIAuditLogDialog";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MultiSelectFilter from "@/components/mgf/MultiSelectFilter";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import PortalHeader from "@/components/portal/PortalHeader";
import BIPageHeader from "@/components/bi/BIPageHeader";
import { getCachedAssociacoes, setCachedAssociacoes } from "@/hooks/useBIGlobalCache";
import PortalPageWrapper from "@/components/portal/PortalPageWrapper";
import { PortalCarouselProvider } from "@/contexts/PortalCarouselContext";
import { useBILayoutOptional } from "@/contexts/BILayoutContext";
import { usePortalLayoutOptional } from "@/contexts/PortalLayoutContext";

export interface MGFFilters {
  operacoes: string[];
  subOperacoes: string[];
  situacao: string;
  // Base de data do filtro de período: 'vencimento' (previsão) ou
  // 'pagamento' (movimentação efetivamente realizada, como no relatório MGF).
  baseData: "vencimento" | "pagamento";
  cooperativa: string;
  regional: string;
  formaPagamento: string;
  tipoVeiculo: string;
  dateRange: DateRange | undefined;
}

interface MGFFilterOptions {
  operacoes: string[];
  subOperacoes: string[];
  situacoes: string[];
  cooperativas: string[];
  regionais: string[];
  formasPagamento: string[];
  tiposVeiculo: string[];
  fornecedores: string[];
  centrosCusto: string[];
}

const EMPTY_FILTER_OPTIONS: MGFFilterOptions = {
  operacoes: [],
  subOperacoes: [],
  situacoes: [],
  cooperativas: [],
  regionais: [],
  formasPagamento: [],
  tiposVeiculo: [],
  fornecedores: [],
  centrosCusto: [],
};

// Converte um valor de dropdown ("all" = sem filtro) para o formato aceito
// pelas RPCs (string ou null).
const toRpcValue = (v: string) => (v && v !== "all" ? v : null);
const dateToRpcValue = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : null);

export default function MGFInsights() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { userRole } = useAuth();
  const biLayout = useBILayoutOptional();
  const portalLayout = usePortalLayoutOptional();

  // Detectar se é acesso via portal (parceiro)
  const isPortalAccess = location.pathname.startsWith("/portal");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [colunas, setColunas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState<MGFFilterOptions>(EMPTY_FILTER_OPTIONS);
  // Incrementado após uma importação bem sucedida, para forçar os
  // componentes filhos (Tabela/Rateio Eventos) a refazer suas buscas via RPC.
  const [refreshToken, setRefreshToken] = useState(0);

  // Associações e permissões
  const [associacoes, setAssociacoes] = useState<any[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState<string>("");
  const [loadingAssociacoes, setLoadingAssociacoes] = useState(true);
  const [modulosBi, setModulosBi] = useState<string[]>(["indicadores", "eventos", "mgf", "cobranca"]);
  const [corretoraData, setCorretoraData] = useState<{ id: string; nome: string; logo_url?: string | null } | null>(
    null,
  );
  const [multipleAssociacoes, setMultipleAssociacoes] = useState(false);

  const [filters, setFilters] = useState<MGFFilters>({
    operacoes: [],
    subOperacoes: [],
    situacao: "all",
    baseData: "vencimento",
    cooperativa: "all",
    regional: "all",
    formaPagamento: "all",
    tipoVeiculo: "all",
    // Sem período padrão — abre mostrando TODOS os lançamentos, sem cortar
    // em "últimos 12 meses" (antes: { from: subMonths(new Date(), 12), to: new Date() }).
    dateRange: undefined,
  });

  // Verifica se pode ver histórico (superintendente ou admin)
  const canViewHistorico = userRole === "superintendente" || userRole === "admin";

  // Sync from shared BILayout context when available (internal access)
  useEffect(() => {
    if (biLayout && !isPortalAccess) {
      setSelectedAssociacao(biLayout.selectedAssociacao);
      setAssociacoes(biLayout.associacoes);
      setLoadingAssociacoes(false);
    }
  }, [biLayout?.selectedAssociacao, biLayout?.associacoes, isPortalAccess]);

  // Carregar associações (only for portal access)
  useEffect(() => {
    if (biLayout && !isPortalAccess) return;

    // Portal access: use corretora from portal context directly
    if (isPortalAccess && portalLayout?.corretora) {
      const c = portalLayout.corretora;
      setAssociacoes([{ id: c.id, nome: c.nome }]);
      setSelectedAssociacao(c.id);
      setCorretoraData({ id: c.id, nome: c.nome, logo_url: c.logo_url });
      setModulosBi(c.modulos_bi || ["indicadores", "eventos", "mgf", "cobranca", "estudo-base"]);
      setMultipleAssociacoes(portalLayout.corretorasDisponiveis.length > 1);
      setLoadingAssociacoes(false);
      return;
    }

    async function fetchAssociacoes() {
      try {
        const associacaoParam = searchParams.get("associacao");

        if (isPortalAccess && associacaoParam) {
          let { data: corretora } = await supabase
            .from("corretoras")
            .select("id, nome, logo_url")
            .eq("id", associacaoParam)
            .maybeSingle();

          if (!corretora) {
            const slugResult = await supabase
              .from("corretoras")
              .select("id, nome, logo_url")
              .eq("slug", associacaoParam)
              .maybeSingle();
            corretora = slugResult.data;
          }

          if (corretora) {
            setAssociacoes([{ id: corretora.id, nome: corretora.nome }]);
            setSelectedAssociacao(corretora.id);
            setCorretoraData(corretora);
            setLoadingAssociacoes(false);
            return;
          }
        }

        const associacaoParamFallback = searchParams.get("associacao");
        const cached = getCachedAssociacoes();
        if (cached && cached.length > 0 && !associacoes.length) {
          setAssociacoes(cached);
          if (associacaoParamFallback && cached.some((c) => c.id === associacaoParamFallback)) {
            setSelectedAssociacao(associacaoParamFallback);
          } else if (!selectedAssociacao) {
            setSelectedAssociacao(cached[0].id);
          }
          setLoadingAssociacoes(false);
        }

        const { data, error } = await supabase.from("corretoras").select("id, nome").order("nome");

        if (error) throw error;
        setAssociacoes(data || []);
        setCachedAssociacoes(data || []);

        if (!cached || cached.length === 0) {
          if (associacaoParamFallback && data?.some((c) => c.id === associacaoParamFallback)) {
            setSelectedAssociacao(associacaoParamFallback);
          } else if (data && data.length > 0) {
            setSelectedAssociacao(data[0].id);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar associações:", error);
        if (!isPortalAccess) toast.error("Erro ao carregar associações");
      } finally {
        setLoadingAssociacoes(false);
      }
    }

    fetchAssociacoes();
  }, [searchParams, isPortalAccess, biLayout, portalLayout?.corretora?.id]);

  // Metadados da importação ativa (nome do arquivo, colunas detectadas).
  // IMPORTANTE: pode existir mais de uma importação "ativa" simultânea para
  // a mesma corretora — ex.: um upload manual de Excel (snapshot histórico
  // já liquidado) e uma importação incremental via API (dados recentes, em
  // aberto). Aqui só buscamos metadado (não os dados em si, que agora vêm
  // agregados do banco via RPC); a soma de total_registros continua sendo
  // feita no cliente por ser só um número informativo no header.
  const fetchImportacaoMeta = useCallback(async () => {
    if (!selectedAssociacao) {
      setImportacaoAtiva(null);
      setColunas([]);
      return;
    }
    try {
      const { data: importacoes, error } = await supabase
        .from("mgf_importacoes")
        .select("id, nome_arquivo, colunas_detectadas, total_registros, created_at")
        .eq("ativo", true)
        .eq("corretora_id", selectedAssociacao)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (importacoes && importacoes.length > 0) {
        const importacaoMaisRecente = importacoes[0];
        setImportacaoAtiva({
          ...importacaoMaisRecente,
          total_registros: importacoes.reduce((acc, i) => acc + (i.total_registros || 0), 0),
        });
        setColunas(
          Array.isArray(importacaoMaisRecente.colunas_detectadas)
            ? (importacaoMaisRecente.colunas_detectadas as string[])
            : [],
        );
      } else {
        setImportacaoAtiva(null);
        setColunas([]);
      }
    } catch (error) {
      console.error("Erro ao buscar importação MGF:", error);
    }
  }, [selectedAssociacao]);

  // Opções dos dropdowns de filtro — agregadas no banco (get_mgf_filter_options),
  // em vez de derivadas do array completo de dados no cliente.
  const fetchFilterOptions = useCallback(async () => {
    if (!selectedAssociacao) {
      setFilterOptions(EMPTY_FILTER_OPTIONS);
      return;
    }
    try {
      const { data, error } = await supabase.rpc("get_mgf_filter_options", {
        p_corretora_id: selectedAssociacao,
      } as any);
      if (error) throw error;
      const opts = (data as any) || {};
      setFilterOptions({
        operacoes: [...(opts.operacoes || [])].sort(),
        subOperacoes: [...(opts.subOperacoes || [])].sort(),
        situacoes: [...(opts.situacoes || [])].sort(),
        cooperativas: [...(opts.cooperativas || [])].sort(),
        regionais: [...(opts.regionais || [])].sort(),
        formasPagamento: [...(opts.formasPagamento || [])].sort(),
        tiposVeiculo: [...(opts.tiposVeiculo || [])].sort(),
        fornecedores: [...(opts.fornecedores || [])].sort(),
        centrosCusto: [...(opts.centrosCusto || [])].sort(),
      });
    } catch (error) {
      console.error("Erro ao buscar opções de filtro MGF:", error);
    }
  }, [selectedAssociacao]);

  // Dashboard agregado no banco (RPC cacheada por até 20min). Substitui a
  // antiga busca paginada de até 100.000 linhas + agregação em JS.
  const fetchDashboard = useCallback(
    async (forceRefresh = false) => {
      if (!selectedAssociacao) {
        setDashboardStats(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("get_dashboard_mgf_cached", {
          p_corretora_id: selectedAssociacao,
          p_operacoes: filters.operacoes.length > 0 ? filters.operacoes : null,
          p_sub_operacoes: filters.subOperacoes.length > 0 ? filters.subOperacoes : null,
          p_situacao: toRpcValue(filters.situacao),
          p_cooperativa: toRpcValue(filters.cooperativa),
          p_regional: toRpcValue(filters.regional),
          p_forma_pagamento: toRpcValue(filters.formaPagamento),
          p_tipo_veiculo: toRpcValue(filters.tipoVeiculo),
          p_data_inicio: dateToRpcValue(filters.dateRange?.from),
          p_data_fim: dateToRpcValue(filters.dateRange?.to),
          p_base_data: filters.baseData,
          p_force_refresh: forceRefresh,
        } as any);

        if (error) throw error;
        setDashboardStats(data);
      } catch (error) {
        console.error("Erro ao buscar dashboard MGF:", error);
        toast.error("Erro ao carregar os dados do dashboard MGF");
        setDashboardStats(null);
      } finally {
        setLoading(false);
      }
    },
    [selectedAssociacao, filters],
  );

  // Metadados + opções de filtro: dependem só da associação selecionada.
  useEffect(() => {
    if (selectedAssociacao) {
      fetchImportacaoMeta();
      fetchFilterOptions();
    } else {
      setImportacaoAtiva(null);
      setColunas([]);
      setFilterOptions(EMPTY_FILTER_OPTIONS);
    }
  }, [selectedAssociacao, fetchImportacaoMeta, fetchFilterOptions]);

  // Dashboard: depende da associação selecionada E dos filtros globais.
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleImportSuccess = async () => {
    await Promise.all([fetchImportacaoMeta(), fetchFilterOptions()]);
    await fetchDashboard(true);
    setRefreshToken((t) => t + 1);
  };

  // Contar filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.operacoes.length > 0) count++;
    if (filters.subOperacoes.length > 0) count++;
    if (filters.situacao !== "all") count++;
    if (filters.cooperativa !== "all") count++;
    if (filters.regional !== "all") count++;
    if (filters.formaPagamento !== "all") count++;
    if (filters.tipoVeiculo !== "all") count++;
    if (filters.dateRange?.from) count++;
    return count;
  }, [filters]);

  const clearFilters = () => {
    setFilters({
      operacoes: [],
      subOperacoes: [],
      situacao: "all",
      baseData: "vencimento",
      cooperativa: "all",
      regional: "all",
      formaPagamento: "all",
      tipoVeiculo: "all",
      dateRange: undefined,
    });
  };

  const selectedAssociacaoNome = associacoes.find((a) => a.id === selectedAssociacao)?.nome || "";

  const recordCount = dashboardStats?.totalRegistros ?? 0;

  // Update shared header dynamic props
  useEffect(() => {
    if (biLayout && !isPortalAccess) {
      biLayout.setHeaderDynamic({
        modulo: 'mgf',
        recordCount,
        fileName: importacaoAtiva?.nome_arquivo,
      });
    }
  }, [recordCount, importacaoAtiva?.nome_arquivo, biLayout, isPortalAccess]);

  // Tabs - esconder importação para parceiros
  const tabs = isPortalAccess
    ? [
        { id: "dashboard", label: "Dashboard", icon: BarChart3 },
        { id: "eventos", label: "Rateio Eventos", icon: FileSpreadsheet },
        { id: "tabela", label: "Dados Completos", icon: Database },
      ]
    : [
        { id: "dashboard", label: "Dashboard", icon: BarChart3 },
        { id: "eventos", label: "Rateio Eventos", icon: FileSpreadsheet },
        { id: "tabela", label: "Dados Completos", icon: Database },
        { id: "importar", label: "Importar Dados", icon: Upload },
      ];

  const handlePortalLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const handleChangeAssociacao = () => {
    navigate("/portal", { replace: true });
  };

  // Montar lista de módulos disponíveis para o carrossel
  const availableModules: ("indicadores" | "eventos" | "mgf" | "cobranca" | "estudo-base")[] = [
    ...(modulosBi.includes("indicadores") ? (["indicadores"] as const) : []),
    ...(modulosBi.includes("eventos") ? (["eventos"] as const) : []),
    ...(modulosBi.includes("mgf") ? (["mgf"] as const) : []),
    ...(modulosBi.includes("cobranca") ? (["cobranca"] as const) : []),
    ...(modulosBi.includes("estudo-base") ? (["estudo-base"] as const) : []),
  ];

  // Filtros globais já normalizados para RPC (null quando "all"/vazio),
  // repassados para os componentes filhos.
  const rpcOperacoes = filters.operacoes.length > 0 ? filters.operacoes : null;
  const rpcSubOperacoes = filters.subOperacoes.length > 0 ? filters.subOperacoes : null;
  const rpcSituacao = toRpcValue(filters.situacao);
  const rpcCooperativa = toRpcValue(filters.cooperativa);
  const rpcRegional = toRpcValue(filters.regional);
  const rpcFormaPagamento = toRpcValue(filters.formaPagamento);
  const rpcTipoVeiculo = toRpcValue(filters.tipoVeiculo);
  const rpcDataInicio = dateToRpcValue(filters.dateRange?.from);
  const rpcDataFim = dateToRpcValue(filters.dateRange?.to);

  const portalContent = (
    <>
      {/* Portal Header - only when NOT inside PortalLayout */}
      {isPortalAccess && corretoraData && !portalLayout && (
        <PortalHeader
          corretora={{
            id: corretoraData.id,
            nome: corretoraData.nome,
            logo_url: corretoraData.logo_url,
            modulos_bi: modulosBi,
          }}
          showChangeButton={multipleAssociacoes}
          onChangeCorretora={handleChangeAssociacao}
          onLogout={handlePortalLogout}
          currentModule="mgf"
          showCarouselControls={true}
        />
      )}

      {/* Header interno - only when NOT inside BILayout */}
      {!isPortalAccess && !biLayout && (
        <BIPageHeader
          title="MGF"
          subtitle="Business Intelligence de Dados MGF"
          associacoes={associacoes}
          selectedAssociacao={selectedAssociacao}
          onAssociacaoChange={setSelectedAssociacao}
          loadingAssociacoes={loadingAssociacoes}
          currentModule="mgf"
          showHistorico={canViewHistorico}
          onHistoricoClick={() => setHistoricoDialogOpen(true)}
          recordCount={recordCount}
          fileName={importacaoAtiva?.nome_arquivo}
        />
      )}

      {/* Filtros Globais (estilo SGA) */}
      {!!importacaoAtiva && (
        <div className="container mx-auto px-4 pt-4">
          <Card className="border-orange-500/20 bg-card/50 backdrop-blur">
            <CardContent className="p-0">
              {/* Header clicável */}
              <button
                onClick={() => setFiltersOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-orange-500" />
                  <span className="font-semibold text-sm">Filtros</span>
                  {activeFiltersCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {activeFiltersCount} ativo{activeFiltersCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {!filtersOpen && activeFiltersCount > 0 && (
                    <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                      {[
                        filters.operacoes.length > 0 && filters.operacoes.join(", "),
                        filters.situacao !== "all" && filters.situacao,
                        filters.regional !== "all" && filters.regional,
                        filters.cooperativa !== "all" && filters.cooperativa,
                        filters.dateRange?.from && format(filters.dateRange.from, "dd/MM/yy", { locale: ptBR }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {activeFiltersCount > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearFilters();
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted/50"
                    >
                      Limpar
                    </button>
                  )}
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>
              {filtersOpen && (
                <div className="px-4 pb-4 pt-1">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
                    {/* Operação — múltipla (Entrada e Saída juntas) */}
                    <MultiSelectFilter
                      allLabel="Todas Operações"
                      options={filterOptions.operacoes}
                      selected={filters.operacoes}
                      onChange={(v) => setFilters((f) => ({ ...f, operacoes: v }))}
                      className="w-full"
                    />

                    {/* SubOperação — múltipla (pedido do dossiê) */}
                    <MultiSelectFilter
                      allLabel="Todas SubOp."
                      options={filterOptions.subOperacoes}
                      selected={filters.subOperacoes}
                      onChange={(v) => setFilters((f) => ({ ...f, subOperacoes: v }))}
                      className="w-full"
                    />

                    {/* Situação */}
                    <Select value={filters.situacao} onValueChange={(v) => setFilters((f) => ({ ...f, situacao: v }))}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Situação" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Situações</SelectItem>
                        {filterOptions.situacoes.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Base de data do período: alinha o BI ao relatório do MGF.
                        "Pagamento" = movimentação efetivamente realizada;
                        "Vencimento" = previsão (lançamentos por vencimento). */}
                    <Select
                      value={filters.baseData}
                      onValueChange={(v) =>
                        setFilters((f) => ({ ...f, baseData: v as "vencimento" | "pagamento" }))
                      }
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Base da data" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vencimento">Data de Vencimento</SelectItem>
                        <SelectItem value="pagamento">Data de Pagamento</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Cooperativa */}
                    <Select
                      value={filters.cooperativa}
                      onValueChange={(v) => setFilters((f) => ({ ...f, cooperativa: v }))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Cooperativa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Cooperativas</SelectItem>
                        {filterOptions.cooperativas.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Regional */}
                    <Select value={filters.regional} onValueChange={(v) => setFilters((f) => ({ ...f, regional: v }))}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Regional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Regionais</SelectItem>
                        {filterOptions.regionais.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Forma Pagamento */}
                    <Select
                      value={filters.formaPagamento}
                      onValueChange={(v) => setFilters((f) => ({ ...f, formaPagamento: v }))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Forma Pgto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Formas</SelectItem>
                        {filterOptions.formasPagamento.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Tipo Veículo */}
                    <Select
                      value={filters.tipoVeiculo}
                      onValueChange={(v) => setFilters((f) => ({ ...f, tipoVeiculo: v }))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Tipo Veículo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos Tipos</SelectItem>
                        {filterOptions.tiposVeiculo.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Período */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 text-xs justify-start gap-1 px-2">
                          <Calendar className="h-3 w-3" />
                          {filters.dateRange?.from ? (
                            filters.dateRange.to ? (
                              <span className="truncate">
                                {format(filters.dateRange.from, "dd/MM", { locale: ptBR })} -{" "}
                                {format(filters.dateRange.to, "dd/MM", { locale: ptBR })}
                              </span>
                            ) : (
                              format(filters.dateRange.from, "dd/MM/yy", { locale: ptBR })
                            )
                          ) : (
                            "Período"
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          initialFocus
                          mode="range"
                          defaultMonth={filters.dateRange?.from}
                          selected={filters.dateRange}
                          onSelect={(range) => setFilters((f) => ({ ...f, dateRange: range }))}
                          numberOfMonths={2}
                          locale={ptBR}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="w-full overflow-x-auto pb-2 -mx-1 px-1">
            <TabsList className="inline-flex md:flex md:w-full max-w-xl mx-auto gap-1 p-1.5 bg-muted/50 rounded-xl min-w-max md:min-w-0 shadow-sm">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                    text-muted-foreground transition-all
                    data-[state=active]:bg-background data-[state=active]:text-foreground
                    data-[state=active]:shadow-md hover:text-foreground hover:bg-background/50
                    whitespace-nowrap"
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="dashboard">
            <MGFDashboard
              stats={dashboardStats}
              colunas={colunas}
              loading={loading}
              associacaoNome={selectedAssociacaoNome}
              corretoraId={selectedAssociacao}
              operacoes={rpcOperacoes}
              subOperacoes={rpcSubOperacoes}
              baseData={filters.baseData}
              situacao={rpcSituacao}
              cooperativa={rpcCooperativa}
              regional={rpcRegional}
              formaPagamento={rpcFormaPagamento}
              tipoVeiculo={rpcTipoVeiculo}
              dataInicio={rpcDataInicio}
              dataFim={rpcDataFim}
            />
          </TabsContent>

          <TabsContent value="eventos">
            <MGFRelatorioEventos
              corretoraId={selectedAssociacao}
              operacoes={rpcOperacoes}
              subOperacoes={rpcSubOperacoes}
              baseData={filters.baseData}
              situacao={rpcSituacao}
              cooperativa={rpcCooperativa}
              regional={rpcRegional}
              formaPagamento={rpcFormaPagamento}
              tipoVeiculo={rpcTipoVeiculo}
              dataInicio={rpcDataInicio}
              dataFim={rpcDataFim}
              loading={loading}
              refreshToken={refreshToken}
            />
          </TabsContent>

          <TabsContent value="tabela">
            <MGFTabela
              corretoraId={selectedAssociacao}
              operacoes={rpcOperacoes}
              subOperacoes={rpcSubOperacoes}
              baseData={filters.baseData}
              situacao={rpcSituacao}
              cooperativa={rpcCooperativa}
              regional={rpcRegional}
              formaPagamento={rpcFormaPagamento}
              tipoVeiculo={rpcTipoVeiculo}
              dataInicio={rpcDataInicio}
              dataFim={rpcDataFim}
              loading={loading}
              refreshToken={refreshToken}
            />
          </TabsContent>

          <TabsContent value="importar">
            <MGFImportacao
              onImportSuccess={handleImportSuccess}
              corretoraId={selectedAssociacao}
              corretoraNome={selectedAssociacaoNome}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de Histórico */}
      {!biLayout && (
        <BIAuditLogDialog
          open={historicoDialogOpen}
          onOpenChange={setHistoricoDialogOpen}
          modulo="mgf_insights"
          corretoraId={selectedAssociacao}
        />
      )}
    </>
  );

  // Se é acesso via portal, envolver com provider do carrossel
  if (isPortalAccess && portalLayout) {
    return <>{portalContent}</>;
  }

  if (isPortalAccess && corretoraData) {
    return (
      <PortalCarouselProvider corretoraId={corretoraData.id} availableModules={availableModules} currentModule="mgf">
        <div className="min-h-screen bg-background">
          <PortalPageWrapper>{portalContent}</PortalPageWrapper>
        </div>
      </PortalCarouselProvider>
    );
  }

  return <>{portalContent}</>;
}
