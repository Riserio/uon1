import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOutletContext } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Search, LayoutGrid, List, Eye, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";


const STATUSES = ["Recebimento", "Levantamento", "Acionamento Setor", "Contato Associado", "Monitoramento", "Resolvido", "Sem Resolução"];

const STATUS_COLORS: Record<string, string> = {
  "Recebimento": "bg-blue-100 text-blue-800",
  "Levantamento": "bg-yellow-100 text-yellow-800",
  "Acionamento Setor": "bg-orange-100 text-orange-800",
  "Contato Associado": "bg-purple-100 text-purple-800",
  "Monitoramento": "bg-cyan-100 text-cyan-800",
  "Resolvido": "bg-green-100 text-green-800",
  "Sem Resolução": "bg-red-100 text-red-800",
};

const STATUS_ACCENT_COLORS: Record<string, string> = {
  "Recebimento": "#3b82f6",
  "Levantamento": "#eab308",
  "Acionamento Setor": "#f97316",
  "Contato Associado": "#a855f7",
  "Monitoramento": "#06b6d4",
  "Resolvido": "#22c55e",
  "Sem Resolução": "#ef4444",
};

const TIPO_LABELS: Record<string, string> = {
  reclamacao: "Reclamação", sugestao: "Sugestão", elogio: "Elogio", denuncia: "Denúncia",
};

const URGENCIA_COLORS: Record<string, string> = {
  alta: "bg-red-500",
  media: "bg-yellow-500",
  baixa: "bg-green-500",
};

const CHECKPOINTS_PER_ETAPA: Record<string, string[]> = {
  "Recebimento": ["Registro recebido", "Classificação inicial"],
  "Levantamento": ["Identificar associado", "Coletar informações", "Analisar documentos", "Definir urgência"],
  "Acionamento Setor": ["Notificar setor responsável", "Registrar acionamento", "Aguardar retorno"],
  "Contato Associado": ["Realizar contato", "Informar andamento", "Coletar feedback"],
  "Monitoramento": ["Acompanhar resolução", "Verificar prazo"],
  "Resolvido": ["Confirmar resolução"],
  "Sem Resolução": ["Registrar justificativa"],
};



type Registro = {
  id: string; protocolo: string; nome: string; cpf: string | null; email: string;
  telefone: string | null; tipo: string; descricao: string; placa_veiculo: string | null;
  status: string; observacoes_internas: string | null; corretora_id: string;
  created_at: string; updated_at: string; urgencia: string | null;
  origem_reclamacao: string | null; setor_responsavel: string | null;
  possivel_motivo: string | null; analista_id: string | null;
  satisfacao_nota: number | null; status_changed_at: string | null;
};

type CheckpointRow = {
  id: string; registro_id: string; etapa: string; checkpoint_index: number;
  checkpoint_label: string; concluido: boolean; concluido_em: string | null;
};

type HistoricoRow = {
  id: string; registro_id: string; status_anterior: string;
  status_novo: string; user_nome: string; created_at: string;
};

