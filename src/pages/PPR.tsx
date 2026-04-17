import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  CheckCircle2, Circle, Clock, Plus, Pencil, Trash2, 
  BarChart3, Building2, RefreshCw, LayoutGrid, Rows3, KanbanSquare,
  User as UserIcon, Filter, Search, MoreVertical, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

const AREAS_PPR = [
  "Rateio",
  "Capital de Estabilização",
  "Criação do Grupo de Proteção",
  "Ouvidoria",
  "Compliance",
  "Jurídico",
  "Auditoria Interna",
  "Controle Financeiro",
  "Sistema de Gestão",
  "KPIs",
  "Rede Credenciada",
  "Departamentos e Setores",
];

const AREA_COLORS: Record<string, string> = {
  "Rateio": "hsl(220 85% 55%)",
  "Capital de Estabilização": "hsl(142 76% 36%)",
  "Criação do Grupo de Proteção": "hsl(270 70% 60%)",
  "Ouvidoria": "hsl(340 82% 52%)",
  "Compliance": "hsl(40 96% 55%)",
  "Jurídico": "hsl(0 72% 51%)",
  "Auditoria Interna": "hsl(168 76% 42%)",
  "Controle Financeiro": "hsl(200 85% 55%)",
  "Sistema de Gestão": "hsl(250 70% 60%)",
  "KPIs": "hsl(30 95% 55%)",
  "Rede Credenciada": "hsl(190 80% 45%)",
  "Departamentos e Setores": "hsl(290 60% 55%)",
};

const SPRINTS = [
  { id: 0, label: "START", color: "hsl(220 9% 46%)" },
  { id: 1, label: "Sprint 1", color: "hsl(220 85% 55%)" },
  { id: 2, label: "Sprint 2", color: "hsl(168 76% 42%)" },
  { id: 3, label: "Sprint 3", color: "hsl(40 96% 55%)" },
  { id: 4, label: "Sprint 4", color: "hsl(270 70% 60%)" },
  { id: 5, label: "Sprint 5", color: "hsl(142 76% 36%)" },
];

