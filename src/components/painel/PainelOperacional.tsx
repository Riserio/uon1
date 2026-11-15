import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ROTA_MODULO } from "@/config/modulos";
import { brl, Cabecalho, CARTAO, Indicador } from "./comum";
import type { DadosComercial, DadosContratos } from "./dados";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const contar = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
  try {
    const { count, error } = await q;
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
};

/**
 * Visão da operação inteira: só administrador e superintendente. Saúde das
 * integrações, envios, coleta de notícias e desempenho da equipe comercial.
 */
export function PainelOperacional({ comercial, contratos }: { comercial?: DadosComercial; contratos?: DadosContratos }) {
  const { data, isLoading } = useQuery({
    queryKey: ["painel_operacional"],
    refetchInterval: 120_000,
    staleTime: 60_000,
    queryFn: async () => {
      const ha7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [associacoes, usuarios, pendentes, cob, sga, mgf, emailErro, emailOk, waFalha, fontes, vendedores] = await Promise.all([
        contar(supabase.from("corretoras").select("id", { count: "exact", head: true })),
        contar(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "ativo")),
        contar(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente")),
        contar(supabase.from("cobranca_automacao_execucoes").select("id", { count: "exact", head: true }).eq("status", "erro").gte("created_at", ha7)),
        contar(supabase.from("sga_automacao_execucoes").select("id", { count: "exact", head: true }).eq("status", "erro").gte("created_at", ha7)),
        contar(supabase.from("mgf_automacao_execucoes").select("id", { count: "exact", head: true }).eq("status", "erro").gte("created_at", ha7)),
        contar(supabase.from("email_historico").select("id", { count: "exact", head: true }).eq("status", "erro").gte("created_at", ha7)),
        contar(supabase.from("email_historico").select("id", { count: "exact", head: true }).eq("status", "enviado").gte("created_at", ha7)),
        contar(db.from("contrato_historico").select("id", { count: "exact", head: true }).in("acao", ["whatsapp_falhou", "envio_falhou"]).eq("canal", "whatsapp").gte("created_at", ha7)),
        db.from("mercado_fontes").select("nome, ativo, ultimo_status, ultimo_erro, ultima_coleta_em").order("nome"),
        db.from("comercial_vendedores").select("id, nome"),
      ]);
      return {
        associacoes,
        usuarios,
        pendentes,
        sincronizacao: [
          { nome: "Cobrança", erros: cob },
          { nome: "SGA", erros: sga },
          { nome: "MGF", erros: mgf },
        ],
        emailErro,
        emailOk,
        waFalha,
        fontes: (fontes.data ?? []) as { nome: string; ativo: boolean; ultimo_status: string | null; ultimo_erro: string | null; ultima_coleta_em: string | null }[],
        vendedores: new Map<string, string>(((vendedores.data ?? []) as { id: string; nome: string }[]).map((v) => [v.id, v.nome])),
      };
    },
  });

  const ranking = (() => {
    if (!comercial || !data) return [];
    const m = new Map<string, { n: number; valor: number }>();
    for (const c of comercial.cotacoesAbertas) {
      const k = c.vendedor_id ?? "sem";
      const x = m.get(k) ?? { n: 0, valor: 0 };
      x.n += 1;
      x.valor += Number(c.valor || 0);
      m.set(k, x);
    }
    return [...m.entries()]
      .map(([id, x]) => ({ nome: id === "sem" ? "Sem vendedor" : (data.vendedores.get(id) ?? "Vendedor"), ...x }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
  })();
  const maior = Math.max(1, ...ranking.map((r) => r.valor));
  const fontesErro = data?.fontes.filter((f) => f.ativo && f.ultimo_status === "erro") ?? [];
  const ultimaColeta = data?.fontes.map((f) => f.ultima_coleta_em).filter(Boolean).sort().pop();
  const n = (v: number | null | undefined) => (v == null ? "—" : v);

  const Linha = ({ ok, titulo, detalhe, para }: { ok: boolean; titulo: string; detalhe: string; para?: string }) => {
    const corpo = (
      <>
        {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{titulo}</p>
          <p className="text-xs text-muted-foreground truncate">{detalhe}</p>
        </div>
      </>
    );
    const classe = "flex items-center gap-2.5 rounded-xl px-3 py-2 bg-muted/40";
    return para ? (
      <Link to={para} className={`${classe} hover:bg-muted/60 transition-colors`}>
        {corpo}
      </Link>
    ) : (
      <div className={classe}>{corpo}</div>
    );
  };

  return (
    <section className={`${CARTAO} p-5 space-y-4 h-full`}>
      <div>
        <Cabecalho icone={Activity} cor="bg-violet-500/10 text-violet-600" titulo="Painel operacional" subtitulo="A operação inteira, para administrador e superintendente" />
      </div>
      <div>
        {isLoading || !data ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Base e equipe</p>
              <div className="grid grid-cols-2 gap-2">
                <Indicador valor={n(data.associacoes)} rotulo="Associações" para={ROTA_MODULO.corretoras} />
                <Indicador valor={n(data.usuarios)} rotulo="Usuários ativos" detalhe={data.pendentes ? `${data.pendentes} aguardando aprovação` : undefined} para="/usuarios" />
                <Indicador valor={contratos ? contratos.aAssinar.length : "—"} rotulo="Contratos a assinar" detalhe="todas as equipes" para={ROTA_MODULO.contratos} />
                <Indicador valor={contratos ? contratos.assinadosMes : "—"} rotulo="Assinados no mês" cor="text-emerald-600" para={ROTA_MODULO.contratos} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Saúde da operação nos últimos 7 dias</p>
              <div className="space-y-1.5">
                {data.sincronizacao.map((s) => (
                  <Linha key={s.nome} ok={!s.erros} titulo={`Sincronização ${s.nome}`} detalhe={s.erros == null ? "sem leitura" : s.erros ? `${s.erros} execução(ões) com erro` : "sem erros"} />
                ))}
                <Linha
                  ok={!data.emailErro}
                  titulo="E-mails"
                  detalhe={`${n(data.emailOk)} enviados, ${data.emailErro ? `${data.emailErro} com falha` : "sem falhas"}`}
                  para={ROTA_MODULO.emails}
                />
                <Linha ok={!data.waFalha} titulo="WhatsApp dos contratos" detalhe={data.waFalha ? `${data.waFalha} envio(s) não entregue(s)` : "sem falhas de entrega"} para={ROTA_MODULO.contratos} />
                <Linha
                  ok={!contratos?.processando}
                  titulo="Finalização de contratos"
                  detalhe={contratos?.processando ? `${contratos.processando} assinado(s) aguardando a via final` : "nenhum contrato parado"}
                  para={ROTA_MODULO.contratos}
                />
                <Linha
                  ok={fontesErro.length === 0}
                  titulo="Radar do mercado"
                  detalhe={
                    fontesErro.length
                      ? `Sem leitura de: ${fontesErro.map((f) => f.nome).join(", ")}`
                      : ultimaColeta
                        ? `${data.fontes.filter((f) => f.ativo).length} fontes, lido ${formatDistanceToNow(parseISO(ultimaColeta), { addSuffix: true, locale: ptBR })}`
                        : "aguardando a primeira leitura"
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Propostas em aberto por vendedor</p>
              {ranking.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma proposta em aberto.</p>
              ) : (
                <div className="space-y-2.5">
                  {ranking.map((r) => (
                    <div key={r.nome}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{r.nome}</span>
                        <span className="tabular-nums text-muted-foreground shrink-0">
                          {r.n} {r.n === 1 ? "proposta" : "propostas"}, {brl(r.valor)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                        <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(4, (r.valor / maior) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