export default function PortalOuvidoria() {
  const { corretora } = useOutletContext<{ corretora: { id: string; nome: string } }>();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");
  const [canEdit, setCanEdit] = useState(false);

  // Detail dialog state
  const [selectedRegistro, setSelectedRegistro] = useState<Registro | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<CheckpointRow[]>([]);
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [detailDefaultTab, setDetailDefaultTab] = useState("dados");
  const [pendingStatusChange, setPendingStatusChange] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Check edit permission
  useEffect(() => {
    if (!corretora?.id) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("corretora_usuarios")
        .select("ouvidoria_pode_editar")
        .eq("corretora_id", corretora.id)
        .eq("profile_id", user.id)
        .maybeSingle();
      setCanEdit(!!(data as any)?.ouvidoria_pode_editar);
    })();
  }, [corretora?.id]);

  useEffect(() => {
    if (!corretora?.id) return;
    loadRegistros();
  }, [corretora?.id]);

  const loadRegistros = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ouvidoria_registros")
      .select("*")
      .eq("corretora_id", corretora.id)
      .order("created_at", { ascending: false });
    const regs = (data as any) || [];
    setRegistros(regs);

    // Load checkpoints
    const ids = regs.map((r: any) => r.id);
    if (ids.length > 0) {
      const { data: cp } = await supabase.from("ouvidoria_checkpoints").select("*").in("registro_id", ids);
      setCheckpoints((cp as any) || []);
    }
    setLoading(false);
  };

  const loadHistorico = async (registroId: string) => {
    const { data } = await supabase.from("ouvidoria_historico").select("*").eq("registro_id", registroId).order("created_at", { ascending: false });
    setHistorico((data as any) || []);
  };

  const ensureCheckpoints = async (registroId: string, etapa: string) => {
    const existing = checkpoints.filter(c => c.registro_id === registroId && c.etapa === etapa);
    if (existing.length > 0) return;
    const labels = CHECKPOINTS_PER_ETAPA[etapa] || [];
    if (labels.length === 0) return;
    const inserts = labels.map((label, idx) => ({
      registro_id: registroId, etapa, checkpoint_index: idx, checkpoint_label: label, concluido: false,
    }));
    await supabase.from("ouvidoria_checkpoints").insert(inserts);
  };

  const areCheckpointsComplete = (registroId: string, etapa: string): boolean => {
    const etapaCps = checkpoints.filter(c => c.registro_id === registroId && c.etapa === etapa);
    if (etapaCps.length === 0) return true;
    return etapaCps.every(c => c.concluido);
  };

  const tryUpdateStatus = async (registro: Registro, novoStatus: string) => {
    if (!canEdit) return;
    if (!areCheckpointsComplete(registro.id, registro.status)) {
      await ensureCheckpoints(registro.id, registro.status);
      const { data: cp } = await supabase.from("ouvidoria_checkpoints").select("*").eq("registro_id", registro.id);
      if (cp) setCheckpoints(prev => [...prev.filter(c => c.registro_id !== registro.id), ...(cp as any)]);
      setSelectedRegistro(registro);
      setDetailDefaultTab("checkpoints");
      setPendingStatusChange(novoStatus);
      setDetailOpen(true);
      loadHistorico(registro.id);
      toast.error(`Complete os checkpoints de "${registro.status}" antes de avançar`);
      return;
    }
    await updateStatus(registro, novoStatus);
  };

  const updateStatus = async (registro: Registro, novoStatus: string) => {
    const statusAnterior = registro.status;
    const { error } = await supabase.from("ouvidoria_registros").update({ status: novoStatus } as any).eq("id", registro.id);
    if (error) { toast.error("Erro ao atualizar status"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("ouvidoria_historico").insert({ registro_id: registro.id, status_anterior: statusAnterior, status_novo: novoStatus, user_id: user?.id, user_nome: user?.email || "Portal" });
    await ensureCheckpoints(registro.id, novoStatus);
    toast.success(`Status alterado para ${novoStatus}`);
    setPendingStatusChange(null);
    // Update local state without full reload (preserves current tab/view)
    setRegistros(prev => prev.map(r => r.id === registro.id ? { ...r, status: novoStatus, status_changed_at: new Date().toISOString() } : r));
    // Reload checkpoints for the moved registro
    const { data: cp } = await supabase.from("ouvidoria_checkpoints").select("*").eq("registro_id", registro.id);
    if (cp) setCheckpoints(prev => [...prev.filter(c => c.registro_id !== registro.id), ...(cp as any)]);
    if (selectedRegistro?.id === registro.id) {
      setSelectedRegistro({ ...registro, status: novoStatus, status_changed_at: new Date().toISOString() });
      loadHistorico(registro.id);
    }
  };

  const toggleCheckpoint = async (cp: CheckpointRow) => {
    if (!canEdit) return;
    const newVal = !cp.concluido;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("ouvidoria_checkpoints").update({
      concluido: newVal, concluido_em: newVal ? new Date().toISOString() : null, user_id: user?.id,
    } as any).eq("id", cp.id);
    setCheckpoints(prev => prev.map(c => c.id === cp.id ? { ...c, concluido: newVal, concluido_em: newVal ? new Date().toISOString() : null } : c));
  };

  const updateField = async (id: string, field: string, value: any) => {
    if (!canEdit) return;
    const { error } = await supabase.from("ouvidoria_registros").update({ [field]: value } as any).eq("id", id);
    if (error) toast.error("Erro ao salvar");
    else {
      setRegistros(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
      if (selectedRegistro?.id === id) setSelectedRegistro(prev => prev ? { ...prev, [field]: value } : prev);
    }
  };

  const openDetail = async (r: Registro) => {
    setSelectedRegistro(r);
    setDetailDefaultTab("dados");
    setPendingStatusChange(null);
    setDetailOpen(true);
    loadHistorico(r.id);
    await ensureCheckpoints(r.id, r.status);
    const { data: cp } = await supabase.from("ouvidoria_checkpoints").select("*").eq("registro_id", r.id);
    if (cp) setCheckpoints(prev => [...prev.filter(c => c.registro_id !== r.id), ...(cp as any)]);
  };

  const filtered = registros.filter(r => {
    const matchSearch = !search || r.protocolo.toLowerCase().includes(search.toLowerCase()) || r.nome.toLowerCase().includes(search.toLowerCase());
    const matchTipo = filterTipo === "all" || r.tipo === filterTipo;
    return matchSearch && matchTipo;
  });

  const totalAbertos = filtered.filter(r => !["Resolvido", "Sem Resolução"].includes(r.status)).length;
  const resolvidos = filtered.filter(r => r.status === "Resolvido").length;
  const semResolucao = filtered.filter(r => r.status === "Sem Resolução").length;
  const tipoCounts = Object.keys(TIPO_LABELS).map(t => ({ name: TIPO_LABELS[t], value: filtered.filter(r => r.tipo === t).length }));
  const statusCounts = STATUSES.map(s => ({ name: s, count: filtered.filter(r => r.status === s).length }));

  // Taxa de resolução
  const totalFinalizados = resolvidos + semResolucao;
  const taxaResolucao = totalFinalizados > 0 ? Math.round((resolvidos / totalFinalizados) * 100) : 0;
  const taxaSemResolucao = totalFinalizados > 0 ? 100 - taxaResolucao : 0;
  const resolucaoData = [
    { name: "Resolvidos", value: resolvidos },
    { name: "Sem Resolução", value: semResolucao },
  ];

  // Vencidos por etapa (SLA 48h por padrão)
  const SLA_HORAS = 48;
  const vencidosPorEtapa = STATUSES.filter(s => !["Resolvido", "Sem Resolução"].includes(s)).map(status => {
    const cards = filtered.filter(r => r.status === status);
    const vencidos = cards.filter(r => {
      const changedAt = r.status_changed_at || r.created_at;
      return differenceInHours(new Date(), new Date(changedAt)) > SLA_HORAS;
    }).length;
    return { name: status, total: cards.length, vencidos, noPrazo: cards.length - vencidos };
  });

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold">Ouvidoria</h2>
        <p className="text-sm text-muted-foreground">
          Acompanhe as manifestações da associação
          {canEdit && <Badge variant="outline" className="ml-2 text-[10px]">Edição habilitada</Badge>}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="rounded-2xl"><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{filtered.length}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{totalAbertos}</p><p className="text-xs text-muted-foreground">Em Andamento</p></CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{resolvidos}</p><p className="text-xs text-muted-foreground">Resolvidos</p></CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-600">{semResolucao}</p><p className="text-xs text-muted-foreground">Sem Resolução</p></CardContent></Card>
      </div>

      <Tabs defaultValue="tabela">
        <TabsList>
          <TabsTrigger value="tabela"><List className="h-4 w-4 mr-1" /> Tabela</TabsTrigger>
          <TabsTrigger value="kanban"><LayoutGrid className="h-4 w-4 mr-1" /> Kanban</TabsTrigger>
          <TabsTrigger value="graficos">Gráficos</TabsTrigger>
        </TabsList>

        <div className="flex flex-wrap gap-3 items-center mt-4">
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar protocolo, nome..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <TabsContent value="tabela">
          <Card className="mt-4 rounded-2xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Protocolo</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map(r => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r)}>
                    <TableCell className="font-mono text-sm">{r.protocolo}</TableCell>
                    <TableCell>{r.nome}</TableCell>
                    <TableCell><Badge variant="outline">{TIPO_LABELS[r.tipo]}</Badge></TableCell>
                    <TableCell><Badge className={STATUS_COLORS[r.status]}>{r.status}</Badge></TableCell>
                    <TableCell>{format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell><Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="kanban">
          <div className="flex gap-3 overflow-x-auto pb-4 mt-4">
            {STATUSES.map(status => {
              const cards = filtered.filter(r => r.status === status);
              const accentColor = STATUS_ACCENT_COLORS[status] || "#6b7280";
              return (
                <div key={status} className="min-w-[260px] w-[260px] flex-shrink-0">
                  <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden h-full flex flex-col">
                    <div className="px-4 py-3 flex items-center justify-between bg-muted/30" style={{ borderTop: `3px solid ${accentColor}` }}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
                        <h3 className="font-semibold text-sm">{status}</h3>
                        <span className="bg-background text-muted-foreground px-2 py-0.5 rounded-md text-xs font-medium border">{cards.length}</span>
                      </div>
                    </div>
                    <div
                      className={`flex-1 p-3 space-y-2.5 overflow-y-auto min-h-[200px] max-h-[calc(100vh-400px)] transition-colors ${draggedId ? 'ring-2 ring-primary/20 ring-inset' : ''}`}
                      onDragOver={canEdit ? (e) => e.preventDefault() : undefined}
                      onDrop={canEdit ? (e) => {
                        e.preventDefault();
                        if (draggedId) {
                          const registro = registros.find(r => r.id === draggedId);
                          if (registro && registro.status !== status) {
                            tryUpdateStatus(registro, status);
                          }
                          setDraggedId(null);
                        }
                      } : undefined}
                    >
                      {cards.slice(0, 8).map(r => {
                        const regCps = checkpoints.filter(c => c.registro_id === r.id && c.etapa === r.status);
                        const done = regCps.filter(c => c.concluido).length;
                        const total = regCps.length;
                        const progress = total > 0 ? (done / total) * 100 : 0;
                        const changedAt = r.status_changed_at || r.created_at;
                        const hoursInStatus = differenceInHours(new Date(), new Date(changedAt));
                        return (
                          <Card
                            key={r.id}
                            className={`cursor-pointer hover:shadow-md transition-shadow rounded-xl ${draggedId === r.id ? 'opacity-50' : ''}`}
                            draggable={canEdit}
                            onDragStart={canEdit ? () => setDraggedId(r.id) : undefined}
                            onDragEnd={() => setDraggedId(null)}
                            onClick={() => openDetail(r)}
                          >
                            <CardContent className="p-3.5 space-y-2" style={{ borderLeft: `3px solid ${accentColor}`, borderRadius: '0.75rem' }}>
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-mono text-muted-foreground">{r.protocolo}</p>
                                {r.urgencia && <div className={`w-2 h-2 rounded-full ${URGENCIA_COLORS[r.urgencia] || URGENCIA_COLORS.media}`} />}
                              </div>
                              <p className="text-sm font-semibold truncate">{r.nome}</p>
                              <Badge variant="outline" className="text-[10px]">{TIPO_LABELS[r.tipo]}</Badge>
                              {total > 0 && (
                                <div className="space-y-1">
                                  <Progress value={progress} className="h-1" />
                                  <p className="text-[10px] text-muted-foreground">{done}/{total} checkpoints</p>
                                </div>
                              )}
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] text-muted-foreground">{format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}</p>
                                <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Clock className="h-2.5 w-2.5" /> {hoursInStatus}h
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                      {cards.length > 8 && <p className="text-xs text-center text-muted-foreground py-1">+{cards.length - 8} registros</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="graficos">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            {/* Por Tipo */}
            <Card className="rounded-2xl"><CardContent className="p-6">
              <h3 className="font-semibold mb-4">Por Tipo</h3>
              <div className="space-y-3">
                {Object.entries(TIPO_LABELS).map(([key, label]) => {
                  const count = filtered.filter(r => r.tipo === key).length;
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm">{label}</span>
                      <span className="bg-muted rounded-full px-3 py-1 text-sm font-semibold min-w-[36px] text-center">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent></Card>

            {/* Por Etapa */}
            <Card className="rounded-2xl"><CardContent className="p-6">
              <h3 className="font-semibold mb-4">Por Etapa</h3>
              <div className="space-y-3">
                {STATUSES.map(status => {
                  const count = filtered.filter(r => r.status === status).length;
                  const accentColor = STATUS_ACCENT_COLORS[status];
                  return (
                    <div key={status} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
                        <span className="text-sm">{status}</span>
                      </div>
                      <span className="bg-muted rounded-full px-3 py-1 text-sm font-semibold min-w-[36px] text-center">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent></Card>

            {/* Taxa de Resolução */}
            <Card className="rounded-2xl"><CardContent className="p-6">
              <h3 className="font-semibold mb-6">Taxa de Resolução</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-3xl font-bold text-green-600">{resolvidos}</p>
                  <p className="text-sm text-muted-foreground mt-1">Resolvidos</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-red-600">{semResolucao}</p>
                  <p className="text-sm text-muted-foreground mt-1">Sem Resolução</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">{totalAbertos}</p>
                  <p className="text-sm text-muted-foreground mt-1">Em Andamento</p>
                </div>
              </div>
            </CardContent></Card>

            {/* SLAs Vencidos por Etapa */}
            <Card className="rounded-2xl"><CardContent className="p-6">
              <h3 className="font-semibold mb-4">SLAs Vencidos por Etapa</h3>
              <div className="space-y-3">
                {vencidosPorEtapa.map(item => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-sm">{item.name}</span>
                    <span className={`rounded-full px-3 py-1 text-sm font-semibold min-w-[36px] text-center ${item.vencidos > 0 ? 'bg-red-100 text-red-700' : 'bg-muted'}`}>
                      {item.vencidos}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
          {selectedRegistro && (
            <div className="flex flex-col h-full max-h-[90vh]">
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b bg-muted/20">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold font-mono">{selectedRegistro.protocolo}</h2>
                  <Badge className={STATUS_COLORS[selectedRegistro.status]}>{selectedRegistro.status}</Badge>
                  {selectedRegistro.urgencia && (
                    <Badge variant="outline" className="capitalize gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${URGENCIA_COLORS[selectedRegistro.urgencia]}`} />
                      {selectedRegistro.urgencia}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>{selectedRegistro.nome}</span>
                  <span>·</span>
                  <span>{TIPO_LABELS[selectedRegistro.tipo]}</span>
                  <span>·</span>
                  <span>{format(new Date(selectedRegistro.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue={detailDefaultTab} key={selectedRegistro.id + detailDefaultTab} className="flex-1 flex flex-col overflow-hidden">
                <div className="px-6 pt-3">
                  <TabsList className="w-full">
                    <TabsTrigger value="dados" className="flex-1">Dados</TabsTrigger>
                    <TabsTrigger value="checkpoints" className="flex-1">Checkpoints</TabsTrigger>
                    <TabsTrigger value="historico" className="flex-1">Histórico</TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-6">
                  <TabsContent value="dados" className="space-y-5 mt-4">
                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {[
                        { label: "Nome", value: selectedRegistro.nome },
                        { label: "CPF", value: selectedRegistro.cpf || "—" },
                        { label: "E-mail", value: selectedRegistro.email },
                        { label: "Telefone", value: selectedRegistro.telefone || "—" },
                        { label: "Tipo", value: TIPO_LABELS[selectedRegistro.tipo] },
                        { label: "Placa", value: selectedRegistro.placa_veiculo || "—" },
                      ].map(item => (
                        <div key={item.label} className="flex flex-col">
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{item.label}</span>
                          <span className="text-sm font-medium mt-0.5">{item.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Descrição */}
                    <div className="rounded-xl bg-muted/40 border p-4">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Descrição</span>
                      <p className="text-sm mt-1.5 leading-relaxed">{selectedRegistro.descricao}</p>
                    </div>

                    {/* Editable fields - only if canEdit */}
                    {canEdit && (
                      <>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Urgência</Label>
                            <Select value={selectedRegistro.urgencia || "media"} onValueChange={v => updateField(selectedRegistro.id, "urgencia", v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="baixa">Baixa</SelectItem>
                                <SelectItem value="media">Média</SelectItem>
                                <SelectItem value="alta">Alta</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Setor Responsável</Label>
                            <Input value={selectedRegistro.setor_responsavel || ""} onChange={e => updateField(selectedRegistro.id, "setor_responsavel", e.target.value)} placeholder="Ex: Financeiro" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Possível Motivo</Label>
                            <Input value={selectedRegistro.possivel_motivo || ""} onChange={e => updateField(selectedRegistro.id, "possivel_motivo", e.target.value)} />
                          </div>
                        </div>

                        {/* Status actions */}
                        <div className="rounded-xl border p-4 space-y-3">
                          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Alterar Etapa</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {STATUSES.map(s => (
                              <Button key={s} variant={selectedRegistro.status === s ? "default" : "outline"} size="sm" className="text-xs h-7 rounded-full"
                                onClick={() => { if (s !== selectedRegistro.status) tryUpdateStatus(selectedRegistro, s); }}>
                                {s}
                              </Button>
                            ))}
                          </div>
                          {pendingStatusChange && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                              <p className="text-xs text-destructive">Complete os checkpoints de "<strong>{selectedRegistro.status}</strong>" para avançar para "<strong>{pendingStatusChange}</strong>"</p>
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white rounded-full" onClick={() => tryUpdateStatus(selectedRegistro, "Resolvido")}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolvido
                            </Button>
                            <Button size="sm" variant="destructive" className="rounded-full" onClick={() => tryUpdateStatus(selectedRegistro, "Sem Resolução")}>
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Sem Resolução
                            </Button>
                          </div>
                        </div>

                        {/* Observações */}
                        <div className="space-y-1.5">
                          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observações Internas</Label>
                          <Textarea defaultValue={selectedRegistro.observacoes_internas || ""} onBlur={e => updateField(selectedRegistro.id, "observacoes_internas", e.target.value)} placeholder="Notas internas..." rows={3} />
                        </div>
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="checkpoints" className="mt-4 space-y-1">
                    {(() => {
                      const allEtapas = STATUSES.map((etapa, idx) => {
                        const cps = checkpoints.filter(c => c.registro_id === selectedRegistro.id && c.etapa === etapa);
                        const done = cps.filter(c => c.concluido).length;
                        const isCurrent = etapa === selectedRegistro.status;
                        const currentIdx = STATUSES.indexOf(selectedRegistro.status);
                        const isPast = idx < currentIdx;
                        const isFuture = idx > currentIdx;
                        return { etapa, cps, done, isCurrent, isPast, isFuture };
                      });
                      return (
                        <div className="relative">
                          <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-border" />
                          <div className="space-y-1">
                            {allEtapas.map(({ etapa, cps, done, isCurrent, isPast, isFuture }) => (
                              <div key={etapa} className={`relative pl-10 py-3 rounded-xl transition-colors ${isCurrent ? 'bg-primary/5 border border-primary/20' : ''}`}>
                                <div className={`absolute left-2 top-4 w-[14px] h-[14px] rounded-full border-2 z-10 ${
                                  isPast ? 'bg-green-500 border-green-500' : isCurrent ? 'bg-primary border-primary animate-pulse' : 'bg-background border-muted-foreground/30'
                                }`}>
                                  {isPast && <CheckCircle2 className="h-2.5 w-2.5 text-white absolute top-0 left-0.5" />}
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold ${isFuture ? 'text-muted-foreground/50' : ''}`}>{etapa}</span>
                                    {isCurrent && <Badge variant="default" className="text-[10px] px-1.5 h-4">Atual</Badge>}
                                  </div>
                                  {cps.length > 0 && <span className="text-xs text-muted-foreground">{done}/{cps.length}</span>}
                                </div>
                                {cps.length > 0 && (
                                  <div className="mt-2 space-y-1.5">
                                    {cps.sort((a, b) => a.checkpoint_index - b.checkpoint_index).map(cp => (
                                      <label key={cp.id} htmlFor={cp.id} className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${canEdit ? 'cursor-pointer' : 'cursor-default'} ${cp.concluido ? 'bg-green-500/5' : canEdit ? 'hover:bg-muted/50' : ''}`}>
                                        <Checkbox id={cp.id} checked={cp.concluido} onCheckedChange={() => toggleCheckpoint(cp)} disabled={!canEdit} />
                                        <span className={`text-sm ${cp.concluido ? 'line-through text-muted-foreground' : ''}`}>{cp.checkpoint_label}</span>
                                        {cp.concluido && cp.concluido_em && (
                                          <span className="text-[10px] text-muted-foreground ml-auto">{format(new Date(cp.concluido_em), "dd/MM HH:mm")}</span>
                                        )}
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </TabsContent>

                  <TabsContent value="historico" className="mt-4">
                    {historico.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhuma movimentação registrada</p>}
                    {historico.length > 0 && (
                      <div className="relative">
                        <div className="absolute left-[15px] top-3 bottom-3 w-0.5 bg-border" />
                        <div className="space-y-0">
                          {historico.map(h => (
                            <div key={h.id} className="relative pl-10 py-3">
                              <div className="absolute left-[9px] top-[18px] w-3 h-3 rounded-full border-2 bg-background z-10" style={{ borderColor: STATUS_ACCENT_COLORS[h.status_novo] || '#6b7280' }} />
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="text-[10px] h-5">{h.status_anterior}</Badge>
                                    <span className="text-muted-foreground text-xs">→</span>
                                    <Badge className={`text-[10px] h-5 ${STATUS_COLORS[h.status_novo]}`}>{h.status_novo}</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1.5">{h.user_nome}</p>
                                </div>
                                <span className="text-[11px] text-muted-foreground whitespace-nowrap">{format(new Date(h.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
