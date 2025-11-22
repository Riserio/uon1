import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, CheckCircle2, Workflow, ChevronDown } from "lucide-react";
import { formatCPF, formatPlaca } from "@/lib/validators";
import { CriarDadosTesteButton } from "@/components/CriarDadosTesteButton";

type CaminhoStatusItem = {
  status_nome: string;
  descricao_publica?: string | null;
  created_at: string;
};

type ResultadoSinistro = {
  atendimento: any;
  vistoria: any | null;
  fluxoNome: string;
  statusPublicos: any[];
  andamentos: any[];
  caminhoStatus: CaminhoStatusItem[];
};

export default function AcompanhamentoSinistro() {
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<ResultadoSinistro[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleInputChange = (value: string) => {
    const cleaned = value.replace(/[^\w]/g, "");

    // Só números = pode ser CPF ou número do sinistro
    if (/^\d+$/.test(cleaned)) {
      if (cleaned.length <= 11) {
        setBusca(formatCPF(cleaned));
        return;
      }
      setBusca(cleaned); // número do sinistro
      return;
    }

    // Placa (permite letras e números)
    if (/[a-zA-Z]/.test(cleaned)) {
      setBusca(formatPlaca(cleaned));
      return;
    }

    setBusca(value);
  };

  const handleBuscar = async () => {
    if (!busca.trim()) {
      toast.error("Digite uma placa, CPF ou número do sinistro/protocolo");
      return;
    }

    setLoading(true);
    setResultados([]);
    setExpandedId(null);

    try {
      const cleanBusca = busca.replace(/[^\w]/g, "");
      const isNumeric = /^\d+$/.test(cleanBusca);
      const isPlaca = /[a-zA-Z]/.test(cleanBusca);

      let atendimentosEncontrados: any[] = [];
      let vistoriasEncontradas: any[] = [];

      // 1) Buscar por número do sinistro
      if (isNumeric) {
        const numeroSinistro = parseInt(cleanBusca, 10);

        const { data: atendNum, error: errAtendNum } = await supabase
          .from("atendimentos")
          .select("*")
          .eq("numero", numeroSinistro);

        if (errAtendNum) console.error(errAtendNum);
        if (atendNum?.length) atendimentosEncontrados = atendNum;
      }

      // 2) Buscar por CPF
      if (isNumeric && cleanBusca.length === 11) {
        const { data: vistCPF, error: errVistCpf } = await supabase
          .from("vistorias")
          .select("*")
          .eq("cliente_cpf", cleanBusca);

        if (errVistCpf) console.error(errVistCpf);
        if (vistCPF?.length) vistoriasEncontradas.push(...vistCPF);
      }

      // 3) Buscar por PLACA
      if (isPlaca) {
        const placaLimpa = cleanBusca.toUpperCase();
        const placaFormatada = formatPlaca(cleanBusca);

        const { data: vistPlaca, error: errVistPlaca } = await supabase
          .from("vistorias")
          .select("*")
          .or(`veiculo_placa.eq.${placaLimpa},veiculo_placa.eq.${placaFormatada}`);

        if (errVistPlaca) console.error(errVistPlaca);
        if (vistPlaca?.length) vistoriasEncontradas.push(...vistPlaca);
      }

      // Se não encontrou nada, retornar
      if (atendimentosEncontrados.length === 0 && vistoriasEncontradas.length === 0) {
        toast.error("Nenhum sinistro encontrado");
        return;
      }

      // Buscar atendimentos pelas vistorias
      const atIds = Array.from(new Set(vistoriasEncontradas.map((v: any) => v.atendimento_id).filter(Boolean)));

      if (atIds.length > 0) {
        const { data: atendVist, error: errAtendVist } = await supabase
          .from("atendimentos")
          .select("*")
          .in("id", atIds);

        if (errAtendVist) console.error(errAtendVist);
        if (atendVist?.length) atendimentosEncontrados.push(...atendVist);
      }

      // Remover duplicados
      const mapaAt: Record<string, any> = Object.fromEntries(atendimentosEncontrados.map((a: any) => [a.id, a]));
      const atendimentos = Object.values(mapaAt);

      if (atendimentos.length === 0) {
        toast.error("Nenhum sinistro encontrado");
        return;
      }

      // Buscar fluxos e configurações de status públicos
      const fluxoIds = Array.from(new Set(atendimentos.map((a: any) => a.fluxo_id).filter(Boolean)));

      let nomeFluxos: Record<string, string> = {};
      let statusPublicosPorFluxo: Record<string, any[]> = {};

      if (fluxoIds.length > 0) {
        const { data: fluxos, error: errFluxos } = await supabase.from("fluxos").select("id, nome").in("id", fluxoIds);

        if (errFluxos) console.error(errFluxos);

        fluxos?.forEach((f: any) => {
          nomeFluxos[f.id] = f.nome;
        });

        const { data: status, error: errStatus } = await supabase
          .from("status_publicos_config")
          .select("*")
          .in("fluxo_id", fluxoIds)
          .eq("visivel_publico", true)
          .order("ordem_exibicao");

        if (errStatus) console.error(errStatus);

        status?.forEach((s: any) => {
          if (!statusPublicosPorFluxo[s.fluxo_id]) {
            statusPublicosPorFluxo[s.fluxo_id] = [];
          }
          statusPublicosPorFluxo[s.fluxo_id].push(s);
        });
      }

      // Montar resultados
      const resultadosFinal: ResultadoSinistro[] = await Promise.all(
        atendimentos.map(async (at: any) => {
          const vist =
            vistoriasEncontradas
              .filter((v: any) => v.atendimento_id === at.id)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;

          const statusPublicosFluxo = statusPublicosPorFluxo[at.fluxo_id] || [];
          const allowedStatusNames = new Set(statusPublicosFluxo.map((s: any) => s.status_nome));

          // Andamentos
          const { data: andamentosData, error: errAnd } = await supabase
            .from("andamentos")
            .select("*, profiles!andamentos_created_by_fkey(nome)")
            .eq("atendimento_id", at.id)
            .order("created_at", { ascending: true });

          if (errAnd) console.error(errAnd);

          // Histórico de status
          const { data: hist, error: errHist } = await supabase
            .from("atendimentos_historico")
            .select("*")
            .eq("atendimento_id", at.id)
            .contains("campos_alterados", ["status"])
            .order("created_at", { ascending: true });

          if (errHist) console.error(errHist);

          // Filtra histórico apenas para status permitidos (se houver config)
          const histFiltrado = (hist || []).filter((h: any) => {
            if (allowedStatusNames.size === 0) return true;
            const anterior = (h.valores_anteriores as any)?.status;
            const novo = (h.valores_novos as any)?.status;
            const anteriorPermitido = anterior ? allowedStatusNames.has(anterior) : false;
            const novoPermitido = novo ? allowedStatusNames.has(novo) : false;
            return anteriorPermitido || novoPermitido;
          });

          // Monta timeline (andamentos + mudanças de status)
          const timeline = [
            ...(andamentosData || []).map((a: any) => ({
              id: `and-${a.id}`,
              tipo: "andamento" as const,
              descricao: a.descricao,
              created_at: a.created_at,
              created_by: a.profiles?.nome || "Sistema",
            })),
            ...histFiltrado.map((h: any) => ({
              id: `hist-${h.id}`,
              tipo: "status" as const,
              descricao: `Status alterado: ${
                (h.valores_anteriores as any)?.status || "N/A"
              } → ${(h.valores_novos as any)?.status || "N/A"}`,
              created_at: h.created_at,
              created_by: h.user_nome || "Sistema",
            })),
          ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          // 👉 Caminho REAL de status percorridos (para o card "Fluxo do sinistro")
          const caminhoStatusRaw = (histFiltrado || [])
            .map((h: any) => {
              const novo = (h.valores_novos as any)?.status;
              if (!novo) return null;
              return {
                status_nome: novo as string,
                created_at: h.created_at as string,
              };
            })
            .filter(Boolean) as { status_nome: string; created_at: string }[];

          // Se não há histórico, mas existe status atual, usa ele
          if (caminhoStatusRaw.length === 0 && at.status) {
            caminhoStatusRaw.push({
              status_nome: at.status,
              created_at: at.created_at,
            });
          }

          // Remove repetições consecutivas
          const caminhoStatusDedup: { status_nome: string; created_at: string }[] = [];
          for (const item of caminhoStatusRaw) {
            const last = caminhoStatusDedup[caminhoStatusDedup.length - 1];
            if (!last || last.status_nome !== item.status_nome) {
              caminhoStatusDedup.push(item);
            }
          }

          // Enriquecer com descrição pública
          const caminhoStatus: CaminhoStatusItem[] = caminhoStatusDedup.map((item) => {
            const config = statusPublicosFluxo.find((s: any) => s.status_nome === item.status_nome);
            return {
              status_nome: item.status_nome,
              descricao_publica: config?.descricao_publica ?? null,
              created_at: item.created_at,
            };
          });

          return {
            atendimento: at,
            vistoria: vist,
            fluxoNome: nomeFluxos[at.fluxo_id] || "Fluxo",
            statusPublicos: statusPublicosFluxo,
            andamentos: timeline,
            caminhoStatus,
          };
        }),
      );

      setResultados(resultadosFinal);

      if (resultadosFinal.length === 1) {
        setExpandedId(resultadosFinal[0].atendimento.id);
      }

      toast.success("Sinistro(s) encontrado(s)!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao buscar sinistros");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold">Acompanhamento de Sinistro</h1>
          <p className="text-sm text-muted-foreground">Consulte pelo CPF, placa ou número do sinistro</p>
        </div>

        <div className="flex justify-end mb-4">
          <CriarDadosTesteButton />
        </div>

        <Card className="mb-8 border shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="CPF, placa ou nº do sinistro"
                value={busca}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
                className="h-11"
              />
              <Button onClick={handleBuscar} disabled={loading} className="h-11 px-8">
                {loading ? (
                  <div className="animate-spin h-4 w-4 border-b-2 border-primary-foreground" />
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Buscar
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {resultados.length === 0 ? (
          <p className="text-center text-muted-foreground">Digite para consultar</p>
        ) : (
          resultados.map((item) => {
            const { atendimento, vistoria, fluxoNome, statusPublicos, andamentos, caminhoStatus } = item;
            const isOpen = expandedId === atendimento.id;

            const placa = vistoria?.veiculo_placa ? formatPlaca(vistoria.veiculo_placa) : "";
            const modelo = vistoria?.veiculo_modelo || "";
            const ano = vistoria?.veiculo_ano || vistoria?.veiculo_ano_modelo || "";

            const resumoVeiculo = [modelo, ano, placa].filter(Boolean).join(" • ");

            const statusAtualConfig = statusPublicos.find((x: any) => x.status_nome === atendimento.status);

            // Lista real de etapas percorridas; fallback para status configurados
            const listaFluxo: CaminhoStatusItem[] =
              caminhoStatus.length > 0
                ? caminhoStatus
                : statusPublicos.map((s: any) => ({
                    status_nome: s.status_nome,
                    descricao_publica: s.descricao_publica,
                    created_at: atendimento.created_at,
                  }));

            const lastIndex = listaFluxo.length - 1;

            return (
              <Card className="mb-4" key={atendimento.id}>
                <CardHeader
                  className="cursor-pointer flex justify-between items-center"
                  onClick={() => setExpandedId(isOpen ? null : atendimento.id)}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Workflow className="h-4 w-4 text-primary" />
                      <span className="font-medium text-primary">{fluxoNome}</span>
                    </div>

                    <div className="mt-1 text-sm flex flex-wrap items-center gap-2">
                      <span className="font-semibold">#{atendimento.numero}</span>

                      {resumoVeiculo && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">{resumoVeiculo}</span>
                        </>
                      )}

                      {atendimento.status && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            Status atual: {atendimento.status}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <ChevronDown className={`h-5 w-5 transition ${isOpen ? "rotate-180" : ""}`} />
                </CardHeader>

                {isOpen && (
                  <CardContent className="space-y-6 pb-6">
                    {/* Resumo do Sinistro */}
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-base">Resumo do sinistro</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-4 text-sm md:grid-cols-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Fluxo atual</p>
                          <p className="font-medium">{fluxoNome}</p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">Status atual</p>
                          <p className="font-medium">{atendimento.status || "Em análise"}</p>
                          {statusAtualConfig?.descricao_publica && (
                            <p className="text-xs text-muted-foreground mt-1">{statusAtualConfig.descricao_publica}</p>
                          )}
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">Data de abertura</p>
                          <p className="font-medium">
                            {atendimento.created_at ? new Date(atendimento.created_at).toLocaleString("pt-BR") : "-"}
                          </p>
                        </div>

                        {vistoria?.cliente_nome && (
                          <div>
                            <p className="text-xs text-muted-foreground">Segurado</p>
                            <p className="font-medium">{vistoria.cliente_nome}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Dados do veículo */}
                    {vistoria && (
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-base">Dados do veículo</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 grid gap-2 text-sm md:grid-cols-3">
                          <p>
                            <span className="text-xs text-muted-foreground block">Placa</span>
                            <span className="font-medium">{placa || "-"}</span>
                          </p>
                          <p>
                            <span className="text-xs text-muted-foreground block">Modelo</span>
                            <span className="font-medium">{modelo || "-"}</span>
                          </p>
                          <p>
                            <span className="text-xs text-muted-foreground block">Ano</span>
                            <span className="font-medium">{ano || "-"}</span>
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Fluxo do sinistro – caminho REAL */}
                    {listaFluxo.length > 0 && (
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-base">Fluxo do sinistro</CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Aqui você vê todas as etapas (status) pelas quais o seu sinistro já passou, na ordem em que
                            aconteceram.
                          </p>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {listaFluxo.map((s, i) => {
                            const isCurrent = i === lastIndex;
                            const done = i < lastIndex;

                            return (
                              <div key={`${s.status_nome}-${i}`} className="flex gap-3 py-3 border-b last:border-0">
                                <div className="flex flex-col items-center">
                                  <div
                                    className={`w-7 h-7 rounded-full flex items-center justify-center ${
                                      done
                                        ? "bg-primary text-primary-foreground"
                                        : isCurrent
                                          ? "border-2 border-primary bg-background text-primary"
                                          : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {done ? (
                                      <CheckCircle2 className="h-4 w-4" />
                                    ) : isCurrent ? (
                                      <div className="w-2 h-2 rounded-full bg-primary" />
                                    ) : (
                                      <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                                    )}
                                  </div>
                                  {i < listaFluxo.length - 1 && <div className="flex-1 w-px bg-border mt-1" />}
                                </div>

                                <div className="flex-1">
                                  <p
                                    className={`font-medium text-sm ${
                                      isCurrent ? "text-primary" : done ? "" : "text-muted-foreground"
                                    }`}
                                  >
                                    {s.status_nome}
                                    {isCurrent && (
                                      <span className="ml-2 text-[10px] uppercase tracking-wide text-primary font-semibold">
                                        ETAPA ATUAL
                                      </span>
                                    )}
                                  </p>

                                  {s.descricao_publica && (
                                    <p className="text-xs text-muted-foreground mt-1">{s.descricao_publica}</p>
                                  )}

                                  {s.created_at && (
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                      Atualizado em {new Date(s.created_at).toLocaleString("pt-BR")}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    )}

                    {/* Linha do tempo completa */}
                    {andamentos.length > 0 && (
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-base">Linha do tempo do sinistro</CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Aqui você acompanha todos os registros e movimentações do seu sinistro que podem ser
                            exibidos ao público.
                          </p>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {andamentos.map((a) => (
                            <div key={a.id} className="border-l pl-3 py-2 text-sm relative">
                              <span className="w-2 h-2 rounded-full bg-primary absolute -left-1 top-3" />
                              <p className="whitespace-pre-line">{a.descricao}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {a.created_by || "Sistema"} • {new Date(a.created_at).toLocaleString("pt-BR")}
                              </p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
