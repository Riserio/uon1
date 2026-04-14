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
import { 
  CheckCircle2, Circle, Clock, Plus, Pencil, Trash2, 
  ChevronRight, BarChart3, Building2, RefreshCw
} from "lucide-react";

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

const SPRINTS = [
  { id: 0, label: "START" },
  { id: 1, label: "Sprint 1" },
  { id: 2, label: "Sprint 2" },
  { id: 3, label: "Sprint 3" },
  { id: 4, label: "Sprint 4" },
  { id: 5, label: "Sprint 5" },
];

const STATUS_CONFIG = {
  pendente: { label: "Pendente", icon: Circle, color: "text-muted-foreground", bg: "bg-muted/40" },
  em_andamento: { label: "Em Andamento", icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
  concluido: { label: "Concluído", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
};

// Default tasks from the PDF
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

  // Load associations
  useEffect(() => {
    supabase.from("corretoras").select("id, nome").order("nome").then(({ data }) => {
      if (data) {
        setAssociacoes(data);
        if (data.length > 0) setSelectedAssociacao(data[0].id);
      }
    });
  }, []);

  // Load program + tasks for selected association
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

    // Insert default tasks
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
    await supabase.from("ppr_tarefas").update({ status: next }).eq("id", tarefa.id);
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, status: next } : t));
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

  // Stats
  const total = tarefas.length;
  const concluidas = tarefas.filter(t => t.status === "concluido").length;
  const emAndamento = tarefas.filter(t => t.status === "em_andamento").length;
  const progressoGeral = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  function getAreaProgress(area: string) {
    const areaTasks = tarefas.filter(t => t.area === area);
    if (areaTasks.length === 0) return 0;
    return Math.round((areaTasks.filter(t => t.status === "concluido").length / areaTasks.length) * 100);
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">PPR - Programa Preparatório</h1>
            <p className="text-sm text-muted-foreground">Checklist de sprints para regulamentação</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedAssociacao} onValueChange={setSelectedAssociacao}>
            <SelectTrigger className="w-52 h-9 text-sm rounded-xl">
              <SelectValue placeholder="Selecione associação..." />
            </SelectTrigger>
            <SelectContent>
              {associacoes.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">Carregando...</div>
      ) : !programa ? (
        <Card className="p-12 text-center space-y-4 rounded-2xl">
          <Building2 className="h-16 w-16 mx-auto text-muted-foreground/40" />
          <h2 className="text-xl font-semibold">Nenhum programa PPR encontrado</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Crie o programa para esta associação com as tarefas padrão do modelo de regulamentação.
          </p>
          <Button onClick={criarPrograma} className="gap-2 rounded-xl">
            <Plus className="h-4 w-4" /> Criar Programa PPR
          </Button>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4 rounded-2xl">
              <p className="text-xs text-muted-foreground">Total de Tarefas</p>
              <p className="text-2xl font-bold">{total}</p>
            </Card>
            <Card className="p-4 rounded-2xl">
              <p className="text-xs text-muted-foreground">Concluídas</p>
              <p className="text-2xl font-bold text-emerald-600">{concluidas}</p>
            </Card>
            <Card className="p-4 rounded-2xl">
              <p className="text-xs text-muted-foreground">Em Andamento</p>
              <p className="text-2xl font-bold text-amber-600">{emAndamento}</p>
            </Card>
            <Card className="p-4 rounded-2xl">
              <p className="text-xs text-muted-foreground">Progresso Geral</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-primary">{progressoGeral}%</p>
              </div>
              <Progress value={progressoGeral} className="h-1.5 mt-1" />
            </Card>
          </div>

          {/* Add task + reload */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Checklist por Área e Sprint</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadPrograma} className="gap-1 rounded-xl">
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </Button>
              <Button size="sm" onClick={() => { setIsNew(true); setEditTask(null); setNewTask({ area: AREAS_PPR[0], sprint: 1, titulo: "", descricao: "", responsavel: "" }); setDialogOpen(true); }} className="gap-1 rounded-xl">
                <Plus className="h-3.5 w-3.5" /> Nova Tarefa
              </Button>
            </div>
          </div>

          {/* Sprint columns layout */}
          <Card className="rounded-2xl overflow-hidden border">
            <div className="overflow-x-auto">
              <div className="min-w-[1000px]">
                {/* Sticky header row */}
                <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: "220px repeat(6, 1fr)" }}>
                  <div className="text-xs font-semibold text-muted-foreground p-3 uppercase tracking-wider">Área</div>
                  {SPRINTS.map(s => (
                    <div key={s.id} className="text-xs font-semibold text-center text-muted-foreground p-3 uppercase tracking-wider border-l border-border/40">
                      {s.label}
                    </div>
                  ))}
                </div>

                {/* Area rows */}
                {AREAS_PPR.map((area, idx) => {
                  const areaProgress = getAreaProgress(area);
                  return (
                    <div
                      key={area}
                      className={`grid border-b last:border-b-0 transition-colors hover:bg-muted/5 ${idx % 2 === 0 ? "bg-background" : "bg-muted/10"}`}
                      style={{ gridTemplateColumns: "220px repeat(6, 1fr)" }}
                    >
                      {/* Area label */}
                      <div className="flex flex-col justify-center p-3 border-r border-border/30">
                        <span className="text-sm font-medium leading-tight">{area}</span>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Progress value={areaProgress} className="h-1.5 flex-1" />
                          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{areaProgress}%</span>
                        </div>
                      </div>

                      {/* Sprint cells */}
                      {SPRINTS.map(sprint => {
                        const cellTasks = tarefas.filter(t => t.area === area && t.sprint === sprint.id);
                        return (
                          <div key={sprint.id} className="min-h-[72px] p-2 border-l border-border/20 flex flex-col gap-1.5">
                            {cellTasks.map(task => {
                              const cfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente;
                              const Icon = cfg.icon;
                              return (
                                <div
                                  key={task.id}
                                  className={`group relative p-2 rounded-xl text-xs leading-snug cursor-pointer transition-all hover:shadow-md ${cfg.bg} border border-border/30 hover:border-border`}
                                  onClick={() => toggleStatus(task)}
                                >
                                  <div className="flex items-start gap-1.5">
                                    <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                                    <span className="line-clamp-3 text-foreground/90">{task.titulo}</span>
                                  </div>
                                  {task.responsavel && (
                                    <span className="text-[10px] text-muted-foreground block mt-1 ml-5">{task.responsavel}</span>
                                  )}
                                  {/* Edit/Delete on hover */}
                                  <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditTask(task); setIsNew(false); setDialogOpen(true); }}
                                      className="p-1 rounded-lg bg-background shadow-sm hover:bg-muted"
                                    >
                                      <Pencil className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); deletarTarefa(task.id); }}
                                      className="p-1 rounded-lg bg-background shadow-sm hover:bg-destructive/10"
                                    >
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

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1.5"><Circle className="h-3.5 w-3.5" /> Pendente</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-amber-600" /> Em Andamento</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Concluído</span>
            <span className="ml-auto italic">Clique na tarefa para alternar status</span>
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
            {isNew && (
              <>
                <div>
                  <label className="text-sm font-medium">Área</label>
                  <Select value={newTask.area} onValueChange={v => setNewTask(p => ({ ...p, area: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AREAS_PPR.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Sprint</label>
                  <Select value={String(newTask.sprint)} onValueChange={v => setNewTask(p => ({ ...p, sprint: Number(v) }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SPRINTS.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
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
