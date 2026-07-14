import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Upload, Database, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EstudoBaseDashboard, { type EstudoBaseFilters, EstudoBaseFilterBar } from "@/components/estudo-base/EstudoBaseDashboard";
import EstudoBaseImportacao from "@/components/estudo-base/EstudoBaseImportacao";
import EstudoBaseMapa from "@/components/estudo-base/EstudoBaseMapa";
import { getBICachedData, setBICachedData } from "@/hooks/useBIGlobalCache";

interface EstudoBaseConteudoProps {
  corretoraId: string;
  corretoraNome?: string;
  hideImport?: boolean;
  onRegistrosChange?: (count: number, fileName?: string) => void;
}

/**
 * Conteúdo puro do Estudo de Base — sem header/BIPageHeader/PortalHeader nem
 * wrapper de página. Usado tanto dentro dos Indicadores (aba "Estudo de Base"
 * em PID.tsx) quanto na página standalone (EstudoBaseInsights).
 */
export default function EstudoBaseConteudo({
  corretoraId,
  corretoraNome,
  hideImport,
  onRegistrosChange,
}: EstudoBaseConteudoProps) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importacaoAtiva, setImportacaoAtiva] = useState<any>(null);
  const [tabelaPage, setTabelaPage] = useState(1);
  const [tabelaPerPage, setTabelaPerPage] = useState(50);
  const [filters, setFilters] = useState<EstudoBaseFilters>({
    situacao: [],
    regional: "todos",
    cooperativa: "todos",
    dataContratoInicio: "",
    dataContratoFim: "",
    montadora: "todos",
    faixaValorProtegido: "todos",
  });

  const fetchRegistros = useCallback(async (forceRefresh = false) => {
    if (!corretoraId) {
      setRegistros([]);
      setImportacaoAtiva(null);
      setLoading(false);
      return;
    }
    if (!forceRefresh) {
      const cached = getBICachedData(corretoraId, "estudo-base");
      if (cached && cached.data.length > 0) {
        setRegistros(cached.data);
        setImportacaoAtiva(cached.importacao);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    try {
      const { data: importacao } = await supabase
        .from("estudo_base_importacoes")
        .select("*")
        .eq("ativo", true)
        .eq("corretora_id", corretoraId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (importacao) {
        setImportacaoAtiva(importacao);
        const BATCH = 1000;
        let all: any[] = [];
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: batch, error } = await supabase
            .from("estudo_base_registros")
            .select("*")
            .eq("importacao_id", importacao.id)
            .range(offset, offset + BATCH - 1);
          if (error) break;
          if (batch && batch.length > 0) {
            all = [...all, ...batch];
            offset += BATCH;
            hasMore = batch.length === BATCH;
          } else {
            hasMore = false;
          }
          if (offset >= 100000) break;
        }
        setRegistros(all);
        setBICachedData(corretoraId, "estudo-base", all, importacao);
      } else {
        setRegistros([]);
        setImportacaoAtiva(null);
      }
    } finally {
      setLoading(false);
    }
  }, [corretoraId]);

  useEffect(() => {
    fetchRegistros();
    setTabelaPage(1);
  }, [fetchRegistros]);

  useEffect(() => {
    onRegistrosChange?.(registros.length, importacaoAtiva?.nome_arquivo);
  }, [registros.length, importacaoAtiva?.nome_arquivo, onRegistrosChange]);

  useEffect(() => {
    if (!corretoraId) return;
    const ch = supabase
      .channel(`estudo-base-conteudo-${corretoraId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "estudo_base_importacoes" }, () => fetchRegistros(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [corretoraId, fetchRegistros]);

  const tabs = hideImport
    ? [
        { id: "dashboard", label: "Dashboard", icon: BarChart3 },
        { id: "mapa", label: "Mapa Geográfico", icon: MapPin },
        { id: "tabela", label: "Dados Completos", icon: Database },
      ]
    : [
        { id: "dashboard", label: "Dashboard", icon: BarChart3 },
        { id: "mapa", label: "Mapa Geográfico", icon: MapPin },
        { id: "tabela", label: "Dados Completos", icon: Database },
        { id: "importar", label: "Importar Dados", icon: Upload },
      ];

  return (
    <div className="space-y-4">
      <EstudoBaseFilterBar registros={registros} filters={filters} onFiltersChange={setFilters} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList className="inline-flex md:flex md:w-auto gap-1 p-1.5 bg-muted/40 rounded-xl min-w-max md:min-w-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md hover:text-foreground hover:bg-muted/60 whitespace-nowrap"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="space-y-4 mt-0">
          <EstudoBaseDashboard registros={registros} loading={loading} filters={filters} onFiltersChange={setFilters} hideFilters />
        </TabsContent>

        <TabsContent value="mapa" className="space-y-4 mt-0">
          <EstudoBaseMapa registros={registros} loading={loading} />
        </TabsContent>

        <TabsContent value="tabela" className="space-y-4 mt-0">
          {(() => {
            const totalPages = Math.ceil(registros.length / tabelaPerPage);
            const startIdx = (tabelaPage - 1) * tabelaPerPage;
            const pageRecords = registros.slice(startIdx, startIdx + tabelaPerPage);
            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Itens por página:</span>
                    <Select value={tabelaPerPage.toString()} onValueChange={(v) => { setTabelaPerPage(Number(v)); setTabelaPage(1); }}>
                      <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {startIdx + 1}–{Math.min(startIdx + tabelaPerPage, registros.length)} de {registros.length.toLocaleString("pt-BR")}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setTabelaPage((p) => Math.max(1, p - 1))} disabled={tabelaPage === 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium px-2">Pág. {tabelaPage} / {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setTabelaPage((p) => Math.min(totalPages, p + 1))} disabled={tabelaPage === totalPages || totalPages === 0}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {["Placa", "Tipo", "Montadora", "Modelo", "Categoria", "Ano", "Situação", "Valor FIPE", "Cooperativa", "Cidade", "Estado", "Sexo", "Idade", "Data Contrato"].map((h) => (
                          <th key={h} className="text-left py-2 px-2 font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRecords.map((r, i) => (
                        <tr key={r.id || i} className="border-b hover:bg-muted/30">
                          <td className="py-1.5 px-2">{r.placa}</td>
                          <td className="py-1.5 px-2">{r.tipo_veiculo}</td>
                          <td className="py-1.5 px-2">{r.montadora}</td>
                          <td className="py-1.5 px-2 max-w-[200px] truncate">{r.modelo}</td>
                          <td className="py-1.5 px-2">{r.categoria}</td>
                          <td className="py-1.5 px-2">{r.ano_modelo}</td>
                          <td className="py-1.5 px-2">{r.situacao_veiculo}</td>
                          <td className="py-1.5 px-2 whitespace-nowrap">
                            {r.valor_fipe
                              ? `R$ ${Number(r.valor_fipe).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                              : r.valor_protegido
                              ? `R$ ${Number(r.valor_protegido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                              : "-"}
                          </td>
                          <td className="py-1.5 px-2 max-w-[160px] truncate">{r.cooperativa}</td>
                          <td className="py-1.5 px-2 max-w-[160px] truncate">{r.cidade_veiculo}</td>
                          <td className="py-1.5 px-2">{r.estado}</td>
                          <td className="py-1.5 px-2">{r.sexo}</td>
                          <td className="py-1.5 px-2">{r.idade_associado}</td>
                          <td className="py-1.5 px-2">{r.data_contrato}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </TabsContent>

        {!hideImport && (
          <TabsContent value="importar" className="space-y-4 mt-0">
            <EstudoBaseImportacao
              onImportSuccess={() => { fetchRegistros(true); setActiveTab("dashboard"); }}
              corretoraId={corretoraId}
              corretoraNome={corretoraNome}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}