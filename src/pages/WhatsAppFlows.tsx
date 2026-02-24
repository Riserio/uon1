import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  Bot, Plus, Trash2, Edit, ArrowRight, ArrowDown, MessageSquare, UserCheck, StopCircle,
  Zap, Variable, HelpCircle, Save, ListChecks, FileBarChart, ShieldX, GripVertical,
  ChevronRight, Copy, Eye, Play, AlertCircle, CheckCircle2, Settings2
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Flow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  priority: number;
  trigger_type: string;
  trigger_config: any;
  created_at: string;
}

interface FlowStep {
  id: string;
  flow_id: string;
  step_key: string;
  step_order: number;
  type: string;
  config: any;
  next_step_key: string | null;
}

const STEP_TYPES = [
  { value: 'send_text', label: 'Enviar Texto', icon: MessageSquare, color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20', desc: 'Envia uma mensagem de texto' },
  { value: 'ask_input', label: 'Pergunta Aberta', icon: HelpCircle, color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20', desc: 'Aguarda resposta em texto livre' },
  { value: 'ask_options', label: 'Pergunta com Opções', icon: ListChecks, color: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20', desc: 'Até 3 opções numeradas com desvio' },
  { value: 'request_report', label: 'Enviar Relatório', icon: FileBarChart, color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', desc: 'Gera e envia relatório automaticamente' },
  { value: 'deny_unauthorized', label: 'Negar Acesso', icon: ShieldX, color: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20', desc: 'Bloqueia números não autorizados' },
  { value: 'transfer_human', label: 'Transferir p/ Humano', icon: UserCheck, color: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20', desc: 'Ativa modo de atendimento humano' },
  { value: 'set_variable', label: 'Definir Variável', icon: Variable, color: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20', desc: 'Salva valor em uma variável' },
  { value: 'end', label: 'Encerrar Fluxo', icon: StopCircle, color: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/20', desc: 'Finaliza o fluxo de automação' },
];

const TRIGGER_TYPES = [
  { value: 'keyword', label: 'Palavra-chave', desc: 'Acionado quando mensagem contém palavra' },
  { value: 'first_message', label: 'Primeira mensagem', desc: 'Acionado no primeiro contato' },
  { value: 'all', label: 'Todas as mensagens', desc: 'Acionado em qualquer mensagem' },
  { value: 'manual', label: 'Manual', desc: 'Acionado apenas manualmente' },
];

const REPORT_TYPES = [
  { value: 'cobranca', label: 'Relatório de Cobrança' },
  { value: 'eventos', label: 'Relatório de Eventos' },
  { value: 'mgf', label: 'Relatório MGF' },
];

const AVAILABLE_VARIABLES = [
  { name: 'nome', description: 'Nome do contato' },
  { name: 'telefone', description: 'Telefone do contato' },
  { name: 'mensagem', description: 'Última mensagem recebida' },
  { name: 'data_atual', description: 'Data atual (DD/MM/AAAA)' },
  { name: 'hora_atual', description: 'Hora atual (HH:MM)' },
];

interface OptionEntry {
  label: string;
  next_step_key: string;
}

export default function WhatsAppFlowEditor({ embedded }: { embedded?: boolean }) {
  const { user } = useAuth();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditFlowDialog, setShowEditFlowDialog] = useState(false);
  const [editingFlowData, setEditingFlowData] = useState<Flow | null>(null);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');
  const [newFlowTrigger, setNewFlowTrigger] = useState('keyword');
  const [newFlowKeywords, setNewFlowKeywords] = useState('');
  const [editingStep, setEditingStep] = useState<FlowStep | null>(null);
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [showVariablesInfo, setShowVariablesInfo] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Step form state
  const [stepType, setStepType] = useState('send_text');
  const [stepMessage, setStepMessage] = useState('');
  const [stepVariableName, setStepVariableName] = useState('');
  const [stepNextKey, setStepNextKey] = useState('');
  const [stepOptions, setStepOptions] = useState<OptionEntry[]>([
    { label: '', next_step_key: '' },
  ]);
  const [stepReportType, setStepReportType] = useState('cobranca');
  const [stepDenyMessage, setStepDenyMessage] = useState('⚠️ Você não tem permissão para solicitar relatórios. Entre em contato com sua associação para liberação.');

  useEffect(() => { loadFlows(); }, []);

  const loadFlows = async () => {
    const { data } = await supabase
      .from('whatsapp_flows')
      .select('*')
      .order('priority', { ascending: false });
    if (data) setFlows(data as Flow[]);
  };

  const loadSteps = async (flowId: string) => {
    const { data } = await supabase
      .from('whatsapp_flow_steps')
      .select('*')
      .eq('flow_id', flowId)
      .order('step_order', { ascending: true });
    if (data) setSteps(data as FlowStep[]);
  };

  const handleSelectFlow = (flow: Flow) => {
    setSelectedFlow(flow);
    loadSteps(flow.id);
  };

  const handleCreateFlow = async () => {
    if (!newFlowName.trim()) return;
    const triggerConfig: any = {};
    if (newFlowTrigger === 'keyword') {
      triggerConfig.keywords = newFlowKeywords.split(',').map(k => k.trim()).filter(Boolean);
    }

    const { error } = await supabase.from('whatsapp_flows').insert({
      name: newFlowName,
      description: newFlowDescription || null,
      trigger_type: newFlowTrigger,
      trigger_config: triggerConfig,
      created_by: user?.id,
    });

    if (error) { toast.error('Erro ao criar fluxo'); return; }
    toast.success('Fluxo criado com sucesso!');
    setShowCreateDialog(false);
    setNewFlowName('');
    setNewFlowDescription('');
    setNewFlowKeywords('');
    loadFlows();
  };

  const handleToggleFlow = async (flow: Flow) => {
    await supabase.from('whatsapp_flows').update({ is_active: !flow.is_active }).eq('id', flow.id);
    loadFlows();
    if (selectedFlow?.id === flow.id) {
      setSelectedFlow({ ...flow, is_active: !flow.is_active });
    }
  };

  const handleDeleteFlow = async (flowId: string) => {
    if (!confirm('Excluir este fluxo e todos os seus passos?')) return;
    await supabase.from('whatsapp_flow_steps').delete().eq('flow_id', flowId);
    await supabase.from('whatsapp_flows').delete().eq('id', flowId);
    toast.success('Fluxo excluído');
    if (selectedFlow?.id === flowId) {
      setSelectedFlow(null);
      setSteps([]);
    }
    loadFlows();
  };

  const handleDuplicateFlow = async (flow: Flow) => {
    const { data: newFlow, error } = await supabase.from('whatsapp_flows').insert({
      name: `${flow.name} (cópia)`,
      description: flow.description,
      trigger_type: flow.trigger_type,
      trigger_config: flow.trigger_config,
      is_active: false,
      priority: flow.priority,
      created_by: user?.id,
    }).select().single();

    if (error || !newFlow) { toast.error('Erro ao duplicar'); return; }

    // Duplicate steps
    const { data: origSteps } = await supabase
      .from('whatsapp_flow_steps')
      .select('*')
      .eq('flow_id', flow.id)
      .order('step_order');

    if (origSteps && origSteps.length > 0) {
      const newSteps = origSteps.map(s => ({
        flow_id: (newFlow as any).id,
        step_key: s.step_key,
        step_order: s.step_order,
        type: s.type,
        config: s.config,
        next_step_key: s.next_step_key,
      }));
      await supabase.from('whatsapp_flow_steps').insert(newSteps);
    }

    toast.success('Fluxo duplicado');
    loadFlows();
  };

  const openEditFlowDialog = (flow: Flow) => {
    setEditingFlowData(flow);
    setNewFlowName(flow.name);
    setNewFlowDescription(flow.description || '');
    setNewFlowTrigger(flow.trigger_type);
    setNewFlowKeywords(flow.trigger_config?.keywords?.join(', ') || '');
    setShowEditFlowDialog(true);
  };

  const handleUpdateFlow = async () => {
    if (!editingFlowData || !newFlowName.trim()) return;
    const triggerConfig: any = {};
    if (newFlowTrigger === 'keyword') {
      triggerConfig.keywords = newFlowKeywords.split(',').map(k => k.trim()).filter(Boolean);
    }
    const { error } = await supabase.from('whatsapp_flows').update({
      name: newFlowName,
      description: newFlowDescription || null,
      trigger_type: newFlowTrigger,
      trigger_config: triggerConfig,
    }).eq('id', editingFlowData.id);
    if (error) { toast.error('Erro ao atualizar fluxo'); return; }
    toast.success('Fluxo atualizado!');
    setShowEditFlowDialog(false);
    setEditingFlowData(null);
    loadFlows();
    if (selectedFlow?.id === editingFlowData.id) {
      setSelectedFlow({ ...editingFlowData, name: newFlowName, description: newFlowDescription || null, trigger_type: newFlowTrigger, trigger_config: triggerConfig });
    }
  };

  const openStepDialog = (step?: FlowStep) => {
    if (step) {
      setEditingStep(step);
      setStepType(step.type);
      setStepMessage(step.config?.message || '');
      setStepVariableName(step.config?.variable_name || '');
      setStepNextKey(step.next_step_key || '');
      setStepOptions(step.config?.options?.length > 0
        ? step.config.options
        : [{ label: '', next_step_key: '' }]);
      setStepReportType(step.config?.report_type || 'cobranca');
      setStepDenyMessage(step.config?.deny_message || '⚠️ Você não tem permissão para solicitar relatórios. Entre em contato com sua associação para liberação.');
    } else {
      setEditingStep(null);
      setStepType('send_text');
      setStepMessage('');
      setStepVariableName('');
      setStepNextKey('');
      setStepOptions([{ label: '', next_step_key: '' }]);
      setStepReportType('cobranca');
      setStepDenyMessage('⚠️ Você não tem permissão para solicitar relatórios. Entre em contato com sua associação para liberação.');
    }
    setShowStepDialog(true);
  };

  const handleSaveStep = async () => {
    if (!selectedFlow) return;
    const config: any = {};

    if (['send_text', 'ask_input', 'ask_options', 'end', 'transfer_human'].includes(stepType)) {
      config.message = stepMessage;
    }
    if (['ask_input', 'set_variable'].includes(stepType)) {
      config.variable_name = stepVariableName;
    }
    if (stepType === 'set_variable') {
      config.value = stepMessage;
    }
    if (stepType === 'ask_options') {
      config.options = stepOptions.filter(o => o.label.trim());
      config.variable_name = stepVariableName || 'opcao_selecionada';
      if (config.options.length === 0) {
        toast.error('Adicione pelo menos uma opção');
        return;
      }
    }
    if (stepType === 'request_report') {
      config.report_type = stepReportType;
      config.message = stepMessage || `📊 Gerando relatório de ${REPORT_TYPES.find(r => r.value === stepReportType)?.label}...`;
      config.deny_message = stepDenyMessage;
    }
    if (stepType === 'deny_unauthorized') {
      config.message = stepDenyMessage;
    }

    if (editingStep) {
      const { error } = await supabase.from('whatsapp_flow_steps').update({
        type: stepType,
        config,
        next_step_key: stepType === 'ask_options' ? null : (stepNextKey || null),
      }).eq('id', editingStep.id);
      if (error) { toast.error('Erro ao atualizar passo'); return; }
    } else {
      const stepKey = `step_${Date.now()}`;
      const order = steps.length;
      const { error } = await supabase.from('whatsapp_flow_steps').insert({
        flow_id: selectedFlow.id,
        step_key: stepKey,
        step_order: order,
        type: stepType,
        config,
        next_step_key: stepType === 'ask_options' ? null : (stepNextKey || null),
      });
      if (error) { toast.error('Erro ao criar passo'); return; }

      // Auto-link previous step
      if (steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        if (!lastStep.next_step_key && lastStep.type !== 'ask_options') {
          await supabase.from('whatsapp_flow_steps').update({ next_step_key: stepKey }).eq('id', lastStep.id);
        }
      }
    }

    toast.success(editingStep ? 'Passo atualizado!' : 'Passo adicionado!');
    setShowStepDialog(false);
    loadSteps(selectedFlow.id);
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!selectedFlow) return;
    if (!confirm('Excluir este passo?')) return;
    await supabase.from('whatsapp_flow_steps').delete().eq('id', stepId);
    toast.success('Passo excluído');
    loadSteps(selectedFlow.id);
  };

  const getStepTypeInfo = (type: string) => STEP_TYPES.find(s => s.value === type) || STEP_TYPES[0];

  const addOption = () => {
    if (stepOptions.length >= 3) return;
    setStepOptions([...stepOptions, { label: '', next_step_key: '' }]);
  };

  const removeOption = (idx: number) => {
    if (stepOptions.length <= 1) return;
    setStepOptions(stepOptions.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, field: keyof OptionEntry, value: string) => {
    const updated = [...stepOptions];
    updated[idx] = { ...updated[idx], [field]: value };
    setStepOptions(updated);
  };

  const getStepLabel = (stepKey: string) => {
    const step = steps.find(s => s.step_key === stepKey);
    if (!step) return stepKey;
    const idx = steps.indexOf(step);
    return `#${idx + 1} ${getStepTypeInfo(step.type).label}`;
  };

  // Build preview conversation
  const buildPreview = () => {
    if (steps.length === 0) return [];
    const preview: { type: 'bot' | 'user'; text: string }[] = [];
    const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);
    
    for (const step of sortedSteps) {
      if (step.type === 'send_text' || step.type === 'end') {
        preview.push({ type: 'bot', text: step.config?.message || '(sem mensagem)' });
      } else if (step.type === 'ask_input') {
        preview.push({ type: 'bot', text: step.config?.message || '(pergunta)' });
        preview.push({ type: 'user', text: `[resposta salva em {${step.config?.variable_name || 'resposta'}}]` });
      } else if (step.type === 'ask_options') {
        let msg = step.config?.message || '(opções)';
        const opts = step.config?.options || [];
        if (opts.length > 0) {
          msg += '\n';
          opts.forEach((o: OptionEntry, i: number) => { msg += `\n${i + 1}. ${o.label}`; });
        }
        preview.push({ type: 'bot', text: msg });
        preview.push({ type: 'user', text: `[usuário escolhe 1-${opts.length}]` });
      } else if (step.type === 'request_report') {
        preview.push({ type: 'bot', text: step.config?.message || '📊 Gerando relatório...' });
      } else if (step.type === 'deny_unauthorized') {
        preview.push({ type: 'bot', text: `🔒 ${step.config?.message || 'Acesso negado'}` });
      } else if (step.type === 'transfer_human') {
        preview.push({ type: 'bot', text: step.config?.message || '🧑‍💼 Transferindo para atendente...' });
      }
    }
    return preview;
  };

  return (
    <TooltipProvider>
      <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
        {/* Header */}
        <div className="flex items-center justify-between">
          {!embedded && (
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bot className="h-6 w-6 text-primary" />
                Automação de Fluxos
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Crie fluxos inteligentes com perguntas, opções, relatórios automáticos e controle de acesso
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2 shadow-sm"><Plus className="h-4 w-4" /> Novo Fluxo</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    Criar Novo Fluxo
                  </DialogTitle>
                  <DialogDescription>Configure o gatilho e nome do fluxo de automação</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label>Nome do fluxo</Label>
                    <Input value={newFlowName} onChange={e => setNewFlowName(e.target.value)} placeholder="Ex: Boas-vindas, Menu Principal" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descrição (opcional)</Label>
                    <Input value={newFlowDescription} onChange={e => setNewFlowDescription(e.target.value)} placeholder="Fluxo de atendimento inicial..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Gatilho</Label>
                    <Select value={newFlowTrigger} onValueChange={setNewFlowTrigger}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRIGGER_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>
                            <div>
                              <span>{t.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {TRIGGER_TYPES.find(t => t.value === newFlowTrigger)?.desc}
                    </p>
                  </div>
                  {newFlowTrigger === 'keyword' && (
                    <div className="space-y-1.5">
                      <Label>Palavras-chave (separadas por vírgula)</Label>
                      <Input value={newFlowKeywords} onChange={e => setNewFlowKeywords(e.target.value)} placeholder="relatório, cobrança, menu" />
                    </div>
                  )}
                </div>
                <DialogFooter className="pt-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
                  <Button onClick={handleCreateFlow} className="gap-2" disabled={!newFlowName.trim()}>
                    <Plus className="h-4 w-4" /> Criar Fluxo
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Flow list - narrower */}
          <Card className="lg:col-span-4 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Fluxos
              </CardTitle>
              <CardDescription>{flows.length} fluxo(s) configurado(s)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[65vh]">
                {flows.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    <Bot className="h-12 w-12 mx-auto mb-3 opacity-15" />
                    <p className="font-medium">Nenhum fluxo criado</p>
                    <p className="text-xs mt-1">Crie seu primeiro fluxo de automação</p>
                  </div>
                )}
                {flows.map(flow => (
                  <div
                    key={flow.id}
                    onClick={() => handleSelectFlow(flow)}
                    className={`p-4 border-b border-border/30 cursor-pointer hover:bg-accent/40 transition-all ${
                      selectedFlow?.id === flow.id 
                        ? 'bg-primary/5 border-l-[3px] border-l-primary' 
                        : 'border-l-[3px] border-l-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block truncate">{flow.name}</span>
                        {flow.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{flow.description}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] font-normal h-5">
                            {TRIGGER_TYPES.find(t => t.value === flow.trigger_type)?.label}
                          </Badge>
                          {flow.trigger_type === 'keyword' && flow.trigger_config?.keywords?.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] h-5">
                              {flow.trigger_config.keywords.length} palavra(s)
                            </Badge>
                          )}
                          {flow.is_active ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] border-emerald-500/20 h-5">
                              <CheckCircle2 className="h-3 w-3 mr-0.5" /> Ativo
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] h-5">Inativo</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Switch
                          checked={flow.is_active}
                          onCheckedChange={() => handleToggleFlow(flow)}
                          onClick={e => e.stopPropagation()}
                          className="scale-75"
                        />
                      </div>
                    </div>
                    {/* Actions row */}
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/20">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEditFlowDialog(flow); }}>
                            <Edit className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleDuplicateFlow(flow); }}>
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Duplicar</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleDeleteFlow(flow.id); }}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Excluir</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Step editor - wider */}
          <Card className="lg:col-span-8 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {selectedFlow ? (
                      <>
                        <Settings2 className="h-4 w-4 text-primary" />
                        {selectedFlow.name}
                      </>
                    ) : (
                      <>
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                        Selecione um fluxo
                      </>
                    )}
                  </CardTitle>
                  {selectedFlow && (
                    <CardDescription>
                      {steps.length} passo(s) configurado(s) • Arraste para reordenar
                    </CardDescription>
                  )}
                </div>
                {selectedFlow && (
                  <div className="flex gap-2">
                    {steps.length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => setShowPreview(true)} className="gap-1.5">
                        <Eye className="h-4 w-4" /> Pré-visualizar
                      </Button>
                    )}
                    <Button size="sm" onClick={() => openStepDialog()} className="gap-1.5 shadow-sm">
                      <Plus className="h-4 w-4" /> Novo Passo
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedFlow ? (
                <div className="text-center py-20 text-muted-foreground">
                  <Zap className="h-16 w-16 mx-auto mb-4 opacity-10" />
                  <p className="font-medium text-base">Selecione um fluxo para editar</p>
                  <p className="text-xs mt-1.5">Ou crie um novo fluxo para começar</p>
                </div>
              ) : steps.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  <ListChecks className="h-16 w-16 mx-auto mb-4 opacity-10" />
                  <p className="font-medium text-base mb-1">Nenhum passo configurado</p>
                  <p className="text-xs text-muted-foreground mb-4">Adicione passos para construir o fluxo de automação</p>
                  <Button variant="outline" onClick={() => openStepDialog()} className="gap-2">
                    <Plus className="h-4 w-4" /> Adicionar primeiro passo
                  </Button>
                </div>
              ) : (
                <ScrollArea className="max-h-[60vh]">
                  <div className="space-y-0 pr-2">
                    {steps.map((step, idx) => {
                      const info = getStepTypeInfo(step.type);
                      const Icon = info.icon;
                      const hasOptions = step.type === 'ask_options' && step.config?.options?.length > 0;

                      return (
                        <div key={step.id}>
                          <div className="flex items-stretch gap-3 group">
                            {/* Timeline */}
                            <div className="flex flex-col items-center pt-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border ${info.color}`}>
                                {idx + 1}
                              </div>
                              {idx < steps.length - 1 && (
                                <div className="flex-1 w-px bg-border/50 mt-1 min-h-[8px]" />
                              )}
                            </div>

                            {/* Step card */}
                            <div className="flex-1 border border-border/50 rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all mb-2 group/card">
                              <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-lg shrink-0 ${info.color} border`}>
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm">{info.label}</span>
                                    <span className="text-[10px] text-muted-foreground">{info.desc}</span>
                                  </div>
                                  {step.config?.message && (
                                    <div className="mt-2 p-2.5 bg-muted/40 rounded-lg border border-border/30">
                                      <p className="text-xs text-foreground/80 whitespace-pre-wrap line-clamp-3">
                                        {step.config.message}
                                      </p>
                                    </div>
                                  )}
                                  {/* Options display */}
                                  {hasOptions && (
                                    <div className="mt-2 space-y-1">
                                      {step.config.options.map((opt: OptionEntry, oi: number) => (
                                        <div key={oi} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-border/20">
                                          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                            {oi + 1}
                                          </div>
                                          <span className="text-xs flex-1">{opt.label}</span>
                                          {opt.next_step_key && (
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                              <ArrowRight className="h-3 w-3" />
                                              {getStepLabel(opt.next_step_key)}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {/* Report type badge */}
                                  {step.type === 'request_report' && step.config?.report_type && (
                                    <div className="mt-2 flex items-center gap-2">
                                      <Badge variant="outline" className="text-[10px] font-normal gap-1 border-emerald-500/30 text-emerald-600">
                                        <FileBarChart className="h-3 w-3" />
                                        {REPORT_TYPES.find(r => r.value === step.config.report_type)?.label}
                                      </Badge>
                                      <Badge variant="outline" className="text-[10px] font-normal gap-1 border-amber-500/30 text-amber-600">
                                        <ShieldX className="h-3 w-3" /> Verifica autorização
                                      </Badge>
                                    </div>
                                  )}
                                  {/* Variable name badge */}
                                  {step.config?.variable_name && ['ask_input', 'ask_options', 'set_variable'].includes(step.type) && (
                                    <Badge variant="outline" className="text-[10px] font-normal mt-2 gap-1">
                                      <Variable className="h-3 w-3" />
                                      {`{${step.config.variable_name}}`}
                                    </Badge>
                                  )}
                                </div>
                                {/* Actions */}
                                <div className="flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openStepDialog(step)}>
                                        <Edit className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Editar</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteStep(step.id)}>
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Excluir</TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>

                              {/* Next step indicator */}
                              {step.next_step_key && (
                                <div className="mt-3 pt-2 border-t border-border/20">
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <ArrowRight className="h-3 w-3" />
                                    Próximo: {getStepLabel(step.next_step_key)}
                                  </span>
                                </div>
                              )}
                              {!step.next_step_key && step.type !== 'ask_options' && step.type !== 'end' && (
                                <div className="mt-3 pt-2 border-t border-border/20">
                                  <span className="text-[10px] text-amber-500 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Sem próximo passo (fluxo encerra aqui)
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview Dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Pré-visualização do Fluxo
              </DialogTitle>
              <DialogDescription>Simulação da conversa pelo WhatsApp</DialogDescription>
            </DialogHeader>
            <div className="bg-[#0b141a] rounded-xl p-4 space-y-2 max-h-[50vh] overflow-y-auto">
              {buildPreview().map((msg, i) => (
                <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap ${
                    msg.type === 'user'
                      ? 'bg-[#005c4b] text-white rounded-br-sm'
                      : 'bg-[#202c33] text-gray-100 rounded-bl-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {buildPreview().length === 0 && (
                <p className="text-center text-gray-500 text-xs py-4">Nenhum passo configurado</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Step Dialog */}
        <Dialog open={showStepDialog} onOpenChange={setShowStepDialog}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingStep ? <Edit className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
                {editingStep ? 'Editar Passo' : 'Novo Passo'}
              </DialogTitle>
              <DialogDescription>Configure o tipo e conteúdo do passo</DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 max-h-[60vh] pr-4">
            <div className="space-y-5 pt-2">
              {/* Step type selection with cards */}
              <div className="space-y-2">
                <Label className="font-medium">Tipo do passo</Label>
                <div className="grid grid-cols-2 gap-2">
                  {STEP_TYPES.map(t => {
                    const Icon = t.icon;
                    const isSelected = stepType === t.value;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setStepType(t.value)}
                        className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border/50 hover:border-border hover:bg-muted/30'
                        }`}
                      >
                        <div className={`p-1.5 rounded-md ${t.color} border`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <span className={`text-xs font-medium block ${isSelected ? 'text-primary' : ''}`}>{t.label}</span>
                          <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Message field */}
              {['send_text', 'ask_input', 'ask_options', 'end', 'transfer_human'].includes(stepType) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">
                      {stepType === 'ask_input' || stepType === 'ask_options' ? 'Pergunta' : 'Mensagem'}
                    </Label>
                    <Dialog open={showVariablesInfo} onOpenChange={setShowVariablesInfo}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground">
                          <Variable className="h-3 w-3" /> Variáveis
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader>
                          <DialogTitle className="text-sm">Variáveis disponíveis</DialogTitle>
                          <DialogDescription>Use no texto para personalizar mensagens</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Use <code className="bg-muted px-1 rounded">{'{variavel}'}</code> no texto.
                          </p>
                          <div className="border rounded-lg divide-y">
                            {AVAILABLE_VARIABLES.map(v => (
                              <div key={v.name} className="flex items-center justify-between p-2.5 text-sm">
                                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{`{${v.name}}`}</code>
                                <span className="text-xs text-muted-foreground">{v.description}</span>
                              </div>
                            ))}
                            {steps.filter(s => s.config?.variable_name).map(s => (
                              <div key={s.id} className="flex items-center justify-between p-2.5 text-sm">
                                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{`{${s.config.variable_name}}`}</code>
                                <span className="text-xs text-muted-foreground">Passo #{steps.indexOf(s) + 1}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Textarea
                    value={stepMessage}
                    onChange={e => setStepMessage(e.target.value)}
                    placeholder={
                      stepType === 'ask_options'
                        ? 'Qual relatório você deseja?\n\nDigite o número da opção:'
                        : stepType === 'ask_input'
                          ? 'Qual seu nome completo?'
                          : 'Olá, {nome}! Bem-vindo...'
                    }
                    rows={3}
                    className="resize-none"
                  />
                </div>
              )}

              {/* Options for ask_options */}
              {stepType === 'ask_options' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">Opções de resposta</Label>
                    {stepOptions.length < 3 && (
                      <Button variant="outline" size="sm" onClick={addOption} className="h-7 text-xs gap-1">
                        <Plus className="h-3 w-3" /> Adicionar
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {stepOptions.map((opt, idx) => (
                      <div key={idx} className="p-3 bg-muted/30 rounded-lg border border-border/40 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <Input
                            value={opt.label}
                            onChange={e => updateOption(idx, 'label', e.target.value)}
                            placeholder={`Opção ${idx + 1} (ex: Relatório de Cobrança)`}
                            className="flex-1 h-8 text-sm"
                          />
                          {stepOptions.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeOption(idx)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-8">
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <Select
                            value={opt.next_step_key || '__none__'}
                            onValueChange={v => updateOption(idx, 'next_step_key', v === '__none__' ? '' : v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Próximo passo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Encerrar fluxo</SelectItem>
                              {steps.filter(s => s.id !== editingStep?.id).map((s) => (
                                <SelectItem key={s.step_key} value={s.step_key}>
                                  #{steps.indexOf(s) + 1} {getStepTypeInfo(s.type).label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    O contato responde com o número (1, 2 ou 3) e o fluxo desvia automaticamente.
                  </p>
                </div>
              )}

              {/* Report type */}
              {stepType === 'request_report' && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Apenas números cadastrados em CONFIG → Números de Destino podem solicitar relatórios.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-medium">Tipo de relatório</Label>
                    <Select value={stepReportType} onValueChange={setStepReportType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REPORT_TYPES.map(r => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-medium">Mensagem de confirmação</Label>
                    <Textarea
                      value={stepMessage}
                      onChange={e => setStepMessage(e.target.value)}
                      placeholder="📊 Gerando relatório..."
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-medium">Mensagem para número não autorizado</Label>
                    <Textarea
                      value={stepDenyMessage}
                      onChange={e => setStepDenyMessage(e.target.value)}
                      placeholder="⚠️ Número não autorizado..."
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Deny unauthorized */}
              {stepType === 'deny_unauthorized' && (
                <div className="space-y-3">
                  <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                    <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                      <ShieldX className="h-3.5 w-3.5" />
                      Enviado quando o número não está em CONFIG → Números de Destino.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-medium">Mensagem de recusa</Label>
                    <Textarea
                      value={stepDenyMessage}
                      onChange={e => setStepDenyMessage(e.target.value)}
                      placeholder="⚠️ Você não tem permissão..."
                      rows={3}
                      className="resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Variable name */}
              {['ask_input', 'set_variable', 'ask_options'].includes(stepType) && (
                <div className="space-y-1.5">
                  <Label className="font-medium">Nome da variável</Label>
                  <Input
                    value={stepVariableName}
                    onChange={e => setStepVariableName(e.target.value)}
                    placeholder={stepType === 'ask_options' ? 'opcao_selecionada' : 'nome_cliente'}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    A resposta será salva em <code className="bg-muted px-1 rounded">{`{${stepVariableName || 'variavel'}}`}</code> para uso posterior.
                  </p>
                </div>
              )}

              {/* Next step (not for ask_options) */}
              {stepType !== 'ask_options' && (
                <div className="space-y-1.5">
                  <Label className="font-medium">Próximo passo</Label>
                  <Select value={stepNextKey || '__none__'} onValueChange={(v) => setStepNextKey(v === '__none__' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Nenhum (encerrar)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum (encerrar fluxo)</SelectItem>
                      {steps.filter(s => s.id !== editingStep?.id).map((s) => (
                        <SelectItem key={s.step_key} value={s.step_key}>
                          #{steps.indexOf(s) + 1} {getStepTypeInfo(s.type).label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            </ScrollArea>
            <DialogFooter className="pt-4 shrink-0">
              <Button variant="outline" onClick={() => setShowStepDialog(false)}>Cancelar</Button>
              <Button onClick={handleSaveStep} className="gap-2 shadow-sm"><Save className="h-4 w-4" /> Salvar Passo</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Flow Dialog */}
        <Dialog open={showEditFlowDialog} onOpenChange={setShowEditFlowDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-primary" />
                Editar Fluxo
              </DialogTitle>
              <DialogDescription>Altere as configurações do fluxo de automação</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Nome do fluxo</Label>
                <Input value={newFlowName} onChange={e => setNewFlowName(e.target.value)} placeholder="Ex: Boas-vindas, Menu Principal" />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição (opcional)</Label>
                <Input value={newFlowDescription} onChange={e => setNewFlowDescription(e.target.value)} placeholder="Fluxo de atendimento inicial..." />
              </div>
              <div className="space-y-1.5">
                <Label>Gatilho</Label>
                <Select value={newFlowTrigger} onValueChange={setNewFlowTrigger}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <span>{t.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {TRIGGER_TYPES.find(t => t.value === newFlowTrigger)?.desc}
                </p>
              </div>
              {newFlowTrigger === 'keyword' && (
                <div className="space-y-1.5">
                  <Label>Palavras-chave (separadas por vírgula)</Label>
                  <Input value={newFlowKeywords} onChange={e => setNewFlowKeywords(e.target.value)} placeholder="relatório, cobrança, menu" />
                </div>
              )}
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setShowEditFlowDialog(false)}>Cancelar</Button>
              <Button onClick={handleUpdateFlow} className="gap-2" disabled={!newFlowName.trim()}>
                <Save className="h-4 w-4" /> Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
