import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Upload, Database, BarChart3, History, Filter, Calendar as CalendarIcon, CreditCard, MapPin, DollarSign } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import CobrancaDashboard from "@/components/cobranca/CobrancaDashboard";
import CobrancaImportacao from "@/components/cobranca/CobrancaImportacao";
import CobrancaTabela from "@/components/cobranca/CobrancaTabela";
import { BIAuditLogDialog } from "@/components/BIAuditLogDialog";
import { useAuth } from "@/hooks/useAuth";

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
  const [activeTab, setActiveTab] = useState("dashboard");
  const [boletos, setBoletos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  
  // Filtros globais
  const [filters, setFilters] = useState<CobrancaFilters>({
    mesReferencia: "",
    situacao: "todos",
    regional: "todos",
    cooperativa: "todos",
    diaVencimento: "todos",
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
    const regionais = [...new Set(boletos.map(b => b.regional_boleto).filter(Boolean))].sort();
    const cooperativas = [...new Set(boletos.map(b => b.cooperativa).filter(Boolean))].sort();
    const diasVencimento = [...new Set(boletos.map(b => b.dia_vencimento_veiculo).filter(v => v !== null))].sort((a, b) => a - b);
    const situacoes = [...new Set(boletos.map(b => b.situacao).filter(Boolean))].sort();
    return { regionais, cooperativas, diasVencimento, situacoes };
  }, [boletos]);

  // Boletos filtrados (excluir cancelados por padrão)
  const filteredBoletos = useMemo(() => {
    let result = boletos.filter(b => b.situacao?.toUpperCase() !== 'CANCELADO');
    
    if (filters.mesReferencia) {
      result = result.filter(b => {
        if (!b.data_vencimento_original) return false;
        const mes = b.data_vencimento_original.substring(0, 7);
        return mes === filters.mesReferencia;
      });
    }
    if (filters.situacao !== "todos") {
      result = result.filter(b => b.situacao?.toUpperCase() === filters.situacao.toUpperCase());
    }
    if (filters.regional !== "todos") {
      result = result.filter(b => b.regional_boleto === filters.regional);
    }
    if (filters.cooperativa !== "todos") {
      result = result.filter(b => b.cooperativa === filters.cooperativa);
    }
    if (filters.diaVencimento !== "todos") {
      result = result.filter(b => String(b.dia_vencimento_veiculo) === filters.diaVencimento);
    }
    
    return result;
  }, [boletos, filters]);

  // Carregar associações
  useEffect(() => {
    async function fetchAssociacoes() {
      try {
        const associacaoParam = searchParams.get("associacao");
        
        if (isPortalAccess && associacaoParam) {
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
          const { data, error } = await supabase
            .from("corretoras")
            .select("id, nome")
            .order("nome");

          if (error) throw error;

          setAssociacoes(data || []);
          
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

  const fetchBoletos = async () => {
    if (!selectedAssociacao) {
      setBoletos([]);
      setImportacaoAtiva(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Buscar importação ativa para a associação selecionada
      const { data: importacao, error: impError } = await supabase
        .from("cobranca_importacoes")
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
        
        // Buscar boletos em lotes
        const BATCH_SIZE = 1000;
        let allBoletos: any[] = [];
        let hasMore = true;
        let offset = 0;

        while (hasMore) {
          const { data: batch, error: bError } = await supabase
            .from("cobranca_boletos")
            .select("*")
            .eq("importacao_id", importacao.id)
            .range(offset, offset + BATCH_SIZE - 1);

          if (bError) {
            console.error("Erro ao buscar boletos:", bError);
            break;
          }

          if (batch && batch.length > 0) {
            allBoletos = [...allBoletos, ...batch];
            offset += BATCH_SIZE;
            hasMore = batch.length === BATCH_SIZE;
          } else {
            hasMore = false;
          }

          if (offset >= 100000) break;
        }

        console.log(`Total de boletos carregados: ${allBoletos.length}`);
        setBoletos(allBoletos);
      } else {
        setBoletos([]);
        setImportacaoAtiva(null);
      }
    } catch (error) {
      console.error("Erro:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAssociacao) {
      fetchBoletos();
    }
  }, [selectedAssociacao]);

  const selectedAssociacaoNome = associacoes.find(a => a.id === selectedAssociacao)?.nome || "";

  const clearFilters = () => {
    setFilters({
      mesReferencia: "",
      situacao: "todos",
      regional: "todos",
      cooperativa: "todos",
      diaVencimento: "todos",
    });
  };

  const hasActiveFilters = filters.mesReferencia || filters.situacao !== "todos" || filters.regional !== "todos" || filters.cooperativa !== "todos" || filters.diaVencimento !== "todos";

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-b">
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
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-400 bg-clip-text text-transparent">
                Cobrança
              </h1>
              <p className="text-muted-foreground mt-1">
                Business Intelligence de Cobrança e Inadimplência
              </p>
            </div>
            
            <Button
              variant="outline"
              onClick={() => navigate(isPortalAccess 
                ? `/portal/sga-insights?associacao=${selectedAssociacao}` 
                : `/sga-insights${selectedAssociacao ? `?associacao=${selectedAssociacao}` : ''}`
              )}
              className="gap-2 border-primary/30 hover:bg-primary/10"
            >
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Eventos</span>
            </Button>
            
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
                <span>{filteredBoletos.length.toLocaleString()} registros</span>
                {hasActiveFilters && <span className="text-emerald-600">(filtrados)</span>}
                <span className="text-muted-foreground/50">|</span>
                <span>{importacaoAtiva.nome_arquivo}</span>
              </div>
            )}
          </div>

          {/* Seletor de Associação */}
          {!isPortalAccess && (
            <Card className="border-emerald-500/20 bg-card/50 backdrop-blur mb-4">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                  <Label htmlFor="associacao-select-cobranca" className="text-base font-semibold whitespace-nowrap">
                    Associação:
                  </Label>
                  <Select 
                    value={selectedAssociacao} 
                    onValueChange={setSelectedAssociacao} 
                    disabled={loadingAssociacoes}
                  >
                    <SelectTrigger
                      id="associacao-select-cobranca"
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
            <Card className="border-emerald-500/20 bg-card/50 backdrop-blur mb-4">
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
          {boletos.length > 0 && (
            <Card className="border-emerald-500/20 bg-card/50 backdrop-blur mb-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-sm">Filtros</span>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs">
                      Limpar filtros
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Mês Referência</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-9 w-full justify-start text-left font-normal",
                            !filters.mesReferencia && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {filters.mesReferencia ? (
                            format(parse(filters.mesReferencia, "yyyy-MM", new Date()), "MMMM 'de' yyyy", { locale: ptBR })
                          ) : (
                            <span>dd/mm/aaaa</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={filters.mesReferencia ? parse(filters.mesReferencia, "yyyy-MM", new Date()) : undefined}
                          onSelect={(date) => {
                            if (date) {
                              setFilters(f => ({ ...f, mesReferencia: format(date, "yyyy-MM") }));
                            }
                          }}
                          defaultMonth={filters.mesReferencia ? parse(filters.mesReferencia, "yyyy-MM", new Date()) : new Date()}
                          locale={ptBR}
                          className={cn("p-3 pointer-events-auto")}
                          footer={
                            <div className="flex justify-between px-4 pb-2 pt-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-emerald-600 hover:text-emerald-700"
                                onClick={() => setFilters(f => ({ ...f, mesReferencia: "" }))}
                              >
                                Limpar
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-emerald-600 hover:text-emerald-700"
                                onClick={() => setFilters(f => ({ ...f, mesReferencia: format(new Date(), "yyyy-MM") }))}
                              >
                                Hoje
                              </Button>
                            </div>
                          }
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Situação</Label>
                    <Select value={filters.situacao} onValueChange={(v) => setFilters(f => ({ ...f, situacao: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        {filterOptions.situacoes.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Label className="text-xs text-muted-foreground">Dia Vencimento</Label>
                    <Select value={filters.diaVencimento} onValueChange={(v) => setFilters(f => ({ ...f, diaVencimento: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {filterOptions.diasVencimento.map(d => (
                          <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="dashboard">
            <CobrancaDashboard 
              boletos={filteredBoletos} 
              loading={loading} 
            />
          </TabsContent>

          <TabsContent value="tabela">
            <CobrancaTabela 
              boletos={filteredBoletos} 
              loading={loading}
            />
          </TabsContent>

          {!isPortalAccess && (
            <TabsContent value="importar">
              <CobrancaImportacao 
                corretoraId={selectedAssociacao}
                onImportSuccess={fetchBoletos}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Modal Histórico */}
      <BIAuditLogDialog
        open={historicoDialogOpen}
        onOpenChange={setHistoricoDialogOpen}
        modulo="cobranca_insights"
        corretoraId={selectedAssociacao}
      />
    </div>
  );
}
