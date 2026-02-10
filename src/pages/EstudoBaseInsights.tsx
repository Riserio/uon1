import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Upload, Database } from "lucide-react";
import { toast } from "sonner";
import BIPageHeader from "@/components/bi/BIPageHeader";
import { BIAuditLogDialog } from "@/components/BIAuditLogDialog";
import { useAuth } from "@/hooks/useAuth";
import EstudoBaseDashboard, { type EstudoBaseFilters } from "@/components/estudo-base/EstudoBaseDashboard";
import EstudoBaseImportacao from "@/components/estudo-base/EstudoBaseImportacao";

export default function EstudoBaseInsights() {
  const [searchParams] = useSearchParams();
  const { userRole } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);

  const [associacoes, setAssociacoes] = useState<any[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState<string>("");
  const [loadingAssociacoes, setLoadingAssociacoes] = useState(true);

  const canViewHistorico = userRole === "superintendente" || userRole === "admin";

  const [filters, setFilters] = useState<EstudoBaseFilters>({
    situacao: ["ATIVO", "SUSPENSO"],
    regional: "todos",
    cooperativa: "todos",
    dataContratoInicio: "",
    dataContratoFim: "",
    montadora: "todos",
    faixaValorProtegido: "todos",
  });

  // Load associations
  useEffect(() => {
    async function fetchAssociacoes() {
      try {
        const { data, error } = await supabase.from("corretoras").select("id, nome").order("nome");
        if (error) throw error;
        setAssociacoes(data || []);
        const param = searchParams.get("associacao") || searchParams.get("corretora");
        if (param && data?.some(c => c.id === param)) {
          setSelectedAssociacao(param);
        } else if (data && data.length > 0) {
          setSelectedAssociacao(data[0].id);
        }
      } catch (error) {
        toast.error("Erro ao carregar associações");
      } finally {
        setLoadingAssociacoes(false);
      }
    }
    fetchAssociacoes();
  }, [searchParams]);

  // Fetch data
  const fetchRegistros = async () => {
    if (!selectedAssociacao) { setRegistros([]); setImportacaoAtiva(null); setLoading(false); return; }
    setLoading(true);
    try {
      const { data: importacao, error: impError } = await supabase
        .from("estudo_base_importacoes")
        .select("*")
        .eq("ativo", true)
        .eq("corretora_id", selectedAssociacao)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (impError && impError.code !== "PGRST116") console.error(impError);

      if (importacao) {
        setImportacaoAtiva(importacao);
        // Batch fetch
        const BATCH_SIZE = 1000;
        let all: any[] = [];
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: batch, error } = await supabase
            .from("estudo_base_registros")
            .select("*")
            .eq("importacao_id", importacao.id)
            .range(offset, offset + BATCH_SIZE - 1);
          if (error) { console.error(error); break; }
          if (batch && batch.length > 0) {
            all = [...all, ...batch];
            offset += BATCH_SIZE;
            hasMore = batch.length === BATCH_SIZE;
          } else { hasMore = false; }
          if (offset >= 100000) break;
        }
        setRegistros(all);
      } else {
        setRegistros([]);
        setImportacaoAtiva(null);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (selectedAssociacao) fetchRegistros(); }, [selectedAssociacao]);

  // Realtime
  useEffect(() => {
    if (!selectedAssociacao) return;
    const channel = supabase
      .channel('estudo-base-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estudo_base_importacoes' }, () => {
        fetchRegistros();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedAssociacao]);

  const selectedAssociacaoNome = associacoes.find(a => a.id === selectedAssociacao)?.nome || "";

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "tabela", label: "Dados Completos", icon: Database },
    { id: "importar", label: "Importar Dados", icon: Upload },
  ];

  return (
    <div className="min-h-screen bg-background">
      <BIPageHeader
        title="Estudo de Base"
        subtitle="Análise detalhada da base de veículos e associados"
        associacoes={associacoes}
        selectedAssociacao={selectedAssociacao}
        onAssociacaoChange={setSelectedAssociacao}
        loadingAssociacoes={loadingAssociacoes}
        currentModule="estudo-base"
        showHistorico={canViewHistorico}
        onHistoricoClick={() => setHistoricoDialogOpen(true)}
        recordCount={registros.length}
        fileName={importacaoAtiva?.nome_arquivo}
      />

      <div className="container mx-auto px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="w-full overflow-x-auto pb-2">
            <TabsList className="inline-flex md:flex md:w-auto gap-1 p-1.5 bg-muted/40 rounded-xl min-w-max md:min-w-0">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                               text-muted-foreground transition-all
                               data-[state=active]:bg-primary data-[state=active]:text-primary-foreground
                               data-[state=active]:shadow-md hover:text-foreground hover:bg-muted/60
                               whitespace-nowrap"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-4 mt-0">
            <EstudoBaseDashboard registros={registros} loading={loading} filters={filters} onFiltersChange={setFilters} />
          </TabsContent>

          <TabsContent value="tabela" className="space-y-4 mt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {["Placa","Tipo","Montadora","Modelo","Categoria","Ano","Situação","Valor Protegido","Cooperativa","Sexo","Idade","Data Contrato"].map(h => (
                      <th key={h} className="text-left py-2 px-2 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registros.slice(0, 500).map((r, i) => (
                    <tr key={r.id || i} className="border-b hover:bg-muted/30">
                      <td className="py-1.5 px-2">{r.placa}</td>
                      <td className="py-1.5 px-2">{r.tipo_veiculo}</td>
                      <td className="py-1.5 px-2">{r.montadora}</td>
                      <td className="py-1.5 px-2 max-w-[200px] truncate">{r.modelo}</td>
                      <td className="py-1.5 px-2">{r.categoria}</td>
                      <td className="py-1.5 px-2">{r.ano_modelo}</td>
                      <td className="py-1.5 px-2">{r.situacao_veiculo}</td>
                      <td className="py-1.5 px-2 whitespace-nowrap">{r.valor_protegido ? `R$ ${Number(r.valor_protegido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</td>
                      <td className="py-1.5 px-2 max-w-[200px] truncate">{r.cooperativa}</td>
                      <td className="py-1.5 px-2">{r.sexo}</td>
                      <td className="py-1.5 px-2">{r.idade_associado}</td>
                      <td className="py-1.5 px-2">{r.data_contrato}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {registros.length > 500 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">Exibindo 500 de {registros.length.toLocaleString('pt-BR')} registros</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="importar" className="space-y-4 mt-0">
            <EstudoBaseImportacao onImportSuccess={() => { fetchRegistros(); setActiveTab("dashboard"); }} corretoraId={selectedAssociacao} corretoraNome={selectedAssociacaoNome} />
          </TabsContent>
        </Tabs>
      </div>

      <BIAuditLogDialog open={historicoDialogOpen} onOpenChange={setHistoricoDialogOpen} modulo="estudo_base" corretoraId={selectedAssociacao} />
    </div>
  );
}
