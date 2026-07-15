import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Upload, Database, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
            const fmtFipe = (r: any) =>
              r.valor_fipe
                ? `R$ ${Number(r.valor_fipe).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                : r.valor_protegido
                ? `R$ ${Number(r.valor_protegido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                : "—";
            const dash = (v: any) => (v === null || v === undefined || v === "" ? "—" : v);
            const isAtivo = (sit?: string | null) => (sit || "").toUpperCase().includes("ATIV");
            return (
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Database className="h-5 w-5 text-primary" />
                    Dados Completos
                    <span className="text-sm font-normal text-muted-foreground">
                      ({registros.length.toLocaleString("pt-BR")} registros)
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Por página:</span>
                    <Select value={tabelaPerPage.toString()} onValueChange={(v) => { setTabelaPerPage(Number(v)); setTabelaPage(1); }}>
                      <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground tabular-nums px-1">
                      {registros.length === 0 ? 0 : startIdx + 1}–{Math.min(startIdx + tabelaPerPage, registros.length)} de {registros.length.toLocaleString("pt-BR")}
                    </span>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setTabelaPage((p) => Math.max(1, p - 1))} disabled={tabelaPage === 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-medium px-1 tabular-nums">{tabelaPage}/{totalPages || 1}</span>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setTabelaPage((p) => Math.min(totalPages, p + 1))} disabled={tabelaPage === totalPages || totalPages === 0}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-secondary">
                          {["Placa", "Tipo", "Montadora", "Modelo", "Categoria", "Ano", "Situação", "Valor FIPE", "Cooperativa", "Cidade", "Estado", "Sexo", "Idade", "Data Contrato"].map((h) => (
                            <th key={h} className="text-left py-3 px-3 font-semibold uppercase tracking-wide text-[10px] text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRecords.length === 0 ? (
                          <tr><td colSpan={14} className="py-10 text-center text-muted-foreground">Nenhum registro para exibir.</td></tr>
                        ) : pageRecords.map((r, i) => (
                          <tr key={r.id || i} className="border-t border-border/60 hover:bg-muted/40 transition-colors">
                            <td className="py-2 px-3 font-medium whitespace-nowrap">{dash(r.placa)}</td>
                            <td className="py-2 px-3 whitespace-nowrap">{dash(r.tipo_veiculo)}</td>
                            <td className="py-2 px-3 whitespace-nowrap">{dash(r.montadora)}</td>
                            <td className="py-2 px-3 max-w-[200px] truncate">{dash(r.modelo)}</td>
                            <td className="py-2 px-3 whitespace-nowrap">{dash(r.categoria)}</td>
                            <td className="py-2 px-3 tabular-nums">{dash(r.ano_modelo)}</td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {r.situacao_veiculo ? (
                                <span className={"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold " + (isAtivo(r.situacao_veiculo) ? "bg-emerald-500/12 text-emerald-600" : "bg-muted text-muted-foreground")}>
                                  <span className={"h-1.5 w-1.5 rounded-full " + (isAtivo(r.situacao_veiculo) ? "bg-emerald-500" : "bg-muted-foreground")} />
                                  {r.situacao_veiculo}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap tabular-nums">{fmtFipe(r)}</td>
                            <td className="py-2 px-3 max-w-[160px] truncate">{dash(r.cooperativa)}</td>
                            <td className="py-2 px-3 max-w-[160px] truncate">{dash(r.cidade_veiculo)}</td>
                            <td className="py-2 px-3">{dash(r.estado)}</td>
                            <td className="py-2 px-3">{dash(r.sexo)}</td>
                            <td className="py-2 px-3 tabular-nums">{dash(r.idade_associado)}</td>
                            <td className="py-2 px-3 whitespace-nowrap">{dash(r.data_contrato)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
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