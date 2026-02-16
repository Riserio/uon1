import { useState, useEffect } from 'react';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, GripVertical, RefreshCw, Eye, EyeOff, Workflow } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface FluxoConfig {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string;
  ordem: number;
  ativo: boolean;
  corretora_id: string;
}

interface StatusConfig {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
  corretora_id: string | null;
  fluxo_id: string | null;
}

// ─── Sortable Fluxo Item ───
function SortableFluxoItem({ fluxo, editingId, loading, onUpdate, onSave, onToggle, onDelete, setEditingId }: {
  fluxo: FluxoConfig; editingId: string | null; loading: boolean;
  onUpdate: (f: FluxoConfig) => void; onSave: (f: FluxoConfig) => void;
  onToggle: (f: FluxoConfig) => void; onDelete: (id: string) => void;
  setEditingId: (id: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fluxo.id });
  const style = { transform: CSS.Transform.toString(transform), transition: `${transition}, opacity 0.2s` };

  return (
    <div ref={setNodeRef} style={style} className="group">
      <div className={`relative p-4 rounded-xl border-2 transition-all ${
        fluxo.ativo ? 'bg-card border-border hover:border-primary/40 shadow-sm' : 'bg-muted/30 border-muted-foreground/20'
      } ${isDragging ? 'opacity-50 scale-[1.02] shadow-xl' : ''}`}>
        <div className="flex items-center gap-3">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1.5 rounded hover:bg-accent">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: fluxo.cor }} />
          <Input value={fluxo.nome} onChange={(e) => { onUpdate({ ...fluxo, nome: e.target.value }); setEditingId(fluxo.id); }}
            className="flex-1" placeholder="Nome do fluxo" />
          <Input value={fluxo.descricao || ''} onChange={(e) => { onUpdate({ ...fluxo, descricao: e.target.value }); setEditingId(fluxo.id); }}
            className="flex-1" placeholder="Descrição" />
          <div className="flex items-center gap-1.5">
            <Input type="color" value={fluxo.cor} onChange={(e) => { onUpdate({ ...fluxo, cor: e.target.value }); setEditingId(fluxo.id); }}
              className="h-8 w-12 cursor-pointer p-0.5" />
            <Button size="icon" variant="ghost" onClick={() => onToggle(fluxo)} className="h-8 w-8">
              {fluxo.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
            </Button>
            {editingId === fluxo.id && (
              <Button size="sm" onClick={() => onSave(fluxo)} disabled={loading}>Salvar</Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => onDelete(fluxo.id)} disabled={loading}
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable Status Item ───
function SortableStatusItem({ status, fluxos, editingId, loading, onUpdate, onSave, onToggle, onDelete, setEditingId, onFluxoChange }: {
  status: StatusConfig; fluxos: FluxoConfig[]; editingId: string | null; loading: boolean;
  onUpdate: (s: StatusConfig) => void; onSave: (s: StatusConfig) => void;
  onToggle: (s: StatusConfig) => void; onDelete: (id: string) => void;
  setEditingId: (id: string | null) => void; onFluxoChange: (statusId: string, fluxoId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: status.id });
  const style = { transform: CSS.Transform.toString(transform), transition: `${transition}, opacity 0.2s` };

  return (
    <div ref={setNodeRef} style={style} className="group">
      <div className={`relative p-4 rounded-xl border-2 transition-all ${
        status.ativo ? 'bg-card border-border hover:border-primary/40 shadow-sm' : 'bg-muted/30 border-muted-foreground/20'
      } ${isDragging ? 'opacity-50 scale-[1.02] shadow-xl' : ''}`}>
        <div className="flex items-center gap-3">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1.5 rounded hover:bg-accent">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: status.cor }} />
          <Input value={status.nome} onChange={(e) => { onUpdate({ ...status, nome: e.target.value }); setEditingId(status.id); }}
            className="flex-1 min-w-0" placeholder="Nome do status" />
          <Select value={status.fluxo_id || 'none'} onValueChange={(v) => onFluxoChange(status.id, v === 'none' ? null : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sem fluxo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem fluxo</SelectItem>
              {fluxos.filter(f => f.ativo).map(f => (
                <SelectItem key={f.id} value={f.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.cor }} />
                    {f.nome}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Input type="color" value={status.cor} onChange={(e) => { onUpdate({ ...status, cor: e.target.value }); setEditingId(status.id); }}
              className="h-8 w-12 cursor-pointer p-0.5" />
            <Button size="icon" variant="ghost" onClick={() => onToggle(status)} className="h-8 w-8">
              {status.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
            </Button>
            {editingId === status.id && (
              <Button size="sm" onClick={() => onSave(status)} disabled={loading}>Salvar</Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => onDelete(status.id)} disabled={loading}
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───
interface GestaoAssociacaoStatusConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: () => void;
  selectedCorretoraId?: string | null;
}

export function GestaoAssociacaoStatusConfig({ open, onOpenChange, onStatusChange, selectedCorretoraId }: GestaoAssociacaoStatusConfigProps) {
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  const [fluxos, setFluxos] = useState<FluxoConfig[]>([]);
  const [availableSituacoes, setAvailableSituacoes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [corretoras, setCorretoras] = useState<{ id: string; nome: string }[]>([]);
  const [configCorretoraId, setConfigCorretoraId] = useState<string | null>(selectedCorretoraId || null);
  const [activeConfigTab, setActiveConfigTab] = useState('fluxos');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (open) {
      loadCorretoras();
      if (selectedCorretoraId) setConfigCorretoraId(selectedCorretoraId);
    }
  }, [open, selectedCorretoraId]);

  useEffect(() => {
    if (open && configCorretoraId) loadData();
  }, [open, configCorretoraId]);

  const loadCorretoras = async () => {
    try {
      const { data, error } = await supabase.from('corretoras').select('id, nome').order('nome');
      if (error) throw error;
      setCorretoras(data || []);
    } catch (error) {
      console.error('Erro ao carregar associações:', error);
    }
  };

  const loadData = async () => {
    if (!configCorretoraId) return;
    try {
      const [configsRes, fluxosRes, situacoesRes] = await Promise.all([
        supabase.from('gestao_associacao_status_config').select('*').eq('corretora_id', configCorretoraId).order('ordem'),
        supabase.from('gestao_associacao_fluxos').select('*').eq('corretora_id', configCorretoraId).order('ordem'),
        supabase.from('sga_eventos').select('situacao_evento, sga_importacoes!inner(corretora_id, ativo)')
          .not('situacao_evento', 'is', null).eq('sga_importacoes.corretora_id', configCorretoraId).eq('sga_importacoes.ativo', true),
      ]);

      if (configsRes.error) throw configsRes.error;
      if (fluxosRes.error) throw fluxosRes.error;

      setStatuses((configsRes.data || []) as StatusConfig[]);
      setFluxos((fluxosRes.data || []) as FluxoConfig[]);

      const uniqueSituacoes = [...new Set((situacoesRes.data || []).map((s: any) => s.situacao_evento).filter(Boolean))] as string[];
      setAvailableSituacoes(uniqueSituacoes.sort());
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar configurações');
    }
  };

  // ─── Fluxo handlers ───
  const handleAddFluxo = async () => {
    if (!configCorretoraId) return;
    try {
      setLoading(true);
      const maxOrdem = Math.max(...fluxos.map(f => f.ordem), 0);
      const { data, error } = await supabase
        .from('gestao_associacao_fluxos')
        .insert({ nome: 'Novo Fluxo', cor: '#3b82f6', ordem: maxOrdem + 1, ativo: true, corretora_id: configCorretoraId })
        .select().single();
      if (error) throw error;
      setFluxos([...fluxos, data as FluxoConfig]);
      setEditingId(data.id);
      toast.success('Fluxo adicionado');
      onStatusChange();
    } catch (error) {
      toast.error('Erro ao adicionar fluxo');
    } finally { setLoading(false); }
  };

  const handleSaveFluxo = async (fluxo: FluxoConfig) => {
    try {
      setLoading(true);
      const { error } = await supabase.from('gestao_associacao_fluxos')
        .update({ nome: fluxo.nome, descricao: fluxo.descricao, cor: fluxo.cor }).eq('id', fluxo.id);
      if (error) throw error;
      setEditingId(null);
      toast.success('Fluxo salvo');
      onStatusChange();
    } catch { toast.error('Erro ao salvar fluxo'); }
    finally { setLoading(false); }
  };

  const handleToggleFluxo = async (fluxo: FluxoConfig) => {
    try {
      setLoading(true);
      const { error } = await supabase.from('gestao_associacao_fluxos').update({ ativo: !fluxo.ativo }).eq('id', fluxo.id);
      if (error) throw error;
      setFluxos(fluxos.map(f => f.id === fluxo.id ? { ...f, ativo: !f.ativo } : f));
      toast.success(`Fluxo ${!fluxo.ativo ? 'ativado' : 'desativado'}`);
      onStatusChange();
    } catch { toast.error('Erro ao alterar fluxo'); }
    finally { setLoading(false); }
  };

  const handleDeleteFluxo = async (id: string) => {
    if (!confirm('Excluir este fluxo? Os status associados perderão a vinculação.')) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('gestao_associacao_fluxos').delete().eq('id', id);
      if (error) throw error;
      setFluxos(fluxos.filter(f => f.id !== id));
      setStatuses(statuses.map(s => s.fluxo_id === id ? { ...s, fluxo_id: null } : s));
      toast.success('Fluxo excluído');
      onStatusChange();
    } catch { toast.error('Erro ao excluir fluxo'); }
    finally { setLoading(false); }
  };

  const handleFluxoDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fluxos.findIndex(f => f.id === active.id);
      const newIndex = fluxos.findIndex(f => f.id === over.id);
      const newFluxos = arrayMove(fluxos, oldIndex, newIndex).map((f, i) => ({ ...f, ordem: i + 1 }));
      setFluxos(newFluxos);
      try {
        await Promise.all(newFluxos.map(f => supabase.from('gestao_associacao_fluxos').update({ ordem: f.ordem }).eq('id', f.id)));
        toast.success('Ordem atualizada');
        onStatusChange();
      } catch { toast.error('Erro ao reordenar'); loadData(); }
    }
  };

  // ─── Status handlers ───
  const handleImportSituacao = async (nome: string) => {
    if (!configCorretoraId) return;
    if (statuses.some(s => s.nome === nome)) { toast.error('Este status já está configurado'); return; }
    try {
      setLoading(true);
      const maxOrdem = Math.max(...statuses.map(s => s.ordem), 0);
      const { data, error } = await supabase
        .from('gestao_associacao_status_config')
        .insert({ nome, cor: '#3b82f6', ordem: maxOrdem + 1, ativo: true, corretora_id: configCorretoraId })
        .select().single();
      if (error) throw error;
      setStatuses([...statuses, data as StatusConfig]);
      toast.success(`Status "${nome}" adicionado`);
      onStatusChange();
    } catch { toast.error('Erro ao adicionar status'); }
    finally { setLoading(false); }
  };

  const handleSaveStatus = async (status: StatusConfig) => {
    try {
      setLoading(true);
      const { error } = await supabase.from('gestao_associacao_status_config')
        .update({ nome: status.nome, cor: status.cor }).eq('id', status.id);
      if (error) throw error;
      setEditingId(null);
      toast.success('Salvo');
      onStatusChange();
    } catch { toast.error('Erro ao salvar'); }
    finally { setLoading(false); }
  };

  const handleToggleStatus = async (status: StatusConfig) => {
    try {
      setLoading(true);
      const { error } = await supabase.from('gestao_associacao_status_config').update({ ativo: !status.ativo }).eq('id', status.id);
      if (error) throw error;
      setStatuses(statuses.map(s => s.id === status.id ? { ...s, ativo: !s.ativo } : s));
      toast.success(`Status ${!status.ativo ? 'ativado' : 'desativado'}`);
      onStatusChange();
    } catch { toast.error('Erro ao alterar'); }
    finally { setLoading(false); }
  };

  const handleDeleteStatus = async (id: string) => {
    if (!confirm('Excluir este status?')) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('gestao_associacao_status_config').delete().eq('id', id);
      if (error) throw error;
      setStatuses(statuses.filter(s => s.id !== id));
      toast.success('Excluído');
      onStatusChange();
    } catch { toast.error('Erro ao excluir'); }
    finally { setLoading(false); }
  };

  const handleStatusFluxoChange = async (statusId: string, fluxoId: string | null) => {
    try {
      setLoading(true);
      const { error } = await supabase.from('gestao_associacao_status_config').update({ fluxo_id: fluxoId }).eq('id', statusId);
      if (error) throw error;
      setStatuses(statuses.map(s => s.id === statusId ? { ...s, fluxo_id: fluxoId } : s));
      toast.success('Fluxo do status atualizado');
      onStatusChange();
    } catch { toast.error('Erro ao vincular fluxo'); }
    finally { setLoading(false); }
  };

  const handleStatusDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = statuses.findIndex(s => s.id === active.id);
      const newIndex = statuses.findIndex(s => s.id === over.id);
      const newStatuses = arrayMove(statuses, oldIndex, newIndex).map((s, i) => ({ ...s, ordem: i + 1 }));
      setStatuses(newStatuses);
      try {
        await Promise.all(newStatuses.map(s => supabase.from('gestao_associacao_status_config').update({ ordem: s.ordem }).eq('id', s.id)));
        toast.success('Ordem atualizada');
        onStatusChange();
      } catch { toast.error('Erro ao reordenar'); loadData(); }
    }
  };

  const unconfiguredSituacoes = availableSituacoes.filter(s => !statuses.some(st => st.nome === s));

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-4xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Configurar Gestão Associação</DialogTitle>
          <DialogDescription>
            Configure fluxos e status por associação. Cada status deve pertencer a um fluxo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 gap-4">
          {/* Association selector */}
          <div className="space-y-2 flex-shrink-0">
            <Label className="text-sm font-medium">Associação</Label>
            <Select value={configCorretoraId || ''} onValueChange={(v) => setConfigCorretoraId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma associação" />
              </SelectTrigger>
              <SelectContent>
                {corretoras.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {configCorretoraId ? (
            <Tabs value={activeConfigTab} onValueChange={setActiveConfigTab} className="flex flex-col flex-1 min-h-0">
              <TabsList className="flex-shrink-0">
                <TabsTrigger value="fluxos" className="gap-2">
                  <Workflow className="h-4 w-4" />
                  Fluxos ({fluxos.length})
                </TabsTrigger>
                <TabsTrigger value="status">
                  Status ({statuses.length})
                </TabsTrigger>
              </TabsList>

              {/* ─── Fluxos Tab ─── */}
              <TabsContent value="fluxos" className="flex-1 min-h-0 flex flex-col gap-3 mt-3">
                <div className="flex-1 min-h-0 overflow-y-auto pr-2">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFluxoDragEnd}>
                    <SortableContext items={fluxos.map(f => f.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {fluxos.map(fluxo => (
                          <SortableFluxoItem
                            key={fluxo.id}
                            fluxo={fluxo}
                            editingId={editingId}
                            loading={loading}
                            onUpdate={(f) => setFluxos(fluxos.map(fl => fl.id === f.id ? f : fl))}
                            onSave={handleSaveFluxo}
                            onToggle={handleToggleFluxo}
                            onDelete={handleDeleteFluxo}
                            setEditingId={setEditingId}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
                <Button onClick={handleAddFluxo} disabled={loading} className="w-full flex-shrink-0">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Novo Fluxo
                </Button>
              </TabsContent>

              {/* ─── Status Tab ─── */}
              <TabsContent value="status" className="flex-1 min-h-0 flex flex-col gap-3 mt-3">
                {/* Unconfigured statuses from BI */}
                {unconfiguredSituacoes.length > 0 && (
                  <div className="space-y-2 flex-shrink-0">
                    <Label className="text-sm font-medium">Situações disponíveis no BI (clique para adicionar)</Label>
                    <div className="max-h-28 overflow-y-auto border rounded-md p-2">
                      <div className="flex flex-wrap gap-2">
                        {unconfiguredSituacoes.map(s => (
                          <Badge key={s} variant="outline"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                            onClick={() => handleImportSituacao(s)}>
                            <Plus className="h-3 w-3 mr-1" />{s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Configured statuses */}
                <div className="flex-1 min-h-0 overflow-y-auto pr-2">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStatusDragEnd}>
                    <SortableContext items={statuses.map(s => s.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {statuses.map(status => (
                          <SortableStatusItem
                            key={status.id}
                            status={status}
                            fluxos={fluxos}
                            editingId={editingId}
                            loading={loading}
                            onUpdate={(s) => setStatuses(statuses.map(st => st.id === s.id ? s : st))}
                            onSave={handleSaveStatus}
                            onToggle={handleToggleStatus}
                            onDelete={handleDeleteStatus}
                            setEditingId={setEditingId}
                            onFluxoChange={handleStatusFluxoChange}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>

                <Button variant="outline" onClick={loadData} disabled={loading} className="w-full flex-shrink-0">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recarregar situações do BI
                </Button>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Selecione uma associação para configurar.</p>
            </div>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
