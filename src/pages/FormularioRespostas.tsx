import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Download,
  Inbox,
  CalendarDays,
  Activity,
  Hash,
  Search,
  ChevronLeft,
  ChevronRight,
  MessageSquareText,
  Archive,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

/* Barra de opção estilo Google Forms: rótulo, barra de progresso, contagem e % */
const OptionBar = ({ name, value, total, isTop }: { name: string; value: number; total: number; isTop: boolean }) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className={`truncate ${isTop ? "font-semibold" : ""}`}>{name}</span>
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
          {value} · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isTop ? "bg-primary" : "bg-primary/40"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default function FormularioRespostas() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [respIdx, setRespIdx] = useState(0);
  const [buscaTabela, setBuscaTabela] = useState("");

  const { data: form } = useQuery({
    queryKey: ["formulario", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formularios")
        .select("*, formulario_perguntas(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: respostas } = useQuery({
    queryKey: ["formulario_respostas", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formulario_respostas")
        .select("*")
        .eq("formulario_id", id!)
        .order("enviado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const perguntas = useMemo(() => {
    const arr = form?.formulario_perguntas || [];
    return [...arr].sort((a: any, b: any) => a.ordem - b.ordem);
  }, [form]);

  const perguntaIds = useMemo(() => new Set(perguntas.map((p: any) => p.id)), [perguntas]);

  /* Respostas órfãs: valores cujo id de pergunta não existe mais (pergunta editada/recriada).
     Exibimos em vez de esconder, para nunca "sumir" com dados preenchidos. */
  const orphanEntries = (r: any): [string, any][] =>
    Object.entries(r?.dados || {}).filter(([k]) => !perguntaIds.has(k));

  const temOrfas = useMemo(
    () => (respostas || []).some((r: any) => orphanEntries(r).length > 0),
    [respostas, perguntaIds],
  );

  const fmtValor = (v: any) => (Array.isArray(v) ? v.join(", ") : (v ?? ""));

  const exportarXLSX = () => {
    if (!respostas || !perguntas) return;
    const linhas = respostas.map((r: any) => {
      const linha: Record<string, any> = {
        "Enviado em": new Date(r.enviado_em).toLocaleString("pt-BR"),
        IP: r.ip || "",
      };
      perguntas.forEach((p: any) => {
        linha[p.enunciado] = fmtValor(r.dados?.[p.id]);
      });
      const orfas = orphanEntries(r);
      if (orfas.length > 0) {
        linha["Respostas de perguntas removidas"] = orfas.map(([, v]) => fmtValor(v)).join(" · ");
      }
      return linha;
    });
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Respostas");
    XLSX.writeFile(wb, `${form?.titulo || "respostas"}.xlsx`);
  };

  const resumo = useMemo(() => {
    if (!respostas || !perguntas) return [];
    return perguntas
      .filter((p: any) => ["radio", "checkbox", "dropdown"].includes(p.tipo))
      .map((p: any) => {
        const contagem: Record<string, number> = {};
        (p.opcoes || []).forEach((o: string) => (contagem[o] = 0));
        let respondidas = 0;
        respostas.forEach((r: any) => {
          const v = r.dados?.[p.id];
          if (Array.isArray(v)) {
            if (v.length > 0) respondidas++;
            v.forEach((x) => (contagem[x] = (contagem[x] || 0) + 1));
          } else if (v) {
            respondidas++;
            contagem[v] = (contagem[v] || 0) + 1;
          }
        });
        const dados = Object.entries(contagem)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);
        return { pergunta: p.enunciado, tipo: p.tipo, respondidas, dados };
      });
  }, [respostas, perguntas]);

  /* Últimas respostas de perguntas de texto (padrão Google Forms) */
  const resumoTexto = useMemo(() => {
    if (!respostas || !perguntas) return [];
    return perguntas
      .filter((p: any) => ["texto_curto", "texto_longo"].includes(p.tipo))
      .map((p: any) => {
        const valores = respostas
          .map((r: any) => r.dados?.[p.id])
          .filter((v: any) => v != null && String(v).trim() !== "")
          .slice(0, 5);
        return { pergunta: p.enunciado, valores, total: valores.length };
      })
      .filter((t) => t.total > 0);
  }, [respostas, perguntas]);

  const total = respostas?.length || 0;
  const resp = respostas?.[respIdx];
  const ultimaResposta = respostas?.[0]?.enviado_em ? new Date(respostas[0].enviado_em).toLocaleString("pt-BR") : "—";
  const respostasHoje = (respostas || []).filter((r: any) => {
    const d = new Date(r.enviado_em);
    const h = new Date();
    return d.toDateString() === h.toDateString();
  }).length;
  const respostas7d = (respostas || []).filter((r: any) => {
    const d = new Date(r.enviado_em).getTime();
    return Date.now() - d <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  const kpis = [
    { label: "Total de respostas", value: total, icon: Inbox, color: "text-primary bg-primary/10" },
    { label: "Hoje", value: respostasHoje, icon: Activity, color: "text-emerald-600 bg-emerald-500/10" },
    { label: "Últimos 7 dias", value: respostas7d, icon: CalendarDays, color: "text-blue-600 bg-blue-500/10" },
    { label: "Perguntas", value: perguntas.length, icon: Hash, color: "text-amber-600 bg-amber-500/10" },
  ];

  /* Filtro de busca na tabela: procura em todas as colunas (incluindo data e órfãs) */
  const respostasFiltradas = useMemo(() => {
    const lista = respostas || [];
    if (!buscaTabela.trim()) return lista;
    const q = buscaTabela.toLowerCase();
    return lista.filter((r: any) => {
      const data = new Date(r.enviado_em).toLocaleString("pt-BR").toLowerCase();
      if (data.includes(q)) return true;
      return Object.values(r.dados || {}).some((v: any) =>
        (Array.isArray(v) ? v.join(", ") : String(v ?? "")).toLowerCase().includes(q),
      );
    });
  }, [respostas, buscaTabela]);

  return (
    <div className="container mx-auto p-6 space-y-8 max-w-7xl">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/formularios")} className="rounded-xl">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-3xl font-bold tracking-tight truncate">{form?.titulo}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Última resposta: <span className="font-medium text-foreground">{ultimaResposta}</span>
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={exportarXLSX} disabled={total === 0} className="rounded-xl">
          <Download className="h-4 w-4 mr-1" /> Exportar XLSX
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="rounded-2xl bg-muted/40 backdrop-blur border-border/50">
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${k.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{k.label}</p>
                  <p className="text-2xl font-bold tabular-nums leading-tight">{k.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue={resumo.length > 0 ? "resumo" : "individual"} className="space-y-6">
        <TabsList className="h-12 p-1.5 bg-muted/60 rounded-2xl gap-1 text-muted-foreground">
          <TabsTrigger
            value="resumo"
            className="rounded-xl px-6 h-9 font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            Resumo
          </TabsTrigger>
          <TabsTrigger
            value="individual"
            className="rounded-xl px-6 h-9 font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            Individual
          </TabsTrigger>
          <TabsTrigger
            value="tabela"
            className="rounded-xl px-6 h-9 font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            Tabela
          </TabsTrigger>
        </TabsList>

        {/* ================= RESUMO ================= */}
        <TabsContent value="resumo" className="space-y-4">
          {total === 0 && (
            <Card className="rounded-2xl bg-muted/40">
              <CardContent className="p-8 text-center text-muted-foreground">Nenhuma resposta ainda</CardContent>
            </Card>
          )}
          {total > 0 && resumo.length === 0 && resumoTexto.length === 0 && (
            <Card className="rounded-2xl bg-muted/40">
              <CardContent className="p-8 text-center text-muted-foreground text-sm space-y-1">
                <p>Este formulário não possui perguntas de escolha (radio/checkbox/dropdown).</p>
                <p>
                  Use as abas <strong>Individual</strong> ou <strong>Tabela</strong> para ver as {total} resposta
                  {total === 1 ? "" : "s"}.
                </p>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {resumo.map((r, i) => (
              <Card key={i} className="rounded-2xl bg-muted/40 backdrop-blur">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm leading-snug">{r.pergunta}</h3>
                    <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">
                      {r.respondidas}/{total}
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {r.dados.map((d, j) => (
                      <OptionBar
                        key={d.name}
                        name={d.name}
                        value={d.value}
                        total={total}
                        isTop={j === 0 && d.value > 0}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {/* Perguntas de texto: últimas respostas (padrão Google Forms) */}
            {resumoTexto.map((t, i) => (
              <Card key={`txt-${i}`} className="rounded-2xl bg-muted/40 backdrop-blur">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm leading-snug flex items-center gap-2">
                      <MessageSquareText className="h-4 w-4 text-primary shrink-0" />
                      {t.pergunta}
                    </h3>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      texto
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {t.valores.map((v: any, j: number) => (
                      <p
                        key={j}
                        className="text-sm bg-background/60 border border-border/50 rounded-lg px-3 py-2 truncate"
                      >
                        {fmtValor(v)}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ================= INDIVIDUAL ================= */}
        <TabsContent value="individual">
          {total === 0 ? (
            <p className="text-muted-foreground">Nenhuma resposta ainda</p>
          ) : (
            <Card className="rounded-2xl bg-muted/40">
              <CardContent className="p-6 space-y-5">
                {/* Navegação */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                      {respIdx + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        Resposta {respIdx + 1} de {total}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {resp && new Date(resp.enviado_em).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => setRespIdx((i) => Math.max(0, i - 1))}
                      disabled={respIdx === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline ml-1">Anterior</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => setRespIdx((i) => Math.min(total - 1, i + 1))}
                      disabled={respIdx >= total - 1}
                    >
                      <span className="hidden sm:inline mr-1">Próxima</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {/* Barra de progresso da navegação */}
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${((respIdx + 1) / total) * 100}%` }}
                  />
                </div>
                {/* Perguntas e respostas em cartões */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {perguntas.map((p: any) => {
                    const v = resp?.dados?.[p.id];
                    const vazio = v == null || (Array.isArray(v) && v.length === 0) || v === "";
                    return (
                      <div
                        key={p.id}
                        className="rounded-xl border border-border/50 bg-background/60 px-4 py-3 space-y-1"
                      >
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-snug">
                          {p.enunciado}
                        </p>
                        <p className={`text-sm ${vazio ? "text-muted-foreground/50 italic" : "font-medium"}`}>
                          {vazio ? "Sem resposta" : fmtValor(v)}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {/* Respostas órfãs (perguntas removidas/recriadas) — exibidas, nunca escondidas */}
                {resp && orphanEntries(resp).length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <p className="text-xs font-medium text-amber-600 flex items-center gap-1.5">
                      <Archive className="h-3.5 w-3.5" />
                      Respostas de perguntas que foram removidas ou editadas
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {orphanEntries(resp).map(([k, v]) => (
                        <div
                          key={k}
                          className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1"
                        >
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                            Pergunta removida
                          </p>
                          <p className="text-sm font-medium">{fmtValor(v)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ================= TABELA ================= */}
        <TabsContent value="tabela" className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar nas respostas..."
              value={buscaTabela}
              onChange={(e) => setBuscaTabela(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
          <Card className="rounded-2xl bg-muted/40 overflow-hidden">
            <div className="overflow-x-auto max-h-[65vh]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Enviado em</TableHead>
                    {perguntas.map((p: any) => (
                      <TableHead key={p.id} className="whitespace-nowrap">
                        {p.enunciado}
                      </TableHead>
                    ))}
                    {temOrfas && (
                      <TableHead className="whitespace-nowrap text-amber-600">Perguntas removidas</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {respostasFiltradas.map((r: any, idx: number) => (
                    <TableRow key={r.id} className={idx % 2 === 1 ? "bg-muted/30" : ""}>
                      <TableCell className="text-xs whitespace-nowrap font-medium">
                        {new Date(r.enviado_em).toLocaleString("pt-BR")}
                      </TableCell>
                      {perguntas.map((p: any) => {
                        const v = r.dados?.[p.id];
                        const texto = fmtValor(v);
                        return (
                          <TableCell key={p.id} className="text-xs max-w-[220px] truncate" title={texto}>
                            {texto}
                          </TableCell>
                        );
                      })}
                      {temOrfas && (
                        <TableCell
                          className="text-xs max-w-[260px] truncate text-muted-foreground"
                          title={orphanEntries(r)
                            .map(([, v]) => fmtValor(v))
                            .join(" · ")}
                        >
                          {orphanEntries(r)
                            .map(([, v]) => fmtValor(v))
                            .join(" · ")}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {respostasFiltradas.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={perguntas.length + (temOrfas ? 2 : 1)}
                        className="text-center text-sm text-muted-foreground py-8"
                      >
                        {buscaTabela ? "Nenhuma resposta corresponde à busca" : "Nenhuma resposta ainda"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
