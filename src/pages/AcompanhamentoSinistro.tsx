import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, CheckCircle2, Workflow, ChevronDown } from "lucide-react";
import { formatCPF, formatPlaca } from "@/lib/validators";

type FluxoPasso = {
  fluxo_id: number;
  fluxo_nome: string;
  created_at: string;
};

type TimelineItem = {
  id: string;
  tipo: "andamento" | "status" | "fluxo";
  descricao: string;
  created_at: string;
  created_by: string;
};

type ResultadoSinistro = {
  atendimento: any;
  vistoria: any | null;
  fluxoNomeAtual: string;
  statusPublicosFluxoAtual: any[];
  timeline: TimelineItem[];
  fluxoCaminho: FluxoPasso[];
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

      // Montar resultados por atendimento
      const resultadosFinal: ResultadoSinistro[] = await Promise.all(
        atendimentos.map(async (at: any) => {
          // Vistoria (se existir)
          const vist =
            vistoriasEncontradas
              .filter((v: any) => v.atendimento_id === at.id)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;

          // Andamentos
          const { data: andamentosData, error: errAnd } = await supabase
            .from("andamentos")
            .select("*, profiles!andamentos_created_by_fkey(nome)")
            .eq("atendimento_id", at.id)
            .order("created_at", { ascending: true });

          if (errAnd) console.error(errAnd);

          // Histórico completo
          const { data: hist, error: errHist } = await supabase
            .from("atendimentos_historico")
            .select("*")
            .eq("atendimento_id", at.id)
            .order("created_at", { ascending: true });

          if (errHist) console.error(errHist);

          const historico = hist || [];

          const histFluxo = historico.filter((h: any) => ((h.campos_alterados as string[]) || []).includes("fluxo_id"));

          const histStatus = historico.filter((h: any) => ((h.campos_alterados as string[]) || []).includes("status"));

          // Descobrir TODOS os fluxos usados
          const fluxoIdsUsados = new Set<number>();
          if (at.fluxo_id) fluxoIdsUsados.add(at.fluxo_id);

          histFluxo.forEach((h: any) => {
            const ant = (h.valores_anteriores as any)?.fluxo_id;
            const novo = (h.valores_novos as any)?.fluxo_id;
            if (ant) fluxoIdsUsados.add(ant);
            if (novo) fluxoIdsUsados.add(novo);
          });

          const fluxosUsadosArray = Array.from(fluxoIdsUsados);

          // Buscar nomes de fluxos + configs de status públicos
          let nomeFluxosLocal: Record<number, string> = {};
          let statusPublicosPorFluxoLocal: Record<number, any[]> = {};

          if (fluxosUsadosArray.length > 0) {
            const { data: fluxosLocal, error: errFluxosLocal } = await supabase
              .from("fluxos")
              .select("id, nome")
              .in("id", fluxosUsadosArray);

            if (errFluxosLocal) console.error(errFluxosLocal);

            fluxosLocal?.forEach((f: any) => {
              nomeFluxosLocal[f.id] = f.nome;
            });

            const { data: statusLocal, error: errStatusLocal } = await supabase
              .from("status_publicos_config")
              .select("*")
              .in("fluxo_id", fluxosUsadosArray)
              .eq("visivel_publico", true)
              .order("ordem_exibicao");

            if (errStatusLocal) console.error(errStatusLocal);

            statusLocal?.forEach((s: any) => {
              if (!statusPublicosPorFluxoLocal[s.fluxo_id]) {
                statusPublicosPorFluxoLocal[s.fluxo_id] = [];
              }
              statusPublicosPorFluxoLocal[s.fluxo_id].push(s);
            });
          }

          const getFluxoNome = (fluxoId?: number | null) => {
            if (!fluxoId) return "Fluxo";
            return nomeFluxosLocal[fluxoId] || `Fluxo ${fluxoId}`;
          };

          const isStatusPublicoNoFluxo = (fluxoId: number | null, statusCode?: string | null) => {
            if (!fluxoId || !statusCode) return false;
            const configs = statusPublicosPorFluxoLocal[fluxoId] || [];
            return configs.some((s: any) => s.status_nome === statusCode);
          };

          const getStatusLabel = (fluxoId: number | null, statusCode?: string | null) => {
            if (!statusCode) return "N/A";
            if (!fluxoId) return statusCode;
            const configs = statusPublicosPorFluxoLocal[fluxoId] || [];
            const config = configs.find((s: any) => s.status_nome === statusCode);
            if (!config) return statusCode;
            return (
              (config.rotulo_publico as string) ||
              (config.nome_publico as string) ||
              (config.label_publico as string) ||
              config.status_nome ||
              statusCode
            );
          };

          // Monta timeline a partir de andamentos + histórico (fluxo/status)
          const timeline: TimelineItem[] = [];

          // Andamentos
          (andamentosData || []).forEach((a: any) => {
            timeline.push({
              id: `and-${a.id}`,
              tipo: "andamento",
              descricao: a.descricao,
              created_at: a.created_at,
              created_by: a.profiles?.nome || "Sistema",
            });
          });

          // Fluxo atual "de base"
          let fluxoAtual: number | null = null;

          if (histFluxo.length > 0) {
            const firstFluxo = histFluxo[0];
            const anterior = (firstFluxo.valores_anteriores as any)?.fluxo_id;
            const novo = (firstFluxo.valores_novos as any)?.fluxo_id;
            fluxoAtual = anterior ?? novo ?? at.fluxo_id ?? null;
          } else {
            fluxoAtual = at.fluxo_id ?? null;
          }

          // Vamos percorrer o histórico em ordem, atualizando fluxoAtual
          historico.forEach((h: any) => {
            const campos = (h.campos_alterados as string[]) || [];
            const createdAt = h.created_at as string;
            const userNome = h.user_nome || "Sistema";

            // 1) mudança de fluxo (só entra na timeline se algum dos fluxos tem algo público)
            if (campos.includes("fluxo_id")) {
              const anteriorId = (h.valores_anteriores as any)?.fluxo_id ?? null;
              const novoId = (h.valores_novos as any)?.fluxo_id ?? null;

              const anteriorNome = getFluxoNome(anteriorId);
              const novoNome = getFluxoNome(novoId);

              fluxoAtual = novoId ?? fluxoAtual;

              const fluxoPublico =
                (anteriorId && (statusPublicosPorFluxoLocal[anteriorId]?.length || 0) > 0) ||
                (novoId && (statusPublicosPorFluxoLocal[novoId]?.length || 0) > 0);

              if (fluxoPublico) {
                timeline.push({
                  id: `hist-fluxo-${h.id}`,
                  tipo: "fluxo",
                  descricao: `Fluxo alterado: ${anteriorNome} → ${novoNome}`,
                  created_at: createdAt,
                  created_by: userNome,
                });
              }
            }

            // 2) mudança de status (somente se status público)
            if (campos.includes("status")) {
              const antStatus = (h.valores_anteriores as any)?.status ?? null;
              const novoStatus = (h.valores_novos as any)?.status ?? null;
              const fluxoRef = fluxoAtual ?? at.fluxo_id ?? null;

              if (!isStatusPublicoNoFluxo(fluxoRef, novoStatus)) return;

              const antLabel = antStatus ? getStatusLabel(fluxoRef, antStatus) : "N/A";
              const novoLabel = getStatusLabel(fluxoRef, novoStatus);

              timeline.push({
                id: `hist-status-${h.id}`,
                tipo: "status",
                descricao: `Status alterado: ${antLabel} → ${novoLabel}`,
                created_at: createdAt,
                created_by: userNome,
              });
            }
          });

          // Ordenar timeline final
          timeline.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          // 👉 Caminho de FLUXOS para exibir no card "Fluxo do sinistro"
          const fluxoCaminhoRaw: { fluxo_id: number; created_at: string }[] = [];

          const fluxoTemAlgoPublico = (fluxoId: number | null) =>
            !!(fluxoId && (statusPublicosPorFluxoLocal[fluxoId]?.length || 0) > 0);

          // Fluxo "inicial"
          let fluxoInicial: number | null = null;

          if (histFluxo.length > 0) {
            const first = histFluxo[0];
            const ant = (first.valores_anteriores as any)?.fluxo_id ?? null;
            const novo = (first.valores_novos as any)?.fluxo_id ?? null;
            fluxoInicial = ant ?? novo ?? at.fluxo_id ?? null;
          } else {
            fluxoInicial = at.fluxo_id ?? null;
          }

          if (fluxoInicial && fluxoTemAlgoPublico(fluxoInicial)) {
            fluxoCaminhoRaw.push({
              fluxo_id: fluxoInicial,
              created_at: at.created_at,
            });
          }

          // Fluxos seguintes (do histórico)
          histFluxo.forEach((h: any) => {
            const novoId = (h.valores_novos as any)?.fluxo_id ?? null;
            if (!novoId || !fluxoTemAlgoPublico(novoId)) return;

            fluxoCaminhoRaw.push({
              fluxo_id: novoId,
              created_at: h.created_at,
            });
          });

          // Se ainda não tiver nada, mas o fluxo atual é público, adiciona
          if (fluxoCaminhoRaw.length === 0 && at.fluxo_id && fluxoTemAlgoPublico(at.fluxo_id)) {
            fluxoCaminhoRaw.push({
              fluxo_id: at.fluxo_id,
              created_at: at.created_at,
            });
          }

          // Remove fluxos repetidos consecutivos
          const fluxoCaminhoDedup: { fluxo_id: number; created_at: string }[] = [];
          for (const item of fluxoCaminhoRaw) {
            const last = fluxoCaminhoDedup[fluxoCaminhoDedup.length - 1];
            if (!last || last.fluxo_id !== item.fluxo_id) {
              fluxoCaminhoDedup.push(item);
            }
          }

          const fluxoCaminho: FluxoPasso[] = fluxoCaminhoDedup.map((f) => ({
            fluxo_id: f.fluxo_id,
            fluxo_nome: getFluxoNome(f.fluxo_id),
            created_at: f.created_at,
          }));

          const fluxoNomeAtual = (at.fluxo_id && getFluxoNome(at.fluxo_id)) || "Fluxo";
          const statusPublicosFluxoAtual = (at.fluxo_id && statusPublicosPorFluxoLocal[at.fluxo_id]) || [];

          return {
            atendimento: at,
            vistoria: vist,
            fluxoNomeAtual,
            statusPublicosFluxoAtual,
            timeline,
            fluxoCaminho,
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
            const { atendimento, vistoria, fluxoNomeAtual, statusPublicosFluxoAtual, timeline, fluxoCaminho } = item;
            const isOpen = expandedId === atendimento.id;

            const placa = vistoria?.veiculo_placa ? formatPlaca(vistoria.veiculo_placa) : "";
            const modelo = vistoria?.veiculo_modelo || "";
            const ano = vistoria?.veiculo_ano || vistoria?.veiculo_ano_modelo || "";

            const resumoVeiculo = [modelo, ano, placa].filter(Boolean).join(" • ");

            const statusAtualConfig = statusPublicosFluxoAtual.find((x: any) => x.status_nome === atendimento.status);

            const lastFluxoIndex = fluxoCaminho.length - 1;

            return (
              <Card className="mb-4" key={atendimento.id}>
                <CardHeader
                  className="cursor-pointer flex justify-between items-center"
                  onClick={() => setExpandedId(isOpen ? null : atendimento.id)}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Workflow className="h-4 w-4 text-primary" />
                      <span className="font-medium text-primary">{fluxoNomeAtual}</span>
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
                          <p className="font-medium">{fluxoNomeAtual}</p>
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

                    {/* Fluxo do sinistro – SOMENTE FLUXOS (atuais + anteriores) */}
                    {fluxoCaminho.length > 0 && (
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-base">Fluxo do sinistro</CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Veja por quais fluxos o seu sinistro já passou e em qual fluxo ele está agora, considerando
                            apenas os fluxos liberados para exibição.
                          </p>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {fluxoCaminho.map((f, i) => {
                            const isCurrent = i === lastFluxoIndex;
                            const done = i < lastFluxoIndex;

                            return (
                              <div key={`${f.fluxo_id}-${i}`} className="flex gap-3 py-3 border-b last:border-0">
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
                                  {i < fluxoCaminho.length - 1 && <div className="flex-1 w-px bg-border mt-1" />}
                                </div>

                                <div className="flex-1">
                                  <p
                                    className={`font-medium text-sm ${
                                      isCurrent ? "text-primary" : done ? "" : "text-muted-foreground"
                                    }`}
                                  >
                                    {f.fluxo_nome}
                                    {isCurrent && (
                                      <span className="ml-2 text-[10px] uppercase tracking-wide text-primary font-semibold">
                                        FLUXO ATUAL
                                      </span>
                                    )}
                                  </p>

                                  {f.created_at && (
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                      Entrou neste fluxo em {new Date(f.created_at).toLocaleString("pt-BR")}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    )}

                    {/* Linha do tempo completa – histórico + andamentos (somente o que é público) */}
                    {timeline.length > 0 && (
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-base">Linha do tempo do sinistro</CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Aqui você acompanha todos os registros, mudanças de status e mudanças de fluxo do seu
                            sinistro que podem ser exibidos.
                          </p>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {timeline.map((a) => (
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
