import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Upload,
  Database,
  BarChart3,
  History,
  Filter,
  Calendar as CalendarIcon,
  CreditCard,
  MapPin,
  DollarSign,
  LogOut,
  Building2,
  Activity,
  TrendingUp,
  ArrowLeftRight,
  ChevronDown,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parse, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import CobrancaDashboard from "@/components/cobranca/CobrancaDashboard";
import CobrancaImportacao from "@/components/cobranca/CobrancaImportacao";
import CobrancaTabela from "@/components/cobranca/CobrancaTabela";
import { BIAuditLogDialog } from "@/components/BIAuditLogDialog";
import { useAuth } from "@/hooks/useAuth";
import PortalHeader from "@/components/portal/PortalHeader";
import BIPageHeader from "@/components/bi/BIPageHeader";
import { getCachedAssociacoes, setCachedAssociacoes } from "@/hooks/useBIGlobalCache";
import PortalPageWrapper from "@/components/portal/PortalPageWrapper";
import { PortalCarouselProvider } from "@/contexts/PortalCarouselContext";
import { useBILayoutOptional } from "@/contexts/BILayoutContext";
import { usePortalLayoutOptional } from "@/contexts/PortalLayoutContext";

// touch: force new deploy (rebuild) picking up server-side RPC dashboard
export interface CobrancaFilters {
  mesReferencia: string;
  situacao: string;
  regional: string;
  cooperativa: string;
  diaVencimento: string;
  /**
   * "sga"   — reproduz o Relatorio de Boletos do SGA: conta apenas boletos de
   *           veiculos que NAO tinham boleto em aberto nos 6 meses anteriores
   *           ("Boletos Anteriores: NAO POSSUI"). E o numero que a associacao
   *           confere. Validado em mai/jun/jul de 2026.
   * "total" — todo boleto do mes, sem filtro. Serve para operacao interna:
   *           mostra a carteira inteira, inclusive quem arrasta debito antigo.
   * O criterio vale para a PAGINA TODA (cards e graficos). Antes so os cards
   * respeitavam o SGA e o grafico por dia seguia no total — a mesma tela
   * mostrava 187 em aberto em cima e 332 embaixo.
   */
  criterio: "sga" | "total";
}

interface FilterOptions {
  regionais: string[];
  cooperativas: string[];
  diasVencimento: number[];
  situacoes: string[];
}

