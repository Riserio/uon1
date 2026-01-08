import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Upload, Database, Map, BarChart3, TrendingUp, AlertTriangle, Car, History, Calendar, Filter, DollarSign } from "lucide-react";
import { toast } from "sonner";
import SGADashboard from "@/components/sga/SGADashboard";
import SGAImportacao from "@/components/sga/SGAImportacao";
import SGAMapa from "@/components/sga/SGAMapa";
import SGATabela from "@/components/sga/SGATabela";
import { BIAuditLogDialog } from "@/components/BIAuditLogDialog";
import { useAuth } from "@/hooks/useAuth";

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
  const [activeTab, setActiveTab] = useState("dashboard");
  const [eventos, setEventos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  
  // Filtros globais
  const [filters, setFilters] = useState<SGAFilters>({
    dataInicio: "",
    dataFim: "",
    regional: "todos",
    cooperativa: "todos",
    tipoVeiculo: "todos",
  });
  
  // Detectar se é acesso via portal (parceiro)
  const isPortalAccess = location.pathname.startsWith('/portal');
  
  // Verifica se pode ver histórico (superintendente ou admin)
  const canViewHistorico = userRole === "superintendente" || userRole === "admin";
  
  // Associações
  const [associacoes, setAssociacoes] = useState<any[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState<string>("");
  const [loadingAssociacoes, setLoadingAssociacoes] = useState(true);

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

  // Carregar associações
  useEffect(() => {
    async function fetchAssociacoes() {
      try {
        // Se é acesso via portal, usar apenas a associação da URL
        const associacaoParam = searchParams.get("associacao");
        
        if (isPortalAccess && associacaoParam) {
          // Para parceiros, buscar apenas a associação específica
          const { data, error } = await supabase
            .from("corretoras")
            .select("id, nome")
            .eq("id", associacaoParam)
            .single();

          if (error) throw error;

          if (data) {
            setAssociacoes([data]);
            setSelectedAssociacao(data.id);
          }
        } else {
          // Para acesso interno, buscar todas as associações
          const { data, error } = await supabase
            .from("corretoras")
            .select("id, nome")
            .order("nome");

          if (error) throw error;

          setAssociacoes(data || []);
          
          // Pegar associação da URL ou usar a primeira
          if (associacaoParam && data?.some(c => c.id === associacaoParam)) {
            setSelectedAssociacao(associacaoParam);
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

  const fetchEventos = async () => {
    if (!selectedAssociacao) {
      setEventos([]);
      setImportacaoAtiva(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Buscar importação ativa para a associação selecionada
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
        
        // Buscar eventos em lotes para ultrapassar limite de 1000 do Supabase
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

          // Segurança: máximo 100 lotes (100k registros)
          if (offset >= 100000) break;
        }

        console.log(`Total de eventos carregados: ${allEventos.length}`);
        setEventos(allEventos);
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
    }
  }, [selectedAssociacao]);

  const selectedAssociacaoNome = associacoes.find(a => a.id === selectedAssociacao)?.nome || "";

  const clearFilters = () => {
    setFilters({
      dataInicio: "",
      dataFim: "",
      regional: "todos",
      cooperativa: "todos",
      tipoVeiculo: "todos",
    });
  };

  const hasActiveFilters = filters.dataInicio || filters.dataFim || filters.regional !== "todos" || filters.cooperativa !== "todos" || filters.tipoVeiculo !== "todos";

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
      ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate(isPortalAccess 
                ? `/portal?associacao=${selectedAssociacao}` 
                : `/pid${selectedAssociacao ? `?associacao=${selectedAssociacao}` : ''}`
              )}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Eventos
              </h1>
              <p className="text-muted-foreground mt-1">
                Business Intelligence de Eventos
              </p>
            </div>
            
            <Button
              variant="outline"
              onClick={() => navigate(isPortalAccess 
                ? `/portal/mgf-insights?associacao=${selectedAssociacao}` 
                : `/mgf-insights${selectedAssociacao ? `?associacao=${selectedAssociacao}` : ''}`
              )}
              className="gap-2 border-orange-500/30 hover:bg-orange-500/10"
            >
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">MGF</span>
            </Button>
            
            {/* Botão Histórico - só para superintendente e admin */}
            {canViewHistorico && (
              <Button
                variant="outline"
                onClick={() => setHistoricoDialogOpen(true)}
                className="gap-2"
              >
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">Histórico</span>
              </Button>
            )}
            {importacaoAtiva && (
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-lg">
                <Database className="h-4 w-4" />
                <span>{filteredEventos.length.toLocaleString()} registros</span>
                {hasActiveFilters && <span className="text-primary">(filtrados)</span>}
                <span className="text-muted-foreground/50">|</span>
                <span>{importacaoAtiva.nome_arquivo}</span>
              </div>
            )}
          </div>

          {/* Seletor de Associação - apenas para acesso interno */}
          {!isPortalAccess && (
            <Card className="border-primary/20 bg-card/50 backdrop-blur mb-4">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                  <Label htmlFor="associacao-select-sga" className="text-base font-semibold whitespace-nowrap">
                    Associação:
                  </Label>
                  <Select 
                    value={selectedAssociacao} 
                    onValueChange={setSelectedAssociacao} 
                    disabled={loadingAssociacoes}
                  >
                    <SelectTrigger
                      id="associacao-select-sga"
                      className="w-full sm:max-w-md h-10 border-2"
                    >
                      <SelectValue placeholder="Selecione uma associação..." />
                    </SelectTrigger>
                    <SelectContent>
                      {associacoes.map((associacao) => (
                        <SelectItem key={associacao.id} value={associacao.id}>
                          {associacao.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Nome da Associação para parceiros */}
          {isPortalAccess && selectedAssociacaoNome && (
            <Card className="border-primary/20 bg-card/50 backdrop-blur mb-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold whitespace-nowrap">
                    Associação:
                  </Label>
                  <span className="text-lg font-medium">{selectedAssociacaoNome}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filtros Globais */}
          {eventos.length > 0 && (
            <Card className="border-primary/20 bg-card/50 backdrop-blur mb-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Filtros</span>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs">
                      Limpar filtros
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          {filteredEventos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <Card className="bg-card/50 backdrop-blur border-primary/20">
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
              <Card className="bg-card/50 backdrop-blur border-green-500/20">
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
              <Card className="bg-card/50 backdrop-blur border-yellow-500/20">
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
              <Card className="bg-card/50 backdrop-blur border-red-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-500/10">
                      <AlertTriangle className="h-5 w-5 text-red-500" />
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
          )}
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full max-w-3xl mx-auto bg-muted/50 ${isPortalAccess ? 'grid-cols-3' : 'grid-cols-4'}`}>
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

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

      {/* Modal Histórico de Alterações */}
      <BIAuditLogDialog
        open={historicoDialogOpen}
        onOpenChange={setHistoricoDialogOpen}
        modulo="sga_insights"
        corretoraId={selectedAssociacao}
      />
    </div>
  );
}
