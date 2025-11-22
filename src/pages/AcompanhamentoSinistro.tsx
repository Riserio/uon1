import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, CheckCircle2, Clock, Car, User, Calendar, Workflow, ChevronDown } from "lucide-react";
import { formatCPF, formatPlaca } from "@/lib/validators";
import { CriarDadosTesteButton } from "@/components/CriarDadosTesteButton";

type ResultadoSinistro = {
  atendimento: any;
  vistoria: any | null;
  fluxoNome: string;
  statusPublicos: any[];
  andamentos: any[];
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
      // CPF até 11 dígitos
      if (cleaned.length <= 11) {
        setBusca(formatCPF(cleaned));
        return;
      }
      // Acima disso considera como ID/Nº sinistro/protocolo
      setBusca(cleaned);
      return;
    }

    // Tem letra = placa
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

      // 1) Se for número, tenta buscar por número do sinistro/protocolo
      if (isNumeric) {
        const numeroSinistro = parseInt(cleanBusca, 10);

        const { data: atendimentosPorNumero, error: erroAtendNumero } = await supabase
          .from("atendimentos")
          .select("*")
          .eq("numero", numeroSinistro);

        if (erroAtendNumero) {
          console.error("❌ Erro ao buscar atendimentos por número:", erroAtendNumero);
        }

        if (atendimentosPorNumero && atendimentosPorNumero.length > 0) {
          atendimentosEncontrados = atendimentosPorNumero;
        }
      }

      // 2) Buscar vistorias por CPF ou Placa
      if (isNumeric && cleanBusca.length === 11) {
        // CPF
        const { data: vistoriasPorCpf, error: erroVistCpf } = await supabase
          .from("vistorias")
          .select("*")
          .eq("cliente_cpf", cleanBusca);

        if (erroVistCpf) {
          console.error("❌ Erro ao buscar vistorias por CPF:", erroVistCpf);
        }

        if (vistoriasPorCpf && vistoriasPorCpf.length > 0) {
          vistoriasEncontradas = [...vistoriasEncontradas, ...vistoriasPorCpf];
        }
      }

      if (isPlaca) {
        // Placa
        const { data: vistoriasPorPlaca, error: erroVistPlaca } = await supabase
          .from("vistorias")
          .select("*")
          .eq("veiculo_placa", cleanBusca.toUpperCase());

        if (erroVistPlaca) {
          console.error("❌ Erro ao buscar vistorias por placa:", erroVistPlaca);
        }

        if (vistoriasPorPlaca && vistoriasPorPlaca.length > 0) {
          vistoriasEncontradas = [...vistoriasEncontradas, ...vistoriasPorPlaca];
        }
      }

      // 3) A partir das vistorias, buscar atendimentos vinculados
      const atendimentoIdsFromVistorias = Array.from(
        new Set(vistoriasEncontradas.map((v) => v.atendimento_id).filter((id) => !!id)),
      ) as string[];

      let atendimentosPorVistoria: any[] = [];
      if (atendimentoIdsFromVistorias.length > 0) {
        const { data: atPorVist, error: erroAtVist } = await supabase
          .from("atendimentos")
          .select("*")
          .in("id", atendimentoIdsFromVistorias);

        if (erroAtVist) {
          console.error("❌ Erro ao buscar atendimentos por vistorias:", erroAtVist);
        }

        if (atPorVist && atPorVist.length > 0) {
          atendimentosPorVistoria = atPorVist;
        }
      }

      // 4) Unificar atendimentos (por número e por vistoria)
      const mapaAtendimentos: Record<string, any> = {};
      [...atendimentosEncontrados, ...atendimentosPorVistoria].forEach((at) => {
        mapaAtendimentos[at.id] = at;
      });

      const atendimentosFinais = Object.values(mapaAtendimentos);

      if (atendimentosFinais.length === 0) {
        console.log("❌ Nenhum resultado encontrado");
        toast.error("Nenhum sinistro encontrado com esses dados");
        return;
      }

      // 5) Buscar fluxos e status públicos para todos os fluxos envolvidos
      const fluxoIds = Array.from(
        new Set(atendimentosFinais.map((a: any) => a.fluxo_id).filter((id) => !!id)),
      ) as string[];

      let mapaFluxos: Record<string, string> = {};
      let statusPublicosPorFluxo: Record<string, any[]> = {};

      if (fluxoIds.length > 0) {
        const { data: fluxosData } = await supabase.from("fluxos").select("id, nome").in("id", fluxoIds);

        if (fluxosData) {
          fluxosData.forEach((f: any) => {
            mapaFluxos[f.id] = f.nome;
          });
        }

        const { data: statusData } = await supabase
          .from("status_publicos_config")
          .select("*")
          .in("fluxo_id", fluxoIds)
          .eq("visivel_publico", true)
          .order("ordem_exibicao");

        if (statusData) {
          statusPublicosPorFluxo = statusData.reduce((acc: any, s: any) => {
            if (!acc[s.fluxo_id]) acc[s.fluxo_id] = [];
            acc[s.fluxo_id].push(s);
            return acc;
          }, {});
        }
      }

      // 6) Montar resultados completos por sinistro
      const resultadosCompletos: ResultadoSinistro[] = await Promise.all(
        atendimentosFinais.map(async (at: any) => {
          // Vistoria principal desse atendimento (pega a última criada)
          const vistoriasDoAtendimento = vistoriasEncontradas
            .filter((v) => v.atendimento_id === at.id)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

          const vistoriaPrincipal = vistoriasDoAtendimento[0] || null;

          // Andamentos
          const { data: andamentosData } = await supabase
            .from("andamentos")
            .select("*, profiles!andamentos_created_by_fkey(nome)")
            .eq("atendimento_id", at.id)
            .order("created_at", { ascending: true });

          // Histórico de mudanças de status
          const { data: historicoData } = await supabase
            .from("atendimentos_historico")
            .select("*")
            .eq("atendimento_id", at.id)
            .contains("campos_alterados", ["status"])
            .order("created_at", { ascending: true });

          const combinedTimeline = [
            ...(andamentosData || []).map((a: any) => ({
              id: a.id,
              type: "andamento",
              descricao: a.descricao,
              created_at: a.created_at,
              created_by: a.profiles?.nome || "Sistema",
            })),
            ...(historicoData || []).map((h: any) => ({
              id: h.id,
              type: "status_change",
              descricao: `Status alterado: ${(h.valores_anteriores as any)?.status || "N/A"} → ${(h.valores_novos as any)?.status || "N/A"}`,
              created_at: h.created_at,
              created_by: h.user_nome,
            })),
          ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          return {
            atendimento: at,
            vistoria: vistoriaPrincipal,
            fluxoNome: at.fluxo_id ? mapaFluxos[at.fluxo_id] || "Fluxo" : "Fluxo",
            statusPublicos: at.fluxo_id ? statusPublicosPorFluxo[at.fluxo_id] || [] : [],
            andamentos: combinedTimeline,
          };
        }),
      );

      console.log("✅ Sinistros encontrados:", resultadosCompletos.length);
      setResultados(resultadosCompletos);

      // Se só tiver 1, já abre expandido
      if (resultadosCompletos.length === 1) {
        setExpandedId(resultadosCompletos[0].atendimento.id);
      }

      toast.success("Sinistro(s) encontrado(s)!");
    } catch (error) {
      console.error("Erro ao buscar:", error);
      toast.error("Erro ao buscar sinistros");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header Minimalista */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Acompanhamento de Sinistro</h1>
          <p className="text-sm text-muted-foreground">Consulte pelo CPF, placa ou número do sinistro/protocolo</p>
        </div>

        {/* Botão de teste */}
        <div className="flex justify-end mb-4">
          <CriarDadosTesteButton />
        </div>

        {/* Busca Minimalista */}
        <Card className="mb-8 border shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Digite CPF, placa ou Nº do sinistro/protocolo"
                  value={busca}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
                  className="h-11"
                />
              </div>
              <Button onClick={handleBuscar} disabled={loading} className="h-11 px-8">
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
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

        {/* Lista de Resultados */}
        {resultados.length > 0 ? (
          <div className="space-y-4">
            {resultados.map((item) => {
              const { atendimento, vistoria, fluxoNome, statusPublicos, andamentos } = item;
              const isExpanded = expandedId === atendimento.id;

              // Montagem de texto do veículo para não confundir
              const placa = vistoria?.veiculo_placa ? formatPlaca(vistoria.veiculo_placa) : null;
              const modelo = vistoria?.veiculo_modelo || null;
              const ano = vistoria?.veiculo_ano || vistoria?.veiculo_ano_modelo || null;

              const resumoVeiculo = [modelo, ano, placa].filter(Boolean).join(" • ");

              return (
                <Card key={atendimento.id} className="border shadow-sm">
                  <CardHeader
                    className="pb-3 cursor-pointer flex flex-row items-center justify-between gap-4"
                    onClick={() => setExpandedId(isExpanded ? null : atendimento.id)}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Workflow className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-primary">{fluxoNome}</span>
                      </div>

                      {/* Linha principal: Nº do sinistro e veículo para não ter dúvida */}
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Sinistro</span>
                          <span className="font-semibold">#{atendimento.numero}</span>
                        </div>

                        {resumoVeiculo && (
                          <div className="flex items-center gap-1">
                            <Car className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">{resumoVeiculo}</span>
                          </div>
                        )}

                        {vistoria?.cliente_nome && (
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">{vistoria.cliente_nome}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs font-medium">{atendimento.status}</span>
                        </div>
                      </div>
                    </div>

                    <ChevronDown
                      className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-0 pb-6 space-y-6">
                      {/* Detalhes do Veículo e Cliente */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                        {/* Veículo */}
                        {vistoria?.veiculo_placa && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <Car className="h-4 w-4" />
                              Veículo
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Placa</span>
                                <span className="font-medium">{formatPlaca(vistoria.veiculo_placa)}</span>
                              </div>
                              {vistoria.veiculo_marca && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Marca</span>
                                  <span className="font-medium">{vistoria.veiculo_marca}</span>
                                </div>
                              )}
                              {vistoria.veiculo_modelo && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Modelo</span>
                                  <span className="font-medium">{vistoria.veiculo_modelo}</span>
                                </div>
                              )}
                              {(vistoria.veiculo_ano || vistoria.veiculo_ano_modelo) && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Ano</span>
                                  <span className="font-medium">
                                    {vistoria.veiculo_ano || vistoria.veiculo_ano_modelo}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Cliente */}
                        {vistoria?.cliente_nome && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <User className="h-4 w-4" />
                              Cliente
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Nome</span>
                                <span className="font-medium">{vistoria.cliente_nome}</span>
                              </div>
                              {vistoria.cliente_telefone && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Telefone</span>
                                  <span className="font-medium">{vistoria.cliente_telefone}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Progresso (todos os status públicos permitidos do fluxo) */}
                      {statusPublicos.length > 0 && (
                        <Card className="border shadow-sm">
                          <CardHeader className="pb-4">
                            <CardTitle className="text-lg font-semibold">Progresso do Sinistro</CardTitle>
                          </CardHeader>
                          <CardContent className="pb-6">
                            <div className="space-y-4">
                              {statusPublicos.map((status, index) => {
                                const currentIndex = statusPublicos.findIndex(
                                  (s) => s.status_nome === atendimento.status,
                                );
                                const thisIndex = index;
                                const isCompleted = currentIndex >= thisIndex;
                                const isLast = index === statusPublicos.length - 1;

                                return (
                                  <div key={status.id} className="flex items-start gap-4">
                                    <div className="flex flex-col items-center">
                                      <div
                                        className={`
                                          w-8 h-8 rounded-full flex items-center justify-center transition-all
                                          ${
                                            isCompleted
                                              ? "bg-primary text-primary-foreground"
                                              : "bg-muted text-muted-foreground"
                                          }
                                        `}
                                      >
                                        {isCompleted ? (
                                          <CheckCircle2 className="h-4 w-4" />
                                        ) : (
                                          <div className="w-2 h-2 rounded-full bg-current" />
                                        )}
                                      </div>
                                      {!isLast && (
                                        <div className={`w-px h-12 mt-1 ${isCompleted ? "bg-primary" : "bg-border"}`} />
                                      )}
                                    </div>

                                    <div className="flex-1 pb-6">
                                      <div className="flex items-start justify-between gap-4">
                                        <div>
                                          <p
                                            className={`font-medium ${
                                              isCompleted ? "text-foreground" : "text-muted-foreground"
                                            }`}
                                          >
                                            {status.status_nome}
                                          </p>
                                          {status.descricao_publica && (
                                            <p className="text-sm text-muted-foreground mt-1">
                                              {status.descricao_publica}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Histórico de Andamentos */}
                      {andamentos.length > 0 && (
                        <Card className="border shadow-sm">
                          <CardHeader className="pb-4">
                            <CardTitle className="text-lg font-semibold">Histórico</CardTitle>
                          </CardHeader>
                          <CardContent className="pb-6">
                            <div className="space-y-3">
                              {andamentos.map((andamento) => (
                                <div key={andamento.id} className="border-l-2 border-muted pl-4 py-2">
                                  <p className="text-sm text-foreground">{andamento.descricao}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                    <span>{andamento.created_by}</span>
                                    <span>•</span>
                                    <span>
                                      {new Date(andamento.created_at).toLocaleDateString("pt-BR", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Digite CPF, placa ou número do sinistro para consultar.
          </div>
        )}
      </div>
    </div>
  );
}
