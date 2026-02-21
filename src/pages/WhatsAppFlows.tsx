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
  Bot, Plus, Trash2, Edit, ArrowRight, MessageSquare, UserCheck, StopCircle,
  Zap, Variable, HelpCircle, GripVertical, Save
} from 'lucide-react';

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
  { value: 'send_text', label: 'Enviar texto', icon: MessageSquare, color: 'bg-blue-100 text-blue-800' },
  { value: 'ask_input', label: 'Perguntar', icon: HelpCircle, color: 'bg-amber-100 text-amber-800' },
  { value: 'transfer_human', label: 'Transferir humano', icon: UserCheck, color: 'bg-green-100 text-green-800' },
  { value: 'set_variable', label: 'Definir variável', icon: Variable, color: 'bg-purple-100 text-purple-800' },
  { value: 'end', label: 'Encerrar', icon: StopCircle, color: 'bg-red-100 text-red-800' },
];

const TRIGGER_TYPES = [
  { value: 'keyword', label: 'Palavra-chave' },
  { value: 'first_message', label: 'Primeira mensagem' },
  { value: 'all', label: 'Todas as mensagens' },
  { value: 'manual', label: 'Manual' },
];

export default function WhatsAppFlowEditor() {
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

  // Step form state
  const [stepType, setStepType] = useState('send_text');
  const [stepMessage, setStepMessage] = useState('');
  const [stepVariableName, setStepVariableName] = useState('');
  const [stepNextKey, setStepNextKey] = useState('');

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
    } else {
      setEditingStep(null);
      setStepType('send_text');
      setStepMessage('');
      setStepVariableName('');
      setStepNextKey('');
    }
    setShowStepDialog(true);
  };

  const handleSaveStep = async () => {
    if (!selectedFlow) return;
    const config: any = {};
    if (['send_text', 'ask_input', 'end', 'transfer_human'].includes(stepType)) {
      config.message = stepMessage;
    }
    if (['ask_input', 'set_variable'].includes(stepType)) {
      config.variable_name = stepVariableName;
    }
    if (stepType === 'set_variable') {
      config.value = stepMessage;
    }

    if (editingStep) {
      await supabase.from('whatsapp_flow_steps').update({
        type: stepType,
        config,
        next_step_key: stepNextKey || null,
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
        next_step_key: stepNextKey || null,
      });

      // Auto-link previous step
      if (steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        if (!lastStep.next_step_key) {
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Fluxos de Automação
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure respostas automáticas e chatbots para WhatsApp
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Novo Fluxo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Fluxo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome do fluxo</Label>
                <Input value={newFlowName} onChange={e => setNewFlowName(e.target.value)} placeholder="Ex: Boas-vindas" />
              </div>
              <div>
                <Label>Gatilho</Label>
                <Select value={newFlowTrigger} onValueChange={setNewFlowTrigger}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newFlowTrigger === 'keyword' && (
                <div>
                  <Label>Palavras-chave (separadas por vírgula)</Label>
                  <Input value={newFlowKeywords} onChange={e => setNewFlowKeywords(e.target.value)} placeholder="oi, olá, menu" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleCreateFlow}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Flow list */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Fluxos</CardTitle>
            <CardDescription>{flows.length} fluxo(s) configurado(s)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[60vh]">
              {flows.map(flow => (
                <div
                  key={flow.id}
                  onClick={() => handleSelectFlow(flow)}
                  className={`p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors ${selectedFlow?.id === flow.id ? 'bg-primary/10' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{flow.name}</span>
                    <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">
                      {TRIGGER_TYPES.find(t => t.value === flow.trigger_type)?.label}
                    </Badge>
                    {flow.is_active ? (
                      <Badge className="bg-green-100 text-green-800 text-[10px]">Ativo</Badge>
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
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {selectedFlow ? `Passos: ${selectedFlow.name}` : 'Selecione um fluxo'}
                </CardTitle>
                {selectedFlow && (
                  <CardDescription>
                    Configure os passos de automação deste fluxo
                  </CardDescription>
                )}
              </div>
              {selectedFlow && (
                <Button size="sm" onClick={() => openStepDialog()}>
                  <Plus className="h-4 w-4 mr-1" /> Passo
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedFlow ? (
              <div className="text-center py-12 text-muted-foreground">
                <Zap className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Selecione um fluxo para editar os passos</p>
              </div>
            ) : steps.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="mb-4">Nenhum passo configurado</p>
                <Button variant="outline" onClick={() => openStepDialog()}>
                  <Plus className="h-4 w-4 mr-2" /> Adicionar primeiro passo
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {steps.map((step, idx) => {
                  const info = getStepTypeInfo(step.type);
                  const Icon = info.icon;
                  return (
                    <div key={step.id} className="flex items-center gap-2">
                      <div className="flex-1 border rounded-lg p-3 flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${info.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{info.label}</span>
                            <Badge variant="outline" className="text-[10px]">{step.step_key}</Badge>
                          </div>
                          {step.config?.message && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {step.config.message}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openStepDialog(step)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteStep(step.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {idx < steps.length - 1 && (
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStep ? 'Editar Passo' : 'Novo Passo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <Select value={stepType} onValueChange={setStepType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {['send_text', 'ask_input', 'end', 'transfer_human'].includes(stepType) && (
              <div>
                <Label>{stepType === 'ask_input' ? 'Pergunta' : 'Mensagem'}</Label>
                <Textarea
                  value={stepMessage}
                  onChange={e => setStepMessage(e.target.value)}
                  placeholder={stepType === 'ask_input' ? 'Qual seu nome?' : 'Olá! Bem-vindo...'}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">Use {'{variavel}'} para inserir variáveis</p>
              </div>
            )}
            {['ask_input', 'set_variable'].includes(stepType) && (
              <div>
                <Label>Nome da variável</Label>
                <Input value={stepVariableName} onChange={e => setStepVariableName(e.target.value)} placeholder="nome_cliente" />
              </div>
            )}
            <div>
              <Label>Próximo passo (step_key)</Label>
              <Select value={stepNextKey} onValueChange={setStepNextKey}>
                <SelectTrigger><SelectValue placeholder="Nenhum (encerrar)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  {steps.filter(s => s.id !== editingStep?.id).map(s => (
                    <SelectItem key={s.step_key} value={s.step_key}>{s.step_key} ({getStepTypeInfo(s.type).label})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveStep}><Save className="h-4 w-4 mr-2" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
