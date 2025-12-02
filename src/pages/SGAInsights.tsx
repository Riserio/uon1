import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Upload, Database, Map, BarChart3, History, TrendingUp, AlertTriangle, Car } from "lucide-react";
import { toast } from "sonner";
import SGADashboard from "@/components/sga/SGADashboard";
import SGAImportacao from "@/components/sga/SGAImportacao";
import SGAHistoricoImportacoes from "@/components/sga/SGAHistoricoImportacoes";
import SGAMapa from "@/components/sga/SGAMapa";
import SGATabela from "@/components/sga/SGATabela";

export default function SGAInsights() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [eventos, setEventos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);

  const fetchEventos = async () => {
    setLoading(true);
    try {
      // Buscar importação ativa
      const { data: importacao, error: impError } = await supabase
        .from("sga_importacoes")
        .select("*")
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (impError && impError.code !== "PGRST116") {
        console.error("Erro ao buscar importação:", impError);
      }

      if (importacao) {
        setImportacaoAtiva(importacao);
        
        // Buscar eventos dessa importação
        const { data: eventosData, error: evError } = await supabase
          .from("sga_eventos")
          .select("*")
          .eq("importacao_id", importacao.id);

        if (evError) {
          console.error("Erro ao buscar eventos:", evError);
        } else {
          setEventos(eventosData || []);
        }
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

  useEffect(() => {
    fetchEventos();
  }, []);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "mapa", label: "Mapa Geográfico", icon: Map },
    { id: "tabela", label: "Dados Completos", icon: Database },
    { id: "importar", label: "Importar Dados", icon: Upload },
    { id: "historico", label: "Histórico", icon: History },
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
              onClick={() => navigate("/pid")}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                SGA Insights
              </h1>
              <p className="text-muted-foreground mt-1">
                Business Intelligence de Eventos do SGA
              </p>
            </div>
            {importacaoAtiva && (
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-lg">
                <Database className="h-4 w-4" />
                <span>{eventos.length.toLocaleString()} registros</span>
                <span className="text-muted-foreground/50">|</span>
                <span>{importacaoAtiva.nome_arquivo}</span>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          {eventos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <Card className="bg-card/50 backdrop-blur border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Car className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{eventos.length.toLocaleString()}</p>
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
                        {eventos.filter(e => e.situacao_evento === "FINALIZADO").length.toLocaleString()}
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
                        {eventos.filter(e => e.situacao_evento === "EM ANALISE" || e.situacao_evento === "ABERTO").length.toLocaleString()}
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
                          .format(eventos.reduce((acc, e) => acc + (e.custo_evento || 0), 0))}
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
          <TabsList className="grid grid-cols-5 w-full max-w-3xl mx-auto bg-muted/50">
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
            <SGADashboard eventos={eventos} loading={loading} />
          </TabsContent>

          <TabsContent value="mapa">
            <SGAMapa eventos={eventos} loading={loading} />
          </TabsContent>

          <TabsContent value="tabela">
            <SGATabela eventos={eventos} loading={loading} />
          </TabsContent>

          <TabsContent value="importar">
            <SGAImportacao onImportSuccess={fetchEventos} />
          </TabsContent>

          <TabsContent value="historico">
            <SGAHistoricoImportacoes onActivate={fetchEventos} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
