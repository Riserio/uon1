import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft, Download, Eye, Loader2, Mail, MapPin, Monitor, Search, Send, Smartphone, Tablet, UserCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { enviarCampanha } from "@/lib/radar/newsletter";
import { urlPublica } from "@/lib/trust";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const CARTAO = "rounded-3xl border border-border/40 bg-card shadow-sm";
const ha = (iso: string) => formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR });
const telefoneBR = (t?: string | null) => {
  const d = (t ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t ?? "";
};

interface Resumo {
  visitas: number;
  visitantes: number;
  assinantes_visitaram: number;
  hoje: number;
  por_dia: { dia: string; visitas: number; visitantes: number }[];
  cidades: { nome: string; visitas: number }[];
  origens: { nome: string; visitas: number }[];
  dispositivos: { nome: string; visitas: number }[];
}
interface Assinante {
  id: string;
  email: string;
  nome: string | null;
  associacao: string | null;
  telefone: string | null;
  status: "pendente" | "ativo" | "cancelado";
  criado_em: string;
  confirmado_em: string | null;
  cancelado_em: string | null;
  ultimo_envio_em: string | null;
  aceite_em: string | null;
}
interface Visita {
  id: number;
  criado_em: string;
  visitante: string;
  pagina: string;
  origem: string | null;
  cidade: string | null;
  uf: string | null;
  pais: string | null;
  dispositivo: string | null;
  navegador: string | null;
  assinante_id: string | null;
}

const STATUS: Record<Assinante["status"], { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Ativo", classe: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  pendente: { rotulo: "Aguardando confirmação", classe: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  cancelado: { rotulo: "Cancelado", classe: "bg-muted text-muted-foreground" },
};
const ICONE_DISPOSITIVO: Record<string, typeof Monitor> = { Celular: Smartphone, Tablet: Tablet, Computador: Monitor };

function Barras({ itens, cor = "bg-primary" }: { itens: { nome: string; visitas: number }[]; cor?: string }) {
  const maior = Math.max(1, ...itens.map((i) => i.visitas));
  if (!itens.length) return <p className="text-sm text-muted-foreground py-2">Sem visitas no período.</p>;
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.nome}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{i.nome}</span>
            <span className="tabular-nums font-semibold shrink-0">{i.visitas}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
            <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(3, (i.visitas / maior) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function csv(linhas: (string | null | undefined)[][]) {
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

/** Gestão do Radar público: visitas, assinantes da newsletter e campanhas. Administrador e superintendente. */
export default function RadarGestao() {
  const { userRole } = useAuth();
  const [dias, setDias] = useState("30");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | Assinante["status"]>("ativo");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const qc = useQueryClient();

  const resumo = useQuery({
    queryKey: ["radar_gestao_resumo", dias],
    queryFn: async () => {
      const { data, error } = await db.rpc("radar_visitas_resumo", { _dias: Number(dias) });
      if (error) throw error;
      return data as Resumo;
    },
  });
  const assinantes = useQuery({
    queryKey: ["radar_gestao_assinantes"],
    queryFn: async () => {
      const { data, error } = await db
        .from("radar_assinantes")
        .select("id, email, nome, associacao, telefone, status, criado_em, confirmado_em, cancelado_em, ultimo_envio_em, aceite_em")
        .order("criado_em", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Assinante[];
    },
  });
  const visitas = useQuery({
    queryKey: ["radar_gestao_visitas"],
    queryFn: async () => {
      const { data, error } = await db
        .from("radar_visitas")
        .select("id, criado_em, visitante, pagina, origem, cidade, uf, pais, dispositivo, navegador, assinante_id")
        .order("criado_em", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Visita[];
    },
  });
  const campanhas = useQuery({
    queryKey: ["radar_gestao_campanhas"],
    queryFn: async () => {
      const { data, error } = await db.from("radar_campanhas").select("*").order("criado_em", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        assunto: string;
        status: string;
        criado_em: string;
        destinatarios: number;
        enviados: number;
        falhas: number;
        erro: string | null;
      }[];
    },
  });

  const porId = useMemo(() => new Map((assinantes.data ?? []).map((a) => [a.id, a])), [assinantes.data]);
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (assinantes.data ?? []).filter(
      (a) =>
        (filtroStatus === "todos" || a.status === filtroStatus) &&
        (!t || [a.nome, a.email, a.associacao, a.telefone].some((x) => (x ?? "").toLowerCase().includes(t))),
    );
  }, [assinantes.data, busca, filtroStatus]);
  const contagem = useMemo(() => {
    const c = { ativo: 0, pendente: 0, cancelado: 0 };
    (assinantes.data ?? []).forEach((a) => c[a.status]++);
    return c;
  }, [assinantes.data]);

  if (userRole !== "admin" && userRole !== "superintendente") return <Navigate to="/dashboard" replace />;

  const r = resumo.data;
  const maiorDia = Math.max(1, ...(r?.por_dia ?? []).map((d) => d.visitas));
  const linkPublico = `${urlPublica().replace(/\/$/, "")}/radar`;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full px-4 md:px-6 py-4 md:py-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Voltar ao painel">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Radar do mercado: público</h1>
              <p className="text-sm text-muted-foreground truncate">
                Visitas da página pública, assinantes da newsletter e campanhas.{" "}
                <a href={linkPublico} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Abrir a página
                </a>
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="visitas" className="space-y-4">
          <TabsList className="rounded-full">
            <TabsTrigger value="visitas" className="rounded-full">
              <Eye className="h-4 w-4 mr-1.5" /> Visitas
            </TabsTrigger>
            <TabsTrigger value="assinantes" className="rounded-full">
              <Users className="h-4 w-4 mr-1.5" /> Assinantes {assinantes.data ? `(${contagem.ativo})` : ""}
            </TabsTrigger>
            <TabsTrigger value="campanhas" className="rounded-full">
              <Send className="h-4 w-4 mr-1.5" /> Campanhas
            </TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------ Visitas */}
          <TabsContent value="visitas" className="space-y-4">
            <div className="flex items-center justify-end">
              <Select value={dias} onValueChange={setDias}>
                <SelectTrigger className="w-[170px] rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {resumo.isLoading || !r ? (
              <Skeleton className="h-72 rounded-3xl" />
            ) : (
              <>
                <section className={`${CARTAO} overflow-hidden`}>
                  <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border/50">
                    {[
                      { v: r.visitas, rotulo: "visitas no período" },
                      { v: r.visitantes, rotulo: "pessoas diferentes" },
                      { v: r.hoje, rotulo: "visitas hoje" },
                      { v: r.assinantes_visitaram, rotulo: "assinantes que voltaram pelo e-mail" },
                    ].map((x) => (
                      <div key={x.rotulo} className="px-5 py-4">
                        <p className="text-3xl font-bold tabular-nums">{x.v}</p>
                        <p className="text-xs text-muted-foreground mt-1">{x.rotulo}</p>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 pb-5 pt-2">
                    <div className="flex items-end gap-1 h-40" role="img" aria-label="Visitas por dia">
                      {r.por_dia.map((d) => (
                        <div key={d.dia} className="group flex-1 h-full flex flex-col justify-end items-center" title={`${format(parseISO(d.dia), "dd/MM")}: ${d.visitas} visitas, ${d.visitantes} pessoas`}>
                          <div className="w-full rounded-t-md bg-primary/80 group-hover:bg-primary transition-colors" style={{ height: `${d.visitas ? Math.max(4, (d.visitas / maiorDia) * 100) : 1}%` }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
                      <span>{r.por_dia[0] && format(parseISO(r.por_dia[0].dia), "dd/MM")}</span>
                      <span>hoje</span>
                    </div>
                  </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-3">
                  <section className={`${CARTAO} p-5`}>
                    <h2 className="font-bold mb-3 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" /> Cidades
                    </h2>
                    <Barras itens={r.cidades} />
                  </section>
                  <section className={`${CARTAO} p-5`}>
                    <h2 className="font-bold mb-3">De onde vieram</h2>
                    <Barras itens={r.origens} cor="bg-accent-brand" />
                  </section>
                  <section className={`${CARTAO} p-5`}>
                    <h2 className="font-bold mb-3">Dispositivos</h2>
                    <Barras itens={r.dispositivos} cor="bg-emerald-500" />
                  </section>
                </div>
              </>
            )}

            <section className={`${CARTAO} overflow-hidden`}>
              <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-bold">Visitas recentes</h2>
                  <p className="text-xs text-muted-foreground">Quem não é assinante aparece pelo local e dispositivo. Assinante que chega pelo e-mail aparece com o nome.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={!visitas.data?.length}
                  onClick={() =>
                    baixar(
                      `radar-visitas-${format(new Date(), "yyyy-MM-dd")}.csv`,
                      csv([
                        ["Data", "Quem", "Associação", "Cidade", "UF", "País", "Origem", "Dispositivo", "Navegador"],
                        ...(visitas.data ?? []).map((v) => {
                          const a = v.assinante_id ? porId.get(v.assinante_id) : null;
                          return [format(parseISO(v.criado_em), "dd/MM/yyyy HH:mm"), a?.nome ?? a?.email ?? "Visitante", a?.associacao, v.cidade, v.uf, v.pais, v.origem ?? "Direto", v.dispositivo, v.navegador];
                        }),
                      ]),
                    )
                  }
                >
                  <Download className="h-4 w-4 mr-1.5" /> Exportar
                </Button>
              </div>
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-5 py-2">Quando</th>
                      <th className="text-left font-medium px-3 py-2">Quem</th>
                      <th className="text-left font-medium px-3 py-2">Local</th>
                      <th className="text-left font-medium px-3 py-2">Origem</th>
                      <th className="text-left font-medium px-3 py-2">Dispositivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitas.isLoading ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin inline" />
                        </td>
                      </tr>
                    ) : !visitas.data?.length ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">
                          Nenhuma visita registrada ainda. As visitas passam a contar depois que a página nova for publicada.
                        </td>
                      </tr>
                    ) : (
                      visitas.data.map((v) => {
                        const a = v.assinante_id ? porId.get(v.assinante_id) : null;
                        const Icone = ICONE_DISPOSITIVO[v.dispositivo ?? ""] ?? Monitor;
                        return (
                          <tr key={v.id} className="border-t border-border/40">
                            <td className="px-5 py-2.5 whitespace-nowrap">
                              <span className="block">{format(parseISO(v.criado_em), "dd/MM HH:mm")}</span>
                              <span className="block text-[11px] text-muted-foreground">{ha(v.criado_em)}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              {a ? (
                                <span className="flex items-center gap-1.5">
                                  <UserCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                  <span className="min-w-0">
                                    <span className="block font-medium truncate">{a.nome ?? a.email}</span>
                                    {a.associacao && <span className="block text-[11px] text-muted-foreground truncate">{a.associacao}</span>}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Visitante</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">{[v.cidade, v.uf].filter(Boolean).join(" - ") || v.pais || "Não identificado"}</td>
                            <td className="px-3 py-2.5">{v.origem ?? "Direto"}</td>
                            <td className="px-3 py-2.5">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Icone className="h-3.5 w-3.5" /> {v.dispositivo}
                                {v.navegador ? `, ${v.navegador}` : ""}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </TabsContent>

          {/* ------------------------------------------------ Assinantes */}
          <TabsContent value="assinantes" className="space-y-4">
            <section className={`${CARTAO} overflow-hidden`}>
              <div className="px-5 py-4 flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail, associação ou telefone" className="pl-9 rounded-full" />
                </div>
                <div className="flex gap-1">
                  {(
                    [
                      ["ativo", `Ativos (${contagem.ativo})`],
                      ["pendente", `Aguardando (${contagem.pendente})`],
                      ["cancelado", `Cancelados (${contagem.cancelado})`],
                      ["todos", "Todos"],
                    ] as const
                  ).map(([id, rot]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFiltroStatus(id)}
                      aria-pressed={filtroStatus === id}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filtroStatus === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      {rot}
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={!lista.length}
                  onClick={() =>
                    baixar(
                      `radar-assinantes-${format(new Date(), "yyyy-MM-dd")}.csv`,
                      csv([
                        ["Nome", "Associação", "E-mail", "Telefone", "Situação", "Inscrição", "Confirmação", "Último envio", "Aceite de comunicações"],
                        ...lista.map((a) => [
                          a.nome,
                          a.associacao,
                          a.email,
                          telefoneBR(a.telefone),
                          STATUS[a.status].rotulo,
                          format(parseISO(a.criado_em), "dd/MM/yyyy HH:mm"),
                          a.confirmado_em ? format(parseISO(a.confirmado_em), "dd/MM/yyyy HH:mm") : "",
                          a.ultimo_envio_em ? format(parseISO(a.ultimo_envio_em), "dd/MM/yyyy HH:mm") : "",
                          a.aceite_em ? format(parseISO(a.aceite_em), "dd/MM/yyyy HH:mm") : "",
                        ]),
                      ]),
                    )
                  }
                >
                  <Download className="h-4 w-4 mr-1.5" /> Exportar
                </Button>
              </div>
              {selecionados.length > 0 && (
                <div className="mx-5 mb-3 rounded-2xl bg-primary/10 px-4 py-2 text-sm flex items-center justify-between gap-2">
                  <span>
                    {selecionados.length} {selecionados.length === 1 ? "assinante selecionado" : "assinantes selecionados"} para a próxima campanha.
                  </span>
                  <button type="button" className="text-xs underline" onClick={() => setSelecionados([])}>
                    Limpar
                  </button>
                </div>
              )}
              <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur text-xs text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2 w-10" aria-label="Selecionar" />
                      <th className="text-left font-medium px-3 py-2">Nome</th>
                      <th className="text-left font-medium px-3 py-2">Associação</th>
                      <th className="text-left font-medium px-3 py-2">Contato</th>
                      <th className="text-left font-medium px-3 py-2">Situação</th>
                      <th className="text-left font-medium px-3 py-2">Inscrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assinantes.isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-center">
                          <Loader2 className="h-4 w-4 animate-spin inline" />
                        </td>
                      </tr>
                    ) : !lista.length ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">
                          Ninguém neste filtro.
                        </td>
                      </tr>
                    ) : (
                      lista.map((a) => (
                        <tr key={a.id} className="border-t border-border/40">
                          <td className="px-5 py-2.5">
                            {a.status === "ativo" && (
                              <Checkbox
                                checked={selecionados.includes(a.id)}
                                onCheckedChange={(v) => setSelecionados((s) => (v === true ? [...s, a.id] : s.filter((x) => x !== a.id)))}
                                aria-label={`Selecionar ${a.nome ?? a.email}`}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-medium">{a.nome ?? <span className="text-muted-foreground font-normal">Sem nome</span>}</td>
                          <td className="px-3 py-2.5">{a.associacao ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-2.5">
                            <a href={`mailto:${a.email}`} className="block text-primary hover:underline">
                              {a.email}
                            </a>
                            {a.telefone && (
                              <a href={`https://wa.me/55${a.telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="block text-xs text-muted-foreground hover:text-foreground">
                                {telefoneBR(a.telefone)}
                              </a>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[a.status].classe}`}>{STATUS[a.status].rotulo}</span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{format(parseISO(a.criado_em), "dd/MM/yyyy")}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </TabsContent>

          {/* ------------------------------------------------ Campanhas */}
          <TabsContent value="campanhas" className="space-y-4">
            <NovaCampanha
              ativos={contagem.ativo}
              selecionados={selecionados}
              onLimparSelecao={() => setSelecionados([])}
              onEnviada={() => {
                qc.invalidateQueries({ queryKey: ["radar_gestao_campanhas"] });
                qc.invalidateQueries({ queryKey: ["radar_gestao_assinantes"] });
              }}
            />
            <section className={`${CARTAO} p-5`}>
              <h2 className="font-bold mb-3">Campanhas enviadas</h2>
              {!campanhas.data?.length ? (
                <p className="text-sm text-muted-foreground">Nenhuma campanha enviada ainda.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {campanhas.data.map((c) => (
                    <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.assunto}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(c.criado_em), "dd/MM/yyyy 'às' HH:mm")}, {c.enviados} de {c.destinatarios} entregues ao provedor
                          {c.falhas ? `, ${c.falhas} com falha` : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          c.status === "enviada" ? STATUS.ativo.classe : c.status === "falhou" ? "bg-red-500/10 text-red-700" : STATUS.pendente.classe
                        }`}
                        title={c.erro ?? undefined}
                      >
                        {c.status === "enviada" ? "Enviada" : c.status === "falhou" ? "Falhou" : "Enviando"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function NovaCampanha({ ativos, selecionados, onLimparSelecao, onEnviada }: { ativos: number; selecionados: string[]; onLimparSelecao: () => void; onEnviada: () => void }) {
  const [assunto, setAssunto] = useState("");
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [botaoTexto, setBotaoTexto] = useState("");
  const [botaoUrl, setBotaoUrl] = useState("");
  const [noticias, setNoticias] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState(false);

  const recentes = useQuery({
    queryKey: ["radar_gestao_noticias_recentes"],
    queryFn: async () => {
      const { data } = await db
        .from("mercado_noticias")
        .select("id, titulo, origem, publicado_em")
        .eq("oculto", false)
        .order("publicado_em", { ascending: false })
        .limit(20);
      return (data ?? []) as { id: string; titulo: string; origem: string | null; publicado_em: string }[];
    },
  });

  const dados = (teste: boolean) => ({
    teste,
    assunto,
    titulo,
    mensagem,
    noticia_ids: noticias,
    botao_texto: botaoTexto.trim() || null,
    botao_url: botaoUrl.trim() || null,
    assinante_ids: selecionados.length ? selecionados : null,
  });
  const envio = useMutation({
    mutationFn: (teste: boolean) => enviarCampanha(dados(teste)),
    onSuccess: (r) => {
      setConfirmando(false);
      if (!r.ok) return toast.error(r.erro ?? "Não foi possível enviar");
      if (r.teste) return toast.success(`Teste enviado para ${r.email}`);
      toast.success(`Campanha enviada para ${r.enviados} ${r.enviados === 1 ? "assinante" : "assinantes"}${r.falhas ? ` (${r.falhas} com falha)` : ""}`);
      setAssunto("");
      setTitulo("");
      setMensagem("");
      setBotaoTexto("");
      setBotaoUrl("");
      setNoticias([]);
      onLimparSelecao();
      onEnviada();
    },
    onError: (e) => {
      setConfirmando(false);
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar");
    },
  });

  const valido = assunto.trim().length >= 3 && titulo.trim().length >= 3 && mensagem.trim().length >= 10 && (!botaoTexto.trim() || /^https?:\/\//.test(botaoUrl.trim()));
  const alvo = selecionados.length || ativos;

  return (
    <section className={`${CARTAO} p-5 space-y-4`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Nova campanha
          </h2>
          <p className="text-xs text-muted-foreground">
            Vai para {selecionados.length ? `${selecionados.length} assinantes selecionados` : `todos os ${ativos} assinantes ativos`}, com o link de cancelar a inscrição no rodapé.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-assunto">Assunto do e-mail</Label>
            <Input id="c-assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={150} placeholder="Ex.: Vangard na Fenaprove 2026" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-titulo">Título</Label>
            <Input id="c-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={150} placeholder="Título que aparece no topo do e-mail" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-msg">Mensagem</Label>
            <Textarea id="c-msg" value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={5000} rows={8} placeholder="Escreva o texto. Linha em branco separa os parágrafos." />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-btn">Botão (opcional)</Label>
              <Input id="c-btn" value={botaoTexto} onChange={(e) => setBotaoTexto(e.target.value)} maxLength={40} placeholder="Ex.: Inscreva-se" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-url">Link do botão</Label>
              <Input id="c-url" value={botaoUrl} onChange={(e) => setBotaoUrl(e.target.value)} maxLength={500} placeholder="https://" />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Incluir notícias do Radar (opcional, até 10)</Label>
          <div className="rounded-2xl border border-border/60 max-h-[420px] overflow-y-auto divide-y divide-border/40">
            {recentes.isLoading ? (
              <div className="p-4 text-center">
                <Loader2 className="h-4 w-4 animate-spin inline" />
              </div>
            ) : (
              (recentes.data ?? []).map((n) => {
                const marcada = noticias.includes(n.id);
                return (
                  <label key={n.id} className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 ${marcada ? "bg-primary/5" : ""}`}>
                    <Checkbox
                      checked={marcada}
                      disabled={!marcada && noticias.length >= 10}
                      onCheckedChange={(v) => setNoticias((s) => (v === true ? [...s, n.id] : s.filter((x) => x !== n.id)))}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-snug line-clamp-2">{n.titulo}</span>
                      <span className="block text-xs text-muted-foreground">
                        {n.origem}, {format(parseISO(n.publicado_em), "dd/MM/yyyy")}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap border-t pt-4">
        <Button variant="outline" className="rounded-full" disabled={!valido || envio.isPending} onClick={() => envio.mutate(true)}>
          {envio.isPending && envio.variables === true ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
          Enviar teste para mim
        </Button>
        {!confirmando ? (
          <Button className="rounded-full" disabled={!valido || !alvo || envio.isPending} onClick={() => setConfirmando(true)}>
            <Send className="h-4 w-4 mr-1.5" /> Enviar para {alvo} {alvo === 1 ? "assinante" : "assinantes"}
          </Button>
        ) : (
          <div className="flex items-center gap-2 rounded-full bg-amber-500/15 pl-4 pr-1 py-1">
            <span className="text-sm">Confirmar o envio para {alvo}?</span>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setConfirmando(false)} disabled={envio.isPending}>
              Voltar
            </Button>
            <Button size="sm" className="rounded-full" onClick={() => envio.mutate(false)} disabled={envio.isPending}>
              {envio.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null} Enviar agora
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
