import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  GitBranch, Loader2, RefreshCw, CheckCircle, XCircle, Clock, Play, Square,
  Activity, TrendingUp, Timer, AlertTriangle, ExternalLink
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

interface AssociacaoAutomacao {
  id: string;
  nome: string;
  corretora_id: string;
  ativo_cobranca: boolean;
  ativo_eventos: boolean;
  ativo_mgf: boolean;
  tem_credenciais: boolean;
}

interface ExecucaoRecente {
  id: string;
  corretora_id: string;
  corretora_nome?: string;
  modulo: string;
  status: string;
  created_at: string;
  finalizado_at: string | null;
  duracao_segundos: number | null;
  erro: string | null;
  github_run_id: string | null;
  github_run_url: string | null;
  tipo_disparo: string | null;
}

export default function BIAdminGitHub() {
  const [associacoes, setAssociacoes] = useState<AssociacaoAutomacao[]>([]);
  const [execucoes, setExecucoes] = useState<ExecucaoRecente[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [subTab, setSubTab] = useState("automacoes");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: corretoras }, { data: credenciais }] = await Promise.all([
        supabase.from("corretoras").select("id, nome").order("nome"),
        supabase.from("hinova_credenciais").select("id, corretora_id, ativo_cobranca, ativo_eventos, ativo_mgf"),
      ]);

      const credMap = new Map(credenciais?.map(c => [c.corretora_id, c]) || []);

      setAssociacoes(
        (corretoras || []).map(c => {
          const cred = credMap.get(c.id);
          return {
            id: cred?.id || "",
            nome: c.nome,
            corretora_id: c.id,
            ativo_cobranca: cred?.ativo_cobranca ?? false,
            ativo_eventos: cred?.ativo_eventos ?? false,
            ativo_mgf: cred?.ativo_mgf ?? false,
            tem_credenciais: !!cred,
          };
        })
      );

      // Load recent executions from all 3 modules
      const corretoraMap = new Map((corretoras || []).map(c => [c.id, c.nome]));
      const since = subDays(new Date(), 30).toISOString();

      const [{ data: cobExec }, { data: sgaExec }, { data: mgfExec }] = await Promise.all([
        supabase.from("cobranca_automacao_execucoes").select("id, corretora_id, status, created_at, finalizado_at, duracao_segundos, erro, github_run_id, github_run_url, tipo_disparo").gte("created_at", since).order("created_at", { ascending: false }).limit(100),
        supabase.from("sga_automacao_execucoes").select("id, corretora_id, status, created_at, finalizado_at, duracao_segundos, erro, github_run_id, github_run_url, tipo_disparo").gte("created_at", since).order("created_at", { ascending: false }).limit(100),
        supabase.from("mgf_automacao_execucoes").select("id, corretora_id, status, created_at, finalizado_at, duracao_segundos, erro, github_run_id, github_run_url, tipo_disparo").gte("created_at", since).order("created_at", { ascending: false }).limit(100),
      ]);

      const allExec: ExecucaoRecente[] = [
        ...(cobExec || []).map(e => ({ ...e, modulo: "Cobrança", corretora_nome: corretoraMap.get(e.corretora_id) })),
        ...(sgaExec || []).map(e => ({ ...e, modulo: "Eventos", corretora_nome: corretoraMap.get(e.corretora_id) })),
        ...(mgfExec || []).map(e => ({ ...e, modulo: "MGF", corretora_nome: corretoraMap.get(e.corretora_id) })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setExecucoes(allExec);
    } catch (e) {
      console.error("Erro ao carregar dados GitHub:", e);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = async (corretoraId: string, credId: string, field: "ativo_cobranca" | "ativo_eventos" | "ativo_mgf", newValue: boolean) => {
    const key = `${corretoraId}-${field}`;
    setToggling(key);
    try {
      if (!credId) {
        toast.error("Configure as credenciais Hinova primeiro");
        return;
      }
      const { error } = await supabase.from("hinova_credenciais").update({ [field]: newValue }).eq("id", credId);
      if (error) throw error;
      setAssociacoes(prev => prev.map(a => a.corretora_id === corretoraId ? { ...a, [field]: newValue } : a));
      toast.success(`${field.replace("ativo_", "").charAt(0).toUpperCase() + field.replace("ativo_", "").slice(1)} ${newValue ? "ativado" : "desativado"}`);
    } catch {
      toast.error("Erro ao atualizar");
    } finally {
      setToggling(null);
    }
  };

  // Calculate stats
  const totalExecucoes = execucoes.length;
  const execSucesso = execucoes.filter(e => e.status === "sucesso").length;
  const execErro = execucoes.filter(e => e.status === "erro").length;
  const execEmAndamento = execucoes.filter(e => e.status === "executando").length;
  const totalMinutos = execucoes.reduce((sum, e) => sum + (e.duracao_segundos ? Math.ceil(e.duracao_segundos / 60) : 0), 0);
  const taxaSucesso = totalExecucoes > 0 ? Math.round((execSucesso / totalExecucoes) * 100) : 0;

  // Chart data: executions per day (last 30 days)
  const execPorDia = (() => {
    const map = new Map<string, { sucesso: number; erro: number; total: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "dd/MM");
      map.set(d, { sucesso: 0, erro: 0, total: 0 });
    }
    execucoes.forEach(e => {
      const d = format(new Date(e.created_at), "dd/MM");
      const entry = map.get(d);
      if (entry) {
        entry.total++;
        if (e.status === "sucesso") entry.sucesso++;
        if (e.status === "erro") entry.erro++;
      }
    });
    return Array.from(map.entries()).map(([dia, v]) => ({ dia, ...v }));
  })();

  // Minutes per day chart
  const minPorDia = (() => {
    const map = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      map.set(format(subDays(new Date(), i), "dd/MM"), 0);
    }
    execucoes.forEach(e => {
      if (e.duracao_segundos) {
        const d = format(new Date(e.created_at), "dd/MM");
        map.set(d, (map.get(d) || 0) + Math.ceil(e.duracao_segundos / 60));
      }
    });
    return Array.from(map.entries()).map(([dia, minutos]) => ({ dia, minutos }));
  })();

  // Per-module breakdown
  const moduloStats = ["Cobrança", "Eventos", "MGF"].map(m => {
    const modExec = execucoes.filter(e => e.modulo === m);
    return {
      modulo: m,
      total: modExec.length,
      sucesso: modExec.filter(e => e.status === "sucesso").length,
      erro: modExec.filter(e => e.status === "erro").length,
      minutos: modExec.reduce((s, e) => s + (e.duracao_segundos ? Math.ceil(e.duracao_segundos / 60) : 0), 0),
    };
  });

  // Estimated cost (GitHub Actions Linux: $0.008/min)
  const custoEstimado = (totalMinutos * 0.008).toFixed(2);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Activity className="h-4 w-4 text-primary" /></div>
              <div><p className="text-xl font-bold">{totalExecucoes}</p><p className="text-[10px] text-muted-foreground">Execuções (30d)</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle className="h-4 w-4 text-green-600" /></div>
              <div><p className="text-xl font-bold">{taxaSucesso}%</p><p className="text-[10px] text-muted-foreground">Taxa de sucesso</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${execErro > 0 ? "bg-destructive/10" : "bg-muted"}`}>
                <AlertTriangle className={`h-4 w-4 ${execErro > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              </div>
              <div><p className="text-xl font-bold">{execErro}</p><p className="text-[10px] text-muted-foreground">Erros (30d)</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Timer className="h-4 w-4 text-blue-600" /></div>
              <div><p className="text-xl font-bold">{totalMinutos}</p><p className="text-[10px] text-muted-foreground">Minutos usados</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><TrendingUp className="h-4 w-4 text-amber-600" /></div>
              <div><p className="text-xl font-bold">${custoEstimado}</p><p className="text-[10px] text-muted-foreground">Custo estimado</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="automacoes" className="gap-1.5 text-xs"><GitBranch className="h-3.5 w-3.5" />Automações</TabsTrigger>
            <TabsTrigger value="consumo" className="gap-1.5 text-xs"><TrendingUp className="h-3.5 w-3.5" />Consumo</TabsTrigger>
            <TabsTrigger value="historico" className="gap-1.5 text-xs"><Clock className="h-3.5 w-3.5" />Histórico</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />Atualizar
          </Button>
        </div>

        {/* Automações - Toggle controls */}
        <TabsContent value="automacoes" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Controle de Automações por Associação</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Associação</TableHead>
                      <TableHead className="text-center">Credenciais</TableHead>
                      <TableHead className="text-center">Cobrança</TableHead>
                      <TableHead className="text-center">Eventos</TableHead>
                      <TableHead className="text-center">MGF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {associacoes.map(a => (
                      <TableRow key={a.corretora_id}>
                        <TableCell className="font-medium text-sm">{a.nome}</TableCell>
                        <TableCell className="text-center">
                          {a.tem_credenciais ? (
                            <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 border-green-200">Configurado</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Pendente</Badge>
                          )}
                        </TableCell>
                        {(["ativo_cobranca", "ativo_eventos", "ativo_mgf"] as const).map(field => (
                          <TableCell key={field} className="text-center">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="inline-flex items-center">
                                    <Switch
                                      checked={a[field]}
                                      disabled={!a.tem_credenciais || toggling === `${a.corretora_id}-${field}`}
                                      onCheckedChange={(v) => handleToggle(a.corretora_id, a.id, field, v)}
                                    />
                                  </div>
                                </TooltipTrigger>
                                {!a.tem_credenciais && (
                                  <TooltipContent><p className="text-xs">Configure credenciais Hinova primeiro</p></TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Consumo - Charts */}
        <TabsContent value="consumo" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Execuções por Dia (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={execPorDia}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="dia" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <RTooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="sucesso" stackId="a" fill="hsl(var(--chart-2))" name="Sucesso" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="erro" stackId="a" fill="hsl(var(--destructive))" name="Erro" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Minutos Consumidos por Dia</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={minPorDia}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="dia" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <RTooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`${v} min`, "Minutos"]} />
                    <Area type="monotone" dataKey="minutos" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.15)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Module breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Consumo por Módulo (30d)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Módulo</TableHead>
                    <TableHead className="text-center">Total Execuções</TableHead>
                    <TableHead className="text-center">Sucesso</TableHead>
                    <TableHead className="text-center">Erros</TableHead>
                    <TableHead className="text-center">Minutos</TableHead>
                    <TableHead className="text-right">Custo Est.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moduloStats.map(m => (
                    <TableRow key={m.modulo}>
                      <TableCell className="font-medium text-sm">{m.modulo}</TableCell>
                      <TableCell className="text-center">{m.total}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700">{m.sucesso}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {m.erro > 0 ? (
                          <Badge variant="destructive" className="text-[10px]">{m.erro}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm">{m.minutos} min</TableCell>
                      <TableCell className="text-right text-sm font-medium">${(m.minutos * 0.008).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted/30">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-center">{totalExecucoes}</TableCell>
                    <TableCell className="text-center">{execSucesso}</TableCell>
                    <TableCell className="text-center">{execErro}</TableCell>
                    <TableCell className="text-center">{totalMinutos} min</TableCell>
                    <TableCell className="text-right">${custoEstimado}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Histórico de execuções */}
        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Associação</TableHead>
                      <TableHead>Módulo</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Duração</TableHead>
                      <TableHead className="text-center">Tipo</TableHead>
                      <TableHead className="text-right">GitHub</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {execucoes.slice(0, 200).map(e => (
                      <TableRow key={`${e.modulo}-${e.id}`}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(e.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-sm font-medium truncate max-w-[180px]" title={e.corretora_nome}>
                          {e.corretora_nome || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{e.modulo}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {e.status === "sucesso" ? (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger><CheckCircle className="h-4 w-4 text-green-500 mx-auto" /></TooltipTrigger>
                                <TooltipContent><p className="text-xs">Sucesso</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : e.status === "erro" ? (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger><XCircle className="h-4 w-4 text-destructive mx-auto cursor-help" /></TooltipTrigger>
                                <TooltipContent className="max-w-xs"><p className="text-xs">{e.erro || "Erro desconhecido"}</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : e.status === "executando" ? (
                            <Loader2 className="h-4 w-4 text-blue-500 animate-spin mx-auto" />
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">{e.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {e.duracao_segundos ? `${Math.ceil(e.duracao_segundos / 60)}min` : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={e.tipo_disparo === "manual" ? "default" : "secondary"} className="text-[10px]">
                            {e.tipo_disparo === "manual" ? "Manual" : e.tipo_disparo === "agendado" ? "Agendado" : e.tipo_disparo || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {e.github_run_url ? (
                            <a href={e.github_run_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              <ExternalLink className="h-3 w-3" />
                              #{e.github_run_id?.slice(-6)}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
