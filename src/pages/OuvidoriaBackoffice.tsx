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
import { Search, Eye, LayoutGrid, List, Settings2, BarChart3, AlertTriangle, Clock, CheckCircle2, XCircle, GripVertical, MessageCircle, Phone, Mail } from "lucide-react";
import { openWhatsApp } from "@/utils/whatsapp";
import { format, differenceInMinutes, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import OuvidoriaConfigDialog from "@/components/ouvidoria/OuvidoriaConfigDialog";
import { OuvidoriaWidgets } from "@/components/ouvidoria/OuvidoriaWidgets";
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
  resposta_final: string | null;
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
function DraggableCard({ registro, onClick, checkpoints, slaHours, corretoraName }: { registro: Registro; onClick: () => void; checkpoints: CheckpointRow[]; slaHours: Record<string, number | null>; corretoraName?: string }) {
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
          {corretoraName && <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20" variant="outline">🏢 {corretoraName}</Badge>}
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
  const [detailDefaultTab, setDetailDefaultTab] = useState<string>("dados");
  const [pendingStatusChange, setPendingStatusChange] = useState<string | null>(null);
  const [checkpointPopup, setCheckpointPopup] = useState<{ registro: Registro; targetStatus: string } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => { loadCorretoras(); }, []);
  useEffect(() => { loadRegistros(); loadSlaConfig(); }, [selectedCorretora]);

  const loadCorretoras = async () => {
    const { data } = await supabase.from("corretoras").select("id, nome, slug, logo_url").order("nome");
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

  const areCheckpointsComplete = (registroId: string, etapa: string): boolean => {
    const etapaCps = checkpoints.filter(c => c.registro_id === registroId && c.etapa === etapa);
    if (etapaCps.length === 0) return true; // No checkpoints = ok
    return etapaCps.every(c => c.concluido);
  };

  const tryUpdateStatus = async (registro: Registro, novoStatus: string, forceOpen = false) => {
    // Final statuses skip checkpoint validation
    if (["Resolvido", "Sem Resolução"].includes(novoStatus)) {
      await updateStatus(registro, novoStatus);
      return;
    }
    // Check if current status checkpoints are complete
    await ensureCheckpoints(registro.id, registro.status);
    const { data: cp } = await supabase.from("ouvidoria_checkpoints").select("*").eq("registro_id", registro.id);
    if (cp) setCheckpoints(prev => [...prev.filter(c => c.registro_id !== registro.id), ...(cp as any)]);
    
    const etapaCps = (cp as CheckpointRow[] || []).filter(c => c.etapa === registro.status);
    const allDone = etapaCps.length === 0 || etapaCps.every(c => c.concluido);
    
    if (!allDone) {
      // Show lightweight checkpoint popup
      setCheckpointPopup({ registro, targetStatus: novoStatus });
      return;
    }
    await updateStatus(registro, novoStatus);
  };

  const updateStatus = async (registro: Registro, novoStatus: string) => {
    const statusAnterior = registro.status;
    const { error } = await supabase.from("ouvidoria_registros").update({ status: novoStatus } as any).eq("id", registro.id);
    if (error) { toast.error("Erro ao atualizar status"); return; }
    await supabase.from("ouvidoria_historico").insert({ registro_id: registro.id, status_anterior: statusAnterior, status_novo: novoStatus, user_id: user?.id, user_nome: user?.email || "Sistema" });
    
    // Initialize checkpoints for new stage if none exist
    await ensureCheckpoints(registro.id, novoStatus);
    
    toast.success(`Status alterado para ${novoStatus}`);
    setPendingStatusChange(null);

    // Auto-send finalization email
    if (["Resolvido", "Sem Resolução"].includes(novoStatus) && registro.email) {
      const resposta = registro.resposta_final || "";
      const tipoLabel = TIPO_LABELS[registro.tipo] || registro.tipo;
      const statusFinal = novoStatus === "Resolvido" ? "Resolvida" : "Encerrada sem resolução";
      const corretoraObj = corretoras.find(c => c.id === registro.corretora_id);
      const corretoraName = corretoraObj?.nome || "";
      const corretoraLogo = corretoraObj?.logo_url || "";
      const logoHtml = corretoraLogo ? `<img src="${corretoraLogo}" alt="${corretoraName}" style="max-height:60px;margin:0 auto 10px;display:block" />` : "";
      supabase.functions.invoke("enviar-email-ouvidoria", {
        body: {
          to: registro.email,
          subject: `Sua manifestação foi finalizada - Protocolo ${registro.protocolo}`,
          html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)"><div style="background:#1e40af;padding:30px;text-align:center">${logoHtml}<h1 style="color:#fff;margin:0;font-size:24px">Ouvidoria</h1><p style="color:rgba(255,255,255,0.85);margin:5px 0 0">${corretoraName}</p></div><div style="padding:30px"><h2 style="color:#333;margin:0 0 15px">Olá, ${registro.nome}!</h2><p style="color:#555;line-height:1.6">Sua manifestação foi <strong>${statusFinal}</strong>.</p><div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0"><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0;color:#888;width:120px">Protocolo:</td><td style="padding:8px 0;color:#333;font-weight:bold;font-size:18px">${registro.protocolo}</td></tr><tr><td style="padding:8px 0;color:#888">Tipo:</td><td style="padding:8px 0;color:#333">${tipoLabel}</td></tr><tr><td style="padding:8px 0;color:#888">Status:</td><td style="padding:8px 0;color:#333;font-weight:bold">${novoStatus}</td></tr></table></div>${resposta ? `<div style="background:#e3f2fd;border-left:4px solid #1e88e5;padding:15px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#1565c0;margin:0 0 8px;font-weight:bold;font-size:14px">📝 Resposta da Ouvidoria:</p><p style="color:#333;margin:0;line-height:1.6;font-size:14px">${resposta.replace(/\n/g, '<br>')}</p></div>` : ''}<p style="color:#555;line-height:1.6">Em breve entraremos em contato pelo canal de sua preferência.</p></div></div></body></html>`,
        },
      }).catch((err: any) => console.error("[Ouvidoria] Erro ao enviar email de finalização:", err));
      toast.info("E-mail de finalização enviado ao associado");
    }

    loadRegistros();
    if (selectedRegistro?.id === registro.id) {
      setSelectedRegistro({ ...registro, status: novoStatus });
      loadHistorico(registro.id);
    }
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
    const registro = registros.find(r => r.id === registroId);
    if (!registro) return;

    // Accept drop both on column and on top of another card
    let newStatus = over.id as string;
    if (!STATUSES.includes(newStatus)) {
      const overCard = registros.find(r => r.id === newStatus);
      newStatus = overCard?.status || "";
    }

    if (!STATUSES.includes(newStatus) || registro.status === newStatus) return;
    tryUpdateStatus(registro, newStatus);
  };

  const filtered = registros.filter((r) => {
    const matchSearch = !search || r.protocolo.toLowerCase().includes(search.toLowerCase()) || r.nome.toLowerCase().includes(search.toLowerCase()) || r.email.toLowerCase().includes(search.toLowerCase()) || (r.placa_veiculo?.toLowerCase().includes(search.toLowerCase()));
    const matchTipo = filterTipo === "all" || r.tipo === filterTipo;
    return matchSearch && matchTipo;
  });

  const openDetail = async (r: Registro, tab = "dados") => {
    setSelectedRegistro(r);
    setDetailDefaultTab(tab);
    setPendingStatusChange(null);
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
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STATUSES.map(status => {
              const cards = filtered.filter(r => r.status === status);
              const slaH = slaHours[status];
              const slaLabel = slaH ? `${slaH}h` : status === "Monitoramento" ? "Agendado" : status === "Resolvido" ? "Finalizado" : status === "Sem Resolução" ? "Encerrado" : undefined;
              return (
                <KanbanColumn key={status} status={status} count={cards.length} slaLabel={slaLabel}>
                  {cards.slice(0, 10).map(r => (
                    <DraggableCard key={r.id} registro={r} checkpoints={checkpoints.filter(c => c.registro_id === r.id)} onClick={() => openDetail(r)} slaHours={slaHours} corretoraName={corretoras.find(c => c.id === r.corretora_id)?.nome} />
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
                <TableHead>Associação</TableHead>
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
                  <TableCell><Badge variant="outline" className="text-xs">{corretoras.find(c => c.id === r.corretora_id)?.nome || "—"}</Badge></TableCell>
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
        <OuvidoriaWidgets
          registros={filtered}
          statuses={STATUSES}
          slaHours={slaHours}
          corretoras={corretoras}
          showAssociacoes={true}
        />
      )}

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
          {selectedRegistro && (
            <div className="flex flex-col h-full max-h-[90vh]">
              {/* Header compacto */}
              <div className="px-6 pt-6 pb-4 border-b bg-muted/20">
                <div className="flex items-center justify-between">
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
                  {!["Resolvido", "Sem Resolução"].includes(selectedRegistro.status) && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="rounded-full border-green-500 text-green-600 hover:bg-green-600 hover:text-white hover:border-green-600" onClick={() => tryUpdateStatus(selectedRegistro, "Resolvido", true)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolvido
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-full border-red-500 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600" onClick={() => tryUpdateStatus(selectedRegistro, "Sem Resolução", true)}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Sem Resolução
                      </Button>
                    </div>
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

                    {/* Resposta ao Associado */}
                    <div className="rounded-xl border p-4 space-y-3 bg-muted/20">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Responder ao Associado</span>
                      <div className="space-y-1.5">
                        <Textarea
                          defaultValue={selectedRegistro.resposta_final || ""}
                          onBlur={e => updateField(selectedRegistro.id, "resposta_final", e.target.value)}
                          placeholder="Digite a resposta que será enviada ao associado quando a manifestação for finalizada..."
                          rows={4}
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {selectedRegistro.telefone && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2 rounded-full border-green-400 text-green-600 hover:bg-green-50 hover:border-green-500"
                              onClick={() => {
                                const resposta = selectedRegistro.resposta_final || "";
                                const msg = resposta
                                  ? `Olá ${selectedRegistro.nome}, tudo bem? Referente à sua manifestação na Ouvidoria (Protocolo: ${selectedRegistro.protocolo}):\n\n${resposta}`
                                  : `Olá ${selectedRegistro.nome}, tudo bem? Entramos em contato referente à sua manifestação na Ouvidoria (Protocolo: ${selectedRegistro.protocolo}).`;
                                openWhatsApp({ phone: selectedRegistro.telefone!, message: msg });
                              }}
                            >
                              <MessageCircle className="h-4 w-4" /> WhatsApp
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2 rounded-full border-orange-400 text-orange-600 hover:bg-orange-50 hover:border-orange-500"
                              asChild
                            >
                              <a href={`tel:${selectedRegistro.telefone.replace(/\D/g, "")}`}>
                                <Phone className="h-4 w-4" /> Ligar
                              </a>
                            </Button>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 text-blue-500" />
                        <span>O e-mail será enviado <strong>automaticamente</strong> ao finalizar a manifestação (Resolvido / Sem Resolução).</span>
                      </div>
                    </div>

                    {/* Editable fields */}
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

                    {/* Status + actions */}
                    <div className="rounded-xl border p-4 space-y-3">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Alterar Etapa</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {STATUSES.map(s => (
                          <Button key={s} variant={selectedRegistro.status === s ? "default" : "outline"} size="sm" className="text-xs h-7 rounded-full"
                            onClick={() => { if (s !== selectedRegistro.status) tryUpdateStatus(selectedRegistro, s, true); }}>
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
                    </div>

                    {/* Observações */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Observações Internas</Label>
                      <Textarea defaultValue={selectedRegistro.observacoes_internas || ""} onBlur={e => updateField(selectedRegistro.id, "observacoes_internas", e.target.value)} placeholder="Notas internas..." rows={3} />
                    </div>
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
                        return { etapa, cps, done, isCurrent, isPast, isFuture, idx };
                      });
                      return (
                        <div className="relative">
                          {/* Vertical timeline line */}
                          <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-border" />
                          <div className="space-y-1">
                            {allEtapas.map(({ etapa, cps, done, isCurrent, isPast, isFuture }) => (
                              <div key={etapa} className={`relative pl-10 py-3 rounded-xl transition-colors ${isCurrent ? 'bg-primary/5 border border-primary/20' : ''}`}>
                                {/* Timeline dot */}
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
                                  {cps.length > 0 && (
                                    <span className="text-xs text-muted-foreground">{done}/{cps.length}</span>
                                  )}
                                </div>
                                {cps.length > 0 && (
                                  <div className="mt-2 space-y-1.5">
                                    {cps.sort((a, b) => a.checkpoint_index - b.checkpoint_index).map(cp => (
                                      <label key={cp.id} htmlFor={cp.id} className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${cp.concluido ? 'bg-green-500/5' : 'hover:bg-muted/50'}`}>
                                        <Checkbox id={cp.id} checked={cp.concluido} onCheckedChange={() => toggleCheckpoint(cp)} />
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
                          {historico.map((h, i) => (
                            <div key={h.id} className="relative pl-10 py-3">
                              {/* Dot */}
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

      <OuvidoriaConfigDialog open={configOpen} onOpenChange={setConfigOpen} corretoras={corretoras} onRefresh={loadCorretoras} />

      {/* Checkpoint Popup */}
      <Dialog open={!!checkpointPopup} onOpenChange={(open) => { if (!open) setCheckpointPopup(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Checkpoints pendentes
            </DialogTitle>
          </DialogHeader>
          {checkpointPopup && (() => {
            const reg = checkpointPopup.registro;
            const etapaCps = checkpoints.filter(c => c.registro_id === reg.id && c.etapa === reg.status);
            const allDone = etapaCps.length > 0 && etapaCps.every(c => c.concluido);
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Complete os itens de <strong>"{reg.status}"</strong> para avançar para <strong>"{checkpointPopup.targetStatus}"</strong>.
                </p>
                <div className="text-xs font-mono text-muted-foreground">{reg.protocolo}</div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {etapaCps
                    .sort((a, b) => a.checkpoint_index - b.checkpoint_index)
                    .map(cp => (
                      <label
                        key={cp.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${cp.concluido ? 'bg-primary/5 border-primary/30' : 'bg-card hover:bg-muted/50'}`}
                      >
                        <Checkbox
                          checked={cp.concluido}
                          onCheckedChange={() => toggleCheckpoint(cp)}
                        />
                        <span className={`text-sm ${cp.concluido ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {cp.checkpoint_label}
                        </span>
                      </label>
                    ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setCheckpointPopup(null)}>
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!allDone}
                    onClick={async () => {
                      await updateStatus(reg, checkpointPopup.targetStatus);
                      setCheckpointPopup(null);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Avançar
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
