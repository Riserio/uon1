import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Upload,
  Database,
  Map,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Car,
  History,
  Calendar,
  Filter,
  DollarSign,
  CreditCard,
  LogOut,
  ArrowLeftRight,
  Building2,
  Activity,
  ChevronDown,
  Globe,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import SGADashboard from "@/components/sga/SGADashboard";
import SGAConsultaHinova from "@/components/sga/SGAConsultaHinova";
import SGAImportacao from "@/components/sga/SGAImportacao";
import SGAMapa from "@/components/sga/SGAMapa";
import SGATabela from "@/components/sga/SGATabela";
import { BIAuditLogDialog } from "@/components/BIAuditLogDialog";
import { useAuth } from "@/hooks/useAuth";
import PortalHeader from "@/components/portal/PortalHeader";
import BIPageHeader from "@/components/bi/BIPageHeader";
import { getCachedAssociacoes, setCachedAssociacoes } from "@/hooks/useBIGlobalCache";
import PortalPageWrapper from "@/components/portal/PortalPageWrapper";
import { PortalCarouselProvider } from "@/contexts/PortalCarouselContext";
import { useBILayoutOptional } from "@/contexts/BILayoutContext";
import { usePortalLayoutOptional } from "@/contexts/PortalLayoutContext";

export interface SGAFilters {
  dataInicio: string;
  dataFim: string;
  regional: string;
  cooperativa: string;
  tipoVeiculo: string;
  status: string; // "em_andamento" | "todos"
}

interface SGAFilterOptions {
  regionais: string[];
  cooperativas: string[];
  estados: string[];
  motivos: string[];
  situacoes: string[];
  tiposVeiculo: string[];
}

// Filtros globais - padrão: eventos em andamento, sem filtro de data.
// Carrega menos registros na tela e alivia a renderização.
const getDefaultFilters = (): SGAFilters => ({
  dataInicio: "",
  dataFim: "",
  regional: "todos",
  cooperativa: "todos",
  tipoVeiculo: "todos",
  status: "em_andamento",
});

const getDefaultFilterOptions = (): SGAFilterOptions => ({
  regionais: [],
  cooperativas: [],
  estados: [],
  motivos: [],
  situacoes: [],
  tiposVeiculo: [],
});

