import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import BISyncButton from "./BISyncButton";
import BIAdminAnalytics from "./BIAdminAnalytics";

interface AssociacaoStatus {
  id: string;
  nome: string;
  slug: string | null;
  cobranca_status: string | null;
  cobranca_ultima: string | null;
  cobranca_erro: string | null;
  eventos_status: string | null;
  eventos_ultima: string | null;
  eventos_erro: string | null;
  mgf_status: string | null;
  mgf_ultima: string | null;
  mgf_erro: string | null;
  tem_credenciais: boolean;
  ativo_cobranca: boolean;
  ativo_eventos: boolean;
  ativo_mgf: boolean;
  total_usuarios: number;
  usuarios_ativos: number;
}

interface PortalUser {
  id: string;
  email: string;
  ativo: boolean;
  corretora_id: string;
}

type Efetivo = "sucesso" | "erro" | "executando" | "parado" | "nunca";

const STALE_EXEC_MS = 15 * 60 * 1000;

function efetivo(status: string | null, ultima: string | null): Efetivo {
  if (status === "executando") {
    const t = ultima ? new Date(ultima).getTime() : 0;
    return t && Date.now() - t > STALE_EXEC_MS ? "parado" : "executando";
  }
  if (status === "sucesso") return "sucesso";
  if (status === "erro" || status === "parado") return "erro";
  return "nunca";
}

