import { Fragment, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  Clock,
  Pause,
  Play,
  Send,
  ChevronDown,
  ChevronRight,
  Download,
  Info,
  Loader2,
  Mail,
  MailCheck,
  MailOpen,
  MailX,
  Monitor,
  MousePointerClick,
  RefreshCw,
  Search,
  Smartphone,
  Tablet,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { controlarCampanha, type OperacaoCampanha } from "@/lib/radar/newsletter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const CARTAO = "rounded-3xl border border-border/40 bg-card shadow-sm";
const dataHora = (iso?: string | null) => (iso ? format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm") : "");
const ha = (iso: string) => formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR });
const pct = (n: number, de: number) => (de ? `${Math.round((n / de) * 1000) / 10}%` : "—");

interface Campanha {
  id: string;
  assunto: string;
  titulo: string;
  mensagem: string;
  botao_texto: string | null;
  botao_url: string | null;
  status: string;
  criado_em: string;
  concluido_em: string | null;
  destinatarios: number;
  enviados: number;
  falhas: number;
  publico: string | null;
  assinantes: number | null;
  prospects: number | null;
  noticias: string[] | null;
  erro: string | null;
  limite_diario: number | null;
  pendentes: number | null;
  ultimo_lote_em: string | null;
}
interface Metricas {
  pendentes?: number;
  cancelados?: number;
  enviados_hoje?: number;
  rastreada: boolean;
  destinatarios: number;
  enviados: number;
  falharam: number;
  entregues: number;
  devolvidos: number;
  spam: number;
  atrasados: number;
  abriram: number;
  aberturas: number;
  clicaram: number;
  cliques: number;
  inscreveram: number;
  assinaram: number;
  descadastraram: number;
  por_hora: { hora: string; aberturas: number; cliques: number }[];
  links: { url: string; cliques: number; pessoas: number }[];
  dispositivos: { nome: string; eventos: number }[];
}
interface Envio {
  id: string;
  email: string;
  nome: string | null;
  associacao: string | null;
  tipo: "assinante" | "prospect";
  status: "pendente" | "cancelado" | "enviando" | "enviado" | "falhou" | "entregue" | "atrasado" | "devolvido" | "spam";
  erro: string | null;
  enviado_em: string | null;
  entregue_em: string | null;
  aberto_em: string | null;
  aberturas: number;
  clicado_em: string | null;
  cliques: number;
  inscreveu_em: string | null;
  assinou_em: string | null;
  descadastrou_em: string | null;
  ultima_atividade_em: string | null;
}
interface Evento {
  id: number;
  criado_em: string;
  tipo: string;
  url: string | null;
  dispositivo: string | null;
  navegador: string | null;
}

const ENTREGA: Record<Envio["status"], { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Na fila", classe: "bg-muted text-muted-foreground" },
  cancelado: {
    rotulo: "Não enviado (cancelado)",
    classe: "bg-muted text-muted-foreground",
  },
  enviando: { rotulo: "Enviando", classe: "bg-amber-500/15 text-amber-800" },
  enviado: { rotulo: "Enviado", classe: "bg-sky-500/10 text-sky-700" },
  entregue: {
    rotulo: "Entregue",
    classe: "bg-emerald-500/10 text-emerald-700",
  },
  atrasado: { rotulo: "Atrasado", classe: "bg-amber-500/15 text-amber-800" },
  falhou: { rotulo: "Não enviado", classe: "bg-red-500/10 text-red-700" },
  devolvido: { rotulo: "Devolvido", classe: "bg-red-500/10 text-red-700" },
  spam: { rotulo: "Marcou como spam", classe: "bg-red-500/10 text-red-700" },
};
const EVENTO: Record<string, string> = {
  abertura: "Abriu o e-mail",
  clique: "Clicou",
  inscricao: "Fez a inscrição na newsletter",
  assinatura: "Confirmou a assinatura",
  descadastro: "Descadastrou",
  entrega: "E-mail entregue",
  atraso: "Entrega atrasada",
  devolucao: "E-mail devolvido",
  spam: "Marcou como spam",
};
const ICONE_DISPOSITIVO: Record<string, typeof Monitor> = {
  Celular: Smartphone,
  Tablet: Tablet,
  Computador: Monitor,
};
const naoRecebeu = (e: Envio) => e.status === "falhou" || e.status === "devolvido";