export default function SGAInsights() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { userRole } = useAuth();
  const biLayout = useBILayoutOptional();
  const portalLayout = usePortalLayoutOptional();
  const [activeTab, setActiveTab] = useState("dashboard");
  // NOTE (escalabilidade): esta página não carrega mais o array cru de
  // eventos no navegador (a VALECAR sozinha já tem 131k+ eventos na
  // importação ativa, ultrapassando o teto de 100k linhas que a busca
  // paginada antiga usava — os dados estavam sendo truncados
  // silenciosamente). Toda a agregação roda no banco via
  // `get_dashboard_eventos_cached` / `get_mapa_eventos_cached`; guardamos
  // apenas os payloads já agregados. A aba "Dados Completos" busca sua
  // própria página de dados diretamente (ver SGATabela.tsx).
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [mapaData, setMapaData] = useState<any>(null);
  const [filterOptions, setFilterOptions] = useState<SGAFilterOptions>(getDefaultFilterOptions());
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);

  const [filters, setFilters] = useState<SGAFilters>(getDefaultFilters());

  const [filtersOpen, setFiltersOpen] = useState(false);

  // Contador de requisições em voo: descarta respostas atrasadas de uma
  // associação/filtro anterior quando o usuário troca rapidamente.
  const fetchIdRef = useRef(0);
  const prevAssociacaoRef = useRef<string>("");

  // Detectar se é acesso via portal (parceiro)
  const isPortalAccess = location.pathname.startsWith("/portal");

  // Verifica se pode ver histórico (superintendente ou admin)
  const canViewHistorico = userRole === "superintendente" || userRole === "admin";

  // Associações e permissões
  const [associacoes, setAssociacoes] = useState<any[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState<string>("");
  const [loadingAssociacoes, setLoadingAssociacoes] = useState(true);
  const [modulosBi, setModulosBi] = useState<string[]>(["indicadores", "eventos", "mgf", "cobranca"]);
  const [corretoraData, setCorretoraData] = useState<{ id: string; nome: string; logo_url?: string | null } | null>(
    null,
  );
  const [multipleAssociacoes, setMultipleAssociacoes] = useState(false);

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
    if (biLayout && !isPortalAccess) return; // Skip - using shared context

    // Portal access: use corretora from portal context directly (avoids slug vs id mismatch)
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
          // Fallback: try by id first, then by slug
          let { data: corretora, error: corretoraError } = await supabase
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

        const associacaoParam2 = searchParams.get("associacao");
        const cached = getCachedAssociacoes();
        if (cached && cached.length > 0 && !associacoes.length) {
          setAssociacoes(cached);
          if (associacaoParam2 && cached.some((c) => c.id === associacaoParam2)) {
            setSelectedAssociacao(associacaoParam2);
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
          if (associacaoParam2 && data?.some((c) => c.id === associacaoParam2)) {
            setSelectedAssociacao(associacaoParam2);
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
  }, [searchParams, isPortalAccess, portalLayout?.corretora?.id]);

  // Converte os filtros da UI ("todos" / string vazia) para o formato que
  // as RPCs esperam (NULL = "sem filtro").
  const toRpcFilterValue = (value: string) => (!value || value === "todos" ? null : value);

  const buildEventosRpcParams = (forceRefresh: boolean) => ({
    p_corretora_id: selectedAssociacao,
    p_status: filters.status,
    p_data_inicio: filters.dataInicio || null,
    p_data_fim: filters.dataFim || null,
    p_regional: toRpcFilterValue(filters.regional),
    p_cooperativa: toRpcFilterValue(filters.cooperativa),
    p_tipo_veiculo: toRpcFilterValue(filters.tipoVeiculo),
    p_force_refresh: forceRefresh,
  });

  const fetchDashboardData = async (forceRefresh = false) => {
    if (!selectedAssociacao) {
      setDashboardStats(null);
      setMapaData(null);
      setImportacaoAtiva(null);
      setLoading(false);
      return;
    }

    const myFetchId = ++fetchIdRef.current;
    const isStale = () => myFetchId !== fetchIdRef.current;

    setLoading(true);
    try {
      const { data: importacao, error: impError } = await supabase
        .from("sga_importacoes")
        .select("*")
        .eq("ativo", true)
        .eq("corretora_id", selectedAssociacao)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (impError) {
        console.error("Erro ao buscar importação:", impError);
      }
      if (isStale()) return;

      if (!importacao) {
        setImportacaoAtiva(null);
        setDashboardStats(null);
        setMapaData(null);
        return;
      }

      setImportacaoAtiva(importacao);

      const rpcParams = buildEventosRpcParams(forceRefresh);

      // Dashboard e Mapa são buscados em paralelo — ambos têm cache próprio
      // de 20min no banco (get_dashboard_eventos_cached /
      // get_mapa_eventos_cached), então manter os dois payloads
      // atualizados juntos é barato em cache "quente".
      const [dashboardRes, mapaRes] = await Promise.all([
        supabase.rpc("get_dashboard_eventos_cached", rpcParams as any),
        supabase.rpc("get_mapa_eventos_cached", rpcParams as any),
      ]);

      if (isStale()) return;

      if (dashboardRes.error) throw dashboardRes.error;
      if (mapaRes.error) throw mapaRes.error;

      setDashboardStats(dashboardRes.data);
      setMapaData(mapaRes.data);
    } catch (error) {
      console.error("Erro:", error);
      if (!isStale()) {
        toast.error("Erro ao carregar dados de Eventos. Tente novamente em instantes.");
      }
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  // Recarregar dados quando associação OU qualquer filtro global mudar.
  // Ao trocar de associação, força a atualização (ignora o cache de 20min
  // da RPC) para não exibir dados desatualizados de outra corretora.
  useEffect(() => {
    if (!selectedAssociacao) {
      setDashboardStats(null);
      setMapaData(null);
      setImportacaoAtiva(null);
      setLoading(false);
      prevAssociacaoRef.current = "";
      return;
    }

    const isAssociacaoChange = prevAssociacaoRef.current !== selectedAssociacao;
    prevAssociacaoRef.current = selectedAssociacao;

    fetchDashboardData(isAssociacaoChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedAssociacao,
    filters.status,
    filters.dataInicio,
    filters.dataFim,
    filters.regional,
    filters.cooperativa,
    filters.tipoVeiculo,
  ]);

  // Opções dos dropdowns de filtro (Regional / Cooperativa / Tipo Veículo):
  // RPC leve, escopo = importação ativa + status, não depende dos demais
  // filtros — evita recarregar as opções a cada troca de filtro.
  useEffect(() => {
    if (!selectedAssociacao) {
      setFilterOptions(getDefaultFilterOptions());
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_eventos_filter_options", {
          p_corretora_id: selectedAssociacao,
          p_status: filters.status,
        } as any);
        if (error) throw error;
        const opts = (data as any) || {};
        setFilterOptions({
          regionais: [...(opts.regionais || [])].sort(),
          cooperativas: [...(opts.cooperativas || [])].sort(),
          estados: [...(opts.estados || [])].sort(),
          motivos: [...(opts.motivos || [])].sort(),
          situacoes: [...(opts.situacoes || [])].sort(),
          tiposVeiculo: opts.tiposVeiculo || ["Passeio", "Motocicleta", "Caminhão", "Van/Utilitário"],
        });
      } catch (error) {
        console.error("Erro ao carregar opções de filtro:", error);
      }
    })();
  }, [selectedAssociacao, filters.status]);

  const selectedAssociacaoNome = associacoes.find((a) => a.id === selectedAssociacao)?.nome || "";

  // Limpar: volta ao padrão (eventos em andamento, sem datas)
  const clearFilters = () => {
    setFilters(getDefaultFilters());
  };

  const hasActiveFilters =
    filters.dataInicio ||
    filters.dataFim ||
    filters.regional !== "todos" ||
    filters.cooperativa !== "todos" ||
    filters.tipoVeiculo !== "todos" ||
    filters.status !== "em_andamento";

  // Update shared header dynamic props
  useEffect(() => {
    if (biLayout && !isPortalAccess) {
      biLayout.setHeaderDynamic({
        recordCount: dashboardStats?.totalEventos ?? 0,
        hasActiveFilters: !!hasActiveFilters,
        fileName: importacaoAtiva?.nome_arquivo,
      });
    }
  }, [dashboardStats?.totalEventos, hasActiveFilters, importacaoAtiva?.nome_arquivo, biLayout, isPortalAccess]);

  // Tabs - esconder importação para parceiros
  const tabs = isPortalAccess
    ? [
        { id: "dashboard", label: "Dashboard", icon: BarChart3 },
        { id: "mapa", label: "Mapa Geográfico", icon: Map },
        { id: "tabela", label: "Dados Completos", icon: Database },
      ]
    : [
        { id: "dashboard", label: "Dashboard", icon: BarChart3 },
        { id: "mapa", label: "Mapa Geográfico", icon: Map },
        { id: "tabela", label: "Dados Completos", icon: Database },
        { id: "importar", label: "Importar Dados", icon: Upload },
        { id: "consulta-sga", label: "Consulta SGA", icon: Globe },
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

  const portalContent = (
    <>
      {/* Portal Header para parceiros - only when NOT inside PortalLayout */}
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
          currentModule="eventos"
          showCarouselControls={true}
        />
      )}

      {/* Header interno (não parceiro) - only when NOT inside BILayout */}
      {!isPortalAccess && !biLayout && (
        <BIPageHeader
          title="Eventos"
          subtitle="Business Intelligence de Eventos"
          associacoes={associacoes}
          selectedAssociacao={selectedAssociacao}
          onAssociacaoChange={setSelectedAssociacao}
          loadingAssociacoes={loadingAssociacoes}
          currentModule="eventos"
          showHistorico={canViewHistorico}
          onHistoricoClick={() => setHistoricoDialogOpen(true)}
          recordCount={dashboardStats?.totalEventos ?? 0}
          hasActiveFilters={!!hasActiveFilters}
          fileName={importacaoAtiva?.nome_arquivo}
        />
      )}

      {/* Filtros colapsáveis */}
      {importacaoAtiva && (
        <div className="container mx-auto px-4 pt-4">
          <Card className="bg-card/50 backdrop-blur border-border/50 overflow-hidden">
            {/* Filtros Header - sempre visível */}
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Filtros</span>
                {hasActiveFilters && (
                  <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    ativo
                  </span>
                )}
                {/* Resumo dos filtros ativos quando fechado (status sempre visível) */}
                {!filtersOpen && (
                  <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                    {[
                      filters.status === "em_andamento" ? "Eventos em andamento" : "Todos os eventos",
                      filters.dataInicio && `Cadastro de: ${filters.dataInicio}`,
                      filters.dataFim && `Cadastro até: ${filters.dataFim}`,
                      filters.regional !== "todos" && filters.regional,
                      filters.cooperativa !== "todos" && filters.cooperativa,
                      filters.tipoVeiculo !== "todos" && filters.tipoVeiculo,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearFilters();
                    }}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Limpar
                  </Button>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`}
                />
              </div>
            </button>

            {/* Filtros corpo - colapsável */}
            {filtersOpen && (
              <div className="px-4 pb-4 border-t border-border/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="em_andamento">Eventos em andamento</SelectItem>
                        <SelectItem value="todos">Todos os eventos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Cadastro de</Label>
                    <Input
                      type="date"
                      value={filters.dataInicio}
                      onChange={(e) => setFilters((f) => ({ ...f, dataInicio: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Cadastro até</Label>
                    <Input
                      type="date"
                      value={filters.dataFim}
                      onChange={(e) => setFilters((f) => ({ ...f, dataFim: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Regional</Label>
                    <Select value={filters.regional} onValueChange={(v) => setFilters((f) => ({ ...f, regional: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas Regionais</SelectItem>
                        {filterOptions.regionais.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Cooperativa</Label>
                    <Select
                      value={filters.cooperativa}
                      onValueChange={(v) => setFilters((f) => ({ ...f, cooperativa: v }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas Cooperativas</SelectItem>
                        {filterOptions.cooperativas.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tipo Veículo</Label>
                    <Select
                      value={filters.tipoVeiculo}
                      onValueChange={(v) => setFilters((f) => ({ ...f, tipoVeiculo: v }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos Tipos</SelectItem>
                        {(filterOptions.tiposVeiculo.length
                          ? filterOptions.tiposVeiculo
                          : ["Passeio", "Motocicleta", "Caminhão", "Van/Utilitário"]
                        ).map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Quick Stats */}
      {dashboardStats && dashboardStats.totalEventos > 0 && (
        <div className="container mx-auto px-4 pt-4">
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 ${filters.status === "em_andamento" ? "" : "md:grid-cols-4"}`}
          >
            {/* Card Total Eventos - oculto quando o filtro é "Eventos em andamento" */}
            {filters.status !== "em_andamento" && (
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <Car className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xl sm:text-2xl font-bold truncate">
                        {dashboardStats.totalEventos.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Eventos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {/* Card Finalizados - oculto quando o filtro é "Eventos em andamento" */}
            {filters.status !== "em_andamento" && (
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-green-500/10 shrink-0">
                      <TrendingUp className="h-5 w-5 text-green-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xl sm:text-2xl font-bold truncate">
                        {dashboardStats.totalFinalizados.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Finalizados</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-yellow-500/10 shrink-0">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl sm:text-2xl font-bold truncate">
                      {dashboardStats.totalEmAndamento.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Em Andamento</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-destructive/10 shrink-0">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-lg sm:text-2xl font-bold truncate"
                      title={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                        dashboardStats.totalCusto || 0,
                      )}
                    >
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                        dashboardStats.totalCusto || 0,
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Custo Total</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="w-full overflow-x-auto pb-2 -mx-1 px-1">
            <TabsList className="inline-flex md:flex md:w-full max-w-3xl mx-auto gap-1 p-1.5 bg-muted/50 rounded-xl min-w-max md:min-w-0 shadow-sm">
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
            <SGADashboard
              stats={dashboardStats}
              loading={loading}
              corretoraId={selectedAssociacao}
              status={filters.status}
              dataInicio={filters.dataInicio}
              dataFim={filters.dataFim}
              regional={filters.regional}
              cooperativa={filters.cooperativa}
              tipoVeiculo={filters.tipoVeiculo}
            />
          </TabsContent>

          <TabsContent value="mapa">
            <SGAMapa mapaData={mapaData} loading={loading} />
          </TabsContent>

          <TabsContent value="tabela">
            <SGATabela
              corretoraId={selectedAssociacao}
              status={filters.status}
              dataInicio={filters.dataInicio}
              dataFim={filters.dataFim}
              regional={filters.regional}
              cooperativa={filters.cooperativa}
              tipoVeiculo={filters.tipoVeiculo}
              loading={loading}
            />
          </TabsContent>

          {!isPortalAccess && (
            <TabsContent value="importar">
              <SGAImportacao
                onImportSuccess={() => {
                  fetchDashboardData(true);
                  setActiveTab("dashboard");
                }}
                corretoraId={selectedAssociacao}
                corretoraNome={selectedAssociacaoNome}
              />
            </TabsContent>
          )}

          {!isPortalAccess && (
            <TabsContent value="consulta-sga">
              <SGAConsultaHinova corretoraId={selectedAssociacao} corretoraNome={selectedAssociacaoNome} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Modal Histórico de Alterações - only when NOT inside BILayout */}
      {!biLayout && (
        <BIAuditLogDialog
          open={historicoDialogOpen}
          onOpenChange={setHistoricoDialogOpen}
          modulo="sga_insights"
          corretoraId={selectedAssociacao}
        />
      )}
    </>
  );

  // If inside PortalLayout, just return content directly (no wrappers needed)
  if (isPortalAccess && portalLayout) {
    return <>{portalContent}</>;
  }

  // Legacy portal access without PortalLayout
  if (isPortalAccess && corretoraData) {
    return (
      <PortalCarouselProvider
        corretoraId={corretoraData.id}
        availableModules={availableModules}
        currentModule="eventos"
      >
        <div className="min-h-screen bg-background">
          <PortalPageWrapper>{portalContent}</PortalPageWrapper>
        </div>
      </PortalCarouselProvider>
    );
  }

  // Inside BILayout - just return content (no wrapper needed)
  return <>{portalContent}</>;
}