const META: Record<Efetivo, { label: string; text: string; dot?: string; spin?: boolean }> = {
  sucesso: { label: "OK", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  erro: { label: "Erro", text: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  executando: { label: "Sincronizando", text: "text-blue-600 dark:text-blue-400", spin: true },
  parado: { label: "Parado", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  nunca: { label: "—", text: "text-muted-foreground", dot: "bg-muted-foreground/40" },
};

/** Status compacto de um módulo (ponto colorido + rótulo, tooltip com detalhe) */
function StatusModulo({ status, ultima, erro, ativo }: { status: string | null; ultima: string | null; erro: string | null; ativo: boolean }) {
  if (!ativo) return <span title="Módulo não ativado" className="text-xs text-muted-foreground/50">—</span>;
  const eff = efetivo(status, ultima);
  const m = META[eff];
  const pill = (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${m.text}`}>
      {m.spin ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className={`h-2 w-2 rounded-full ${m.dot}`} />}
      {m.label}
    </span>
  );
  const rel = ultima ? formatDistanceToNow(new Date(ultima), { locale: ptBR, addSuffix: true }) : null;
  const tip = eff === "erro" ? erro : eff === "parado" ? "Execução não finalizou. Sincronize novamente." : null;
  if (!tip && !rel) return pill;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild><span className="cursor-help">{pill}</span></TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {tip && <p className={eff === "erro" ? "text-destructive" : "text-amber-600"}>{tip}</p>}
          {rel && <p className="text-muted-foreground mt-0.5">{rel}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Detecta erro de login/credenciais nas mensagens de erro dos módulos */
const LOGIN_ERROR_RE = /login|credenc|senha|autentic|acesso negado|unauthorized/i;
function loginErrorInfo(a: AssociacaoStatus): { modulo: string; mensagem: string }[] {
  const out: { modulo: string; mensagem: string }[] = [];
  if (a.ativo_cobranca && efetivo(a.cobranca_status, a.cobranca_ultima) === "erro" && a.cobranca_erro && LOGIN_ERROR_RE.test(a.cobranca_erro)) out.push({ modulo: "Cobrança", mensagem: a.cobranca_erro });
  if (a.ativo_eventos && efetivo(a.eventos_status, a.eventos_ultima) === "erro" && a.eventos_erro && LOGIN_ERROR_RE.test(a.eventos_erro)) out.push({ modulo: "Eventos", mensagem: a.eventos_erro });
  if (a.ativo_mgf && efetivo(a.mgf_status, a.mgf_ultima) === "erro" && a.mgf_erro && LOGIN_ERROR_RE.test(a.mgf_erro)) out.push({ modulo: "MGF", mensagem: a.mgf_erro });
  return out;
}

/** Saúde geral da associação (pior status entre os módulos ativos) */
function saude(a: AssociacaoStatus): "ok" | "erro" | "sincronizando" | "neutro" {
  const mods: Efetivo[] = [];
  if (a.ativo_cobranca) mods.push(efetivo(a.cobranca_status, a.cobranca_ultima));
  if (a.ativo_eventos) mods.push(efetivo(a.eventos_status, a.eventos_ultima));
  if (a.ativo_mgf) mods.push(efetivo(a.mgf_status, a.mgf_ultima));
  if (mods.includes("executando")) return "sincronizando";
  if (mods.some((m) => m === "erro" || m === "parado")) return "erro";
  if (mods.includes("sucesso")) return "ok";
  return "neutro";
}

// ── KPI widget ──
function Kpi({ icon, valor, label, cor }: { icon: React.ReactNode; valor: React.ReactNode; label: string; cor: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${cor}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none">{valor}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}

// ── Card widget de associação ──
function AssociacaoCard({ a }: { a: AssociacaoStatus }) {
  const s = saude(a);
  const errosLogin = loginErrorInfo(a);
  const temErroLogin = errosLogin.length > 0;
  const pontoCor =
    s === "erro" ? "bg-red-500" : s === "sincronizando" ? "bg-blue-500 animate-pulse" : s === "ok" ? "bg-emerald-500" : "bg-muted-foreground/30";

  return (
    <div className={`rounded-2xl border p-4 hover:shadow-md transition-all ${
      temErroLogin
        ? "border-red-500/60 bg-red-500/5 ring-1 ring-red-500/30"
        : "border-border/50 bg-card hover:border-primary/20"
    }`}>
      {temErroLogin && (
        <div className="flex items-center gap-1.5 mb-2 -mt-1">
          <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-red-600">
            Erro de login · {errosLogin.map((e) => e.modulo).join(", ")}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 rounded-full shrink-0 ${pontoCor}`} />
          <h3 className="font-semibold text-sm truncate">{a.nome}</h3>
        </div>
        {a.tem_credenciais ? (
          <span title="Credenciais configuradas" className="text-emerald-500 shrink-0"><ShieldCheck className="h-4 w-4" /></span>
        ) : (
          <span title="Sem credenciais" className="text-muted-foreground/50 shrink-0"><XCircle className="h-4 w-4" /></span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {[
          { label: "Cobrança", status: a.cobranca_status, ultima: a.cobranca_ultima, erro: a.cobranca_erro, ativo: a.ativo_cobranca },
          { label: "Eventos", status: a.eventos_status, ultima: a.eventos_ultima, erro: a.eventos_erro, ativo: a.ativo_eventos },
          { label: "MGF", status: a.mgf_status, ultima: a.mgf_ultima, erro: a.mgf_erro, ativo: a.ativo_mgf },
        ].map((mod) => (
          <div key={mod.label} className="rounded-lg bg-muted/30 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{mod.label}</p>
            <StatusModulo status={mod.status} ultima={mod.ultima} erro={mod.erro} ativo={mod.ativo} />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {a.total_usuarios > 0 ? `${a.usuarios_ativos}/${a.total_usuarios}` : "—"}
        </span>
        <BISyncButton corretoraId={a.id} corretoraNome={a.nome} />
      </div>
    </div>
  );
}

type Filtro = "todas" | "erro" | "sincronizando";

export default function BIAdminDashboard() {
  const [associacoes, setAssociacoes] = useState<AssociacaoStatus[]>([]);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [syncingAll, setSyncingAll] = useState(false);

  const STALE_TIMEOUT_MS = 10 * 60 * 1000;

  const resolveStaleStatuses = async (corretoraIds: string[]) => {
    if (!corretoraIds.length) return;
    const tables = [
      { exec: "cobranca_automacao_execucoes", config: "cobranca_automacao_config" },
      { exec: "sga_automacao_execucoes", config: "sga_automacao_config" },
      { exec: "mgf_automacao_execucoes", config: "mgf_automacao_config" },
    ] as const;
    const now = Date.now();
    await Promise.all(
      tables.map(async ({ exec, config }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: stale } = (await (supabase as any)
          .from(exec)
          .select("id, corretora_id, created_at")
          .eq("status", "executando")
          .in("corretora_id", corretoraIds)) as any;
        for (const row of stale || []) {
          if (now - new Date(row.created_at).getTime() > STALE_TIMEOUT_MS) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from(exec).update({ status: "erro", erro: "Timeout: execução não respondeu no tempo esperado", finalizado_at: new Date().toISOString() }).eq("id", row.id);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from(config).update({ ultimo_status: "erro", ultimo_erro: "Timeout: execução não respondeu" }).eq("corretora_id", row.corretora_id);
          }
        }
      }),
    );
    // Cura configs presas em "executando" cuja última execução é antiga
    await Promise.all(
      tables.map(async ({ config }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: stuck } = (await (supabase as any)
          .from(config)
          .select("corretora_id, ultima_execucao")
          .eq("ultimo_status", "executando")
          .in("corretora_id", corretoraIds)) as any;
        for (const row of stuck || []) {
          const tt = row.ultima_execucao ? new Date(row.ultima_execucao).getTime() : 0;
          if (!tt || now - tt > STALE_TIMEOUT_MS) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from(config).update({ ultimo_status: "erro", ultimo_erro: "Execução não finalizou (status preso)" }).eq("corretora_id", row.corretora_id).eq("ultimo_status", "executando");
          }
        }
      }),
    );
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: corretoras } = await supabase.from("corretoras").select("id, nome, slug").order("nome");
      if (!corretoras) return;

      await resolveStaleStatuses(corretoras.map((c) => c.id));

      const { data: credenciais } = await supabase
        .from("hinova_credenciais")
        .select("corretora_id, ativo_cobranca, ativo_eventos, ativo_mgf");

      const [cobConfigs, sgaConfigs, mgfConfigs] = await Promise.all([
        supabase.from("cobranca_automacao_config").select("corretora_id, ultimo_status, ultima_execucao, ultimo_erro"),
        supabase.from("sga_automacao_config").select("corretora_id, ultimo_status, ultima_execucao, ultimo_erro"),
        supabase.from("mgf_automacao_config").select("corretora_id, ultimo_status, ultima_execucao, ultimo_erro"),
      ]);

      const { data: usuarios } = await supabase
        .from("corretora_usuarios")
        .select("id, email, ativo, corretora_id");

      const credMap = new Map(credenciais?.map((c) => [c.corretora_id, c]) || []);
      const cobMap = new Map(cobConfigs.data?.map((c) => [c.corretora_id, c]) || []);
      const sgaMap = new Map(sgaConfigs.data?.map((c) => [c.corretora_id, c]) || []);
      const mgfMap = new Map(mgfConfigs.data?.map((c) => [c.corretora_id, c]) || []);

      const userCountMap = new Map<string, { total: number; ativos: number }>();
      usuarios?.forEach((u) => {
        const cur = userCountMap.get(u.corretora_id) || { total: 0, ativos: 0 };
        cur.total++;
        if (u.ativo) cur.ativos++;
        userCountMap.set(u.corretora_id, cur);
      });

      setAssociacoes(
        corretoras.map((c) => {
          const cred = credMap.get(c.id);
          const cob = cobMap.get(c.id);
          const sga = sgaMap.get(c.id);
          const mgf = mgfMap.get(c.id);
          const users = userCountMap.get(c.id) || { total: 0, ativos: 0 };
          return {
            id: c.id, nome: c.nome, slug: c.slug,
            cobranca_status: cob?.ultimo_status || null, cobranca_ultima: cob?.ultima_execucao || null, cobranca_erro: cob?.ultimo_erro || null,
            eventos_status: sga?.ultimo_status || null, eventos_ultima: sga?.ultima_execucao || null, eventos_erro: sga?.ultimo_erro || null,
            mgf_status: mgf?.ultimo_status || null, mgf_ultima: mgf?.ultima_execucao || null, mgf_erro: mgf?.ultimo_erro || null,
            tem_credenciais: !!cred, ativo_cobranca: cred?.ativo_cobranca || false, ativo_eventos: cred?.ativo_eventos || false, ativo_mgf: cred?.ativo_mgf || false,
            total_usuarios: users.total, usuarios_ativos: users.ativos,
          };
        }),
      );
      setPortalUsers((usuarios || []).map((u) => ({ id: u.id, email: u.email, ativo: u.ativo, corretora_id: u.corretora_id })));
    } catch (e) {
      console.error("Erro ao carregar dados admin:", e);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sincronizarTodas = async () => {
    setSyncingAll(true);
    try {
      const schedulers = ["scheduler-cobranca-hinova", "scheduler-sga-hinova", "scheduler-mgf-hinova"];
      const results = await Promise.allSettled(schedulers.map((fn) => supabase.functions.invoke(fn, { body: { force: true } })));
      let disparados = 0;
      let erros = 0;
      results.forEach((r) => {
        if (r.status === "fulfilled" && r.value.data) {
          disparados += r.value.data.disparados || 0;
          erros += r.value.data.erros || 0;
        } else erros++;
      });
      if (disparados > 0) toast.success(`${disparados} sincronizações iniciadas!`);
      else if (erros > 0) toast.error(`${erros} erros ao disparar sincronizações`);
      else toast.info("Nenhuma associação pendente para sincronizar");
      setTimeout(loadData, 3000);
    } catch (e) {
      toast.error("Erro ao sincronizar: " + (e instanceof Error ? e.message : "desconhecido"));
    } finally {
      setSyncingAll(false);
    }
  };

  const totalComErro = associacoes.filter((a) => saude(a) === "erro").length;
  const totalAtivos = associacoes.filter((a) => a.tem_credenciais).length;

  const { totalUsuarios, usuariosAtivos } = useMemo(() => {
    const porEmail = new Map<string, boolean>();
    portalUsers.forEach((u) => porEmail.set(u.email, (porEmail.get(u.email) || false) || u.ativo));
    return { totalUsuarios: porEmail.size, usuariosAtivos: [...porEmail.values()].filter(Boolean).length };
  }, [portalUsers]);

  const filtradas = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    return associacoes.filter((a) => {
      if (termo && !a.nome.toLowerCase().includes(termo)) return false;
      if (filtro === "erro") return saude(a) === "erro";
      if (filtro === "sincronizando") return saude(a) === "sincronizando";
      return true;
    });
  }, [associacoes, searchTerm, filtro]);

  const sincronizandoCount = associacoes.filter((a) => saude(a) === "sincronizando").length;

  // Spinner de tela cheia apenas no PRIMEIRO carregamento;
  // no "Atualizar", o conteúdo permanece visível com leve esmaecimento.
  if (loading && associacoes.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtros: { id: Filtro; label: string; count: number }[] = [
    { id: "todas", label: "Todas", count: associacoes.length },
    { id: "erro", label: "Com erro", count: totalComErro },
    { id: "sincronizando", label: "Sincronizando", count: sincronizandoCount },
  ];

  const associacoesComErroLogin = associacoes.filter((a) => loginErrorInfo(a).length > 0);

  return (
    <div className={`space-y-5 transition-opacity duration-300 ${loading ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
      {/* Alerta de erros de login — destaque vermelho */}
      {associacoesComErroLogin.length > 0 && (
        <div className="rounded-2xl border border-red-500/50 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-8 w-8 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </span>
            <div>
              <p className="text-sm font-semibold text-red-600">
                Erro de login em {associacoesComErroLogin.length} associaç{associacoesComErroLogin.length === 1 ? "ão" : "ões"}
              </p>
              <p className="text-xs text-muted-foreground">Verifique as credenciais Hinova destas associações</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {associacoesComErroLogin.map((a) => {
              const erros = loginErrorInfo(a);
              return (
                <TooltipProvider key={a.id} delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 cursor-help">
                        <XCircle className="h-3 w-3" />
                        {a.nome}
                        <span className="opacity-70">· {erros.map((e) => e.modulo).join(", ")}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm text-xs">
                      {erros.map((e, i) => (
                        <p key={i}><span className="font-semibold">{e.modulo}:</span> {e.mensagem.slice(0, 180)}</p>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      )}
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Building2 className="h-5 w-5 text-primary" />} valor={associacoes.length} label="Associações" cor="bg-primary/10" />
        <Kpi icon={<Zap className="h-5 w-5 text-emerald-600" />} valor={totalAtivos} label="Com automação" cor="bg-emerald-500/10" />
        <Kpi
          icon={<AlertTriangle className={`h-5 w-5 ${totalComErro > 0 ? "text-red-600" : "text-muted-foreground"}`} />}
          valor={totalComErro}
          label="Com erros"
          cor={totalComErro > 0 ? "bg-red-500/10" : "bg-muted"}
        />
        <Kpi icon={<Users className="h-5 w-5 text-blue-600" />} valor={`${usuariosAtivos}/${totalUsuarios}`} label="Usuários Portal" cor="bg-blue-500/10" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar associação..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9 rounded-xl" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1.5 rounded-xl">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" className="gap-1.5 rounded-xl" disabled={syncingAll} onClick={sincronizarTodas}>
            {syncingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
            Sincronizar Todas
          </Button>
        </div>
      </div>

      <Tabs defaultValue="visao-geral">
        <TabsList className="rounded-xl">
          <TabsTrigger value="visao-geral" className="gap-1.5 rounded-lg"><Activity className="h-3.5 w-3.5" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5 rounded-lg"><BarChart3 className="h-3.5 w-3.5" /> Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-4 space-y-4">
          {/* Filtros rápidos */}
          <div className="flex items-center gap-2">
            {filtros.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filtro === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}>
                {f.label}
                <span className={`rounded-full px-1.5 ${filtro === f.id ? "bg-white/20" : "bg-background"}`}>{f.count}</span>
              </button>
            ))}
          </div>

          {filtradas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 py-16 text-center">
              <CheckCircle className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma associação {filtro === "erro" ? "com erro" : filtro === "sincronizando" ? "sincronizando" : "encontrada"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtradas.map((a) => (
                <AssociacaoCard key={a.id} a={a} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <BIAdminAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
