import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, CheckCircle2, Workflow, ChevronDown } from "lucide-react";
import { formatCPF, formatPlaca } from "@/lib/validators";

type CaminhoStatusItem = {
  status_nome: string;
  descricao_publica?: string | null;
  created_at: string;
  fluxo_id?: number | null;
  fluxo_nome?: string | null;
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
      const atIds = Array.from(
        new Set(
          vistoriasEncontradas.map((v: any) => v.atendimento_id).filter(Boolean)
        )
      );

      if (atIds.length > 0) {
        const { data: atendVist, error: errAtendVist } = await supabase
          .from("atendimentos")
          .select("*")
          .in("id", atIds);

        if (errAtendVist) console.error(errAtendVist);
        if (atendVist?.length) atendimentosEncontrados.push(...atendVist);
      }

      // Remover duplicados
      const mapaAt: Record<string, any> = Object.fromEntries(
        atendimentosEncontrados.map((a: any) => [a.id, a])
      );
      const atendimentos = Object.values(mapaAt);

      if (atendimentos.length === 0) {
        toast.error("Nenhum sinistro encontrado");
        return;
      }

      // Montar resultados por atendimento
      const resultadosFinal: ResultadoSinistro[] = await Promise.all(
        atendimentos.map(async (at: any) => {
          const vist =
            vistoriasEncontradas
              .filter((v: any) => v.atendimento_id === at.id)
              .sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
              )[0] || null;

          // Andamentos
          const { data: andamentosData, error: errAnd } = await supabase
            .from("andamentos")
            .select("*, profiles!andamentos_created_by_fkey(nome)")
            .eq("atendimento_id", at.id)
            .order("created_at", { ascending: true });

          if (errAnd) console.error(errAnd);

          // Histórico completo (status, fluxo e outros)
          const { data: hist, error: errHist } = await supabase
            .from("atendimentos_historico")
            .select("*")
            .eq("atendimento_id", at.id)
            .order("created_at", { ascending: true });

          if (errHist) console.error(errHist);

          const historico = (hist || []);

          // Separar status e fluxo
          const histStatus = historico.filter((h: any) => {
            const campos = (h.campos_alterados as string[]) || [];
            return campos.includes("status");
          });

          const histFluxo = historico.filter((h: any) => {
            const campos = (h.campos_alterados as string[]) || [];
            return campos.includes("fluxo_id");
          });

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

          // Buscar nomes de TODOS os fluxos usados e status públicos (para descrição)
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

          // Timeline completa: andamentos + mudanças de status + mudanças de fluxo
          const timeline: TimelineItem[] = [
            ...(andamentosData || []).map((a: any) => ({
              id: `and-${a.id}`,
              tipo: "andamento" as const,
              descricao: a.descricao,
              created_at: a.created_at,
              created_by: a.profiles?.nome || "Sistema",
            })),
            ...histStatus.map((h: any) => ({
              id: `hist-status-${h.id}`,
              tipo: "status" as const,
              descricao: `Status alterado: ${
                (h.valores_anteriores as any)?.status || "N/A"
              } → ${(h.valores_novos as any)?.status || "N/A"}`,
              created_at: h.created_at,
              created_by: h.user_nome || "Sistema",
            })),
            ...histFluxo.map((h: any) => {
              const anteriorId = (h.valores_anteriores as any)?.fluxo_id;
              const novoId = (h.valores_novos as any)?.fluxo_id;

              const anteriorNome =
                (anteriorId && nomeFluxosLocal[anteriorId]) ||
                (anteriorId ? `Fluxo ${anteriorId}` : "N/A");
              const novoNome =
                (novoId && nomeFluxosLocal[novoId]) ||
                (novoId ? `Fluxo ${novoId}` : "N/A");

              return {
                id: `hist-fluxo-${h.id}`,
                tipo: "fluxo" as const,
                descricao: `Fluxo alterado: ${anteriorNome} → ${novoNome}`,
                created_at: h.created_at,
                created_by: h.user_nome || "Sistema",
              };
            }),
          ].sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          );

          // 👉 Caminho REAL de status percorridos, acompanhando fluxo ativo
          let currentFluxoId: number | null = at.fluxo_id ?? null;

          if (histFluxo.length > 0) {
            const firstFluxo = histFluxo[0];
            const anteriorFluxoId = (firstFluxo.valores_anteriores as any)
              ?.fluxo_id;
            if (anteriorFluxoId !== undefined && anteriorFluxoId !== null) {
              currentFluxoId = anteriorFluxoId;
            }
          }

          const caminhoStatusRaw: {
            status_nome: string;
            created_at: string;
            fluxo_id: number | null;
          }[] = [];

          historico.forEach((h: any) => {
            const campos = (h.campos_alterados as string[]) || [];

            // Atualiza fluxo atual quando mudar fluxo_id
            if (campos.includes("fluxo_id")) {
              const novoFluxoId = (h.valores_novos as any)?.fluxo_id;
              if (novoFluxoId !== undefined && novoFluxoId !== null) {
                currentFluxoId = novoFluxoId;
              }
            }

            // Registra mudança de status atrelada ao fluxo atual
            if (campos.includes("status")) {
              const novoStatus = (h.valores_novos as any)?.status;
              if (!novoStatus) return;

              caminhoStatusRaw.push({
                status_nome: novoStatus,
                created_at: h.created_at as string,
                fluxo_id: currentFluxoId,
              });
            }
          });

          // Se não há histórico, mas existe status atual, usa ele
          if (caminhoStatusRaw.length === 0 && at.status) {
            caminhoStatusRaw.push({
              status_nome: at.status,
              created_at: at.created_at,
              fluxo_id: at.fluxo_id ?? null,
            });
          }

          // Remove repetições consecutivas (mesmo status no mesmo fluxo)
          const caminhoStatusDedup: {
            status_nome: string;
            created_at: string;
            fluxo_id: number | null;
          }[] = [];
          for (const item of caminhoStatusRaw) {
            const last = caminhoStatusDedup[caminhoStatusDedup.length - 1];
            if (
              !last ||
              last.status_nome !== item.status_nome ||
              last.fluxo_id !== item.fluxo_id
            ) {
              caminhoStatusDedup.push(item);
            }
          }

          // Enriquecer com descrição pública e nome do fluxo
          const caminhoStatus: CaminhoStatusItem[] = caminhoStatusDedup.map(
            (item) => {
              const fluxoId = item.fluxo_id ?? undefined;
              const fluxoNome = fluxoId ? nomeFluxosLocal[fluxoId] || null : null;
              const statusConfigs = fluxoId
                ? statusPublicosPorFluxoLocal[fluxoId] || []
                : [];

              const config = statusConfigs.find(
                (s: any) => s.status_nome === item.status_nome
              );

              return {
                status_nome: item.status_nome,
                descricao_publica: config?.descricao_publica ?? null,
                created_at: item.created_at,
                fluxo_id: fluxoId,
                fluxo_nome: fluxoNome,
              };
            }
          );

          const fluxoNomeAtual =
            (at.fluxo_id && nomeFluxosLocal[at.fluxo_id]) || "Fluxo";
          const statusPublicosFluxoAtual =
            (at.fluxo_id && statusPublicosPorFluxoLocal[at.fluxo_id]) || [];

          return {
            atendimento: at,
            vistoria: vist,
            fluxoNomeAtual,
            statusPublicosFluxoAtual,
            timeline,
            caminhoStatus,
          };
        })
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
          <p className="text-sm text-muted-foreground">
            Consulte pelo CPF, placa ou número do sinistro
          </p>
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
              <Button
                onClick={handleBuscar}
                disabled={loading}
                className="h-11 px-8"
              >
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
          <p className="text-center text-muted-foreground">
            Digite para consultar
          </p>
        ) : (
          resultados.map((item) => {
            const {
              atendimento,
              vistoria,
              fluxoNomeAtual,
              statusPublicosFluxoAtual,
              timeline,
              caminhoStatus,
            } = item;
            const isOpen = expandedId === atendimento.id;

            const placa = vistoria?.veiculo_placa
              ? formatPlaca(vistoria.veiculo_placa)
              : "";
            const modelo = vistoria?.veiculo_modelo || "";
            const ano =
              vistoria?.veiculo_ano || vistoria?.veiculo_ano_modelo || "";

            const resumoVeiculo = [modelo, ano, placa]
              .filter(Boolean)
              .join(" • ");

            const statusAtualConfig = statusPublicosFluxoAtual.find(
              (x: any) => x.status_nome === atendimento.status
            );

            const listaFluxo: CaminhoStatusItem[] =
              caminhoStatus.length > 0
                ? caminhoStatus
                : atendimento.status
                ? [
                    {
                      status_nome: atendimento.status,
                      created_at: atendimento.created_at,
                      fluxo_id: atendimento.fluxo_id ?? undefined,
                      fluxo_nome: fluxoNomeAtual,
                    },
                  ]
                : [];

            const lastIndex = listaFluxo.length - 1;

            return (
              <Card className="mb-4" key={atendimento.id}>
                <CardHeader
                  className="cursor-pointer flex justify-between items-center"
                  onClick={() =>
                    setExpandedId(isOpen ? null : atendimento.id)
                  }
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Workflow className="h-4 w-4 text-primary" />
                      <span className="font-medium text-primary">
                        {fluxoNomeAtual}
                      </span>
                    </div>

                    <div className="mt-1 text-sm flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        #{atendimento.numero}
                      </span>

                      {resumoVeiculo && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">
                            {resumoVeiculo}
                          </span>
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

                  <ChevronDown
                    className={`h-5 w-5 transition ${
