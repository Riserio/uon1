import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, Database, BarChart3, History, Filter } from "lucide-react";
import { toast } from "sonner";
import MGFDashboard from "@/components/mgf/MGFDashboard";
import MGFImportacao from "@/components/mgf/MGFImportacao";
import MGFTabela from "@/components/mgf/MGFTabela";
import { BIAuditLogDialog } from "@/components/BIAuditLogDialog";
import { useAuth } from "@/hooks/useAuth";

export default function MGFInsights() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userRole } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dados, setDados] = useState<any[]>([]);
  const [colunas, setColunas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  
  // Associações
  const [associacoes, setAssociacoes] = useState<any[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState<string>("");
  const [loadingAssociacoes, setLoadingAssociacoes] = useState(true);

  // Verifica se pode ver histórico (superintendente ou admin)
  const canViewHistorico = userRole === "superintendente" || userRole === "admin";

  // Carregar associações
  useEffect(() => {
    async function fetchAssociacoes() {
      try {
        const { data, error } = await supabase
          .from("corretoras")
          .select("id, nome")
          .order("nome");

        if (error) throw error;

        setAssociacoes(data || []);
        
        // Pegar associação da URL ou usar a primeira
        const associacaoParam = searchParams.get("associacao");
        if (associacaoParam && data?.some(c => c.id === associacaoParam)) {
          setSelectedAssociacao(associacaoParam);
        } else if (data && data.length > 0) {
          setSelectedAssociacao(data[0].id);
        }
      } catch (error) {
        console.error("Erro ao carregar associações:", error);
        toast.error("Erro ao carregar associações");
      } finally {
        setLoadingAssociacoes(false);
      }
    }

    fetchAssociacoes();
  }, [searchParams]);

  const fetchDados = async () => {
    if (!selectedAssociacao) {
      setDados([]);
      setImportacaoAtiva(null);
      setColunas([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Buscar importação ativa para a associação selecionada
      const { data: importacao, error: impError } = await supabase
        .from("mgf_importacoes")
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
        setColunas(Array.isArray(importacao.colunas_detectadas) ? importacao.colunas_detectadas as string[] : []);
        
        // Buscar dados em lotes
        const BATCH_SIZE = 1000;
        let allDados: any[] = [];
        let hasMore = true;
        let offset = 0;

        while (hasMore) {
          const { data: batch, error: dataError } = await supabase
            .from("mgf_dados")
            .select("*")
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

        console.log(`Total de dados MGF carregados: ${allDados.length}`);
        setDados(allDados);
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

  const selectedAssociacaoNome = associacoes.find(a => a.id === selectedAssociacao)?.nome || "";

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "tabela", label: "Dados Completos", icon: Database },
    { id: "importar", label: "Importar Dados", icon: Upload },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate(-1)}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent">
                MGF Insights
              </h1>
              <p className="text-muted-foreground mt-1">
                Business Intelligence de Dados MGF
              </p>
            </div>
            
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
                <span>{dados.length.toLocaleString()} registros</span>
                <span className="text-muted-foreground/50">|</span>
                <span>{importacaoAtiva.nome_arquivo}</span>
              </div>
            )}
          </div>

          {/* Seletor de Associação */}
          <Card className="border-orange-500/20 bg-card/50 backdrop-blur mb-4">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                <Label htmlFor="associacao-select-mgf" className="text-base font-semibold whitespace-nowrap">
                  Associação:
                </Label>
                <Select 
                  value={selectedAssociacao} 
                  onValueChange={setSelectedAssociacao} 
                  disabled={loadingAssociacoes}
                >
                  <SelectTrigger
                    id="associacao-select-mgf"
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
        </div>
      </div>

      {/* Tabs */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-3 mb-6">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard">
            <MGFDashboard 
              dados={dados} 
              colunas={colunas}
              loading={loading} 
              associacaoNome={selectedAssociacaoNome}
            />
          </TabsContent>

          <TabsContent value="tabela">
            <MGFTabela 
              dados={dados} 
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
    </div>
  );
}