type Filtro = "todos" | "na_fila" | "abriram" | "nao_abriram" | "clicaram" | "assinaram" | "descadastraram" | "nao_receberam";
const FILTROS: { id: Filtro; rotulo: string; testa: (e: Envio) => boolean }[] = [
  { id: "todos", rotulo: "Todos", testa: () => true },
  {
    id: "na_fila",
    rotulo: "Na fila",
    testa: (e) => e.status === "pendente" || e.status === "enviando",
  },
  { id: "abriram", rotulo: "Abriram", testa: (e) => !!e.aberto_em },
  {
    id: "nao_abriram",
    rotulo: "Não abriram",
    testa: (e) => !e.aberto_em && !naoRecebeu(e) && !!e.enviado_em,
  },
  { id: "clicaram", rotulo: "Clicaram", testa: (e) => !!e.clicado_em },
  {
    id: "assinaram",
    rotulo: "Assinaram",
    testa: (e) => !!e.assinou_em || !!e.inscreveu_em,
  },
  {
    id: "descadastraram",
    rotulo: "Descadastraram",
    testa: (e) => !!e.descadastrou_em,
  },
  {
    id: "nao_receberam",
    rotulo: "Não receberam",
    testa: (e) => naoRecebeu(e) || e.status === "spam",
  },
];

function csv(linhas: (string | number | null | undefined)[][]) {
  return linhas.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
}
function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
function linkLegivel(url: string) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/radar") && u.searchParams.get("assinar") === "1") return "Inscrição no Radar do mercado";
    if (u.pathname === "/radar") return "Radar do mercado (página)";
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

