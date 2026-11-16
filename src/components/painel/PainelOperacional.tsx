import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { LucideIcon } from "lucide-react";
import { Building2, CheckCircle2, CircleAlert, FileCheck2, FileSignature, Mail, MessageCircle, Radar, RefreshCcw, Stamp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ROTA_MODULO } from "@/config/modulos";
import { brl, CARTAO } from "./comum";
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
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

interface Ponto {
  icone: LucideIcon;
  nome: string;
  ok: boolean;
  detalhe: string;
  para?: string;
}

/**
 * Visão da operação inteira: só administrador e superintendente. Abre com o
 * veredito (tudo funcionando ou o que pede atenção), depois os pontos de
 * controle, o movimento de e-mails e a equipe comercial.
 */
export function PainelOperacional({ comercial, contratos }: { comercial?: DadosComercial; contratos?: DadosContratos }) {
  const { data, isLoading } = useQuery({
    queryKey: ["painel_operacional"],
    refetchInterval: 120_000,
    staleTime: 60_000,
    queryFn: async () => {
      const ha7 = subDays(new Date(), 7).toISOString();
      const [associacoes, usuarios, cob, sga, mgf, waFalha, emails, fontes, vendedores] = await Promise.all([
        contar(supabase.from("corretoras").select("id", { count: "exact", head: true })),
        contar(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "ativo")),
        contar(supabase.from("cobranca_automacao_execucoes").select("id", { count: "exact", head: true }).eq("status", "erro").gte("created_at", ha7)),
        contar(supabase.from("sga_automacao_execucoes").select("id", { count: "exact", head: true }).eq("status", "erro").gte("created_at", ha7)),
        contar(supabase.from("mgf_automacao_execucoes").select("id", { count: "exact", head: true }).eq("status", "erro").gte("created_at", ha7)),
        contar(db.from("contrato_historico").select("id", { count: "exact", head: true }).in("acao", ["whatsapp_falhou", "envio_falhou"]).eq("canal", "whatsapp").gte("created_at", ha7)),
        supabase.from("email_historico").select("status, created_at").gte("created_at", ha7).order("created_at", { ascending: false }).limit(5000),
        db.from("mercado_fontes").select("nome, ativo, ultimo_status, ultima_coleta_em").order("nome"),
        db.from("comercial_vendedores").select("id, nome"),
      ]);
      return {
        associacoes,
        usuarios,
        cob,
        sga,
        mgf,
        waFalha,
        emails: (emails.data ?? []) as { status: string; created_at: string | null }[],
        fontes: (fontes.data ?? []) as { nome: string; ativo: boolean; ultimo_status: string | null; ultima_coleta_em: string | null }[],
        vendedores: new Map<string, string>(((vendedores.data ?? []) as { id: string; nome: string }[]).map((v) => [v.id, v.nome])),
      };
    },
  });

  if (isLoading || !data) {
    return (
      <section className={`${CARTAO} p-5`}>
        <Skeleton className="h-64 rounded-2xl" />
      </section>
    );
  }

  // E-mails por dia, últimos 7 dias
  const dias = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
  const porDia = dias.map((d) => {
    const k = format(d, "yyyy-MM-dd");
    const doDia = data.emails.filter((e) => e.created_at && format(parseISO(e.created_at), "yyyy-MM-dd") === k);
    return { d, ok: doDia.filter((e) => e.status === "enviado").length, erro: doDia.filter((e) => e.status === "erro").length };
  });
  const emailOk = porDia.reduce((s, x) => s + x.ok, 0);
  const emailErro = porDia.reduce((s, x) => s + x.erro, 0);
  const pico = Math.max(1, ...porDia.map((x) => x.ok + x.erro));

  const fontesAtivas = data.fontes.filter((f) => f.ativo);
  const fontesErro = fontesAtivas.filter((f) => f.ultimo_status === "erro");
  const ultimaColeta = fontesAtivas.map((f) => f.ultima_coleta_em).filter(Boolean).sort().pop();
  const sinc = (nome: string, erros: number | null): Ponto => ({
    icone: RefreshCcw,
    nome: `Sincronização ${nome}`,
    ok: !erros,
    detalhe: erros == null ? "sem leitura" : erros ? `${erros} ${erros === 1 ? "execução com erro" : "execuções com erro"}` : "sem erros",
  });
  const pontos: Ponto[] = [
    sinc("Cobrança", data.cob),
    sinc("SGA", data.sga),
    sinc("MGF", data.mgf),
    { icone: Mail, nome: "E-mails", ok: !emailErro, detalhe: emailErro ? `${emailErro} com falha de ${emailOk + emailErro}` : `${emailOk} enviados, sem falhas`, para: ROTA_MODULO.emails },
    { icone: MessageCircle, nome: "WhatsApp dos contratos", ok: !data.waFalha, detalhe: data.waFalha ? `${data.waFalha} ${data.waFalha === 1 ? "envio não entregue" : "envios não entregues"}` : "sem falhas de entrega", para: ROTA_MODULO.contratos },
    { icone: Stamp, nome: "Finalização de contratos", ok: !contratos?.processando, detalhe: contratos?.processando ? `${contratos.processando} aguardando a via final` : "nenhum contrato parado", para: ROTA_MODULO.contratos },
    {
      icone: Radar,
      nome: "Radar do mercado",
      ok: fontesErro.length === 0,
      detalhe: fontesErro.length
        ? `sem leitura de ${fontesErro.map((f) => f.nome).join(", ")}`
        : ultimaColeta
          ? `${fontesAtivas.length} fontes, lido ${formatDistanceToNow(parseISO(ultimaColeta), { addSuffix: true, locale: ptBR })}`
          : "aguardando a primeira leitura",
    },
  ];
  // o que pede atenção vem primeiro
  pontos.sort((a, b) => Number(a.ok) - Number(b.ok));
  const problemas = pontos.filter((p) => !p.ok).length;

  // Equipe comercial: propostas em aberto e assinadas no mês, por vendedor
  const equipe = (() => {
    if (!comercial) return [];
    const m = new Map<string, { abertas: number; valor: number; assinadas: number }>();
    const de = (id: string | null) => {
      const k = id ?? "sem";
      if (!m.has(k)) m.set(k, { abertas: 0, valor: 0, assinadas: 0 });
      return m.get(k)!;
    };
    for (const c of comercial.cotacoesAbertas) {
      const x = de(c.vendedor_id);
      x.abertas += 1;
      x.valor += Number(c.valor || 0);
    }
    for (const c of comercial.emitidasMesLista) de(c.vendedor_id).assinadas += 1;
    return [...m.entries()]
      .map(([id, x]) => ({ nome: id === "sem" ? "Sem vendedor" : (data.vendedores.get(id) ?? "Vendedor"), ...x }))
      .sort((a, b) => b.valor - a.valor || b.assinadas - a.assinadas)
      .slice(0, 5);
  })();
  const maior = Math.max(1, ...equipe.map((r) => r.valor));

  const numeros: { icone: LucideIcon; cor: string; valor: React.ReactNode; rotulo: string; para: string }[] = [
    { icone: Building2, cor: "bg-violet-500/10 text-violet-600", valor: data.associacoes ?? "—", rotulo: "associações na base", para: ROTA_MODULO.corretoras },
    { icone: Users, cor: "bg-blue-500/10 text-blue-600", valor: data.usuarios ?? "—", rotulo: "usuários ativos", para: "/usuarios" },
    { icone: FileSignature, cor: "bg-amber-500/10 text-amber-600", valor: contratos ? contratos.aAssinar.length : "—", rotulo: "contratos a assinar", para: ROTA_MODULO.contratos },
    { icone: FileCheck2, cor: "bg-emerald-500/10 text-emerald-600", valor: contratos ? contratos.assinadosMes : "—", rotulo: "assinados neste mês", para: ROTA_MODULO.contratos },
  ];

  return (
    <section className={`${CARTAO} overflow-hidden`} aria-label="Painel operacional">
      {/* Veredito */}
      <div
        className={`relative px-5 py-5 text-white bg-gradient-to-br ${
          problemas ? "from-amber-900 via-orange-800 to-rose-700" : "from-slate-900 via-indigo-950 to-indigo-800"
        }`}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-11 w-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              {problemas ? <CircleAlert className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight leading-tight">
                {problemas ? `${problemas} ${problemas === 1 ? "ponto pede" : "pontos pedem"} atenção na operação` : "Operação funcionando normalmente"}
              </h2>
              <p className="text-sm text-white/70">Painel operacional, últimos 7 dias. Visível para administrador e superintendente.</p>
            </div>
          </div>
          <div className="flex gap-1.5" aria-hidden>
            {pontos.map((p) => (
              <span key={p.nome} title={`${p.nome}: ${p.detalhe}`} className={`h-2.5 w-7 rounded-full ${p.ok ? "bg-emerald-400" : "bg-white animate-pulse"}`} />
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-2">
          {numeros.map((n) => (
            <Link key={n.rotulo} to={n.para} className="rounded-2xl bg-white/10 hover:bg-white/15 transition-colors px-4 py-3 flex items-center gap-3">
              <n.icone className="h-5 w-5 text-white/70 shrink-0" />
              <span className="min-w-0">
                <span className="block text-2xl font-bold tabular-nums leading-none">{n.valor}</span>
                <span className="block text-xs text-white/70 mt-1 truncate">{n.rotulo}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 p-5">
        {/* Pontos de controle */}
        <div>
          <h3 className="text-sm font-bold mb-2">Pontos de controle</h3>
          <ul className="space-y-1">
            {pontos.map((p) => {
              const corpo = (
                <>
                  <span className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${p.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
                    <p.icone className="h-4 w-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{p.nome}</span>
                    <span className={`block text-xs truncate ${p.ok ? "text-muted-foreground" : "text-red-600 dark:text-red-400 font-medium"}`}>{p.detalhe}</span>
                  </span>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${p.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                </>
              );
              const classe = "flex items-center gap-3 rounded-xl px-2 py-1.5";
              return (
                <li key={p.nome}>
                  {p.para ? (
                    <Link to={p.para} className={`${classe} hover:bg-muted/60 transition-colors`}>
                      {corpo}
                    </Link>
                  ) : (
                    <div className={classe}>{corpo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* E-mails por dia */}
        <div className="flex flex-col">
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold">E-mails enviados por dia</h3>
            <Link to={ROTA_MODULO.emails} className="text-xs font-medium text-primary hover:underline">
              Abrir
            </Link>
          </div>
          <p className="text-3xl font-bold tabular-nums leading-none">{emailOk + emailErro}</p>
          <p className="text-xs text-muted-foreground mt-1">
            em 7 dias{emailErro ? `, ${emailErro} com falha` : emailOk ? ", todos entregues ao provedor" : ""}
          </p>
          <div className="mt-4 flex-1 flex items-end gap-2 min-h-[120px]" role="img" aria-label={`E-mails por dia: ${porDia.map((x) => `${format(x.d, "dd/MM")} ${x.ok + x.erro}`).join(", ")}`}>
            {porDia.map((x) => {
              const total = x.ok + x.erro;
              return (
                <div key={x.d.toISOString()} className="group flex-1 flex flex-col items-center gap-1.5 h-full justify-end" title={`${format(x.d, "dd/MM")}: ${x.ok} enviados${x.erro ? `, ${x.erro} com falha` : ""}`}>
                  <span className="text-[11px] tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">{total}</span>
                  <div className="w-full flex flex-col justify-end rounded-lg overflow-hidden bg-muted/50" style={{ height: `${Math.max(6, (total / pico) * 100)}%` }}>
                    {x.erro > 0 && <div className="bg-red-500" style={{ height: `${(x.erro / Math.max(1, total)) * 100}%` }} />}
                    {x.ok > 0 && <div className="bg-primary flex-1" />}
                  </div>
                  <span className="text-[11px] text-muted-foreground capitalize">{format(x.d, "EEEEEE", { locale: ptBR })}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Equipe comercial */}
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold">Equipe comercial</h3>
            <Link to={ROTA_MODULO.comercial} className="text-xs font-medium text-primary hover:underline">
              Abrir
            </Link>
          </div>
          {equipe.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma proposta em aberto nem contrato assinado neste mês.</p>
          ) : (
            <ul className="space-y-3">
              {equipe.map((r, i) => (
                <li key={r.nome} className="flex items-center gap-3">
                  <span className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    {iniciais(r.nome) || "?"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium truncate">{r.nome}</span>
                      <span className="text-sm font-bold tabular-nums shrink-0">{brl(r.valor)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${r.valor ? Math.max(4, (r.valor / maior) * 100) : 0}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r.abertas} {r.abertas === 1 ? "proposta em aberto" : "propostas em aberto"}
                      {r.assinadas ? `, ${r.assinadas} ${r.assinadas === 1 ? "assinada" : "assinadas"} no mês` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
