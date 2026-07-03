import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ModuloImportacao = "cobranca" | "eventos" | "mgf";
export type StatusImportacao = "executando" | "sucesso" | "erro" | "parado" | "outro";

export interface ImportacaoItem {
  id: string;
  modulo: ModuloImportacao;
  corretoraId: string | null;
  corretoraNome: string;
  statusRaw: string | null;
  status: StatusImportacao;
  etapa: string | null;
  registros: number | null;
  erro: string | null;
  runUrl: string | null;
  criadoEm: string;
  finalizadoEm: string | null;
}

const TABELAS: Record<ModuloImportacao, string> = {
  cobranca: "cobranca_automacao_execucoes",
  eventos: "sga_automacao_execucoes",
  mgf: "mgf_automacao_execucoes",
};

const STALE_MS = 15 * 60 * 1000; // "executando" há mais que isso = provavelmente parado

function normalizaStatus(raw: string | null, criadoEm: string): StatusImportacao {
  if (raw === "sucesso") return "sucesso";
  if (raw === "erro" || raw === "parado") return "erro";
  if (raw === "executando") {
    return Date.now() - new Date(criadoEm).getTime() > STALE_MS ? "parado" : "executando";
  }
  return "outro";
}

/**
 * Execuções de importação recentes (cobrança, eventos, MGF) com atualização em tempo real.
 * Usado pelo rail lateral de acompanhamento.
 */
export function useImportacoesRecentes(limitePorModulo = 15) {
  const [itens, setItens] = useState<ImportacaoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const [corretorasRes, ...execsRes] = await Promise.all([
        supabase.from("corretoras").select("id, nome"),
        ...(Object.entries(TABELAS) as [ModuloImportacao, string][]).map(([, tabela]) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from(tabela)
            .select("id, corretora_id, status, created_at, finalizado_at, registros_processados, etapa_atual, erro, github_run_url")
            .order("created_at", { ascending: false })
            .limit(limitePorModulo),
        ),
      ]);

      const nomePorId = new Map<string, string>(
        (corretorasRes.data ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]),
      );

      const modulos = Object.keys(TABELAS) as ModuloImportacao[];
      const todos: ImportacaoItem[] = [];
      execsRes.forEach((res, i) => {
        const modulo = modulos[i];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (res.data ?? []).forEach((r: any) => {
          todos.push({
            id: r.id,
            modulo,
            corretoraId: r.corretora_id ?? null,
            corretoraNome: (r.corretora_id && nomePorId.get(r.corretora_id)) || "Associação",
            statusRaw: r.status ?? null,
            status: normalizaStatus(r.status ?? null, r.created_at),
            etapa: r.etapa_atual ?? null,
            registros: r.registros_processados ?? null,
            erro: r.erro ?? null,
            runUrl: r.github_run_url ?? null,
            criadoEm: r.created_at,
            finalizadoEm: r.finalizado_at ?? null,
          });
        });
      });

      todos.sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
      setItens(todos);
    } catch (e) {
      console.warn("[importacoes] falha ao carregar execuções:", e);
    } finally {
      setLoading(false);
    }
  }, [limitePorModulo]);

  useEffect(() => {
    carregar();
    const channel = supabase.channel("importacoes_rail");
    Object.values(TABELAS).forEach((tabela) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table: tabela }, carregar);
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregar]);

  const emAndamento = useMemo(() => itens.filter((i) => i.status === "executando"), [itens]);

  return { itens, emAndamento, temImportacaoRodando: emAndamento.length > 0, loading, recarregar: carregar };
}
