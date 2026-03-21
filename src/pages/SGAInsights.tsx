import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Upload, Database, Map, BarChart3, TrendingUp, AlertTriangle, Car, History, Calendar, Filter, DollarSign, CreditCard, LogOut, ArrowLeftRight, Building2, Activity, ChevronDown, Globe } from "lucide-react";
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
import { getPrefetchedData, savePrefetchedData } from "@/hooks/usePortalDataPrefetch";
import { getBICachedData, setBICachedData, getCachedAssociacoes, setCachedAssociacoes } from "@/hooks/useBIGlobalCache";
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
}

export default function SGAInsights() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { userRole } = useAuth();
  const biLayout = useBILayoutOptional();
  const portalLayout = usePortalLayoutOptional();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [eventos, setEventos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  
  // Filtros globais - padrão: últimos 12 meses
  const getDefaultDateRange = () => {
    const hoje = new Date();
    const dataFim = format(hoje, "yyyy-MM-dd");
    const dataInicio = format(new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate()), "yyyy-MM-dd");
    return { dataInicio, dataFim };
  };
  
  const defaultDates = getDefaultDateRange();
  
  const [filters, setFilters] = useState<SGAFilters>({
    dataInicio: defaultDates.dataInicio,
    dataFim: defaultDates.dataFim,
    regional: "todos",
    cooperativa: "todos",
    tipoVeiculo: "todos",
  });
  
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Detectar se é acesso via portal (parceiro)
  const isPortalAccess = location.pathname.startsWith('/portal');
  
  // Verifica se pode ver histórico (superintendente ou admin)
  const canViewHistorico = userRole === "superintendente" || userRole === "admin";
  
  // Associações e permissões
  const [associacoes, setAssociacoes] = useState<any[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState<string>("");
  const [loadingAssociacoes, setLoadingAssociacoes] = useState(true);
  const [modulosBi, setModulosBi] = useState<string[]>(['indicadores', 'eventos', 'mgf', 'cobranca']);
  const [corretoraData, setCorretoraData] = useState<{ id: string; nome: string; logo_url?: string | null } | null>(null);
  const [multipleAssociacoes, setMultipleAssociacoes] = useState(false);

  // Extrair opções únicas para filtros
  const filterOptions = useMemo(() => {
    const regionais = [...new Set(eventos.map(e => e.regional).filter(Boolean))].sort();
    const cooperativas = [...new Set(eventos.map(e => e.cooperativa).filter(Boolean))].sort();
    const tiposVeiculo = [...new Set(eventos.map(e => {
      const modelo = e.modelo_veiculo || "";
      if (modelo.toLowerCase().includes("moto") || modelo.toLowerCase().includes("honda") || modelo.toLowerCase().includes("yamaha")) return "Motocicleta";
      if (modelo.toLowerCase().includes("caminhao") || modelo.toLowerCase().includes("caminhão") || modelo.toLowerCase().includes("truck")) return "Caminhão";
      return "Passeio";
    }))].sort();
    return { regionais, cooperativas, tiposVeiculo };
  }, [eventos]);

  // Eventos filtrados
  const filteredEventos = useMemo(() => {
    let result = [...eventos];
    
    if (filters.dataInicio) {
      result = result.filter(e => e.data_evento && e.data_evento >= filters.dataInicio);
    }
    if (filters.dataFim) {
      result = result.filter(e => e.data_evento && e.data_evento <= filters.dataFim);
    }
    if (filters.regional !== "todos") {
      result = result.filter(e => e.regional === filters.regional);
    }
    if (filters.cooperativa !== "todos") {
      result = result.filter(e => e.cooperativa === filters.cooperativa);
    }
    if (filters.tipoVeiculo !== "todos") {
      result = result.filter(e => {
        const modelo = e.modelo_veiculo || "";
        if (filters.tipoVeiculo === "Motocicleta") {
          return modelo.toLowerCase().includes("moto") || modelo.toLowerCase().includes("honda") || modelo.toLowerCase().includes("yamaha");
        }
        if (filters.tipoVeiculo === "Caminhão") {
          return modelo.toLowerCase().includes("caminhao") || modelo.toLowerCase().includes("caminhão") || modelo.toLowerCase().includes("truck");
        }
        return !modelo.toLowerCase().includes("moto") && !modelo.toLowerCase().includes("caminhao") && !modelo.toLowerCase().includes("caminhão");
      });
    }
    
    return result;
  }, [eventos, filters]);

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
      setModulosBi(c.modulos_bi || ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base']);
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
          if (associacaoParam2 && cached.some(c => c.id === associacaoParam2)) {
            setSelectedAssociacao(associacaoParam2);
          } else if (!selectedAssociacao) {
            setSelectedAssociacao(cached[0].id);
          }
          setLoadingAssociacoes(false);
        }
        
        const { data, error } = await supabase
          .from("corretoras")
          .select("id, nome")
          .order("nome");

        if (error) throw error;
        setAssociacoes(data || []);
        setCachedAssociacoes(data || []);
        
        if (!cached || cached.length === 0) {
          if (associacaoParam2 && data?.some(c => c.id === associacaoParam2)) {
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

  const fetchEventos = async (forceRefresh = false) => {
    if (!selectedAssociacao) {
      setEventos([]);
      setImportacaoAtiva(null);
      setLoading(false);
      return;
    }

    // Cache global: exibição instantânea ao navegar entre módulos
    if (!forceRefresh) {
      const globalCached = getBICachedData(selectedAssociacao, 'eventos');
      if (globalCached && globalCached.data.length > 0) {
        setEventos(globalCached.data);
        setImportacaoAtiva(globalCached.importacao);
        setLoading(false);
        return;
      }
      // Portal prefetch cache: show immediately but fetch full data in background
      if (isPortalAccess) {
        const cached = getPrefetchedData<any>(selectedAssociacao, 'eventos');
        if (cached && cached.length > 0) {
          setEventos(cached);
          setLoading(false);
          // Continue to fetch full data in background (prefetch only has 1000 records)
        }
      }
    }

    setLoading(true);
    try {
      const { data: importacao, error: impError } = await supabase
        .from("sga_importacoes")
        .select("*")
        .eq("ativo", true)
        .eq("corretora_id", selectedAssociacao)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (impError && impError.code !== "PGRST116") {
        console.error("Erro ao buscar importação:", impError);
      }

      if (importacao) {
        setImportacaoAtiva(importacao);
        
        const BATCH_SIZE = 1000;
        let allEventos: any[] = [];
        let hasMore = true;
        let offset = 0;

        while (hasMore) {
          const { data: batch, error: evError } = await supabase
            .from("sga_eventos")
            .select("*")
            .eq("importacao_id", importacao.id)
            .range(offset, offset + BATCH_SIZE - 1);

          if (evError) {
            console.error("Erro ao buscar eventos:", evError);
            break;
          }

          if (batch && batch.length > 0) {
            allEventos = [...allEventos, ...batch];
            offset += BATCH_SIZE;
            hasMore = batch.length === BATCH_SIZE;
          } else {
            hasMore = false;
          }

          if (offset >= 100000) break;
        }

        setEventos(allEventos);
        setBICachedData(selectedAssociacao, 'eventos', allEventos, importacao);
        if (isPortalAccess) savePrefetchedData(selectedAssociacao, 'eventos', allEventos);
      } else {
        setEventos([]);
        setImportacaoAtiva(null);
      }
    } catch (error) {
      console.error("Erro:", error);
    } finally {
      setLoading(false);
    }
  };

  // Recarregar eventos quando associação mudar
  useEffect(() => {
    if (selectedAssociacao) {
      fetchEventos();
    } else {
      setEventos([]);
      setImportacaoAtiva(null);
      setLoading(false);
    }
  }, [selectedAssociacao]);

  const selectedAssociacaoNome = associacoes.find(a => a.id === selectedAssociacao)?.nome || "";

  const clearFilters = () => {
    const defaultDates = getDefaultDateRange();
    setFilters({
      dataInicio: defaultDates.dataInicio,
      dataFim: defaultDates.dataFim,
      regional: "todos",
      cooperativa: "todos",
      tipoVeiculo: "todos",
    });
  };

  const hasActiveFilters = filters.dataInicio || filters.dataFim || filters.regional !== "todos" || filters.cooperativa !== "todos" || filters.tipoVeiculo !== "todos";

  // Update shared header dynamic props
  useEffect(() => {
    if (biLayout && !isPortalAccess) {
      biLayout.setHeaderDynamic({
        recordCount: filteredEventos.length,
        hasActiveFilters: !!hasActiveFilters,
        fileName: importacaoAtiva?.nome_arquivo,
      });
    }
  }, [filteredEventos.length, hasActiveFilters, importacaoAtiva?.nome_arquivo, biLayout, isPortalAccess]);

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
  const availableModules: ('indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base')[] = [
    ...(modulosBi.includes('indicadores') ? ['indicadores'] as const : []),
    ...(modulosBi.includes('eventos') ? ['eventos'] as const : []),
    ...(modulosBi.includes('mgf') ? ['mgf'] as const : []),
    ...(modulosBi.includes('cobranca') ? ['cobranca'] as const : []),
    ...(modulosBi.includes('estudo-base') ? ['estudo-base'] as const : []),
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
            modulos_bi: modulosBi
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
          recordCount={filteredEventos.length}
          hasActiveFilters={!!hasActiveFilters}
          fileName={importacaoAtiva?.nome_arquivo}
        />
      )}

      {/* Filtros colapsáveis */}
      {eventos.length > 0 && (
        <div className="container mx-auto px-4 pt-4">
          <Card className="bg-card/50 backdrop-blur border-border/50 overflow-hidden">
            {/* Filtros Header - sempre visível */}
            <button
              onClick={() => setFiltersOpen(o => !o)}
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
                {/* Resumo dos filtros ativos quando fechado */}
                {!filtersOpen && hasActiveFilters && (
                  <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                    {[
                      filters.dataInicio && `De: ${filters.dataInicio}`,
                      filters.dataFim && `Até: ${filters.dataFim}`,
                      filters.regional !== "todos" && filters.regional,
                      filters.cooperativa !== "todos" && filters.cooperativa,
                      filters.tipoVeiculo !== "todos" && filters.tipoVeiculo,
                    ].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); clearFilters(); }}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Limpar
                  </Button>
                )}
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {/* Filtros corpo - colapsável */}
            {filtersOpen && (
              <div className="px-4 pb-4 border-t border-border/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Data Início</Label>
                    <Input
                      type="date"
                      value={filters.dataInicio}
                      onChange={(e) => setFilters(f => ({ ...f, dataInicio: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Data Fim</Label>
                    <Input
                      type="date"
                      value={filters.dataFim}
                      onChange={(e) => setFilters(f => ({ ...f, dataFim: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Regional</Label>
                    <Select value={filters.regional} onValueChange={(v) => setFilters(f => ({ ...f, regional: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas Regionais</SelectItem>
                        {filterOptions.regionais.map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Cooperativa</Label>
                    <Select value={filters.cooperativa} onValueChange={(v) => setFilters(f => ({ ...f, cooperativa: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas Cooperativas</SelectItem>
                        {filterOptions.cooperativas.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tipo Veículo</Label>
                    <Select value={filters.tipoVeiculo} onValueChange={(v) => setFilters(f => ({ ...f, tipoVeiculo: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos Tipos</SelectItem>
                        <SelectItem value="Passeio">Passeio</SelectItem>
                        <SelectItem value="Motocicleta">Motocicleta</SelectItem>
                        <SelectItem value="Caminhão">Caminhão</SelectItem>
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
      {filteredEventos.length > 0 && (
        <div className="container mx-auto px-4 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Car className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{filteredEventos.length.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Eventos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {filteredEventos.filter(e => e.situacao_evento === "FINALIZADO").length.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Finalizados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/10">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {filteredEventos.filter(e => e.situacao_evento === "EM ANALISE" || e.situacao_evento === "ABERTO").length.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Em Análise</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' })
                        .format(filteredEventos.reduce((acc, e) => acc + (e.custo_evento || 0), 0))}
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
            <SGADashboard eventos={filteredEventos} loading={loading} />
          </TabsContent>

          <TabsContent value="mapa">
            <SGAMapa eventos={filteredEventos} loading={loading} />
          </TabsContent>

          <TabsContent value="tabela">
            <SGATabela eventos={filteredEventos} loading={loading} />
          </TabsContent>

          {!isPortalAccess && (
            <TabsContent value="importar">
              <SGAImportacao 
                onImportSuccess={fetchEventos} 
                corretoraId={selectedAssociacao}
                corretoraNome={selectedAssociacaoNome}
              />
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
          <PortalPageWrapper>
            {portalContent}
          </PortalPageWrapper>
        </div>
      </PortalCarouselProvider>
    );
  }

  // Inside BILayout - just return content (no wrapper needed)
  return <>{portalContent}</>;
}