export default function CobrancaInsights() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { userRole } = useAuth();
  const biLayout = useBILayoutOptional();
  const portalLayout = usePortalLayoutOptional();
  const [activeTab, setActiveTab] = useState("dashboard");
  // NOTE (escalabilidade): esta página não carrega mais a lista crua de
  // boletos no navegador (chegou a passar de 600 mil linhas para a
  // VALECAR, causando "Erro ao carregar dados de Cobrança"). Toda a
  // agregação do dashboard é feita no banco pela RPC
  // `get_dashboard_cobranca_cached`; guardamos apenas o payload já
  // agregado (`dashboardStats`) e os ids das importações ativas
  // (`importacaoIds`), que a aba "Dados Completos" usa para paginar do
  // lado do servidor.
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [importacaoIds, setImportacaoIds] = useState<string[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    regionais: [],
    cooperativas: [],
    diasVencimento: [],
    situacoes: [],
  });
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const autoAdjustedMonthRef = useRef(false);
  const prevAssociacaoRef = useRef<string>("");
  // Contador de requisições em voo: usado para descartar respostas
  // "atrasadas" de uma associação/filtro anterior quando o usuário troca
  // de associação ou de filtro rapidamente (evita misturar/sobrescrever
  // dados novos com uma resposta antiga que só terminou de chegar depois).
  const fetchIdRef = useRef(0);

  // Filtros globais - regra: sempre mostrar o MÊS ATUAL por padrão; se não
  // houver boletos no mês atual, o auto-ajuste abaixo cai para o mês
  // anterior automaticamente (regra já existente, mantida).
  const getMesAtual = () => format(new Date(), "yyyy-MM");
  const getMesAnterior = () => format(subMonths(new Date(), 1), "yyyy-MM");

  const [filters, setFilters] = useState<CobrancaFilters>({
    mesReferencia: getMesAtual(),
    criterio: "sga" as const,
    situacao: "todos",
    regional: "todos",
    cooperativa: "todos",
    diaVencimento: "todos",
  });

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

        const cached = getCachedAssociacoes();
        if (cached && cached.length > 0 && !associacoes.length) {
          setAssociacoes(cached);
          const ap = searchParams.get("associacao") || searchParams.get("corretora");
          if (ap && cached.some((c) => c.id === ap)) {
            setSelectedAssociacao(ap);
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
          const ap2 = searchParams.get("associacao") || searchParams.get("corretora");
          if (ap2 && data?.some((c) => c.id === ap2)) {
            setSelectedAssociacao(ap2);
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

  // Converte os filtros da UI ("todos" / string vazia) para o formato que
  // as RPCs esperam (NULL = "sem filtro").
  const toRpcFilterValue = (value: string) => (!value || value === "todos" ? null : value);

  const fetchDashboardStats = async (forceRefresh = false) => {
    if (!selectedAssociacao) {
      setDashboardStats(null);
      setImportacaoAtiva(null);
      setImportacaoIds([]);
      setLoading(false);
      return;
    }

    // Marca esta chamada como a "mais recente". Se, ao terminar, uma chamada
    // mais nova já tiver começado (troca rápida de associação/filtro), esta
    // resposta é descartada em vez de sobrescrever o estado com dados
    // desatualizados ou de outra associação/filtro.
    const myFetchId = ++fetchIdRef.current;
    const isStale = () => myFetchId !== fetchIdRef.current;

    setLoading(true);
    try {
      // IMPORTANTE: pode haver MAIS DE UMA importação ativa ao mesmo tempo
      // por desenho — uma "API cobrança (histórico)" (backfill de registros
      // antigos, mantida via cron) e uma "recente" (snapshot diário). As
      // duas são complementares e devem ser somadas — usar .single()/.limit(1)
      // aqui falha sempre que há mais de uma ativa (é o caso normal hoje) e
      // fazia a tela cair silenciosamente em "Nenhum Dado Disponível".
      const { data: importacoesAtivas, error: impError } = await supabase
        .from("cobranca_importacoes")
        .select("*")
        .eq("ativo", true)
        .eq("corretora_id", selectedAssociacao)
        .order("created_at", { ascending: false });

      if (impError) throw impError;
      if (isStale()) return;

      if (importacoesAtivas && importacoesAtivas.length > 0) {
        // Para exibição (nome do arquivo, data etc.) usa a mais recente,
        // mas os boletos são somados de TODAS as importações ativas.
        const ids = importacoesAtivas.map((i) => i.id);
        setImportacaoIds(ids);
        setImportacaoAtiva(importacoesAtivas[0]);

        // Toda a agregação (totais, rankings, séries por dia) acontece no
        // banco. `get_dashboard_cobranca_cached` mantém um cache próprio
        // (20 min) por combinação de importações + filtros — em cache
        // "quente" a resposta é quase instantânea; em cache "frio", para
        // uma associação grande como a VALECAR, pode levar ~30-45s (uma
        // vez por janela de cache, não a cada troca de filtro repetida).
        // Retry automático: em cache "frio" (VALECAR, ~30-45s) a chamada
        // costuma estourar o statement_timeout / gateway na primeira
        // tentativa e o usuário tinha que atualizar 2-3 vezes até o cache
        // esquentar. Aqui tentamos até 3x com pequenos delays antes de
        // mostrar erro — nas tentativas seguintes o cache já está sendo
        // preenchido e a resposta volta rápido.
        const params = {
          p_importacao_ids: ids,
          p_mes_referencia: toRpcFilterValue(filters.mesReferencia),
          p_situacao: toRpcFilterValue(filters.situacao),
          p_regional: toRpcFilterValue(filters.regional),
          p_cooperativa: toRpcFilterValue(filters.cooperativa),
          p_dia_vencimento: filters.diaVencimento !== "todos" ? Number(filters.diaVencimento) : null,
          p_force_refresh: forceRefresh,
          p_criterio: filters.criterio,
        };
        let data: any = null;
        let lastError: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 1500 * attempt));
            if (isStale()) return;
          }
          const res = await supabase.rpc("get_dashboard_cobranca_cached", params as any);
          if (isStale()) return;
          if (!res.error) {
            data = res.data;
            lastError = null;
            break;
          }
          lastError = res.error;
          console.warn(`[Cobrança] tentativa ${attempt + 1} falhou:`, res.error?.message || res.error);
        }
        if (lastError) throw lastError;

        setDashboardStats(data);
      } else {
        setImportacaoIds([]);
        setImportacaoAtiva(null);
        setDashboardStats(null);
      }
    } catch (error) {
      console.error("Erro:", error);
      if (!isStale()) {
        toast.error("Erro ao carregar dados de Cobrança. Tente novamente em instantes.");
      }
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  // Busca os totais quando a associação OU qualquer filtro global muda —
  // diferente do design anterior (que buscava tudo uma vez e filtrava no
  // navegador), agora o filtro precisa ir ao servidor a cada mudança.
  useEffect(() => {
    if (!selectedAssociacao) {
      setDashboardStats(null);
      setImportacaoAtiva(null);
      setImportacaoIds([]);
      setLoading(false);
      prevAssociacaoRef.current = "";
      return;
    }

    if (prevAssociacaoRef.current !== selectedAssociacao) {
      autoAdjustedMonthRef.current = false;
      prevAssociacaoRef.current = selectedAssociacao;
    }

    fetchDashboardStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedAssociacao,
    filters.mesReferencia,
    filters.situacao,
    filters.regional,
    filters.cooperativa,
    filters.diaVencimento,
    filters.criterio,
  ]);

  // Opções dos dropdowns de filtro: RPC leve e separada (não depende dos
  // filtros atuais, só das importações ativas) — evita recarregar as
  // opções a cada troca de filtro.
  useEffect(() => {
    if (!importacaoIds.length) {
      setFilterOptions({ regionais: [], cooperativas: [], diasVencimento: [], situacoes: [] });
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_dashboard_filter_options", {
          p_importacao_ids: importacaoIds,
        } as any);
        if (error) throw error;
        const opts = (data as any) || {};
        setFilterOptions({
          regionais: [...(opts.regionais || [])].sort(),
          cooperativas: [...(opts.cooperativas || [])].sort(),
          diasVencimento: [...(opts.diasVencimento || [])].sort((a: number, b: number) => a - b),
          situacoes: [...(opts.situacoes || [])].sort(),
        });
      } catch (error) {
        console.error("Erro ao carregar opções de filtro:", error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importacaoIds.join(",")]);

  // Auto-ajuste do mês de referência: usa mês atual, mas cai para o mês
  // anterior se não houver boleto no mês atual com os filtros correntes
  // (só ajusta 1x por associação).
  useEffect(() => {
    if (autoAdjustedMonthRef.current) return;
    if (loading) return;
    if (!dashboardStats) return;
    if (filters.mesReferencia !== getMesAtual()) return;

    if (dashboardStats.totalBoletos === 0) {
      setFilters((f) => ({ ...f, mesReferencia: getMesAnterior() }));
    }
    autoAdjustedMonthRef.current = true;
  }, [dashboardStats, loading]);

  // Realtime: atualizar dashboard quando nova importação for detectada ou automação finalizar
  useEffect(() => {
    if (!selectedAssociacao) return;

    const channel = supabase
      .channel(`cobranca-dashboard-${selectedAssociacao}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "cobranca_importacoes",
          filter: `corretora_id=eq.${selectedAssociacao}`,
        },
        (payload) => {
          console.log("Nova importação detectada via realtime:", payload);
          // Se a nova importação já está ativa, atualizar imediatamente
          if ((payload.new as any)?.ativo === true) {
            toast.info("Nova importação detectada! Atualizando dashboard...");
            // force_refresh=true: ignora o cache de 20min da RPC, já que
            // acabamos de importar dados novos e o cache antigo está
            // desatualizado.
            fetchDashboardStats(true);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cobranca_importacoes",
          filter: `corretora_id=eq.${selectedAssociacao}`,
        },
        (payload) => {
          console.log("Importação atualizada via realtime:", payload);
          // Se a importação foi ativada, atualizar
          if (payload.new && (payload.new as any).ativo === true) {
            toast.info("Importação atualizada! Atualizando dashboard...");
            fetchDashboardStats(true);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cobranca_automacao_execucoes",
          filter: `corretora_id=eq.${selectedAssociacao}`,
        },
        (payload) => {
          // Quando a automação finaliza com sucesso, atualizar o dashboard
          if (payload.new && (payload.new as any).status === "sucesso") {
            console.log("Automação finalizada com sucesso via realtime:", payload);
            toast.success("Sincronização automática concluída! Atualizando dashboard...");
            // Pequeno delay para garantir que a importação foi ativada
            setTimeout(() => {
              fetchDashboardStats(true);
            }, 1000);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedAssociacao]);

  const selectedAssociacaoNome = associacoes.find((a) => a.id === selectedAssociacao)?.nome || "";

  const clearFilters = () => {
    setFilters({
      mesReferencia: getMesAtual(),
      situacao: "todos",
      regional: "todos",
      cooperativa: "todos",
      diaVencimento: "todos",
      // Limpar filtros volta ao padrao do sistema, que e o criterio SGA — e o
      // criterio em que os numeros batem com o relatorio da associacao.
      criterio: "sga",
    });
    autoAdjustedMonthRef.current = false;
  };

  const hasActiveFilters =
    filters.mesReferencia ||
    filters.situacao !== "todos" ||
    filters.regional !== "todos" ||
    filters.cooperativa !== "todos" ||
    filters.diaVencimento !== "todos";

  // Update shared header dynamic props
  useEffect(() => {
    if (biLayout && !isPortalAccess) {
      biLayout.setHeaderDynamic({
        modulo: 'cobranca',
        recordCount: dashboardStats?.totalBoletos ?? 0,
        hasActiveFilters: !!hasActiveFilters,
        fileName: importacaoAtiva?.nome_arquivo,
      });
    }
  }, [dashboardStats?.totalBoletos, hasActiveFilters, importacaoAtiva?.nome_arquivo, biLayout, isPortalAccess]);

  const tabs = isPortalAccess
    ? [
        { id: "dashboard", label: "Dashboard", icon: BarChart3 },
        { id: "tabela", label: "Dados Completos", icon: Database },
      ]
    : [
        { id: "dashboard", label: "Dashboard", icon: BarChart3 },
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
          currentModule="cobranca"
          showCarouselControls={true}
        />
      )}

      {/* Header interno - only when NOT inside BILayout */}
      {!isPortalAccess && !biLayout && (
        <BIPageHeader
          title="Cobrança"
          subtitle="Business Intelligence de Cobrança e Inadimplência"
          associacoes={associacoes}
          selectedAssociacao={selectedAssociacao}
          onAssociacaoChange={setSelectedAssociacao}
          loadingAssociacoes={loadingAssociacoes}
          currentModule="cobranca"
          showHistorico={canViewHistorico}
          onHistoricoClick={() => setHistoricoDialogOpen(true)}
          recordCount={dashboardStats?.totalBoletos ?? 0}
          hasActiveFilters={!!hasActiveFilters}
          fileName={importacaoAtiva?.nome_arquivo}
        />
      )}

      {/* Filtros Globais */}
      {importacaoIds.length > 0 && (
        <div className="container mx-auto px-3 sm:px-4 pt-4 max-w-full overflow-x-hidden">
          <Card className="border-emerald-500/20 bg-card/50 backdrop-blur">
            <CardContent className="p-0">
              {/* Header clicável */}
              <button
                onClick={() => setFiltersOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-sm">Filtros</span>
                  {hasActiveFilters && (
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-600 text-[10px] text-white font-bold">
                      {[
                        filters.situacao !== "todos",
                        filters.regional !== "todos",
                        filters.cooperativa !== "todos",
                        filters.diaVencimento !== "todos",
                      ].filter(Boolean).length + (filters.mesReferencia ? 1 : 0)}
                    </span>
                  )}
                  {!filtersOpen && hasActiveFilters && (
                    <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                      {[
                        filters.mesReferencia &&
                          format(
                            new Date(
                              parseInt(filters.mesReferencia.split("-")[0]),
                              parseInt(filters.mesReferencia.split("-")[1]) - 1,
                              1,
                            ),
                            "MMM/yy",
                            { locale: ptBR },
                          ),
                        filters.situacao !== "todos" && filters.situacao,
                        filters.regional !== "todos" && filters.regional,
                        filters.cooperativa !== "todos" && filters.cooperativa,
                        filters.diaVencimento !== "todos" && `Dia ${filters.diaVencimento}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearFilters();
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Mês Referência</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "h-9 w-full justify-start text-left font-normal",
                              !filters.mesReferencia && "text-muted-foreground",
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {filters.mesReferencia ? (
                              format(
                                new Date(
                                  parseInt(filters.mesReferencia.split("-")[0]),
                                  parseInt(filters.mesReferencia.split("-")[1]) - 1,
                                  1,
                                ),
                                "MMMM 'de' yyyy",
                                { locale: ptBR },
                              )
                            ) : (
                              <span>Selecione o mês</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-4" align="start">
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-xs">Mês</label>
                                <Select
                                  value={filters.mesReferencia ? filters.mesReferencia.split("-")[1] : ""}
                                  onValueChange={(mes) => {
                                    const ano = filters.mesReferencia
                                      ? filters.mesReferencia.split("-")[0]
                                      : String(new Date().getFullYear());
                                    setFilters((f) => ({ ...f, mesReferencia: `${ano}-${mes}` }));
                                  }}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Mês" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[
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
                                    ].map((m) => (
                                      <SelectItem key={m.value} value={m.value}>
                                        {m.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs">Ano</label>
                                <Select
                                  value={filters.mesReferencia ? filters.mesReferencia.split("-")[0] : ""}
                                  onValueChange={(ano) => {
                                    const mes = filters.mesReferencia ? filters.mesReferencia.split("-")[1] : "01";
                                    setFilters((f) => ({ ...f, mesReferencia: `${ano}-${mes}` }));
                                  }}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Ano" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((ano) => (
                                      <SelectItem key={ano} value={String(ano)}>
                                        {ano}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="flex justify-between pt-2 border-t">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-emerald-600 hover:text-emerald-700"
                                onClick={() => setFilters((f) => ({ ...f, mesReferencia: "" }))}
                              >
                                Limpar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-emerald-600 hover:text-emerald-700"
                                onClick={() =>
                                  setFilters((f) => ({ ...f, mesReferencia: format(new Date(), "yyyy-MM") }))
                                }
                              >
                                Mês Atual
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Situação</label>
                      <Select
                        value={filters.situacao}
                        onValueChange={(v) => setFilters((f) => ({ ...f, situacao: v }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todas</SelectItem>
                          {filterOptions.situacoes.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Regional</label>
                      <Select
                        value={filters.regional}
                        onValueChange={(v) => setFilters((f) => ({ ...f, regional: v }))}
                      >
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
                      <label className="text-xs text-muted-foreground">Cooperativa</label>
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
                      <label className="text-xs text-muted-foreground">Dia Vencimento</label>
                      <Select
                        value={filters.diaVencimento}
                        onValueChange={(v) => setFilters((f) => ({ ...f, diaVencimento: v }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos</SelectItem>
                          {filterOptions.diasVencimento.map((d) => (
                            <SelectItem key={d} value={String(d)}>
                              Dia {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="container mx-auto px-3 sm:px-4 py-6 max-w-full overflow-x-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="w-full overflow-x-auto pb-2 -mx-1 px-1">
            <TabsList className="inline-flex md:flex md:w-full max-w-xl mx-auto gap-1 p-1.5 bg-muted/50 rounded-xl min-w-max md:min-w-0 shadow-sm">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                      text-muted-foreground transition-all
                      data-[state=active]:bg-background data-[state=active]:text-foreground
                      data-[state=active]:shadow-md hover:text-foreground hover:bg-background/50
                      whitespace-nowrap"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="dashboard">
            <CobrancaDashboard
              stats={dashboardStats}
              loading={loading}
              corretoraId={selectedAssociacao}
              mesReferencia={filters.mesReferencia}
              isPortalAccess={isPortalAccess}
              criterio={filters.criterio}
              onCriterioChange={(c) => setFilters((f) => ({ ...f, criterio: c }))}
            />
          </TabsContent>

          <TabsContent value="tabela">
            <CobrancaTabela
              importacaoIds={importacaoIds}
              globalFilters={filters}
              filterOptions={filterOptions}
              loading={loading}
              corretoraId={selectedAssociacao}
            />
          </TabsContent>

          {!isPortalAccess && (
            <TabsContent value="importar">
              <CobrancaImportacao corretoraId={selectedAssociacao} onImportSuccess={() => fetchDashboardStats(true)} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Modal Histórico */}
      {!biLayout && (
        <BIAuditLogDialog
          open={historicoDialogOpen}
          onOpenChange={setHistoricoDialogOpen}
          modulo="cobranca_insights"
          corretoraId={selectedAssociacao}
        />
      )}
    </>
  );

  // If inside PortalLayout, just return content directly
  if (isPortalAccess && portalLayout) {
    return <>{portalContent}</>;
  }

  // Legacy portal access without PortalLayout
  if (isPortalAccess && corretoraData) {
    return (
      <PortalCarouselProvider
        corretoraId={corretoraData.id}
        availableModules={availableModules}
        currentModule="cobranca"
      >
        <div className="min-h-screen bg-background">
          <PortalPageWrapper>{portalContent}</PortalPageWrapper>
        </div>
      </PortalCarouselProvider>
    );
  }

  return <>{portalContent}</>;
}
