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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from '@/components/ui/dialog';
import {
  Bot, Plus, Trash2, Edit, ArrowRight, ArrowDown, MessageSquare, UserCheck, StopCircle,
  Zap, Variable, HelpCircle, Save, ListChecks, FileBarChart, ShieldX
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';

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
  { value: 'send_text', label: 'Enviar texto', icon: MessageSquare, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { value: 'ask_input', label: 'Perguntar (texto livre)', icon: HelpCircle, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { value: 'ask_options', label: 'Perguntar (opções)', icon: ListChecks, color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  { value: 'request_report', label: 'Enviar relatório', icon: FileBarChart, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { value: 'deny_unauthorized', label: 'Negar (sem permissão)', icon: ShieldX, color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  { value: 'transfer_human', label: 'Transferir humano', icon: UserCheck, color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  { value: 'set_variable', label: 'Definir variável', icon: Variable, color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  { value: 'end', label: 'Encerrar', icon: StopCircle, color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
];

const TRIGGER_TYPES = [
  { value: 'keyword', label: 'Palavra-chave' },
  { value: 'first_message', label: 'Primeira mensagem' },
  { value: 'all', label: 'Todas as mensagens' },
  { value: 'manual', label: 'Manual' },
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
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowTrigger, setNewFlowTrigger] = useState('keyword');
  const [newFlowKeywords, setNewFlowKeywords] = useState('');
  const [editingStep, setEditingStep] = useState<FlowStep | null>(null);
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [showVariablesInfo, setShowVariablesInfo] = useState(false);

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
      trigger_type: newFlowTrigger,
      trigger_config: triggerConfig,
      created_by: user?.id,
    });

    if (error) { toast.error('Erro ao criar fluxo'); return; }
    toast.success('Fluxo criado');
    setShowCreateDialog(false);
    setNewFlowName('');
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
    if (!confirm('Excluir este fluxo?')) return;
    await supabase.from('whatsapp_flows').delete().eq('id', flowId);
    toast.success('Fluxo excluído');
    if (selectedFlow?.id === flowId) {
      setSelectedFlow(null);
      setSteps([]);
    }
    loadFlows();
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
      await supabase.from('whatsapp_flow_steps').update({
        type: stepType,
        config,
        next_step_key: stepType === 'ask_options' ? null : (stepNextKey || null),
      }).eq('id', editingStep.id);
    } else {
      const stepKey = `step_${Date.now()}`;
      const order = steps.length;
      await supabase.from('whatsapp_flow_steps').insert({
        flow_id: selectedFlow.id,
        step_key: stepKey,
        step_order: order,
        type: stepType,
        config,
        next_step_key: stepType === 'ask_options' ? null : (stepNextKey || null),
      });

      if (steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        if (!lastStep.next_step_key && lastStep.type !== 'ask_options') {
          await supabase.from('whatsapp_flow_steps').update({ next_step_key: stepKey }).eq('id', lastStep.id);
        }
      }
    }

    toast.success(editingStep ? 'Passo atualizado' : 'Passo adicionado');
    setShowStepDialog(false);
    loadSteps(selectedFlow.id);
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!selectedFlow) return;
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

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      <div className="flex items-center justify-between">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              Fluxos de Automação
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure respostas automáticas, perguntas com opções e envio de relatórios
            </p>
          </div>
        )}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Novo Fluxo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Criar Novo Fluxo
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Nome do fluxo</Label>
                <Input value={newFlowName} onChange={e => setNewFlowName(e.target.value)} placeholder="Ex: Boas-vindas, Solicitação de Relatório" />
              </div>
              <div className="space-y-1.5">
                <Label>Gatilho</Label>
                <Select value={newFlowTrigger} onValueChange={setNewFlowTrigger}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Define quando o fluxo será acionado automaticamente</p>
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
              <Button onClick={handleCreateFlow} className="gap-2"><Plus className="h-4 w-4" /> Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Flow list */}
        <Card className="lg:col-span-1 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Fluxos
            </CardTitle>
            <CardDescription>{flows.length} fluxo(s) configurado(s)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[60vh]">
              {flows.length === 0 && (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  <Bot className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  Nenhum fluxo criado
                </div>
              )}
              {flows.map(flow => (
                <div
                  key={flow.id}
                  onClick={() => handleSelectFlow(flow)}
                  className={`p-4 border-b border-border/40 cursor-pointer hover:bg-accent/50 transition-colors ${selectedFlow?.id === flow.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{flow.name}</span>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={flow.is_active}
                        onCheckedChange={() => handleToggleFlow(flow)}
                        onClick={e => e.stopPropagation()}
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDeleteFlow(flow.id); }}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {TRIGGER_TYPES.find(t => t.value === flow.trigger_type)?.label}
                    </Badge>
                    {flow.is_active ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] border-emerald-500/20">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                    )}
                  </div>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Step editor */}
        <Card className="lg:col-span-2 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {selectedFlow ? (
                    <>
                      <Bot className="h-4 w-4 text-primary" />
                      {selectedFlow.name}
                    </>
                  ) : 'Selecione um fluxo'}
                </CardTitle>
                {selectedFlow && (
                  <CardDescription>
                    Configure os passos de automação • {steps.length} passo(s)
                  </CardDescription>
                )}
              </div>
              {selectedFlow && (
                <Button size="sm" onClick={() => openStepDialog()} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Novo Passo
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedFlow ? (
              <div className="text-center py-16 text-muted-foreground">
                <Zap className="h-14 w-14 mx-auto mb-4 opacity-10" />
                <p className="font-medium">Selecione um fluxo para editar</p>
                <p className="text-xs mt-1">Ou crie um novo fluxo para começar</p>
              </div>
            ) : steps.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ListChecks className="h-14 w-14 mx-auto mb-4 opacity-10" />
                <p className="font-medium mb-3">Nenhum passo configurado</p>
                <Button variant="outline" onClick={() => openStepDialog()} className="gap-2">
                  <Plus className="h-4 w-4" /> Adicionar primeiro passo
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {steps.map((step, idx) => {
                  const info = getStepTypeInfo(step.type);
                  const Icon = info.icon;
                  const hasOptions = step.type === 'ask_options' && step.config?.options?.length > 0;

                  return (
                    <div key={step.id}>
                      <div className="flex items-stretch gap-3 group">
                        {/* Step number indicator */}
                        <div className="flex flex-col items-center pt-4">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                            {idx + 1}
                          </div>
                          {idx < steps.length - 1 && (
                            <div className="flex-1 w-px bg-border/60 mt-1" />
                          )}
                        </div>

                        {/* Step card */}
                        <div className="flex-1 border border-border/50 rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all mb-2">
                          <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl ${info.color}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{info.label}</span>
                              </div>
                              {step.config?.message && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {step.config.message}
                                </p>
                              )}
                              {hasOptions && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {step.config.options.map((opt: OptionEntry, oi: number) => (
                                    <Badge key={oi} variant="outline" className="text-[10px] font-normal gap-1">
                                      {oi + 1}. {opt.label}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {step.type === 'request_report' && step.config?.report_type && (
                                <Badge variant="outline" className="text-[10px] font-normal mt-2 gap-1">
                                  <FileBarChart className="h-3 w-3" />
                                  {REPORT_TYPES.find(r => r.value === step.config.report_type)?.label}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openStepDialog(step)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteStep(step.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>

                          {/* Next step indicator */}
                          {step.next_step_key && (
                            <div className="mt-2 pt-2 border-t border-border/30">
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <ArrowRight className="h-3 w-3" />
                                Próximo: {steps.find(s => s.step_key === step.next_step_key)
                                  ? `#${steps.findIndex(s => s.step_key === step.next_step_key) + 1} ${getStepTypeInfo(steps.find(s => s.step_key === step.next_step_key)!.type).label}`
                                  : step.next_step_key}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Step dialog */}
      <Dialog open={showStepDialog} onOpenChange={setShowStepDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingStep ? <Edit className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
              {editingStep ? 'Editar Passo' : 'Novo Passo'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            {/* Step type */}
            <div className="space-y-1.5">
              <Label className="font-medium">Tipo do passo</Label>
              <Select value={stepType} onValueChange={setStepType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map(t => {
                    const Icon = t.icon;
                    return (
                      <SelectItem key={t.value} value={t.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {t.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Message field for applicable types */}
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
                      </DialogHeader>
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Use <code className="bg-muted px-1 rounded">{'{variavel}'}</code> no texto.
                        </p>
                        <div className="border rounded-md divide-y">
                          {AVAILABLE_VARIABLES.map(v => (
                            <div key={v.name} className="flex items-center justify-between p-2 text-sm">
                              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{`{${v.name}}`}</code>
                              <span className="text-xs text-muted-foreground">{v.description}</span>
                            </div>
                          ))}
                          {steps.filter(s => s.config?.variable_name).map(s => (
                            <div key={s.id} className="flex items-center justify-between p-2 text-sm">
                              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{`{${s.config.variable_name}}`}</code>
                              <span className="text-xs text-muted-foreground">Capturada no passo #{steps.indexOf(s) + 1}</span>
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
                        ? 'Qual seu nome?'
                        : 'Olá, {nome}! Bem-vindo...'
                  }
                  rows={3}
                />
              </div>
            )}

            {/* Options for ask_options */}
            {stepType === 'ask_options' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Opções de resposta (máx. 3)</Label>
                  {stepOptions.length < 3 && (
                    <Button variant="outline" size="sm" onClick={addOption} className="h-7 text-xs gap-1">
                      <Plus className="h-3 w-3" /> Opção
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {stepOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border/40">
                      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {idx + 1}
                      </div>
                      <Input
                        value={opt.label}
                        onChange={e => updateOption(idx, 'label', e.target.value)}
                        placeholder={`Opção ${idx + 1} (ex: Relatório de Cobrança)`}
                        className="flex-1"
                      />
                      <Select
                        value={opt.next_step_key || '__none__'}
                        onValueChange={v => updateOption(idx, 'next_step_key', v === '__none__' ? '' : v)}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Próximo passo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Encerrar</SelectItem>
                          {steps.filter(s => s.id !== editingStep?.id).map((s) => (
                            <SelectItem key={s.step_key} value={s.step_key}>
                              #{steps.indexOf(s) + 1} {getStepTypeInfo(s.type).label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {stepOptions.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeOption(idx)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  O contato responde com o número da opção (1, 2 ou 3) e o fluxo segue para o passo correspondente.
                </p>
              </div>
            )}

            {/* Report type for request_report */}
            {stepType === 'request_report' && (
              <div className="space-y-4">
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
                  <p className="text-xs text-muted-foreground">
                    O relatório será enviado apenas se o número estiver cadastrado em CONFIG → Números de Destino.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-medium">Mensagem de confirmação</Label>
                  <Textarea
                    value={stepMessage}
                    onChange={e => setStepMessage(e.target.value)}
                    placeholder="📊 Gerando relatório..."
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-medium">Mensagem para número não autorizado</Label>
                  <Textarea
                    value={stepDenyMessage}
                    onChange={e => setStepDenyMessage(e.target.value)}
                    placeholder="⚠️ Número não autorizado..."
                    rows={2}
                  />
                </div>
              </div>
            )}

            {/* Deny unauthorized message */}
            {stepType === 'deny_unauthorized' && (
              <div className="space-y-1.5">
                <Label className="font-medium">Mensagem de recusa</Label>
                <Textarea
                  value={stepDenyMessage}
                  onChange={e => setStepDenyMessage(e.target.value)}
                  placeholder="⚠️ Você não tem permissão..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Enviado quando o número não está cadastrado em Números de Destino.
                </p>
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
                />
                <p className="text-xs text-muted-foreground">
                  A resposta será salva nesta variável para uso em passos futuros.
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
                    <SelectItem value="__none__">Nenhum (encerrar)</SelectItem>
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
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setShowStepDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveStep} className="gap-2"><Save className="h-4 w-4" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
