import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, Database, BarChart3, History, Filter, X, Calendar, MapPin, CreditCard, FileSpreadsheet, LogOut, Building2, Activity, DollarSign, TrendingUp, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import MGFDashboard from "@/components/mgf/MGFDashboard";
import MGFImportacao from "@/components/mgf/MGFImportacao";
import MGFTabela from "@/components/mgf/MGFTabela";
import MGFRelatorioEventos from "@/components/mgf/MGFRelatorioEventos";
import { BIAuditLogDialog } from "@/components/BIAuditLogDialog";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import PortalHeader from "@/components/portal/PortalHeader";
import BIPageHeader from "@/components/bi/BIPageHeader";
import { getPrefetchedData, savePrefetchedData } from "@/hooks/usePortalDataPrefetch";
import { getBICachedData, setBICachedData } from "@/hooks/useBIGlobalCache";
import PortalPageWrapper from "@/components/portal/PortalPageWrapper";
import { PortalCarouselProvider } from "@/contexts/PortalCarouselContext";

export interface MGFFilters {
  operacao: string;
  subOperacao: string;
  situacao: string;
  cooperativa: string;
  regional: string;
  formaPagamento: string;
  tipoVeiculo: string;
  dateRange: DateRange | undefined;
}

export default function MGFInsights() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { userRole } = useAuth();
  
  // Detectar se é acesso via portal (parceiro)
  const isPortalAccess = location.pathname.startsWith('/portal');
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dados, setDados] = useState<any[]>([]);
  const [colunas, setColunas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  
  // Associações e permissões
  const [associacoes, setAssociacoes] = useState<any[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState<string>("");
  const [loadingAssociacoes, setLoadingAssociacoes] = useState(true);
  const [modulosBi, setModulosBi] = useState<string[]>(['indicadores', 'eventos', 'mgf', 'cobranca']);
  const [corretoraData, setCorretoraData] = useState<{ id: string; nome: string; logo_url?: string | null } | null>(null);
  const [multipleAssociacoes, setMultipleAssociacoes] = useState(false);

  // Filtros globais (estilo SGA) - padrão: últimos 12 meses
  const getDefaultDateRange = () => {
    const hoje = new Date();
    const from = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
    return { from, to: hoje };
  };
  
  const [filters, setFilters] = useState<MGFFilters>({
    operacao: "all",
    subOperacao: "all",
    situacao: "all",
    cooperativa: "all",
    regional: "all",
    formaPagamento: "all",
    tipoVeiculo: "all",
    dateRange: getDefaultDateRange(),
  });

  // Verifica se pode ver histórico (superintendente ou admin)
  const canViewHistorico = userRole === "superintendente" || userRole === "admin";

  // Carregar associações
  useEffect(() => {
    async function fetchAssociacoes() {
      try {
        // Se é acesso via portal, usar apenas a associação da URL
        const associacaoParam = searchParams.get("associacao");
        
        if (isPortalAccess && associacaoParam) {
          // Para parceiros, buscar a associação e suas permissões
          const { data: corretora, error: corretoraError } = await supabase
            .from("corretoras")
            .select("id, nome, logo_url")
            .eq("id", associacaoParam)
            .single();

          if (corretoraError) throw corretoraError;

          if (corretora) {
            // Buscar permissões do usuário para esta corretora
            const { data: usuarioData } = await supabase
              .from("corretora_usuarios")
              .select("modulos_bi")
              .eq("corretora_id", associacaoParam)
              .eq("ativo", true)
              .maybeSingle();

            setAssociacoes([{ id: corretora.id, nome: corretora.nome }]);
            setSelectedAssociacao(corretora.id);
            setCorretoraData(corretora);
            setModulosBi(usuarioData?.modulos_bi || ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base']);
            
            // Verificar se usuário tem múltiplas associações
            const { data: todasAssociacoes } = await supabase
              .from("corretora_usuarios")
              .select("corretora_id")
              .eq("ativo", true);
            setMultipleAssociacoes((todasAssociacoes?.length || 0) > 1);
          }
        } else {
          // Para acesso interno, buscar todas as associações
          const { data, error } = await supabase
            .from("corretoras")
            .select("id, nome")
            .order("nome");

          if (error) throw error;

          setAssociacoes(data || []);
          
          const associacaoParamFallback = searchParams.get("associacao");
          if (associacaoParamFallback && data?.some(c => c.id === associacaoParamFallback)) {
            setSelectedAssociacao(associacaoParamFallback);
          } else if (data && data.length > 0) {
            setSelectedAssociacao(data[0].id);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar associações:", error);
        toast.error("Erro ao carregar associações");
      } finally {
        setLoadingAssociacoes(false);
      }
    }

    fetchAssociacoes();
  }, [searchParams, isPortalAccess]);

  const fetchDados = async (forceRefresh = false) => {
    if (!selectedAssociacao) {
      setDados([]);
      setImportacaoAtiva(null);
      setColunas([]);
      setLoading(false);
      return;
    }

    // Cache global: exibição instantânea
    if (!forceRefresh) {
      const globalCached = getBICachedData(selectedAssociacao, 'mgf');
      if (globalCached && globalCached.data.length > 0) {
        setDados(globalCached.data);
        setImportacaoAtiva(globalCached.importacao);
        if (globalCached.importacao?.colunas_detectadas) {
          setColunas(Array.isArray(globalCached.importacao.colunas_detectadas) ? globalCached.importacao.colunas_detectadas as string[] : []);
        }
        setLoading(false);
        return;
      }
      if (isPortalAccess) {
        const cached = getPrefetchedData<any>(selectedAssociacao, 'mgf');
        if (cached && cached.length > 0) {
          setDados(cached);
          setLoading(false);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const { data: importacao, error: impError } = await supabase
        .from("mgf_importacoes")
        .select("id, nome_arquivo, colunas_detectadas, total_registros, created_at")
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
        setColunas(Array.isArray(importacao.colunas_detectadas) ? importacao.colunas_detectadas as string[] : []);
        
        const BATCH_SIZE = 1000;
        let allDados: any[] = [];
        let hasMore = true;
        let offset = 0;
        const SELECT_COLS = "id, operacao, sub_operacao, descricao, fornecedor, centro_custo, valor, valor_pagamento, data_vencimento, data_vencimento_original, situacao_pagamento, data_pagamento, controle_interno, veiculo_evento, cooperativa, regional, regional_evento, forma_pagamento, tipo_veiculo, categoria_veiculo, multa, juros, nota_fiscal, valor_total_lancamento, data_nota_fiscal, quantidade_parcela, veiculo_lancamento, classificacao_veiculo, associado, cnpj_fornecedor, cpf_cnpj_cliente, nome_fantasia_fornecedor, voluntario, mes_referente, impostos, protocolo_evento, motivo_evento, terceiro_evento, data_evento, placa_terceiro_evento";

        while (hasMore) {
          const { data: batch, error: dataError } = await supabase
            .from("mgf_dados")
            .select(SELECT_COLS)
            .eq("importacao_id", importacao.id)
            .range(offset, offset + BATCH_SIZE - 1);

          if (dataError) {
            console.error("Erro ao buscar dados:", dataError);
            break;
          }

          if (batch && batch.length > 0) {
            allDados = [...allDados, ...batch];
            offset += BATCH_SIZE;
            hasMore = batch.length === BATCH_SIZE;
          } else {
            hasMore = false;
          }

          if (offset >= 100000) break;
        }

        setDados(allDados);
        setBICachedData(selectedAssociacao, 'mgf', allDados, importacao);
        if (isPortalAccess) savePrefetchedData(selectedAssociacao, 'mgf', allDados);
      } else {
        setDados([]);
        setImportacaoAtiva(null);
        setColunas([]);
      }
    } catch (error) {
      console.error("Erro:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAssociacao) {
      fetchDados();
    }
  }, [selectedAssociacao]);

  // Extrair opções únicas para filtros
  const filterOptions = useMemo(() => {
    const operacoes = new Set<string>();
    const subOperacoes = new Set<string>();
    const situacoes = new Set<string>();
    const cooperativas = new Set<string>();
    const regionais = new Set<string>();
    const formasPagamento = new Set<string>();
    const tiposVeiculo = new Set<string>();

    dados.forEach(d => {
      if (d.operacao) operacoes.add(d.operacao);
      if (d.sub_operacao) subOperacoes.add(d.sub_operacao);
      if (d.situacao_pagamento) situacoes.add(d.situacao_pagamento);
      if (d.cooperativa) cooperativas.add(d.cooperativa);
      if (d.regional || d.regional_evento) regionais.add(d.regional || d.regional_evento);
      if (d.forma_pagamento) formasPagamento.add(d.forma_pagamento);
      if (d.tipo_veiculo || d.categoria_veiculo) tiposVeiculo.add(d.tipo_veiculo || d.categoria_veiculo);
    });

    return {
      operacoes: Array.from(operacoes).sort(),
      subOperacoes: Array.from(subOperacoes).sort(),
      situacoes: Array.from(situacoes).sort(),
      cooperativas: Array.from(cooperativas).sort(),
      regionais: Array.from(regionais).sort(),
      formasPagamento: Array.from(formasPagamento).sort(),
      tiposVeiculo: Array.from(tiposVeiculo).sort(),
    };
  }, [dados]);

  // Aplicar filtros
  const filteredDados = useMemo(() => {
    let result = dados;

    if (filters.operacao !== "all") {
      result = result.filter(d => d.operacao === filters.operacao);
    }
    if (filters.subOperacao !== "all") {
      result = result.filter(d => d.sub_operacao === filters.subOperacao);
    }
    if (filters.situacao !== "all") {
      result = result.filter(d => d.situacao_pagamento === filters.situacao);
    }
    if (filters.cooperativa !== "all") {
      result = result.filter(d => d.cooperativa === filters.cooperativa);
    }
    if (filters.regional !== "all") {
      result = result.filter(d => (d.regional || d.regional_evento) === filters.regional);
    }
    if (filters.formaPagamento !== "all") {
      result = result.filter(d => d.forma_pagamento === filters.formaPagamento);
    }
    if (filters.tipoVeiculo !== "all") {
      result = result.filter(d => (d.tipo_veiculo || d.categoria_veiculo) === filters.tipoVeiculo);
    }
    if (filters.dateRange?.from) {
      result = result.filter(d => {
        const dataRef = d.data_vencimento || d.data_evento || d.data_nota_fiscal;
        if (!dataRef) return false;
        const date = new Date(dataRef);
        if (filters.dateRange?.from && date < filters.dateRange.from) return false;
        if (filters.dateRange?.to && date > filters.dateRange.to) return false;
        return true;
      });
    }

    return result;
  }, [dados, filters]);

  // Contar filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.operacao !== "all") count++;
    if (filters.subOperacao !== "all") count++;
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
      operacao: "all",
      subOperacao: "all",
      situacao: "all",
      cooperativa: "all",
      regional: "all",
      formaPagamento: "all",
      tipoVeiculo: "all",
      dateRange: getDefaultDateRange(),
    });
  };

  const selectedAssociacaoNome = associacoes.find(a => a.id === selectedAssociacao)?.nome || "";

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
  const availableModules: ('indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base')[] = [
    ...(modulosBi.includes('indicadores') ? ['indicadores'] as const : []),
    ...(modulosBi.includes('eventos') ? ['eventos'] as const : []),
    ...(modulosBi.includes('mgf') ? ['mgf'] as const : []),
    ...(modulosBi.includes('cobranca') ? ['cobranca'] as const : []),
    ...(modulosBi.includes('estudo-base') ? ['estudo-base'] as const : []),
  ];

  const portalContent = (
    <>
      {/* Portal Header para parceiros */}
      {isPortalAccess && corretoraData && (
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
          currentModule="mgf"
          showCarouselControls={true}
        />
      )}

      {/* Header interno (não parceiro) */}
      {!isPortalAccess && (
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
          recordCount={filteredDados.length}
          fileName={importacaoAtiva?.nome_arquivo}
        />
      )}

      {/* Filtros Globais (estilo SGA) */}
      {dados.length > 0 && (
        <div className="container mx-auto px-4 pt-4">
          <Card className="border-orange-500/20 bg-card/50 backdrop-blur">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="h-4 w-4 text-orange-500" />
                <span className="font-semibold text-sm">Filtros Globais</span>
                {activeFiltersCount > 0 && (
                  <>
                    <Badge variant="secondary" className="ml-2">
                      {activeFiltersCount} ativo{activeFiltersCount > 1 ? "s" : ""}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs">
                      <X className="h-3 w-3 mr-1" />
                      Limpar
                    </Button>
                  </>
                )}
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
                {/* Operação */}
                <Select value={filters.operacao} onValueChange={(v) => setFilters(f => ({ ...f, operacao: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Operação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas Operações</SelectItem>
                    {filterOptions.operacoes.map(o => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* SubOperação */}
                <Select value={filters.subOperacao} onValueChange={(v) => setFilters(f => ({ ...f, subOperacao: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="SubOperação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas SubOp.</SelectItem>
                    {filterOptions.subOperacoes.map(o => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Situação */}
                <Select value={filters.situacao} onValueChange={(v) => setFilters(f => ({ ...f, situacao: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Situação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas Situações</SelectItem>
                    {filterOptions.situacoes.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Cooperativa */}
                <Select value={filters.cooperativa} onValueChange={(v) => setFilters(f => ({ ...f, cooperativa: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Cooperativa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas Cooperativas</SelectItem>
                    {filterOptions.cooperativas.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Regional */}
                <Select value={filters.regional} onValueChange={(v) => setFilters(f => ({ ...f, regional: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Regional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas Regionais</SelectItem>
                    {filterOptions.regionais.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Forma Pagamento */}
                <Select value={filters.formaPagamento} onValueChange={(v) => setFilters(f => ({ ...f, formaPagamento: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Forma Pgto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas Formas</SelectItem>
                    {filterOptions.formasPagamento.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Tipo Veículo */}
                <Select value={filters.tipoVeiculo} onValueChange={(v) => setFilters(f => ({ ...f, tipoVeiculo: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Tipo Veículo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Tipos</SelectItem>
                    {filterOptions.tiposVeiculo.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
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
                            {format(filters.dateRange.from, "dd/MM", { locale: ptBR })} - {format(filters.dateRange.to, "dd/MM", { locale: ptBR })}
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
                      onSelect={(range) => setFilters(f => ({ ...f, dateRange: range }))}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
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
              dados={filteredDados} 
              colunas={colunas}
              loading={loading} 
              associacaoNome={selectedAssociacaoNome}
            />
          </TabsContent>

          <TabsContent value="eventos">
            <MGFRelatorioEventos 
              dados={filteredDados} 
              loading={loading} 
            />
          </TabsContent>

          <TabsContent value="tabela">
            <MGFTabela 
              dados={filteredDados} 
              colunas={colunas}
              loading={loading} 
            />
          </TabsContent>

          <TabsContent value="importar">
            <MGFImportacao 
              onImportSuccess={fetchDados} 
              corretoraId={selectedAssociacao}
              corretoraNome={selectedAssociacaoNome}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de Histórico */}
      <BIAuditLogDialog
        open={historicoDialogOpen}
        onOpenChange={setHistoricoDialogOpen}
        modulo="mgf_insights"
        corretoraId={selectedAssociacao}
      />
    </>
  );

  // Se é acesso via portal, envolver com provider do carrossel
  if (isPortalAccess && corretoraData) {
    return (
      <PortalCarouselProvider
        corretoraId={corretoraData.id}
        availableModules={availableModules}
        currentModule="mgf"
      >
        <div className="min-h-screen bg-background">
          <PortalPageWrapper>
            {portalContent}
          </PortalPageWrapper>
        </div>
      </PortalCarouselProvider>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {portalContent}
    </div>
  );
}
