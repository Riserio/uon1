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
import { getPrefetchedData, savePrefetchedData } from "@/hooks/usePortalDataPrefetch";
import { getBICachedData, setBICachedData, getCachedAssociacoes, setCachedAssociacoes } from "@/hooks/useBIGlobalCache";
import PortalPageWrapper from "@/components/portal/PortalPageWrapper";
import { PortalCarouselProvider } from "@/contexts/PortalCarouselContext";
import { useBILayoutOptional } from "@/contexts/BILayoutContext";
import { usePortalLayoutOptional } from "@/contexts/PortalLayoutContext";
import { dedupSGAFiel } from "@/lib/cobrancaDedup";

export interface CobrancaFilters {
  mesReferencia: string;
  situacao: string;
  regional: string;
  cooperativa: string;
  diaVencimento: string;
}

export default function CobrancaInsights() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { userRole } = useAuth();
  const biLayout = useBILayoutOptional();
  const portalLayout = usePortalLayoutOptional();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [boletos, setBoletos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const autoAdjustedMonthRef = useRef(false);
  // Contador de requisições em voo: usado para descartar respostas
  // "atrasadas" de uma associação anterior quando o usuário troca de
  // associação rapidamente (evita misturar/sobrescrever dados novos com
  // uma resposta antiga que só terminou de chegar depois).
  const fetchIdRef = useRef(0);

  // Filtros globais - regra: sempre mostrar o MÊS ATUAL por padrão; se não
  // houver boletos no mês atual, o auto-ajuste abaixo cai para o mês
  // anterior automaticamente (regra já existente, mantida).
  const getMesAtual = () => format(new Date(), "yyyy-MM");
  const getMesAnterior = () => format(subMonths(new Date(), 1), "yyyy-MM");

  const [filters, setFilters] = useState<CobrancaFilters>({
    mesReferencia: getMesAtual(),
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

  // Extrair opções únicas para filtros
  const filterOptions = useMemo(() => {
    // Single-pass aggregation: 1 loop em vez de 5 (4x mais rápido em arrays grandes)
    const regionaisSet = new Set<string>();
    const cooperativasSet = new Set<string>();
    const diasSet = new Set<number>();
    const situacoesSet = new Set<string>();
    for (const b of boletos) {
      if (b.regional_boleto) regionaisSet.add(b.regional_boleto);
      if (b.cooperativa) cooperativasSet.add(b.cooperativa);
      if (b.dia_vencimento_veiculo != null) diasSet.add(b.dia_vencimento_veiculo);
      if (b.situacao) situacoesSet.add(b.situacao);
    }
    return {
      regionais: [...regionaisSet].sort(),
      cooperativas: [...cooperativasSet].sort(),
      diasVencimento: [...diasSet].sort((a, b) => a - b),
      situacoes: [...situacoesSet].sort(),
    };
  }, [boletos]);

  // Boletos filtrados (excluir cancelados por padrão)
  const filteredBoletos = useMemo(() => {
    let result = boletos.filter((b) => b.situacao?.toUpperCase() !== "CANCELADO");

    if (filters.mesReferencia) {
      result = result.filter((b) => {
        const dataRef = b.data_vencimento_original || b.data_vencimento;
        if (!dataRef) return false;
        const mes = String(dataRef).substring(0, 7);
        return mes === filters.mesReferencia;
      });
    }
    if (filters.situacao !== "todos") {
      result = result.filter((b) => b.situacao?.toUpperCase() === filters.situacao.toUpperCase());
    }
    if (filters.regional !== "todos") {
      result = result.filter((b) => b.regional_boleto === filters.regional);
    }
    if (filters.cooperativa !== "todos") {
      result = result.filter((b) => b.cooperativa === filters.cooperativa);
    }
    if (filters.diaVencimento !== "todos") {
      result = result.filter((b) => String(b.dia_vencimento_veiculo) === filters.diaVencimento);
    }

    return result;
  }, [boletos, filters]);

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

  const fetchBoletos = async (forceRefresh = false) => {
    if (!selectedAssociacao) {
      setBoletos([]);
      setImportacaoAtiva(null);
      setLoading(false);
      return;
    }

    // Cache global: exibição instantânea
    if (!forceRefresh) {
      const globalCached = getBICachedData(selectedAssociacao, "cobranca");
      if (globalCached && globalCached.data.length > 0) {
        setBoletos(globalCached.data);
        setImportacaoAtiva(globalCached.importacao);
        setLoading(false);
        return;
      }
      if (isPortalAccess) {
        const cached = getPrefetchedData<any>(selectedAssociacao, "cobranca");
        if (cached && cached.length > 0) {
          setBoletos(cached);
          setLoading(false);
          return;
        }
      }
    }

    // Marca esta chamada como a "mais recente". Se, ao terminar, uma chamada
    // mais nova já tiver começado (troca rápida de associação/filtro), esta
    // resposta é descartada em vez de sobrescrever o estado com dados
    // desatualizados ou de outra associação.
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
        const importacaoIds = importacoesAtivas.map((i) => i.id);

        const BATCH_SIZE = 1000;
        const MAX_ROWS = 100000;
        const CONCURRENCY = 8;

        // Busca o total de boletos primeiro (head request, sem baixar dados)
        // para poder disparar as páginas em ondas paralelas em vez de uma
        // sequencial de cada vez. Corretoras com histórico + recente somados
        // chegam a dezenas de milhares de boletos (ex.: ~97 mil), o que
        // levava a ~97 requisições em série e deixava a tela de Cobrança
        // visivelmente lenta para carregar.
        //
        // IMPORTANTE: esta consulta (head request) já teve erros engolidos
        // silenciosamente aqui antes — uma falha transitória fazia `count`
        // ficar undefined, `total` virar 0 e a tela mostrar "Nenhum Dado
        // Disponível" mesmo com boletos existindo no banco. Agora um erro
        // aqui interrompe o fluxo (vai para o catch) em vez de fingir que
        // há 0 registros.
        const { count, error: countError } = await supabase
          .from("cobranca_boletos")
          .select("*", { count: "exact", head: true })
          .in("importacao_id", importacaoIds);

        if (countError) throw countError;
        if (isStale()) return;

        const total = Math.min(count || 0, MAX_ROWS);
        const numBatches = Math.ceil(total / BATCH_SIZE);

        let allBoletos: any[] = [];
        let batchErrorCount = 0;
        for (let i = 0; i < numBatches; i += CONCURRENCY) {
          // Aborta ondas restantes se uma troca de associação/filtro mais
          // recente já começou — evita trabalho (e banda) desperdiçados.
          if (isStale()) return;

          const wave = Array.from({ length: Math.min(CONCURRENCY, numBatches - i) }, (_, j) => {
            const offset = (i + j) * BATCH_SIZE;
            return supabase
              .from("cobranca_boletos")
              .select("*")
              .in("importacao_id", importacaoIds)
              .range(offset, offset + BATCH_SIZE - 1);
          });

          const results = await Promise.all(wave);
          for (const { data: batch, error: bError } of results) {
            if (bError) {
              console.error("Erro ao buscar boletos:", bError);
              batchErrorCount++;
              continue;
            }
            if (batch) allBoletos = allBoletos.concat(batch);
          }
        }

        if (isStale()) return;

        if (total > 0 && allBoletos.length === 0) {
          // O banco reportou registros mas nenhum lote retornou dados: trata
          // como falha (não como "sem dados") para não gravar um resultado
          // vazio incorreto em cache por 10 minutos.
          throw new Error(`Falha ao carregar boletos de cobrança: ${total} esperados, 0 recebidos`);
        }

        // Aplicar deduplicação fiel ao SGA: 1 boleto por pessoa+vencimento (maior valor)
        // e remover boletos acumulados/refaturados (dia ≠ dia_vencimento_veiculo)
        const boletosFiel = dedupSGAFiel(allBoletos);
        console.log(`[Cobranca] Boletos brutos: ${allBoletos.length} → após dedup SGA: ${boletosFiel.length}`);
        setBoletos(boletosFiel);
        setImportacaoAtiva(importacoesAtivas[0]);

        // Só grava em cache se a leitura foi completa (sem erros de lote) —
        // um resultado parcial não deve virar "verdade" cacheada por 10 min.
        if (batchErrorCount === 0) {
          setBICachedData(selectedAssociacao, "cobranca", boletosFiel, importacoesAtivas[0]);
        }
        if (isPortalAccess) savePrefetchedData(selectedAssociacao, "cobranca", boletosFiel);

        if (batchErrorCount > 0) {
          toast.warning("Alguns lotes de boletos falharam ao carregar. Os dados exibidos podem estar incompletos — tente Sincronizar novamente.");
        }
      } else {
        setBoletos([]);
        setImportacaoAtiva(null);
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

  useEffect(() => {
    if (selectedAssociacao) {
      autoAdjustedMonthRef.current = false;
      fetchBoletos();
    } else {
      setBoletos([]);
      setImportacaoAtiva(null);
      setLoading(false);
    }
  }, [selectedAssociacao]);

  // Auto-ajuste do mes de referencia: usa mes atual, mas cai para o mes anterior se nao houver boleto no mes atual (so ajusta 1x por associacao)
  useEffect(() => {
    if (autoAdjustedMonthRef.current) return;
    if (loading) return;
    if (boletos.length === 0) return;
    if (filters.mesReferencia !== getMesAtual()) return;

    const temBoletoNoMesAtual = boletos.some((b) => {
      const dataRef = b.data_vencimento_original || b.data_vencimento;
      if (!dataRef) return false;
      return String(dataRef).substring(0, 7) === getMesAtual();
    });

    if (!temBoletoNoMesAtual) {
      setFilters((f) => ({ ...f, mesReferencia: getMesAnterior() }));
    }
    autoAdjustedMonthRef.current = true;
  }, [boletos, loading]);

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
            fetchBoletos(true);
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
            fetchBoletos(true);
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
              fetchBoletos(true);
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
        recordCount: filteredBoletos.length,
        hasActiveFilters: !!hasActiveFilters,
        fileName: importacaoAtiva?.nome_arquivo,
      });
    }
  }, [filteredBoletos.length, hasActiveFilters, importacaoAtiva?.nome_arquivo, biLayout, isPortalAccess]);

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
          recordCount={filteredBoletos.length}
          hasActiveFilters={!!hasActiveFilters}
          fileName={importacaoAtiva?.nome_arquivo}
        />
      )}

      {/* Filtros Globais */}
      {boletos.length > 0 && (
        <div className="container mx-auto px-4 pt-4">
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
      <div className="container mx-auto px-4 py-6">
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
              boletos={filteredBoletos}
              loading={loading}
              corretoraId={selectedAssociacao}
              mesReferencia={filters.mesReferencia}
              isPortalAccess={isPortalAccess}
            />
          </TabsContent>

          <TabsContent value="tabela">
            <CobrancaTabela boletos={filteredBoletos} loading={loading} corretoraId={selectedAssociacao} />
          </TabsContent>

          {!isPortalAccess && (
            <TabsContent value="importar">
              <CobrancaImportacao corretoraId={selectedAssociacao} onImportSuccess={fetchBoletos} />
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
