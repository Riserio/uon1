// Dados do painel. Todas as consultas passam pela RLS: cada usuário só recebe
// os leads, cotações e contratos que a hierarquia dele permite ver.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const DIA = 86_400_000;

export interface CotacaoPainel {
  id: string;
  numero: number;
  produto: string | null;
  valor: number;
  status: string;
  vendedor_id: string | null;
  validade_ate: string | null;
  proposta_enviada_em: string | null;
  aceite_em: string | null;
  contrato_id: string | null;
  emitida_em: string | null;
  created_at: string;
  lead: { nome: string } | null;
}

export function usePainelComercial(ativo: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["painel_comercial", user?.id],
    enabled: ativo && !!user,
    refetchInterval: 120_000,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: etapas }, { data: leads }, { data: cots }] = await Promise.all([
        db.from("comercial_etapas").select("id, tipo"),
        db.from("comercial_leads").select("id, etapa_id, created_at, etapa_alterada_em").is("arquivado_em", null).limit(5000),
        db
          .from("comercial_cotacoes")
          .select(
            "id, numero, produto, valor, status, vendedor_id, validade_ate, proposta_enviada_em, aceite_em, contrato_id, emitida_em, created_at, lead:comercial_leads(nome)",
          )
          .is("arquivado_em", null)
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);
      const tipo = new Map<string, string>((etapas ?? []).map((e: { id: string; tipo: string }) => [e.id, e.tipo]));
      const agora = Date.now();
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
      const L = (leads ?? []) as { etapa_id: string; created_at: string; etapa_alterada_em: string }[];
      const C = (cots ?? []) as CotacaoPainel[];
      const doMes = (iso?: string | null) => !!iso && new Date(iso).getTime() >= inicioMes;

      const aguardando = C.filter((c) => c.status === "enviada" && !c.aceite_em);
      const vencidas = aguardando.filter((c) => c.validade_ate && new Date(c.validade_ate).getTime() < agora);
      const noPrazo = aguardando.filter((c) => !vencidas.includes(c));
      return {
        leads: {
          abertos: L.filter((l) => tipo.get(l.etapa_id) === "aberta").length,
          novos7d: L.filter((l) => agora - new Date(l.created_at).getTime() < 7 * DIA).length,
          ganhosMes: L.filter((l) => tipo.get(l.etapa_id) === "ganho" && doMes(l.etapa_alterada_em)).length,
          perdidosMes: L.filter((l) => tipo.get(l.etapa_id) === "perdido" && doMes(l.etapa_alterada_em)).length,
        },
        cotacoes: {
          rascunho: C.filter((c) => c.status === "rascunho").length,
          aguardando: noPrazo.length,
          valorAguardando: noPrazo.reduce((s, c) => s + Number(c.valor || 0), 0),
          aceitas: C.filter((c) => c.status === "aprovada").length,
          emitidasMes: C.filter((c) => c.status === "emitida" && doMes(c.emitida_em)).length,
          valorEmitidoMes: C.filter((c) => c.status === "emitida" && doMes(c.emitida_em)).reduce((s, c) => s + Number(c.valor || 0), 0),
          vencidas: vencidas.length,
          recusadas: C.filter((c) => c.status === "recusada").length,
          canceladas: C.filter((c) => c.status === "cancelada").length,
          pedidosCancelamento: C.filter((c) => c.status === "cancelamento_solicitado").length,
        },
        /** Propostas que vencem em até 3 dias sem aceite. */
        vencendo: noPrazo.filter((c) => c.validade_ate && new Date(c.validade_ate).getTime() - agora < 3 * DIA),
        /** Cliente aceitou os valores e ainda não gerou o contrato. */
        aceitasSemContrato: C.filter((c) => c.status === "aprovada" && c.aceite_em && !c.contrato_id),
        cotacoesAbertas: C.filter((c) => ["rascunho", "enviada", "aprovada"].includes(c.status)),
      };
    },
  });
}

export interface ContratoPainel {
  id: string;
  numero: string;
  titulo: string;
  status: string;
  contratante_nome: string | null;
  data_fim: string | null;
  enviado_em: string | null;
  expira_em: string | null;
  concluido_em: string | null;
  created_at: string;
}

export function usePainelContratos(ativo: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["painel_contratos", user?.id],
    enabled: ativo && !!user,
    refetchInterval: 120_000,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await db
        .from("contratos")
        .select("id, numero, titulo, status, contratante_nome, data_fim, enviado_em, expira_em, concluido_em, created_at")
        .eq("arquivado", false)
        .order("created_at", { ascending: false })
        .limit(2000);
      const K = (data ?? []) as ContratoPainel[];
      const agora = Date.now();
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
      const aAssinar = K.filter((k) => ["aguardando_assinatura", "parcialmente_assinado"].includes(k.status));
      const assinados = K.filter((k) => k.status === "assinado");
      return {
        rascunhos: K.filter((k) => k.status === "rascunho").length,
        aAssinar,
        processando: K.filter((k) => k.status === "assinado_processando").length,
        assinados: assinados.length,
        assinadosMes: assinados.filter((k) => k.concluido_em && new Date(k.concluido_em).getTime() >= inicioMes).length,
        expirados: K.filter((k) => k.status === "expirado").length,
        cancelados: K.filter((k) => k.status === "cancelado").length,
        recusados: K.filter((k) => k.status === "recusado").length,
        /** Prazo de assinatura acaba em até 3 dias. */
        prazoAcabando: aAssinar.filter((k) => k.expira_em && new Date(k.expira_em).getTime() - agora < 3 * DIA),
        /** Enviados há mais de 7 dias e ainda sem todas as assinaturas. */
        parados: aAssinar.filter((k) => k.enviado_em && agora - new Date(k.enviado_em).getTime() > 7 * DIA),
        /** Vigência termina nos próximos 30 dias. */
        vigenciaVencendo: assinados.filter((k) => {
          if (!k.data_fim) return false;
          const fim = new Date(k.data_fim).getTime();
          return fim >= agora && fim - agora < 30 * DIA;
        }),
      };
    },
  });
}

export type DadosComercial = NonNullable<ReturnType<typeof usePainelComercial>["data"]>;
export type DadosContratos = NonNullable<ReturnType<typeof usePainelContratos>["data"]>;