const STATUS_CONFIG = {
  pendente: { label: "Pendente", icon: Circle, color: "text-muted-foreground", bg: "bg-muted/40", ring: "ring-border" },
  em_andamento: { label: "Em Andamento", icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", ring: "ring-amber-200 dark:ring-amber-900" },
  concluido: { label: "Concluído", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", ring: "ring-emerald-200 dark:ring-emerald-900" },
};

const DEFAULT_TASKS: { area: string; sprint: number; titulo: string; descricao?: string }[] = [
  { area: "Rateio", sprint: 1, titulo: "Definição política de rateio" },
  { area: "Rateio", sprint: 2, titulo: "Levantamento dos custos de eventos e estudo de rateio últimos 12 meses", descricao: "Revisão com base nos custos da operação." },
  { area: "Rateio", sprint: 3, titulo: "Revisão da precificação e análise das tabelas aplicadas", descricao: "Revisão com base nos custos da operação, não como comparativo." },
  { area: "Rateio", sprint: 4, titulo: "Simulação teste de aplicação de rateio médio", descricao: "3 meses após implantação da tabela." },
  { area: "Capital de Estabilização", sprint: 2, titulo: "Definição do Caixa de estabilização", descricao: "Estudo de valor de arrecadação para construção do caixa." },
  { area: "Capital de Estabilização", sprint: 3, titulo: "Criação de produto e agregação dos recursos" },
  { area: "Capital de Estabilização", sprint: 4, titulo: "Criação do caixa mínimo de 1 rateio médio mensal" },
  { area: "Capital de Estabilização", sprint: 5, titulo: "Auditoria periódica, estruturação de CER 3 Rateios" },
  { area: "Criação do Grupo de Proteção", sprint: 1, titulo: "Classificação de grupos de aceitação", descricao: "Rever grupos para garantir base mais saudável." },
  { area: "Criação do Grupo de Proteção", sprint: 2, titulo: "Estudo de rateio baseado nos grupos de aceitação" },
  { area: "Criação do Grupo de Proteção", sprint: 3, titulo: "Criação do grupo independente" },
  { area: "Criação do Grupo de Proteção", sprint: 4, titulo: "Alterações previstas na resolução" },
  { area: "Ouvidoria", sprint: 1, titulo: "Gestão de Reclamações", descricao: "Reclame aqui, PROCON, consumidor.gov.br e relacionamento externo." },
  { area: "Ouvidoria", sprint: 2, titulo: "Criação do manual interno de ouvidoria e definição de fluxo" },
  { area: "Ouvidoria", sprint: 3, titulo: "Implementação do setor de Qualidade e Ouvidoria", descricao: "Controles de qualidade e estruturação da ouvidoria interna." },
  { area: "Compliance", sprint: 2, titulo: "Elaboração de todas as políticas internas", descricao: "Código de Conduta, detecção e investigação de fraudes." },
  { area: "Compliance", sprint: 3, titulo: "Canal de denúncias e política de proteção de dados (LGPD)" },
  { area: "Compliance", sprint: 4, titulo: "Treinamento interno sobre conformidade e proteção de dados" },
  { area: "Compliance", sprint: 5, titulo: "Auditoria dos canais de denúncia e sistemas utilizados" },
  { area: "Jurídico", sprint: 2, titulo: "Estruturação do modelo de PSL Judicial", descricao: "Classificação: Provável 100%, Possível 50%, Remoto 0%." },
  { area: "Jurídico", sprint: 3, titulo: "Levantamento de risco e passivo jurídico" },
  { area: "Jurídico", sprint: 4, titulo: "Definição de adequação do passivo aos limites aceitáveis" },
  { area: "Auditoria Interna", sprint: 2, titulo: "Auditoria de sinistros pagos (amostragem)", descricao: "Revisão retroativa dos últimos 12 meses buscando padrões de fraude." },
  { area: "Auditoria Interna", sprint: 5, titulo: "Auditoria periódica, relatórios" },
  { area: "Controle Financeiro", sprint: 1, titulo: "Plano de contas e controle de custos de eventos", descricao: "Estruturação do plano de contas adequado." },
  { area: "KPIs", sprint: 1, titulo: "Levantamento dos indicadores de Gestão e sinistralidade" },
  { area: "KPIs", sprint: 2, titulo: "Monitoramento e definição de Stop Loss de sinistralidade" },
  { area: "KPIs", sprint: 3, titulo: "Monitoramento e correção" },
  { area: "KPIs", sprint: 4, titulo: "Monitoramento e correção" },
  { area: "Rede Credenciada", sprint: 1, titulo: "Mapeamento de rede credenciada" },
  { area: "Rede Credenciada", sprint: 2, titulo: "Due diligence, contratos e qualidade de parceiros" },
  { area: "Rede Credenciada", sprint: 3, titulo: "Contratos padronizados com SLA", descricao: "Prazo de atendimento, qualidade e critérios de descredenciamento." },
  { area: "Rede Credenciada", sprint: 5, titulo: "Auditoria semestral da rede", descricao: "Revisão dos indicadores de qualidade. Descredenciamento de parceiros abaixo da meta." },
  { area: "Departamentos e Setores", sprint: 1, titulo: "Mapeamento de fluxos de processos e boas práticas" },
  { area: "Departamentos e Setores", sprint: 2, titulo: "Criação do POP de procedimentos internos" },
  { area: "Departamentos e Setores", sprint: 3, titulo: "Fluxo de regulação, critérios de cobertura, SLA de pagamento", descricao: "Programa estruturado de detecção de fraude." },
  { area: "Departamentos e Setores", sprint: 4, titulo: "Programa de treinamentos, onboarding" },
  { area: "Departamentos e Setores", sprint: 5, titulo: "Apuração e auditoria de procedimento interno" },
];

interface Tarefa {
  id: string;
  programa_id: string;
  area: string;
  sprint: number;
  titulo: string;
  descricao: string | null;
  status: string;
  responsavel: string | null;
  observacoes: string | null;
  ordem: number;
}

interface Programa {
  id: string;
  corretora_id: string;
  nome: string;
  status: string;
}

type ViewMode = "kanban" | "matrix" | "board";
type GroupBy = "sprint" | "status" | "area";

export default function PPR() {
  const { user } = useAuth();
  const [associacoes, setAssociacoes] = useState<{ id: string; nome: string }[]>([]);
  const [selectedAssociacao, setSelectedAssociacao] = useState("");
  const [programa, setPrograma] = useState<Programa | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTask, setEditTask] = useState<Tarefa | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({ area: AREAS_PPR[0], sprint: 1, titulo: "", descricao: "", responsavel: "" });
  const [isNew, setIsNew] = useState(false);
  const [view, setView] = useState<ViewMode>("kanban");
  const [groupBy, setGroupBy] = useState<GroupBy>("sprint");
  const [search, setSearch] = useState("");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("corretoras").select("id, nome").order("nome").then(({ data }) => {
      if (data) {
        setAssociacoes(data);
        if (data.length > 0) setSelectedAssociacao(data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedAssociacao) return;
    setLoading(true);
    loadPrograma();
  }, [selectedAssociacao]);

  async function loadPrograma() {
    const { data: progs } = await supabase
      .from("ppr_programas")
      .select("*")
      .eq("corretora_id", selectedAssociacao)
      .limit(1);

    if (progs && progs.length > 0) {
      setPrograma(progs[0] as Programa);
      const { data: tasks } = await supabase
        .from("ppr_tarefas")
        .select("*")
        .eq("programa_id", progs[0].id)
        .order("ordem")
        .order("area");
      setTarefas((tasks || []) as Tarefa[]);
    } else {
      setPrograma(null);
      setTarefas([]);
    }
    setLoading(false);
  }

  async function criarPrograma() {
    const { data, error } = await supabase
      .from("ppr_programas")
      .insert({ corretora_id: selectedAssociacao, created_by: user?.id })
      .select()
      .single();

    if (error || !data) {
      toast.error("Erro ao criar programa");
      return;
    }

    const tasksToInsert = DEFAULT_TASKS.map((t, i) => ({
      programa_id: data.id,
      area: t.area,
      sprint: t.sprint,
      titulo: t.titulo,
      descricao: t.descricao || null,
      status: "pendente",
      ordem: i,
    }));

    await supabase.from("ppr_tarefas").insert(tasksToInsert);
    toast.success("Programa PPR criado com tarefas do modelo!");
    loadPrograma();
  }

  async function toggleStatus(tarefa: Tarefa) {
    const order = ["pendente", "em_andamento", "concluido"];
    const next = order[(order.indexOf(tarefa.status) + 1) % order.length];
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, status: next } : t));
    await supabase.from("ppr_tarefas").update({ status: next }).eq("id", tarefa.id);
  }

  async function updateTaskField(id: string, fields: Partial<Tarefa>) {
    setTarefas(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
    await supabase.from("ppr_tarefas").update(fields).eq("id", id);
  }

  async function salvarTarefa() {
    if (!programa) return;
    if (isNew) {
      await supabase.from("ppr_tarefas").insert({
        programa_id: programa.id,
        area: newTask.area,
        sprint: newTask.sprint,
        titulo: newTask.titulo,
        descricao: newTask.descricao || null,
        responsavel: newTask.responsavel || null,
        ordem: tarefas.length,
      });
      toast.success("Tarefa adicionada");
    } else if (editTask) {
      await supabase.from("ppr_tarefas").update({
        titulo: editTask.titulo,
        descricao: editTask.descricao,
        responsavel: editTask.responsavel,
        observacoes: editTask.observacoes,
        area: editTask.area,
        sprint: editTask.sprint,
        status: editTask.status,
      }).eq("id", editTask.id);
      toast.success("Tarefa atualizada");
    }
    setDialogOpen(false);
    loadPrograma();
  }

  async function deletarTarefa(id: string) {
    await supabase.from("ppr_tarefas").delete().eq("id", id);
    setTarefas(prev => prev.filter(t => t.id !== id));
    toast.success("Tarefa removida");
  }

  // ----- Filters -----
  const filteredTarefas = tarefas.filter(t => {
    const matchSearch = !search || t.titulo.toLowerCase().includes(search.toLowerCase()) || (t.descricao || "").toLowerCase().includes(search.toLowerCase());
    const matchArea = filterArea === "all" || t.area === filterArea;
    return matchSearch && matchArea;
  });

  // ----- Stats -----
  const total = tarefas.length;
  const concluidas = tarefas.filter(t => t.status === "concluido").length;
  const emAndamento = tarefas.filter(t => t.status === "em_andamento").length;
  const pendentes = tarefas.filter(t => t.status === "pendente").length;
  const progressoGeral = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  function getAreaProgress(area: string) {
    const areaTasks = tarefas.filter(t => t.area === area);
    if (areaTasks.length === 0) return 0;
    return Math.round((areaTasks.filter(t => t.status === "concluido").length / areaTasks.length) * 100);
  }

  // ----- Drag & Drop helpers -----
  function handleDragStart(id: string) { setDraggedId(id); }
  function handleDragEnd() { setDraggedId(null); }

  async function handleDrop(target: { sprint?: number; status?: string; area?: string }) {
    if (!draggedId) return;
    const task = tarefas.find(t => t.id === draggedId);
    if (!task) return;
    const updates: Partial<Tarefa> = {};
    if (target.sprint !== undefined && target.sprint !== task.sprint) updates.sprint = target.sprint;
    if (target.status && target.status !== task.status) updates.status = target.status;
    if (target.area && target.area !== task.area) updates.area = target.area;
    if (Object.keys(updates).length > 0) {
      await updateTaskField(draggedId, updates);
    }
    setDraggedId(null);
  }

  // ----- Kanban groupings -----
  const kanbanColumns = (() => {
    if (groupBy === "sprint") {
      return SPRINTS.map(s => ({
        key: String(s.id),
        label: s.label,
        color: s.color,
        target: { sprint: s.id },
        tasks: filteredTarefas.filter(t => t.sprint === s.id),
      }));
    }
    if (groupBy === "status") {
      return Object.entries(STATUS_CONFIG).map(([k, cfg]) => ({
        key: k,
        label: cfg.label,
        color: k === "concluido" ? "hsl(142 76% 36%)" : k === "em_andamento" ? "hsl(40 96% 55%)" : "hsl(220 9% 46%)",
        target: { status: k },
        tasks: filteredTarefas.filter(t => t.status === k),
      }));
    }
    return AREAS_PPR.map(a => ({
      key: a,
      label: a,
      color: AREA_COLORS[a] || "hsl(220 85% 55%)",
      target: { area: a },
      tasks: filteredTarefas.filter(t => t.area === a),
    }));
  })();

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Hero header */}
      <div className="rounded-3xl border border-border/50 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 backdrop-blur">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center shadow-sm">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">PPR · Programa Preparatório</h1>
              <p className="text-sm text-muted-foreground">Gerencie sprints, áreas e tarefas no estilo board moderno</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedAssociacao} onValueChange={setSelectedAssociacao}>
              <SelectTrigger className="w-56 h-10 text-sm rounded-2xl bg-background/80 backdrop-blur">
                <Building2 className="h-4 w-4 mr-1 opacity-60" />
                <SelectValue placeholder="Selecione associação..." />
              </SelectTrigger>
              <SelectContent>
                {associacoes.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">Carregando...</div>
      ) : !programa ? (
        <Card className="p-12 text-center space-y-4 rounded-3xl border-dashed">
          <Building2 className="h-16 w-16 mx-auto text-muted-foreground/40" />
          <h2 className="text-xl font-semibold">Nenhum programa PPR encontrado</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Crie o programa para esta associação com as tarefas padrão do modelo de regulamentação.
          </p>
          <Button onClick={criarPrograma} className="gap-2 rounded-2xl">
            <Plus className="h-4 w-4" /> Criar Programa PPR
          </Button>
        </Card>
      ) : (
        <>
          {/* KPI widgets */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4 rounded-2xl bg-muted/40 backdrop-blur border-border/50">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">Total de tarefas</p>
                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-3xl font-bold mt-2">{total}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{AREAS_PPR.length} áreas · 6 sprints</p>
            </Card>
            <Card className="p-4 rounded-2xl bg-muted/40 backdrop-blur border-border/50">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">Concluídas</p>
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
              </div>
              <p className="text-3xl font-bold mt-2 text-emerald-600">{concluidas}</p>
              <Progress value={total ? (concluidas / total) * 100 : 0} className="h-1.5 mt-2" />
            </Card>
            <Card className="p-4 rounded-2xl bg-muted/40 backdrop-blur border-border/50">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">Em andamento</p>
                <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
              </div>
              <p className="text-3xl font-bold mt-2 text-amber-600">{emAndamento}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{pendentes} pendentes</p>
            </Card>
            <Card className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">Progresso geral</p>
                <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-3xl font-bold mt-2 text-primary">{progressoGeral}%</p>
              <Progress value={progressoGeral} className="h-1.5 mt-2" />
            </Card>
          </div>

          {/* Toolbar */}
          <Card className="p-3 rounded-2xl bg-muted/40 backdrop-blur border-border/50">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              {/* View switcher */}
              <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
                <TabsList className="rounded-xl bg-background/80">
                  <TabsTrigger value="kanban" className="rounded-lg gap-1.5"><KanbanSquare className="h-3.5 w-3.5" />Kanban</TabsTrigger>
                  <TabsTrigger value="board" className="rounded-lg gap-1.5"><LayoutGrid className="h-3.5 w-3.5" />Board</TabsTrigger>
                  <TabsTrigger value="matrix" className="rounded-lg gap-1.5"><Rows3 className="h-3.5 w-3.5" />Matriz</TabsTrigger>
                </TabsList>
              </Tabs>

              {view === "kanban" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Agrupar:</span>
                  <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
                    <SelectTrigger className="h-8 w-32 rounded-xl text-xs bg-background/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sprint">Sprint</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                      <SelectItem value="area">Área</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex-1 flex flex-col sm:flex-row gap-2 lg:justify-end">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar tarefa..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="h-9 pl-8 rounded-xl bg-background/80 text-sm"
                  />
                </div>
                <Select value={filterArea} onValueChange={setFilterArea}>
                  <SelectTrigger className="h-9 w-44 rounded-xl bg-background/80 text-sm">
                    <Filter className="h-3.5 w-3.5 mr-1 opacity-60" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as áreas</SelectItem>
                    {AREAS_PPR.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={loadPrograma} className="gap-1 rounded-xl h-9">
                  <RefreshCw className="h-3.5 w-3.5" /> Atualizar
                </Button>
                <Button size="sm" onClick={() => { setIsNew(true); setEditTask(null); setNewTask({ area: AREAS_PPR[0], sprint: 1, titulo: "", descricao: "", responsavel: "" }); setDialogOpen(true); }} className="gap-1 rounded-xl h-9">
                  <Plus className="h-3.5 w-3.5" /> Nova tarefa
                </Button>
              </div>
            </div>
          </Card>

          {/* KANBAN VIEW (ClickUp-inspired) */}
          {view === "kanban" && (
            <div className="overflow-x-auto pb-4 -mx-2 px-2">
              <div className="flex gap-4" style={{ minWidth: `${kanbanColumns.length * 320}px` }}>
                {kanbanColumns.map(col => {
                  const isDropTarget = draggedId !== null;
                  return (
                  <div
                    key={col.key}
                    className={cn(
                      "w-[300px] flex-shrink-0 flex flex-col rounded-2xl border overflow-hidden transition-all",
                      "bg-background border-border/50",
                      isDropTarget && "border-dashed"
                    )}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-2","ring-primary/40","bg-primary/5"); }}
                    onDragLeave={e => { e.currentTarget.classList.remove("ring-2","ring-primary/40","bg-primary/5"); }}
                    onDrop={(e) => { e.currentTarget.classList.remove("ring-2","ring-primary/40","bg-primary/5"); handleDrop(col.target as any); }}
                  >
                    <div
                      className="px-4 py-3 flex items-center justify-between border-b border-border/40 bg-background/50"
                      style={{ borderTop: `3px solid ${col.color}` }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                        <h3 className="font-semibold text-sm">{col.label}</h3>
                        <Badge variant="secondary" className="rounded-md text-[10px] h-5 px-1.5">{col.tasks.length}</Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-lg"
                        onClick={() => {
                          setIsNew(true); setEditTask(null);
                          setNewTask({
                            area: groupBy === "area" ? col.key : AREAS_PPR[0],
                            sprint: groupBy === "sprint" ? Number(col.key) : 1,
                            titulo: "", descricao: "", responsavel: "",
                          });
                          setDialogOpen(true);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="flex-1 p-2 space-y-2 min-h-[400px] max-h-[calc(100vh-380px)] overflow-y-auto">
                      {col.tasks.length === 0 && (
                        <div className="text-center text-xs text-muted-foreground py-8 italic">Sem tarefas</div>
                      )}
                      {col.tasks.map(task => {
                        const cfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente;
                        const Icon = cfg.icon;
                        const areaColor = AREA_COLORS[task.area] || "hsl(220 85% 55%)";
                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={() => handleDragStart(task.id)}
                            onDragEnd={handleDragEnd}
                            className={cn(
                              "group relative bg-background rounded-xl p-3 border border-border/50 cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:-translate-y-0.5",
                              draggedId === task.id && "opacity-40"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <button
                                onClick={() => toggleStatus(task)}
                                className={cn("h-5 w-5 rounded-full ring-1 flex items-center justify-center shrink-0 transition-colors", cfg.ring, cfg.bg)}
                              >
                                <Icon className={cn("h-3 w-3", cfg.color)} />
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-snug text-foreground line-clamp-3">{task.titulo}</p>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditTask(task); setIsNew(false); setDialogOpen(true); }}
                                  className="p-1 rounded-lg hover:bg-muted"
                                >
                                  <Pencil className="h-3 w-3 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deletarTarefa(task.id); }}
                                  className="p-1 rounded-lg hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </button>
                              </div>
                            </div>

                            {task.descricao && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{task.descricao}</p>
                            )}

                            <div className="flex items-center justify-between gap-1.5 flex-wrap">
                              <div className="flex items-center gap-1 flex-wrap">
                                {groupBy !== "area" && (
                                  <Badge
                                    variant="outline"
                                    className="rounded-md text-[10px] h-5 px-1.5 font-medium border-0"
                                    style={{ backgroundColor: `${areaColor}20`, color: areaColor }}
                                  >
                                    {task.area}
                                  </Badge>
                                )}
                                {groupBy !== "sprint" && (
                                  <Badge variant="secondary" className="rounded-md text-[10px] h-5 px-1.5">
                                    {SPRINTS.find(s => s.id === task.sprint)?.label}
                                  </Badge>
                                )}
                              </div>
                              {task.responsavel && (
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                                    <UserIcon className="h-3 w-3 text-primary" />
                                  </div>
                                  <span className="truncate max-w-[80px]">{task.responsavel}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BOARD VIEW (área cards w/ progress) */}
          {view === "board" && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {AREAS_PPR.filter(a => filterArea === "all" || filterArea === a).map(area => {
                const areaTasks = filteredTarefas.filter(t => t.area === area);
                const areaProgress = getAreaProgress(area);
                const color = AREA_COLORS[area] || "hsl(220 85% 55%)";
                return (
                  <Card key={area} className="rounded-2xl bg-muted/40 backdrop-blur border-border/50 overflow-hidden">
                    <div className="p-4 border-b border-border/40" style={{ borderTop: `3px solid ${color}` }}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-sm">{area}</h3>
                        <Badge variant="secondary" className="rounded-md text-[10px]">{areaTasks.length}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={areaProgress} className="h-1.5 flex-1" />
                        <span className="text-xs font-semibold tabular-nums" style={{ color }}>{areaProgress}%</span>
                      </div>
                    </div>
                    <div className="p-3 space-y-1.5 max-h-[300px] overflow-y-auto">
                      {areaTasks.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">Sem tarefas</p>}
                      {areaTasks.map(task => {
                        const cfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente;
                        const Icon = cfg.icon;
                        return (
                          <div
                            key={task.id}
                            className="flex items-start gap-2 p-2 rounded-xl hover:bg-background/80 cursor-pointer group"
                            onClick={() => { setEditTask(task); setIsNew(false); setDialogOpen(true); }}
                          >
                            <button onClick={(e) => { e.stopPropagation(); toggleStatus(task); }} className="shrink-0 mt-0.5">
                              <Icon className={cn("h-4 w-4", cfg.color)} />
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-xs leading-snug", task.status === "concluido" && "line-through text-muted-foreground")}>{task.titulo}</p>
                              <Badge variant="outline" className="rounded-md text-[9px] h-4 px-1 mt-1">
                                {SPRINTS.find(s => s.id === task.sprint)?.label}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* MATRIX VIEW (original grid) */}
          {view === "matrix" && (
            <Card className="rounded-2xl overflow-hidden border bg-muted/40 backdrop-blur border-border/50">
              <div className="overflow-x-auto">
                <div className="min-w-[1000px]">
                  <div className="grid border-b bg-background/50" style={{ gridTemplateColumns: "220px repeat(6, 1fr)" }}>
                    <div className="text-xs font-semibold text-muted-foreground p-3 uppercase tracking-wider">Área</div>
                    {SPRINTS.map(s => (
                      <div key={s.id} className="text-xs font-semibold text-center text-muted-foreground p-3 uppercase tracking-wider border-l border-border/40">
                        {s.label}
                      </div>
                    ))}
                  </div>
                  {AREAS_PPR.map((area, idx) => {
                    const areaProgress = getAreaProgress(area);
                    return (
                      <div
                        key={area}
                        className={`grid border-b last:border-b-0 ${idx % 2 === 0 ? "bg-background/30" : "bg-muted/10"}`}
                        style={{ gridTemplateColumns: "220px repeat(6, 1fr)" }}
                      >
                        <div className="flex flex-col justify-center p-3 border-r border-border/30">
                          <span className="text-sm font-medium">{area}</span>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Progress value={areaProgress} className="h-1.5 flex-1" />
                            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{areaProgress}%</span>
                          </div>
                        </div>
                        {SPRINTS.map(sprint => {
                          const cellTasks = filteredTarefas.filter(t => t.area === area && t.sprint === sprint.id);
                          return (
                            <div
                              key={sprint.id}
                              className="min-h-[72px] p-2 border-l border-border/20 flex flex-col gap-1.5"
                              onDragOver={e => e.preventDefault()}
                              onDrop={() => handleDrop({ sprint: sprint.id, area })}
                            >
                              {cellTasks.map(task => {
                                const cfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente;
                                const Icon = cfg.icon;
                                return (
                                  <div
                                    key={task.id}
                                    draggable
                                    onDragStart={() => handleDragStart(task.id)}
                                    onDragEnd={handleDragEnd}
                                    className={cn(
                                      "group relative p-2 rounded-xl text-xs leading-snug cursor-pointer transition-all hover:shadow-md border border-border/30",
                                      cfg.bg,
                                      draggedId === task.id && "opacity-40"
                                    )}
                                    onClick={() => toggleStatus(task)}
                                  >
                                    <div className="flex items-start gap-1.5">
                                      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", cfg.color)} />
                                      <span className="line-clamp-3">{task.titulo}</span>
                                    </div>
                                    {task.responsavel && (
                                      <span className="text-[10px] text-muted-foreground block mt-1 ml-5">{task.responsavel}</span>
                                    )}
                                    <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
                                      <button onClick={(e) => { e.stopPropagation(); setEditTask(task); setIsNew(false); setDialogOpen(true); }} className="p-1 rounded-lg bg-background shadow-sm hover:bg-muted">
                                        <Pencil className="h-3 w-3 text-muted-foreground" />
                                      </button>
                                      <button onClick={(e) => { e.stopPropagation(); deletarTarefa(task.id); }} className="p-1 rounded-lg bg-background shadow-sm hover:bg-destructive/10">
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1.5"><Circle className="h-3.5 w-3.5" /> Pendente</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-amber-600" /> Em Andamento</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Concluído</span>
            <span className="ml-auto italic">Arraste cards entre colunas · Clique no ícone para alternar status</span>
          </div>
        </>
      )}

      {/* Edit / New Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "Nova Tarefa" : "Editar Tarefa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Área</label>
                <Select
                  value={isNew ? newTask.area : (editTask?.area || AREAS_PPR[0])}
                  onValueChange={v => isNew ? setNewTask(p => ({ ...p, area: v })) : setEditTask(p => p ? { ...p, area: v } : p)}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AREAS_PPR.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Sprint</label>
                <Select
                  value={String(isNew ? newTask.sprint : (editTask?.sprint ?? 1))}
                  onValueChange={v => isNew ? setNewTask(p => ({ ...p, sprint: Number(v) })) : setEditTask(p => p ? { ...p, sprint: Number(v) } : p)}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPRINTS.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!isNew && editTask && (
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={editTask.status} onValueChange={v => setEditTask(p => p ? { ...p, status: v } : p)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, cfg]) => <SelectItem key={k} value={k}>{cfg.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Título</label>
              <Input
                className="rounded-xl"
                value={isNew ? newTask.titulo : (editTask?.titulo || "")}
                onChange={e => isNew ? setNewTask(p => ({ ...p, titulo: e.target.value })) : setEditTask(p => p ? { ...p, titulo: e.target.value } : p)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea
                className="rounded-xl"
                value={isNew ? newTask.descricao : (editTask?.descricao || "")}
                onChange={e => isNew ? setNewTask(p => ({ ...p, descricao: e.target.value })) : setEditTask(p => p ? { ...p, descricao: e.target.value } : p)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Responsável</label>
              <Input
                className="rounded-xl"
                value={isNew ? newTask.responsavel : (editTask?.responsavel || "")}
                onChange={e => isNew ? setNewTask(p => ({ ...p, responsavel: e.target.value })) : setEditTask(p => p ? { ...p, responsavel: e.target.value } : p)}
              />
            </div>
            {!isNew && (
              <div>
                <label className="text-sm font-medium">Observações</label>
                <Textarea
                  className="rounded-xl"
                  value={editTask?.observacoes || ""}
                  onChange={e => setEditTask(p => p ? { ...p, observacoes: e.target.value } : p)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={salvarTarefa} className="rounded-xl">{isNew ? "Adicionar" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