function Indicador({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  cor = "text-primary",
}: {
  icone: typeof Mail;
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  cor?: string;
}) {
  return (
    <div className={`${CARTAO} p-4`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icone className={`h-4 w-4 ${cor}`} />
        {rotulo}
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{valor}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground mt-0.5">{detalhe}</p>}
    </div>
  );
}

function Funil({ etapas }: { etapas: { rotulo: string; n: number }[] }) {
  const topo = Math.max(1, etapas[0]?.n ?? 1);
  return (
    <ul className="space-y-3">
      {etapas.map((e, i) => (
        <li key={e.rotulo}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>{e.rotulo}</span>
            <span className="tabular-nums">
              <strong>{e.n}</strong>
              <span className="text-muted-foreground text-xs ml-1.5">{i ? pct(e.n, topo) : ""}</span>
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-muted mt-1 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${e.n ? Math.max(2, (e.n / topo) * 100) : 0}%`,
                opacity: 1 - i * 0.13,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Aberturas e cliques por hora, das primeiras horas após o envio até agora (máx. 72 h). */
function Atividade({ inicio, pontos }: { inicio: string; pontos: Metricas["por_hora"] }) {
  const horas = useMemo(() => {
    const comeco = new Date(inicio);
    comeco.setMinutes(0, 0, 0);
    const fim = Math.min(Date.now(), comeco.getTime() + 72 * 3600_000);
    const mapa = new Map(pontos.map((p) => [new Date(p.hora).getTime(), p]));
    const lista: { t: number; aberturas: number; cliques: number }[] = [];
    for (let t = comeco.getTime(); t <= fim; t += 3600_000)
      lista.push({
        t,
        aberturas: mapa.get(t)?.aberturas ?? 0,
        cliques: mapa.get(t)?.cliques ?? 0,
      });
    return lista;
  }, [inicio, pontos]);
  const maior = Math.max(1, ...horas.map((h) => h.aberturas + h.cliques));
  if (!pontos.length) return <p className="text-sm text-muted-foreground py-6 text-center">Ainda sem aberturas ou cliques.</p>;
  return (
    <div>
      <div className="flex items-end gap-px h-36">
        {horas.map((h) => (
          <div
            key={h.t}
            className="flex-1 flex flex-col justify-end h-full group"
            title={`${format(new Date(h.t), "dd/MM HH'h'")}: ${h.aberturas} aberturas, ${h.cliques} cliques`}
          >
            <div className="w-full bg-amber-500 rounded-t-sm" style={{ height: `${(h.cliques / maior) * 100}%` }} />
            <div
              className={`w-full bg-primary/80 group-hover:bg-primary ${h.cliques ? "" : "rounded-t-sm"}`}
              style={{ height: `${(h.aberturas / maior) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
        <span>{format(new Date(horas[0].t), "dd/MM HH'h'")}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-primary" /> aberturas
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-amber-500" /> cliques
          </span>
        </span>
        <span>{format(new Date(horas[horas.length - 1].t), "dd/MM HH'h'")}</span>
      </div>
    </div>
  );
}

function Historico({ envio }: { envio: string }) {
  const q = useQuery({
    queryKey: ["radar_campanha_eventos", envio],
    queryFn: async () => {
      const { data, error } = await db
        .from("radar_campanha_eventos")
        .select("id, criado_em, tipo, url, dispositivo, navegador")
        .eq("envio_id", envio)
        .order("criado_em", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Evento[];
    },
  });
  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!q.data?.length) return <p className="text-xs text-muted-foreground">Nenhuma atividade registrada.</p>;
  return (
    <ol className="space-y-1.5">
      {q.data.map((ev) => (
        <li key={ev.id} className="text-xs flex flex-wrap gap-x-2">
          <span className="text-muted-foreground tabular-nums">{dataHora(ev.criado_em)}</span>
          <span className="font-medium">{EVENTO[ev.tipo] ?? ev.tipo}</span>
          {ev.url && <span className="text-muted-foreground truncate max-w-[22rem]">em {linkLegivel(ev.url)}</span>}
          {ev.dispositivo && (
            <span className="text-muted-foreground">
              · {ev.dispositivo}
              {ev.navegador && ev.navegador !== "Outro" ? `, ${ev.navegador}` : ""}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Métricas de uma campanha do Radar: entrega, aberturas, cliques, assinaturas e descadastros. */
export default function RadarCampanha() {
  const { id = "" } = useParams();
  const { userRole } = useAuth();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const permitido = userRole === "admin" || userRole === "superintendente";

  const campanha = useQuery({
    queryKey: ["radar_campanha", id],
    enabled: permitido && !!id,
    queryFn: async () => {
      const { data, error } = await db.from("radar_campanhas").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Campanha | null;
    },
  });
  const metricas = useQuery({
    queryKey: ["radar_campanha_metricas", id],
    enabled: permitido && !!id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("radar_campanha_metricas", {
        _campanha: id,
      });
      if (error) throw error;
      return data as Metricas;
    },
  });
  const envios = useQuery({
    queryKey: ["radar_campanha_envios", id],
    enabled: permitido && !!id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("radar_campanha_envios").select("*").eq("campanha_id", id).order("email").limit(10000);
      if (error) throw error;
      return (data ?? []) as Envio[];
    },
  });

  const contagem = useMemo(() => {
    const c = {} as Record<Filtro, number>;
    FILTROS.forEach((f) => (c[f.id] = (envios.data ?? []).filter(f.testa).length));
    return c;
  }, [envios.data]);
  const lista = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro)!;
    const t = busca.trim().toLowerCase();
    return (envios.data ?? []).filter((e) => f.testa(e) && (!t || [e.email, e.nome, e.associacao].some((x) => (x ?? "").toLowerCase().includes(t))));
  }, [envios.data, filtro, busca]);

  const [limiteNovo, setLimiteNovo] = useState("");
  const controle = useMutation({
    mutationFn: ({ op, limite }: { op: OperacaoCampanha; limite?: number | null }) => controlarCampanha(id, op, limite),
    onSuccess: (r, v) => {
      if (!r.ok) return toast.error(r.erro ?? "Não foi possível concluir");
      if (v.op === "enviar_agora") {
        if (r.enviados)
          toast.success(`${r.enviados} e-mails enviados agora`, {
            description: r.motivo,
          });
        else toast.info(r.motivo ?? "Nada a enviar agora");
      } else toast.success("Campanha atualizada");
      setLimiteNovo("");
      campanha.refetch();
      metricas.refetch();
      envios.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível concluir"),
  });

  if (!permitido) return <Navigate to="/dashboard" replace />;

  const c = campanha.data;
  const m = metricas.data;
  const rastreada = !!m?.rastreada;
  const enviados = rastreada ? m!.enviados : (c?.enviados ?? 0);
  const entregues = m?.entregues ?? 0;
  const temEntrega = entregues + (m?.devolvidos ?? 0) + (m?.spam ?? 0) > 0;
  const baseAbertura = temEntrega ? entregues : enviados;
  const naoReceberam = (m?.falharam ?? 0) + (m?.devolvidos ?? 0);
  const atualizar = () => {
    metricas.refetch();
    envios.refetch();
  };

  const exportar = () => {
    baixar(
      `campanha-${format(parseISO(c?.criado_em ?? new Date().toISOString()), "yyyy-MM-dd")}.csv`,
      csv([
        [
          "E-mail",
          "Nome",
          "Associação",
          "Tipo",
          "Entrega",
          "Erro",
          "Enviado em",
          "Entregue em",
          "Abriu em",
          "Aberturas",
          "Clicou em",
          "Cliques",
          "Inscreveu em",
          "Assinou em",
          "Descadastrou em",
        ],
        ...lista.map((e) => [
          e.email,
          e.nome,
          e.associacao,
          e.tipo === "prospect" ? "Prospect" : "Assinante",
          ENTREGA[e.status]?.rotulo ?? e.status,
          e.erro,
          dataHora(e.enviado_em),
          dataHora(e.entregue_em),
          dataHora(e.aberto_em),
          e.aberturas,
          dataHora(e.clicado_em),
          e.cliques,
          dataHora(e.inscreveu_em),
          dataHora(e.assinou_em),
          dataHora(e.descadastrou_em),
        ]),
      ]),
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full px-4 md:px-6 py-4 md:py-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/radar/gestao?aba=campanhas">
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Voltar às campanhas">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
                <Mail className="h-6 w-6 text-primary shrink-0" />
                <span className="truncate">{c?.assunto ?? "Campanha"}</span>
              </h1>
              <p className="text-sm text-muted-foreground">
                {c ? (
                  <>
                    Enviada em {dataHora(c.criado_em)} ({ha(c.criado_em)}) para{" "}
                    {c.prospects ? `${c.assinantes ?? 0} assinantes + ${c.prospects} prospects` : `${c.destinatarios} assinantes`}
                  </>
                ) : campanha.isLoading ? (
                  "Carregando…"
                ) : (
                  "Campanha não encontrada."
                )}
              </p>
            </div>
          </div>
          <Button variant="outline" className="rounded-full" onClick={atualizar} disabled={metricas.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${metricas.isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>

        {metricas.isLoading || campanha.isLoading ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-3xl" />
            ))}
          </div>
        ) : metricas.isError ? (
          <section className={`${CARTAO} p-5 text-sm text-muted-foreground flex gap-2`}>
            <Info className="h-4 w-4 mt-0.5 shrink-0" />O acompanhamento de campanhas ainda não está ativo no banco de dados. Os números aparecem depois que a
            atualização for aplicada.
          </section>
        ) : (
          <>
            {!rastreada && (
              <section className={`${CARTAO} p-4 text-sm text-muted-foreground flex gap-2`}>
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                Esta campanha foi enviada antes do acompanhamento existir: só há o total de envios. As próximas campanhas mostram aberturas, cliques,
                assinaturas e descadastros de cada pessoa.
              </section>
            )}

            {c && (m?.pendentes ?? 0) > 0 && (c.status === "em_andamento" || c.status === "pausada") && (
              <section className={`${CARTAO} p-5 space-y-3`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-bold flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" /> Fila de envio{" "}
                      {c.status === "pausada" && <span className="text-xs font-semibold text-muted-foreground">(pausada)</span>}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {m!.pendentes} {m!.pendentes === 1 ? "pessoa ainda vai" : "pessoas ainda vão"} receber ·{" "}
                      {c.limite_diario ? `até ${c.limite_diario} por dia` : "sem limite por dia (só a cota da conta)"}
                      {c.limite_diario
                        ? ` · termina em cerca de ${Math.ceil(m!.pendentes! / c.limite_diario)} ${Math.ceil(m!.pendentes! / c.limite_diario) === 1 ? "dia" : "dias"}`
                        : ""}
                      {m!.enviados_hoje ? ` · ${m!.enviados_hoje} saíram hoje` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Sai de hora em hora, das 9h às 18h, sem passar da cota diária da conta no Resend.</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.status === "em_andamento" ? (
                      <>
                        <Button size="sm" className="rounded-full" onClick={() => controle.mutate({ op: "enviar_agora" })} disabled={controle.isPending}>
                          {controle.isPending && controle.variables?.op === "enviar_agora" ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-1.5" />
                          )}
                          Enviar próximo lote agora
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => controle.mutate({ op: "pausar" })}
                          disabled={controle.isPending}
                        >
                          <Pause className="h-4 w-4 mr-1.5" /> Pausar
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" className="rounded-full" onClick={() => controle.mutate({ op: "retomar" })} disabled={controle.isPending}>
                        <Play className="h-4 w-4 mr-1.5" /> Retomar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full text-red-700"
                      disabled={controle.isPending}
                      onClick={() => {
                        if (window.confirm(`Cancelar o envio para as ${m!.pendentes} pessoas que ainda estão na fila? Quem já recebeu não é afetado.`))
                          controle.mutate({ op: "cancelar_fila" });
                      }}
                    >
                      Cancelar fila
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm">Máximo por dia:</span>
                  <Input
                    type="number"
                    min={1}
                    max={5000}
                    value={limiteNovo}
                    onChange={(e) => setLimiteNovo(e.target.value)}
                    placeholder={c.limite_diario ? String(c.limite_diario) : "sem limite"}
                    className="w-28 rounded-full h-8"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={controle.isPending || !limiteNovo}
                    onClick={() =>
                      controle.mutate({
                        op: "limite",
                        limite: Number(limiteNovo) > 0 ? Math.floor(Number(limiteNovo)) : null,
                      })
                    }
                  >
                    Salvar
                  </Button>
                  <div className="flex-1 min-w-[8rem] h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{
                        width: `${(enviados / Math.max(1, m!.destinatarios)) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {enviados} de {m!.destinatarios} enviados
                  </span>
                </div>
              </section>
            )}

            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Indicador
                icone={Users}
                rotulo="Destinatários"
                valor={rastreada ? m!.destinatarios : (c?.destinatarios ?? 0)}
                detalhe={`${enviados} enviados ao provedor${m?.pendentes ? ` · ${m.pendentes} na fila` : ""}`}
              />
              <Indicador
                icone={MailCheck}
                rotulo="Entregues"
                valor={temEntrega ? entregues : "—"}
                detalhe={temEntrega ? `${pct(entregues, enviados)} dos enviados` : "aguardando o retorno do provedor"}
                cor="text-emerald-600"
              />
              <Indicador
                icone={MailOpen}
                rotulo="Abriram"
                valor={rastreada ? m!.abriram : "—"}
                detalhe={rastreada ? `${pct(m!.abriram, baseAbertura)} · ${m!.aberturas} aberturas` : undefined}
              />
              <Indicador
                icone={MousePointerClick}
                rotulo="Clicaram"
                valor={rastreada ? m!.clicaram : "—"}
                detalhe={rastreada ? `${pct(m!.clicaram, baseAbertura)} · ${m!.cliques} cliques · ${pct(m!.clicaram, m!.abriram)} de quem abriu` : undefined}
                cor="text-amber-600"
              />
              <Indicador
                icone={UserPlus}
                rotulo="Assinaram"
                valor={rastreada ? m!.assinaram : "—"}
                detalhe={rastreada ? `${m!.inscreveram} fizeram a inscrição · ${pct(m!.assinaram, enviados)} dos enviados` : undefined}
                cor="text-emerald-600"
              />
              <Indicador
                icone={UserMinus}
                rotulo="Descadastraram"
                valor={rastreada ? m!.descadastraram : "—"}
                detalhe={rastreada ? pct(m!.descadastraram, enviados) : undefined}
                cor="text-muted-foreground"
              />
              <Indicador
                icone={MailX}
                rotulo="Não receberam"
                valor={rastreada ? naoReceberam : (c?.falhas ?? 0)}
                detalhe={rastreada ? `${m!.falharam} não enviados · ${m!.devolvidos} devolvidos` : "falhas no envio"}
                cor="text-red-600"
              />
              <Indicador
                icone={MailX}
                rotulo="Marcaram como spam"
                valor={rastreada ? m!.spam : "—"}
                detalhe={rastreada && m!.atrasados ? `${m!.atrasados} com entrega atrasada` : undefined}
                cor="text-red-600"
              />
            </div>

            {rastreada && (
              <>
                <div className="grid gap-4 lg:grid-cols-3">
                  <section className={`${CARTAO} p-5`}>
                    <h2 className="font-bold mb-4">Funil</h2>
                    <Funil
                      etapas={[
                        { rotulo: "Enviados", n: enviados },
                        ...(temEntrega ? [{ rotulo: "Entregues", n: entregues }] : []),
                        { rotulo: "Abriram", n: m!.abriram },
                        { rotulo: "Clicaram", n: m!.clicaram },
                        { rotulo: "Assinaram", n: m!.assinaram },
                      ]}
                    />
                  </section>
                  <section className={`${CARTAO} p-5 lg:col-span-2`}>
                    <h2 className="font-bold mb-4">Atividade por hora</h2>
                    <Atividade inicio={c?.criado_em ?? new Date().toISOString()} pontos={m!.por_hora} />
                  </section>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <section className={`${CARTAO} p-5 lg:col-span-2`}>
                    <h2 className="font-bold mb-3">Links mais clicados</h2>
                    {!m!.links.length ? (
                      <p className="text-sm text-muted-foreground">Nenhum clique ainda.</p>
                    ) : (
                      <ul className="divide-y divide-border/50">
                        {m!.links.map((l) => (
                          <li key={l.url} className="py-2 flex items-center justify-between gap-3 text-sm">
                            <a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline" title={l.url}>
                              {linkLegivel(l.url)}
                            </a>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              <strong className="text-foreground">{l.cliques}</strong> cliques · {l.pessoas} {l.pessoas === 1 ? "pessoa" : "pessoas"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section className={`${CARTAO} p-5`}>
                    <h2 className="font-bold mb-3">Dispositivos</h2>
                    {!m!.dispositivos.length ? (
                      <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
                    ) : (
                      <ul className="space-y-2.5">
                        {m!.dispositivos.map((d) => {
                          const Icone = ICONE_DISPOSITIVO[d.nome] ?? Monitor;
                          const total = m!.dispositivos.reduce((s, x) => s + x.eventos, 0);
                          return (
                            <li key={d.nome}>
                              <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2">
                                  <Icone className="h-4 w-4 text-muted-foreground" /> {d.nome}
                                </span>
                                <span className="tabular-nums font-semibold">{pct(d.eventos, total)}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{
                                    width: `${(d.eventos / Math.max(1, total)) * 100}%`,
                                  }}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </div>

                <section className={`${CARTAO} p-5 space-y-3`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h2 className="font-bold">Destinatários</h2>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          placeholder="Buscar e-mail, nome ou associação"
                          className="pl-9 rounded-full w-64"
                        />
                      </div>
                      <Button variant="outline" className="rounded-full" onClick={exportar} disabled={!lista.length}>
                        <Download className="h-4 w-4 mr-1.5" /> Exportar
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {FILTROS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFiltro(f.id)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filtro === f.id ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:bg-muted/50"}`}
                      >
                        {f.rotulo} <span className="tabular-nums text-muted-foreground">({contagem[f.id] ?? 0})</span>
                      </button>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                          <th className="py-2 pr-3 font-medium">Destinatário</th>
                          <th className="py-2 pr-3 font-medium">Entrega</th>
                          <th className="py-2 pr-3 font-medium">Abriu</th>
                          <th className="py-2 pr-3 font-medium">Clicou</th>
                          <th className="py-2 pr-3 font-medium">Assinatura</th>
                          <th className="py-2 font-medium">Última atividade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {lista.map((e) => {
                          const exp = aberto === e.id;
                          return (
                            <Fragment key={e.id}>
                              <tr className="hover:bg-muted/30 cursor-pointer align-top" onClick={() => setAberto(exp ? null : e.id)}>
                                <td className="py-2.5 pr-3">
                                  <div className="flex items-start gap-1.5">
                                    {exp ? (
                                      <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                    )}
                                    <div className="min-w-0">
                                      <p className="font-medium truncate">{e.email}</p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {[e.nome, e.associacao].filter(Boolean).join(" · ") || "—"} · {e.tipo === "prospect" ? "Prospect" : "Assinante"}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2.5 pr-3">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${ENTREGA[e.status]?.classe ?? ""}`}
                                    title={e.erro ?? undefined}
                                  >
                                    {ENTREGA[e.status]?.rotulo ?? e.status}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-3 text-xs whitespace-nowrap">
                                  {e.aberto_em ? (
                                    <>
                                      {dataHora(e.aberto_em)}
                                      {e.aberturas > 1 && <span className="text-muted-foreground"> · {e.aberturas}x</span>}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 text-xs whitespace-nowrap">
                                  {e.clicado_em ? (
                                    <>
                                      {dataHora(e.clicado_em)}
                                      {e.cliques > 1 && <span className="text-muted-foreground"> · {e.cliques}x</span>}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 text-xs whitespace-nowrap">
                                  {e.descadastrou_em ? (
                                    <span className="text-red-700">Descadastrou</span>
                                  ) : e.assinou_em ? (
                                    <span className="text-emerald-700 font-medium">Assinou</span>
                                  ) : e.inscreveu_em ? (
                                    <span className="text-amber-700">Inscrição pendente</span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                  {e.ultima_atividade_em ? ha(e.ultima_atividade_em) : "—"}
                                </td>
                              </tr>
                              {exp && (
                                <tr className="bg-muted/20">
                                  <td colSpan={6} className="px-8 py-3">
                                    {e.erro && <p className="text-xs text-red-700 mb-2">Motivo: {e.erro}</p>}
                                    <Historico envio={e.id} />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                        {!lista.length && (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                              Ninguém neste filtro.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Abertura é contada quando o programa de e-mail carrega as imagens: alguns (como o Apple Mail) carregam sozinhos e outros bloqueiam, então
                    use como tendência. Clique, inscrição e descadastro são registrados com precisão.
                  </p>
                </section>
              </>
            )}

            {c && (
              <section className={`${CARTAO} p-5 space-y-2`}>
                <h2 className="font-bold">Conteúdo enviado</h2>
                <p className="text-sm">
                  <span className="text-muted-foreground">Título:</span> {c.titulo}
                </p>
                <p className="text-sm whitespace-pre-line text-muted-foreground">{c.mensagem}</p>
                <p className="text-xs text-muted-foreground">
                  {(c.noticias ?? []).length} {(c.noticias ?? []).length === 1 ? "item do Radar" : "itens do Radar"}
                  {c.botao_texto && c.botao_url ? ` · botão "${c.botao_texto}" → ${linkLegivel(c.botao_url)}` : " · sem botão"}
                </p>
                {c.erro && <p className="text-xs text-red-700">Erro no envio: {c.erro}</p>}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
