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
      if (cleaned.length <= 11) {
        setBusca(formatCPF(cleaned));
        return;
      }
      setBusca(cleaned); // número do sinistro
      return;
    }

    // Placa
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

        const { data: atendNum } = await supabase.from("atendimentos").select("*").eq("numero", numeroSinistro);

        if (atendNum?.length) atendimentosEncontrados = atendNum;
      }

      // 2) Buscar por CPF
      if (isNumeric && cleanBusca.length === 11) {
        const { data: vistCPF } = await supabase.from("vistorias").select("*").eq("cliente_cpf", cleanBusca);

        if (vistCPF?.length) vistoriasEncontradas.push(...vistCPF);
      }

      // 3) Buscar por PLACA (correção aplicada)
      if (isPlaca) {
        const placaLimpa = cleanBusca.toUpperCase(); // ABC1D23
        const placaFormatada = formatPlaca(cleanBusca); // ABC-1D23 ou ABC1D23 dependendo da função

        const { data: vistPlaca } = await supabase
          .from("vistorias")
          .select("*")
          .or(`veiculo_placa.eq.${placaLimpa},veiculo_placa.eq.${placaFormatada}`);

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
        const { data: atendVist } = await supabase.from("atendimentos").select("*").in("id", atIds);

        if (atendVist?.length) atendimentosEncontrados.push(...atendVist);
      }

      // Remover duplicados
      const mapaAt = Object.fromEntries(atendimentosEncontrados.map((a: any) => [a.id, a]));

      const atendimentos = Object.values(mapaAt);

      if (atendimentos.length === 0) {
        toast.error("Nenhum sinistro encontrado");
        return;
      }

      // Buscar fluxos
      const fluxoIds = Array.from(new Set(atendimentos.map((a: any) => a.fluxo_id).filter(Boolean)));

      let nomeFluxos: Record<string, string> = {};
      let statusPublicos: Record<string, any[]> = {};

      if (fluxoIds.length > 0) {
        const { data: fluxos } = await supabase.from("fluxos").select("id, nome").in("id", fluxoIds);

        fluxos?.forEach((f: any) => {
          nomeFluxos[f.id] = f.nome;
        });

        const { data: status } = await supabase
          .from("status_publicos_config")
          .select("*")
          .in("fluxo_id", fluxoIds)
          .eq("visivel_publico", true)
          .order("ordem_exibicao");

        status?.forEach((s: any) => {
          if (!statusPublicos[s.fluxo_id]) statusPublicos[s.fluxo_id] = [];
          statusPublicos[s.fluxo_id].push(s);
        });
      }

      // Montar resultados completos
      const resultadosFinal: ResultadoSinistro[] = await Promise.all(
        atendimentos.map(async (at: any) => {
          const vist =
            vistoriasEncontradas
              .filter((v: any) => v.atendimento_id === at.id)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;

          // Buscar andamentos
          const { data: andamentosData } = await supabase
            .from("andamentos")
            .select("*, profiles!andamentos_created_by_fkey(nome)")
            .eq("atendimento_id", at.id)
            .order("created_at", { ascending: true });

          // Buscar histórico de status
          const { data: hist } = await supabase
            .from("atendimentos_historico")
            .select("*")
            .eq("atendimento_id", at.id)
            .contains("campos_alterados", ["status"])
            .order("created_at", { ascending: true });

          const timeline = [
            ...(andamentosData || []).map((a: any) => ({
              id: a.id,
              descricao: a.descricao,
              created_at: a.created_at,
              created_by: a.profiles?.nome || "Sistema",
            })),
            ...(hist || []).map((h: any) => ({
              id: h.id,
              descricao: `Status alterado: ${
                (h.valores_anteriores as any)?.status || "N/A"
              } → ${(h.valores_novos as any)?.status || "N/A"}`,
              created_at: h.created_at,
              created_by: h.user_nome,
            })),
          ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          return {
            atendimento: at,
            vistoria: vist,
            fluxoNome: nomeFluxos[at.fluxo_id] || "Fluxo",
            statusPublicos: statusPublicos[at.fluxo_id] || [],
            andamentos: timeline,
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
            const { atendimento, vistoria, fluxoNome, statusPublicos, andamentos } = item;
            const isOpen = expandedId === atendimento.id;

            const placa = vistoria?.veiculo_placa ? formatPlaca(vistoria.veiculo_placa) : "";
            const modelo = vistoria?.veiculo_modelo || "";
            const ano = vistoria?.veiculo_ano || vistoria?.veiculo_ano_modelo || "";

            const resumoVeiculo = [modelo, ano, placa].filter(Boolean).join(" • ");

            return (
              <Card className="mb-4" key={atendimento.id}>
                <CardHeader
                  className="cursor-pointer flex justify-between"
                  onClick={() => setExpandedId(isOpen ? null : atendimento.id)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Workflow className="h-4 w-4 text-primary" />
                      <span className="font-medium text-primary">{fluxoNome}</span>
                    </div>

                    <div className="mt-1 text-sm">
                      <span className="font-semibold">#{atendimento.numero}</span>

                      {resumoVeiculo && <span className="ml-3 text-muted-foreground">{resumoVeiculo}</span>}
                    </div>
                  </div>

                  <ChevronDown className={`h-5 w-5 transition ${isOpen ? "rotate-180" : ""}`} />
                </CardHeader>

                {isOpen && (
                  <CardContent className="space-y-6">
                    {/* Dados do veículo */}
                    {vistoria && (
                      <Card>
                        <CardContent className="p-4 space-y-2 text-sm">
                          <p>
                            <strong>Placa:</strong> {placa}
                          </p>
                          <p>
                            <strong>Modelo:</strong> {modelo}
                          </p>
                          <p>
                            <strong>Ano:</strong> {ano}
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Progresso */}
                    {statusPublicos.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Progresso</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {statusPublicos.map((s, i) => {
                            const currentIndex = statusPublicos.findIndex((x) => x.status_nome === atendimento.status);
                            const done = currentIndex >= i;

                            return (
                              <div key={s.id} className="flex gap-3 py-3">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                    done ? "bg-primary text-white" : "bg-muted"
                                  }`}
                                >
                                  {done ? (
                                    <CheckCircle2 className="h-4 w-4" />
                                  ) : (
                                    <div className="w-2 h-2 bg-muted-foreground rounded-full" />
                                  )}
                                </div>

                                <div>
                                  <p className={`font-medium ${done ? "" : "text-muted-foreground"}`}>
                                    {s.status_nome}
                                  </p>
                                  {s.descricao_publica && (
                                    <p className="text-xs text-muted-foreground">{s.descricao_publica}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    )}

                    {/* Histórico */}
                    {andamentos.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Histórico</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {andamentos.map((a) => (
                            <div key={a.id} className="border-l pl-3 py-2 text-sm mb-2">
                              <p>{a.descricao}</p>
                              <p className="text-xs text-muted-foreground">
                                {a.created_by} • {new Date(a.created_at).toLocaleString("pt-BR")}
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
