import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Building2, Users, Shield, ShieldOff, Loader2,
  CheckCircle, XCircle, Clock, AlertTriangle, Search,
  RefreshCw, Activity, Zap, BarChart3
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
  totp_configurado: boolean;
  corretora_id: string;
  corretora_nome?: string;
  modulos_bi: string[] | null;
  created_at: string;
  ultimo_acesso: string | null;
}

interface GroupedUser {
  email: string;
  associacoes: { id: string; corretora_id: string; corretora_nome: string; ativo: boolean; totp_configurado: boolean; modulos_bi: string[] | null; ultimo_acesso: string | null }[];
  ultimo_acesso_geral: string | null;
  created_at: string;
}

function StatusCell({ status, ultima, erro }: { status: string | null; ultima: string | null; erro: string | null; ativo: boolean }) {
  const icon = status === "sucesso" ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> :
    status === "erro" ? <XCircle className="h-3.5 w-3.5 text-destructive" /> :
    status === "executando" ? <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" /> :
    <Clock className="h-3.5 w-3.5 text-muted-foreground" />;

  const content = (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        {icon}
      </div>
      {ultima && (
        <span className="text-[10px] text-muted-foreground">
          {format(new Date(ultima), "dd/MM HH:mm", { locale: ptBR })}
        </span>
      )}
    </div>
  );

  if (status === "erro" && erro) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">{content}</div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            <p className="font-semibold text-destructive mb-1">Erro:</p>
            <p>{erro}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

export default function BIAdminDashboard() {
  const [associacoes, setAssociacoes] = useState<AssociacaoStatus[]>([]);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [togglingUser, setTogglingUser] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: corretoras } = await supabase
        .from("corretoras")
        .select("id, nome, slug")
        .order("nome");

      if (!corretoras) return;

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
        .select("id, email, ativo, totp_configurado, corretora_id, modulos_bi, created_at, ultimo_acesso");

      const credMap = new Map(credenciais?.map(c => [c.corretora_id, c]) || []);
      const cobMap = new Map(cobConfigs.data?.map(c => [c.corretora_id, c]) || []);
      const sgaMap = new Map(sgaConfigs.data?.map(c => [c.corretora_id, c]) || []);
      const mgfMap = new Map(mgfConfigs.data?.map(c => [c.corretora_id, c]) || []);

      const userCountMap = new Map<string, { total: number; ativos: number }>();
      usuarios?.forEach(u => {
        const current = userCountMap.get(u.corretora_id) || { total: 0, ativos: 0 };
        current.total++;
        if (u.ativo) current.ativos++;
        userCountMap.set(u.corretora_id, current);
      });

      const result: AssociacaoStatus[] = corretoras.map(c => {
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
      });

      setAssociacoes(result);

      const corretoraMap = new Map(corretoras.map(c => [c.id, c.nome]));
      setPortalUsers(
        (usuarios || []).map(u => ({
          ...u,
          corretora_nome: corretoraMap.get(u.corretora_id) || "N/A",
        }))
      );
    } catch (e) {
      console.error("Erro ao carregar dados admin:", e);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggleUser = async (userId: string, currentAtivo: boolean) => {
    setTogglingUser(userId);
    try {
      const { error } = await supabase
        .from("corretora_usuarios")
        .update({ ativo: !currentAtivo })
        .eq("id", userId);
      if (error) throw error;
      toast.success(currentAtivo ? "Usuário bloqueado" : "Usuário desbloqueado");
      loadData();
    } catch {
      toast.error("Erro ao atualizar usuário");
    } finally {
      setTogglingUser(null);
    }
  };

  const filteredAssociacoes = associacoes.filter(a =>
    a.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Agrupar usuários por email
  const groupedUsers: GroupedUser[] = (() => {
    const map = new Map<string, GroupedUser>();
    portalUsers.forEach(u => {
      const existing = map.get(u.email);
      const assocEntry = {
        id: u.id,
        corretora_id: u.corretora_id,
        corretora_nome: u.corretora_nome || "N/A",
        ativo: u.ativo,
        totp_configurado: u.totp_configurado,
        modulos_bi: u.modulos_bi,
        ultimo_acesso: u.ultimo_acesso,
      };
      if (existing) {
        existing.associacoes.push(assocEntry);
        // Pegar o acesso mais recente
        if (u.ultimo_acesso && (!existing.ultimo_acesso_geral || u.ultimo_acesso > existing.ultimo_acesso_geral)) {
          existing.ultimo_acesso_geral = u.ultimo_acesso;
        }
        if (u.created_at < existing.created_at) {
          existing.created_at = u.created_at;
        }
      } else {
        map.set(u.email, {
          email: u.email,
          associacoes: [assocEntry],
          ultimo_acesso_geral: u.ultimo_acesso,
          created_at: u.created_at,
        });
      }
    });
    return Array.from(map.values());
  })();

  const filteredGroupedUsers = groupedUsers.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.associacoes.some(a => a.corretora_nome.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalComErro = associacoes.filter(a =>
    a.cobranca_status === "erro" || a.eventos_status === "erro" || a.mgf_status === "erro"
  ).length;
  const totalAtivos = associacoes.filter(a => a.tem_credenciais).length;
  const totalUsuarios = groupedUsers.length;
  const usuariosAtivos = groupedUsers.filter(u => u.associacoes.some(a => a.ativo)).length;

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Building2 className="h-5 w-5 text-primary" /></div>
              <div><p className="text-2xl font-bold">{associacoes.length}</p><p className="text-xs text-muted-foreground">Associações</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><Zap className="h-5 w-5 text-green-600" /></div>
              <div><p className="text-2xl font-bold">{totalAtivos}</p><p className="text-xs text-muted-foreground">Com automação</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${totalComErro > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                <AlertTriangle className={`h-5 w-5 ${totalComErro > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
              <div><p className="text-2xl font-bold">{totalComErro}</p><p className="text-xs text-muted-foreground">Com erros</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Users className="h-5 w-5 text-blue-600" /></div>
              <div><p className="text-2xl font-bold">{usuariosAtivos}/{totalUsuarios}</p><p className="text-xs text-muted-foreground">Usuários Portal</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Tabs */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar associação ou usuário..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-9" />
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />Atualizar
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="visao-geral" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Visão Geral</TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-1.5"><Users className="h-3.5 w-3.5" />Usuários Portal</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Associação</TableHead>
                      <TableHead className="text-center">Cobrança</TableHead>
                      <TableHead className="text-center">Eventos</TableHead>
                      <TableHead className="text-center">MGF</TableHead>
                      <TableHead className="text-center">Usuários</TableHead>
                      <TableHead className="text-center">Credenciais</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssociacoes.map(a => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div>
                            <span className="font-medium text-sm">{a.nome}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusCell status={a.cobranca_status} ultima={a.cobranca_ultima} erro={a.cobranca_erro} ativo={a.ativo_cobranca} />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusCell status={a.eventos_status} ultima={a.eventos_ultima} erro={a.eventos_erro} ativo={a.ativo_eventos} />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusCell status={a.mgf_status} ultima={a.mgf_ultima} erro={a.mgf_erro} ativo={a.ativo_mgf} />
                        </TableCell>
                        <TableCell className="text-center">
                          {a.total_usuarios > 0 ? (
                            <Badge variant="outline" className="text-xs">{a.usuarios_ativos}/{a.total_usuarios}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {a.tem_credenciais ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <BISyncButton corretoraId={a.id} corretoraNome={a.nome} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usuarios" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Associações</TableHead>
                      <TableHead className="text-center">TOTP</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead>Último Acesso</TableHead>
                      <TableHead>Criado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGroupedUsers.map(u => (
                      <TableRow key={u.email}>
                        <TableCell className="font-medium text-sm">{u.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {u.associacoes.map(a => (
                              <div key={a.id} className="flex items-center gap-1.5">
                                <Badge variant={a.ativo ? "outline" : "destructive"} className="text-[10px] px-1.5 py-0 shrink-0">
                                  {a.ativo ? "Ativo" : "Off"}
                                </Badge>
                                <span className="text-xs truncate max-w-[200px]" title={a.corretora_nome}>{a.corretora_nome}</span>
                                <Button
                                  size="sm" variant="ghost"
                                  onClick={() => handleToggleUser(a.id, a.ativo)}
                                  disabled={togglingUser === a.id}
                                  title={a.ativo ? "Bloquear nesta associação" : "Desbloquear nesta associação"}
                                  className="h-5 w-5 p-0 ml-auto shrink-0"
                                >
                                  {togglingUser === a.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : a.ativo ? (
                                    <ShieldOff className="h-3 w-3" />
                                  ) : (
                                    <Shield className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={u.associacoes.some(a => a.totp_configurado) ? "default" : "secondary"} className="text-[10px]">
                            {u.associacoes.some(a => a.totp_configurado) ? "OK" : "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={u.associacoes.every(a => a.ativo) ? "default" : u.associacoes.some(a => a.ativo) ? "outline" : "destructive"} className="text-[10px]">
                            {u.associacoes.every(a => a.ativo) ? "Ativo" : u.associacoes.some(a => a.ativo) ? "Parcial" : "Bloqueado"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            {(() => {
                              if (!u.ultimo_acesso_geral) return <span className="text-muted-foreground/50">Nunca</span>;
                              const diffMs = Date.now() - new Date(u.ultimo_acesso_geral).getTime();
                              const isOnline = diffMs < 5 * 60 * 1000;
                              const isRecent = diffMs < 60 * 60 * 1000;
                              return (
                                <>
                                  <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : isRecent ? 'bg-yellow-500' : 'bg-muted-foreground/30'}`} title={isOnline ? 'Online' : isRecent ? 'Recente' : 'Offline'} />
                                  <span>{format(new Date(u.ultimo_acesso_geral), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
                                </>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(u.created_at), "dd/MM/yy", { locale: ptBR })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <BIAdminAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
