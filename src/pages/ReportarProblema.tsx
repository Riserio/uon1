import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bug, CheckCircle2, AlertTriangle, RefreshCw, Plus, Loader2, ShieldCheck, Wifi, Database, ServerCog, Cpu, Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ReportDialog, coletarDiagnostico } from "@/components/report/ReportDialog";
import { RelatoDetailDialog } from "@/components/report/RelatoDetailDialog";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BugReport {
  id: string;
  titulo: string;
  descricao: string;
  categoria: string;
  severidade: string;
  status: string;
  url: string | null;
  created_at: string;
  updated_at: string;
  diagnostico: any;
  anexos: any;
  previsao_entrega: string | null;
  arquivado: boolean;
  resolvido_em: string | null;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  aberto:       { label: "Aberto",        className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  em_analise:   { label: "Em análise",    className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  em_correcao: { label: "Em correção",   className: "bg-purple-500/15 text-purple-600 border-purple-500/30" },
  resolvido:    { label: "Resolvido",     className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  fechado:      { label: "Fechado",       className: "bg-muted text-muted-foreground border-border" },
  duplicado:    { label: "Duplicado",     className: "bg-muted text-muted-foreground border-border" },
};

const SEV_STYLES: Record<string, string> = {
  baixa:   "bg-slate-500/15 text-slate-600 border-slate-500/30",
  media:   "bg-blue-500/15 text-blue-600 border-blue-500/30",
  alta:    "bg-orange-500/15 text-orange-600 border-orange-500/30",
  critica: "bg-red-500/15 text-red-600 border-red-500/30",
};

type Check = { nome: string; ok: boolean | null; detalhe?: string; icon: any };

export default function ReportarProblema() {
  const { user } = useAuth();
  const [openDialog, setOpenDialog] = useState(false);
  const [relatos, setRelatos] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<Check[]>([]);
  const [rodandoDiag, setRodandoDiag] = useState(false);
  const [selecionado, setSelecionado] = useState<BugReport | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);
  const diagnostico = useMemo(() => coletarDiagnostico(), []);

  const carregarRelatos = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("bug_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (!error) setRelatos((data || []) as BugReport[]);
    setLoading(false);
  };

  useEffect(() => { carregarRelatos(); /* eslint-disable-next-line */ }, [user?.id]);

  const rodarDiagnostico = async () => {
    setRodandoDiag(true);
    const results: Check[] = [];
    // 1. Online
    results.push({ nome: "Conexão de rede", ok: navigator.onLine, detalhe: (navigator as any).connection?.effectiveType || "n/a", icon: Wifi });
    // 2. Supabase (banco)
    try {
      const t0 = performance.now();
      const { error } = await supabase.from("app_config").select("id", { count: "exact", head: true }).limit(1);
      const ms = Math.round(performance.now() - t0);
      results.push({ nome: "Banco de dados", ok: !error, detalhe: error ? error.message : `latência ${ms} ms`, icon: Database });
    } catch (e: any) {
      results.push({ nome: "Banco de dados", ok: false, detalhe: e?.message, icon: Database });
    }
    // 3. Sessão
    try {
      const { data } = await supabase.auth.getSession();
      results.push({ nome: "Sessão de autenticação", ok: !!data.session, detalhe: data.session ? "sessão ativa" : "não autenticado", icon: ShieldCheck });
    } catch {
      results.push({ nome: "Sessão de autenticação", ok: false, icon: ShieldCheck });
    }
    // 4. Storage
    try {
      const { error } = await supabase.storage.from("bug-reports").list("", { limit: 1 });
      results.push({ nome: "Armazenamento de arquivos", ok: !error, detalhe: error?.message, icon: ServerCog });
    } catch (e: any) {
      results.push({ nome: "Armazenamento de arquivos", ok: false, detalhe: e?.message, icon: ServerCog });
    }
    // 5. Memória JS
    const mem = (performance as any).memory;
    if (mem) {
      const uso = Math.round(mem.usedJSHeapSize / 1048576);
      const limite = Math.round(mem.jsHeapSizeLimit / 1048576);
      results.push({ nome: "Memória do navegador", ok: uso / limite < 0.85, detalhe: `${uso} MB / ${limite} MB`, icon: Cpu });
    }
    // 6. Viewport
    results.push({ nome: "Renderização", ok: window.innerWidth > 320, detalhe: `${window.innerWidth}×${window.innerHeight}`, icon: Monitor });
    setChecks(results);
    setRodandoDiag(false);
  };

  useEffect(() => { rodarDiagnostico(); }, []);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { total: relatos.length, aberto: 0, em_analise: 0, em_correcao: 0, resolvido: 0 };
    relatos.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [relatos]);

  const relatosFiltrados = useMemo(
    () => relatos.filter(r => (verArquivados ? r.arquivado : !r.arquivado)),
    [relatos, verArquivados]
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Bug className="h-7 w-7 text-orange-500" />
              Reportar problema
            </h1>
            <p className="text-muted-foreground">
              Central de suporte técnico. Reporte bugs, acompanhe o status dos seus relatos e execute um autodiagnóstico do sistema.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={carregarRelatos} className="gap-2">
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Atualizar
            </Button>
            <Button onClick={() => setOpenDialog(true)} className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="h-4 w-4" /> Novo relato
            </Button>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          {[
            { k: "total",       l: "Total",         c: "text-foreground" },
            { k: "aberto",      l: "Abertos",       c: "text-blue-600" },
            { k: "em_analise",  l: "Em análise",    c: "text-amber-600" },
            { k: "em_correcao", l: "Em correção",   c: "text-purple-600" },
            { k: "resolvido",   l: "Resolvidos",    c: "text-emerald-600" },
          ].map(x => (
            <Card key={x.k} className="rounded-2xl bg-muted/40 backdrop-blur">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{x.l}</p>
                <p className={`text-2xl font-bold ${x.c}`}>{contagem[x.k] || 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="relatos" className="space-y-4">
          <TabsList className="rounded-full bg-muted/40 backdrop-blur">
            <TabsTrigger value="relatos" className="rounded-full">Meus relatos</TabsTrigger>
            <TabsTrigger value="status" className="rounded-full">Status do sistema</TabsTrigger>
            <TabsTrigger value="diagnostico" className="rounded-full">Autodiagnóstico</TabsTrigger>
          </TabsList>

          {/* Relatos */}
          <TabsContent value="relatos" className="space-y-3">
            <div className="flex items-center justify-end">
              <Button variant="ghost" size="sm" onClick={() => setVerArquivados(v => !v)} className="text-xs">
                {verArquivados ? "Ver ativos" : `Ver arquivados (${relatos.filter(r => r.arquivado).length})`}
              </Button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : relatosFiltrados.length === 0 ? (
              <Card className="rounded-2xl bg-muted/40 backdrop-blur">
                <CardContent className="p-10 text-center space-y-3">
                  <Bug className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">{verArquivados ? "Nenhum relato arquivado." : "Nenhum relato ativo."}</p>
                  <Button onClick={() => setOpenDialog(true)} className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
                    <Plus className="h-4 w-4" /> Criar meu primeiro relato
                  </Button>
                </CardContent>
              </Card>
            ) : (
              relatosFiltrados.map(r => {
                const st = STATUS_STYLES[r.status] || STATUS_STYLES.aberto;
                return (
                  <Card
                    key={r.id}
                    onClick={() => setSelecionado(r)}
                    className="rounded-2xl bg-muted/40 backdrop-blur cursor-pointer hover:bg-muted/60 transition-colors"
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold truncate">{r.titulo}</span>
                            <Badge variant="outline" className={SEV_STYLES[r.severidade] || ""}>{r.severidade}</Badge>
                            <Badge variant="outline" className="capitalize">{r.categoria.replace("_", " ")}</Badge>
                            {r.arquivado && <Badge variant="outline" className="bg-muted">Arquivado</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">{r.descricao}</p>
                          <p className="text-xs text-muted-foreground">
                            Enviado {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                            {r.previsao_entrega && <> · Previsão: {new Date(r.previsao_entrega + "T00:00:00").toLocaleDateString("pt-BR")}</>}
                            {r.url && <> · <span className="truncate">{r.url}</span></>}
                          </p>
                        </div>
                        <Badge variant="outline" className={st.className}>{st.label}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Status */}
          <TabsContent value="status" className="space-y-3">
            <Card className="rounded-2xl bg-muted/40 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Status das funcionalidades</span>
                  <Button size="sm" variant="outline" onClick={rodarDiagnostico} disabled={rodandoDiag} className="gap-2">
                    <RefreshCw className={rodandoDiag ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Rodar novamente
                  </Button>
                </CardTitle>
                <CardDescription>Verificação em tempo real dos serviços críticos.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {checks.map((c, i) => {
                  const Icon = c.icon;
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 p-3 bg-background/60">
                      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.nome}</p>
                        {c.detalhe && <p className="text-xs text-muted-foreground truncate">{c.detalhe}</p>}
                      </div>
                      {c.ok === true
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        : c.ok === false
                          ? <AlertTriangle className="h-5 w-5 text-red-500" />
                          : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="rounded-2xl bg-muted/40 backdrop-blur">
              <CardHeader>
                <CardTitle>Informações importantes</CardTitle>
                <CardDescription>Boas práticas para acelerar o reparo do problema reportado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>• Descreva os passos para reproduzir o problema, o resultado esperado e o observado.</p>
                <p>• Anexe evidências (prints, vídeos ou logs). Cada relato aceita múltiplos arquivos.</p>
                <p>• Ao reportar, um diagnóstico automático do seu dispositivo é enviado junto — você não precisa preencher nada técnico.</p>
                <p>• Você pode acompanhar o status do relato nesta página. Status possíveis: Aberto, Em análise, Em correção, Resolvido.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Diagnóstico */}
          <TabsContent value="diagnostico">
            <Card className="rounded-2xl bg-muted/40 backdrop-blur">
              <CardHeader>
                <CardTitle>Autodiagnóstico do dispositivo</CardTitle>
                <CardDescription>Informações técnicas coletadas do seu navegador. Estes dados acompanham cada relato enviado.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 md:grid-cols-2 text-sm">
                  {Object.entries(diagnostico).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-3 rounded-lg bg-background/60 border border-border/50 px-3 py-2">
                      <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                      <span className="font-mono text-xs text-right break-all max-w-[60%]">
                        {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "-")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ReportDialog open={openDialog} onOpenChange={(v) => { setOpenDialog(v); if (!v) carregarRelatos(); }} />
      <RelatoDetailDialog
        relato={selecionado}
        open={!!selecionado}
        onOpenChange={(v) => !v && setSelecionado(null)}
        onSaved={() => { carregarRelatos(); setSelecionado(null); }}
      />
    </div>
  );
}