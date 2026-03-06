import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Search, Eye, LayoutGrid, List, Settings2, BarChart3, AlertTriangle, Clock, CheckCircle2, XCircle, GripVertical } from "lucide-react";
import { format, differenceInMinutes, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import OuvidoriaConfigDialog from "@/components/ouvidoria/OuvidoriaConfigDialog";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const STATUSES = [
  "Recebimento",
  "Levantamento",
  "Acionamento Setor",
  "Contato Associado",
  "Monitoramento",
  "Resolvido",
  "Sem Resolução",
];

const STATUS_COLORS: Record<string, string> = {
  "Recebimento": "bg-blue-100 text-blue-800 border-blue-300",
  "Levantamento": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "Acionamento Setor": "bg-orange-100 text-orange-800 border-orange-300",
  "Contato Associado": "bg-purple-100 text-purple-800 border-purple-300",
  "Monitoramento": "bg-cyan-100 text-cyan-800 border-cyan-300",
  "Resolvido": "bg-green-100 text-green-800 border-green-300",
  "Sem Resolução": "bg-red-100 text-red-800 border-red-300",
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

const DEFAULT_SLA_HOURS: Record<string, number | null> = {
  "Recebimento": 1,
  "Levantamento": 6,
  "Acionamento Setor": 12,
  "Contato Associado": 6,
  "Monitoramento": null,
  "Resolvido": null,
  "Sem Resolução": null,
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

const TIPO_LABELS: Record<string, string> = {
  reclamacao: "Reclamação",
  sugestao: "Sugestão",
  elogio: "Elogio",
  denuncia: "Denúncia",
};

const URGENCIA_COLORS: Record<string, string> = {
  alta: "bg-red-500",
  media: "bg-yellow-500",
  baixa: "bg-green-500",
};

const PIE_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#8b5cf6"];

type Registro = {
  id: string;
  protocolo: string;
  nome: string;
  cpf: string | null;
  email: string;
  telefone: string | null;
  tipo: string;
  descricao: string;
  placa_veiculo: string | null;
  status: string;
  observacoes_internas: string | null;
  corretora_id: string;
  created_at: string;
  updated_at: string;
  urgencia: string | null;
  origem_reclamacao: string | null;
  setor_responsavel: string | null;
  possivel_motivo: string | null;
  analista_id: string | null;
  satisfacao_nota: number | null;
  status_changed_at: string | null;
};

type CheckpointRow = {
  id: string;
  registro_id: string;
  etapa: string;
  checkpoint_index: number;
  checkpoint_label: string;
  concluido: boolean;
  concluido_em: string | null;
};

type HistoricoRow = {
  id: string;
  registro_id: string;
  status_anterior: string;
  status_novo: string;
  user_nome: string;
  created_at: string;
};

function getSlaStatus(registro: Registro, slaHours: Record<string, number | null>): "green" | "yellow" | "red" | null {
  const slaH = slaHours[registro.status] ?? DEFAULT_SLA_HOURS[registro.status];
  if (!slaH) return null;
  const changedAt = registro.status_changed_at || registro.created_at;
  const mins = differenceInMinutes(new Date(), new Date(changedAt));
  const totalMins = slaH * 60;
  const pct = (mins / totalMins) * 100;
  if (pct < 70) return "green";
  if (pct <= 100) return "yellow";
  return "red";
}

function SlaIndicator({ status }: { status: "green" | "yellow" | "red" | null }) {
  if (!status) return null;
  const colors = { green: "bg-green-500", yellow: "bg-yellow-500", red: "bg-red-500" };
  return <div className={`w-2.5 h-2.5 rounded-full ${colors[status]} shrink-0 animate-pulse`} title={`SLA: ${status}`} />;
}

// Droppable column - modern widget style
function KanbanColumn({ status, children, count, slaLabel }: { status: string; children: React.ReactNode; count: number; slaLabel?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const accentColor = STATUS_ACCENT_COLORS[status] || "#6b7280";
  return (
    <div ref={setNodeRef} className="min-w-[280px] w-[280px] flex-shrink-0">
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden h-full flex flex-col">
        <div 
          className="px-4 py-3 flex items-center justify-between bg-muted/30"
          style={{ borderTop: `3px solid ${accentColor}` }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: accentColor }} />
            <h3 className="font-semibold text-sm text-foreground">{status}</h3>
            <span className="bg-background text-muted-foreground px-2 py-0.5 rounded-md text-xs font-medium border">{count}</span>
          </div>
          {slaLabel && (
            <span className="text-[10px] text-muted-foreground font-medium">{slaLabel}</span>
          )}
        </div>
        <div className={`flex-1 p-3 space-y-2.5 overflow-y-auto min-h-[200px] max-h-[calc(100vh-340px)] transition-colors duration-75 ${isOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Draggable card - modern style
function DraggableCard({ registro, onClick, checkpoints, slaHours }: { registro: Registro; onClick: () => void; checkpoints: CheckpointRow[]; slaHours: Record<string, number | null> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: registro.id,
    data: { type: "card", registro },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const sla = getSlaStatus(registro, slaHours);
  const etapaCheckpoints = checkpoints.filter(c => c.etapa === registro.status);
  const done = etapaCheckpoints.filter(c => c.concluido).length;
  const total = etapaCheckpoints.length;
  const progress = total > 0 ? (done / total) * 100 : 0;
  const accentColor = STATUS_ACCENT_COLORS[registro.status] || "#6b7280";
  const changedAt = registro.status_changed_at || registro.created_at;
  const hoursInStatus = differenceInHours(new Date(), new Date(changedAt));

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="cursor-grab active:cursor-grabbing rounded-xl border bg-card hover:shadow-md transition-shadow duration-75 hover:-translate-y-0.5" 
      onClick={onClick} 
      {...attributes} 
      {...listeners}
    >
      <div className="p-3.5 space-y-2" style={{ borderLeft: `3px solid ${accentColor}`, borderRadius: '0.75rem' }}>
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs font-mono text-muted-foreground">{registro.protocolo}</p>
          <div className="flex items-center gap-1.5">
            {registro.urgencia && <div className={`w-2 h-2 rounded-full ${URGENCIA_COLORS[registro.urgencia] || URGENCIA_COLORS.media}`} title={`Urgência: ${registro.urgencia}`} />}
            <SlaIndicator status={sla} />
          </div>
        </div>
        <p className="text-sm font-semibold truncate text-foreground">{registro.nome}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{TIPO_LABELS[registro.tipo] || registro.tipo}</Badge>
          {registro.placa_veiculo && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">🚗 {registro.placa_veiculo}</Badge>}
        </div>
        {total > 0 && (
          <div className="space-y-1">
            <Progress value={progress} className="h-1" />
            <p className="text-[10px] text-muted-foreground">{done}/{total} checkpoints</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">{format(new Date(registro.created_at), "dd/MM/yyyy", { locale: ptBR })}</p>
          <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" /> {hoursInStatus}h na etapa
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OuvidoriaBackoffice() {
  const { user } = useAuth();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedRegistro, setSelectedRegistro] = useState<Registro | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "tabela" | "relatorios">("kanban");
  const [checkpoints, setCheckpoints] = useState<CheckpointRow[]>([]);
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [slaHours, setSlaHours] = useState<Record<string, number | null>>(DEFAULT_SLA_HOURS);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => { loadCorretoras(); }, []);
  useEffect(() => { loadRegistros(); loadSlaConfig(); }, [selectedCorretora]);

  const loadCorretoras = async () => {
    const { data } = await supabase.from("corretoras").select("id, nome, slug").order("nome");
    setCorretoras(data || []);
  };

  const loadRegistros = async () => {
    setLoading(true);
    let query = supabase.from("ouvidoria_registros").select("*").order("created_at", { ascending: false });
    if (selectedCorretora !== "all") query = query.eq("corretora_id", selectedCorretora);
    const { data } = await query;
    setRegistros((data as any) || []);
    
    // Load all checkpoints
    const ids = (data || []).map((r: any) => r.id);
    if (ids.length > 0) {
      const { data: cp } = await supabase.from("ouvidoria_checkpoints").select("*").in("registro_id", ids);
      setCheckpoints((cp as any) || []);
    }
    setLoading(false);
  };

  const loadSlaConfig = async () => {
    if (selectedCorretora === "all") {
      setSlaHours(DEFAULT_SLA_HOURS);
      return;
    }
    const { data } = await supabase
      .from("ouvidoria_config")
      .select("sla_horas")
      .eq("corretora_id", selectedCorretora)
      .maybeSingle();
    if (data?.sla_horas && typeof data.sla_horas === 'object') {
      setSlaHours({ ...DEFAULT_SLA_HOURS, ...(data.sla_horas as Record<string, number | null>) });
    } else {
      setSlaHours(DEFAULT_SLA_HOURS);
    }
  };

  const loadHistorico = async (registroId: string) => {
    const { data } = await supabase.from("ouvidoria_historico").select("*").eq("registro_id", registroId).order("created_at", { ascending: false });
    setHistorico((data as any) || []);
  };

  const updateStatus = async (registro: Registro, novoStatus: string) => {
    const statusAnterior = registro.status;
    const { error } = await supabase.from("ouvidoria_registros").update({ status: novoStatus } as any).eq("id", registro.id);
    if (error) { toast.error("Erro ao atualizar status"); return; }
    await supabase.from("ouvidoria_historico").insert({ registro_id: registro.id, status_anterior: statusAnterior, status_novo: novoStatus, user_id: user?.id, user_nome: user?.email || "Sistema" });
    
    // Initialize checkpoints for new stage if none exist
    await ensureCheckpoints(registro.id, novoStatus);
    
    toast.success(`Status alterado para ${novoStatus}`);
    loadRegistros();
    if (selectedRegistro?.id === registro.id) loadHistorico(registro.id);
  };

  const ensureCheckpoints = async (registroId: string, etapa: string) => {
    const existing = checkpoints.filter(c => c.registro_id === registroId && c.etapa === etapa);
    if (existing.length > 0) return;
    const labels = CHECKPOINTS_PER_ETAPA[etapa] || [];
    if (labels.length === 0) return;
    const inserts = labels.map((label, idx) => ({
      registro_id: registroId,
      etapa,
      checkpoint_index: idx,
      checkpoint_label: label,
      concluido: false,
    }));
    await supabase.from("ouvidoria_checkpoints").insert(inserts);
  };

  const toggleCheckpoint = async (cp: CheckpointRow) => {
    const newVal = !cp.concluido;
    await supabase.from("ouvidoria_checkpoints").update({
      concluido: newVal,
      concluido_em: newVal ? new Date().toISOString() : null,
      user_id: user?.id,
    } as any).eq("id", cp.id);
    setCheckpoints(prev => prev.map(c => c.id === cp.id ? { ...c, concluido: newVal, concluido_em: newVal ? new Date().toISOString() : null } : c));
  };

  const updateField = async (id: string, field: string, value: any) => {
    const { error } = await supabase.from("ouvidoria_registros").update({ [field]: value } as any).eq("id", id);
    if (error) toast.error("Erro ao salvar");
    else {
      setRegistros(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
      if (selectedRegistro?.id === id) setSelectedRegistro(prev => prev ? { ...prev, [field]: value } : prev);
    }
  };

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);
  
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const registroId = active.id as string;
    const newStatus = over.id as string;
    if (!STATUSES.includes(newStatus)) return;
    const registro = registros.find(r => r.id === registroId);
    if (!registro || registro.status === newStatus) return;
    updateStatus(registro, newStatus);
  };

  const filtered = registros.filter((r) => {
    const matchSearch = !search || r.protocolo.toLowerCase().includes(search.toLowerCase()) || r.nome.toLowerCase().includes(search.toLowerCase()) || r.email.toLowerCase().includes(search.toLowerCase()) || (r.placa_veiculo?.toLowerCase().includes(search.toLowerCase()));
    const matchTipo = filterTipo === "all" || r.tipo === filterTipo;
    return matchSearch && matchTipo;
  });

  const openDetail = async (r: Registro) => {
    setSelectedRegistro(r);
    setDetailOpen(true);
    loadHistorico(r.id);
    await ensureCheckpoints(r.id, r.status);
    // Refresh checkpoints for this registro
    const { data: cp } = await supabase.from("ouvidoria_checkpoints").select("*").eq("registro_id", r.id);
    if (cp) setCheckpoints(prev => [...prev.filter(c => c.registro_id !== r.id), ...(cp as any)]);
  };

  // Stats
  const totalAbertos = filtered.filter(r => !["Resolvido", "Sem Resolução"].includes(r.status)).length;
  const urgenciaAlta = filtered.filter(r => r.urgencia === "alta" && !["Resolvido", "Sem Resolução"].includes(r.status)).length;
  const noPrazo = filtered.filter(r => { const s = getSlaStatus(r, slaHours); return s === "green" || s === "yellow"; }).length;
  const vencidos = filtered.filter(r => getSlaStatus(r, slaHours) === "red").length;
  const resolvidosHoje = filtered.filter(r => r.status === "Resolvido" && format(new Date(r.updated_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")).length;

  // Report data
  const tipoCounts = Object.keys(TIPO_LABELS).map(t => ({ name: TIPO_LABELS[t], value: filtered.filter(r => r.tipo === t).length }));
  const statusCounts = STATUSES.map(s => ({ name: s, count: filtered.filter(r => r.status === s).length }));

  const draggedRegistro = activeId ? registros.find(r => r.id === activeId) : null;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ouvidoria</h1>
          <p className="text-muted-foreground">Gestão de manifestações</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
          <Settings2 className="h-4 w-4 mr-1" /> Configurar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todas as associações" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as associações</SelectItem>
            {corretoras.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar protocolo, nome, e-mail, placa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1 border rounded-md p-0.5">
          <Button variant={viewMode === "kanban" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("kanban")}><LayoutGrid className="h-4 w-4" /></Button>
          <Button variant={viewMode === "tabela" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("tabela")}><List className="h-4 w-4" /></Button>
          <Button variant={viewMode === "relatorios" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("relatorios")}><BarChart3 className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="rounded-2xl border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{totalAbertos}</p><p className="text-xs text-muted-foreground">Abertos</p></CardContent></Card>
        <Card className="rounded-2xl border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-destructive">{urgenciaAlta}</p><p className="text-xs text-muted-foreground">Urgência Alta</p></CardContent></Card>
        <Card className="rounded-2xl border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{noPrazo}</p><p className="text-xs text-muted-foreground">No Prazo</p></CardContent></Card>
        <Card className="rounded-2xl border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-destructive">{vencidos}</p><p className="text-xs text-muted-foreground">SLA Vencido</p></CardContent></Card>
        <Card className="rounded-2xl border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{resolvidosHoje}</p><p className="text-xs text-muted-foreground">Resolvidos Hoje</p></CardContent></Card>
      </div>

      {/* Content */}
      {viewMode === "kanban" && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STATUSES.map(status => {
              const cards = filtered.filter(r => r.status === status);
              const slaH = slaHours[status];
              const slaLabel = slaH ? `${slaH}h` : status === "Monitoramento" ? "Agendado" : status === "Resolvido" ? "Finalizado" : status === "Sem Resolução" ? "Encerrado" : undefined;
              return (
                <KanbanColumn key={status} status={status} count={cards.length} slaLabel={slaLabel}>
                  {cards.slice(0, 10).map(r => (
                    <DraggableCard key={r.id} registro={r} checkpoints={checkpoints.filter(c => c.registro_id === r.id)} onClick={() => openDetail(r)} slaHours={slaHours} />
                  ))}
                  {cards.length > 10 && <p className="text-xs text-center text-muted-foreground py-1">+{cards.length - 10} registros</p>}
                </KanbanColumn>
              );
            })}
          </div>
          <DragOverlay>
            {draggedRegistro && (
              <Card className="w-[240px] shadow-lg">
                <CardContent className="p-3">
                  <p className="text-xs font-mono">{draggedRegistro.protocolo}</p>
                  <p className="text-sm font-medium truncate">{draggedRegistro.nome}</p>
                </CardContent>
              </Card>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {viewMode === "tabela" && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Protocolo</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Urgência</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Data</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 50).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.protocolo}</TableCell>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell><Badge variant="outline">{TIPO_LABELS[r.tipo]}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${URGENCIA_COLORS[r.urgencia || 'media']}`} />
                      <span className="text-xs capitalize">{r.urgencia || 'media'}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge className={STATUS_COLORS[r.status]}>{r.status}</Badge></TableCell>
                  <TableCell><SlaIndicator status={getSlaStatus(r, slaHours)} /></TableCell>
                  <TableCell>{r.placa_veiculo || "-"}</TableCell>
                  <TableCell>{format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => openDetail(r)}><Eye className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {viewMode === "relatorios" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Distribuição por Tipo</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={tipoCounts.filter(t => t.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {tipoCounts.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Manifestações por Etapa</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={statusCounts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Taxa de Resolução</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-3xl font-bold text-green-600">{filtered.filter(r => r.status === "Resolvido").length}</p>
                  <p className="text-xs text-muted-foreground">Resolvidos</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-red-600">{filtered.filter(r => r.status === "Sem Resolução").length}</p>
                  <p className="text-xs text-muted-foreground">Sem Resolução</p>
                </div>
                <div>
                  <p className="text-3xl font-bold">{totalAbertos}</p>
                  <p className="text-xs text-muted-foreground">Em Andamento</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">SLAs Vencidos por Etapa</h3>
              <div className="space-y-2">
                {STATUSES.filter(s => slaHours[s] !== null && slaHours[s] !== undefined).map(s => {
                  const venc = filtered.filter(r => r.status === s && getSlaStatus(r, slaHours) === "red").length;
                  return (
                    <div key={s} className="flex items-center justify-between text-sm">
                      <span>{s}</span>
                      <Badge variant={venc > 0 ? "destructive" : "secondary"}>{venc}</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <DialogTitle>{selectedRegistro?.protocolo}</DialogTitle>
              {selectedRegistro && (
                <>
                  <Badge className={STATUS_COLORS[selectedRegistro.status]}>{selectedRegistro.status}</Badge>
                  {selectedRegistro.urgencia && (
                    <Badge variant="outline" className="capitalize gap-1">
                      <div className={`w-2 h-2 rounded-full ${URGENCIA_COLORS[selectedRegistro.urgencia]}`} />
                      {selectedRegistro.urgencia}
                    </Badge>
                  )}
                </>
              )}
            </div>
          </DialogHeader>
          {selectedRegistro && (
            <Tabs defaultValue="dados">
              <TabsList className="w-full">
                <TabsTrigger value="dados" className="flex-1">Dados</TabsTrigger>
                <TabsTrigger value="checkpoints" className="flex-1">Checkpoints</TabsTrigger>
                <TabsTrigger value="historico" className="flex-1">Histórico</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Nome:</span> {selectedRegistro.nome}</div>
                  <div><span className="text-muted-foreground">CPF:</span> {selectedRegistro.cpf || "-"}</div>
                  <div><span className="text-muted-foreground">E-mail:</span> {selectedRegistro.email}</div>
                  <div><span className="text-muted-foreground">Telefone:</span> {selectedRegistro.telefone || "-"}</div>
                  <div><span className="text-muted-foreground">Tipo:</span> {TIPO_LABELS[selectedRegistro.tipo]}</div>
                  <div><span className="text-muted-foreground">Placa:</span> {selectedRegistro.placa_veiculo || "-"}</div>
                  <div className="col-span-2"><span className="text-muted-foreground">Data:</span> {format(new Date(selectedRegistro.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Descrição</Label>
                  <p className="text-sm bg-muted/50 rounded p-3 mt-1">{selectedRegistro.descricao}</p>
                </div>

                {/* Editable fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Urgência</Label>
                    <Select value={selectedRegistro.urgencia || "media"} onValueChange={v => updateField(selectedRegistro.id, "urgencia", v)}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Setor Responsável</Label>
                    <Input className="h-8" value={selectedRegistro.setor_responsavel || ""} onChange={e => updateField(selectedRegistro.id, "setor_responsavel", e.target.value)} placeholder="Ex: Financeiro" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Possível Motivo</Label>
                    <Input className="h-8" value={selectedRegistro.possivel_motivo || ""} onChange={e => updateField(selectedRegistro.id, "possivel_motivo", e.target.value)} />
                  </div>
                </div>

                {/* Status selector */}
                <div className="space-y-2">
                  <Label className="text-xs">Alterar Etapa</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map(s => (
                      <Button key={s} variant={selectedRegistro.status === s ? "default" : "outline"} size="sm" className="text-xs h-7"
                        onClick={() => { if (s !== selectedRegistro.status) { updateStatus(selectedRegistro, s); setSelectedRegistro({ ...selectedRegistro, status: s }); } }}>
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { updateStatus(selectedRegistro, "Resolvido"); setSelectedRegistro({ ...selectedRegistro, status: "Resolvido" }); }}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Resolvido
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => { updateStatus(selectedRegistro, "Sem Resolução"); setSelectedRegistro({ ...selectedRegistro, status: "Sem Resolução" }); }}>
                    <XCircle className="h-4 w-4 mr-1" /> Sem Resolução
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Observações Internas</Label>
                  <Textarea defaultValue={selectedRegistro.observacoes_internas || ""} onBlur={e => updateField(selectedRegistro.id, "observacoes_internas", e.target.value)} placeholder="Notas internas..." rows={3} />
                </div>
              </TabsContent>

              <TabsContent value="checkpoints" className="space-y-4 mt-4">
                {STATUSES.map(etapa => {
                  const cps = checkpoints.filter(c => c.registro_id === selectedRegistro.id && c.etapa === etapa);
                  if (cps.length === 0) return null;
                  const done = cps.filter(c => c.concluido).length;
                  return (
                    <div key={etapa} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-xs ${etapa === selectedRegistro.status ? 'border-primary' : ''}`}>{etapa}</Badge>
                        <span className="text-xs text-muted-foreground">{done}/{cps.length}</span>
                      </div>
                      <div className="space-y-1 pl-2">
                        {cps.sort((a, b) => a.checkpoint_index - b.checkpoint_index).map(cp => (
                          <div key={cp.id} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={cp.concluido} onCheckedChange={() => toggleCheckpoint(cp)} />
                            <span className={cp.concluido ? "line-through text-muted-foreground" : ""}>{cp.checkpoint_label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="historico" className="space-y-3 mt-4">
                {historico.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum histórico</p>}
                {historico.map(h => (
                  <div key={h.id} className="flex items-start gap-3 text-sm border-l-2 border-primary/20 pl-3 py-1">
                    <div className="flex-1">
                      <p><Badge variant="outline" className="mr-1 text-xs">{h.status_anterior}</Badge> → <Badge className={`text-xs ${STATUS_COLORS[h.status_novo]}`}>{h.status_novo}</Badge></p>
                      <p className="text-xs text-muted-foreground mt-1">{h.user_nome} · {format(new Date(h.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                    </div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <OuvidoriaConfigDialog open={configOpen} onOpenChange={setConfigOpen} corretoras={corretoras} />
    </div>
  );
}
