import { useState, useEffect } from 'react';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, GripVertical, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
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

interface StatusConfig {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
}

interface SortableItemProps {
  status: StatusConfig;
  editingId: string | null;
  loading: boolean;
  onUpdate: (s: StatusConfig) => void;
  onSave: (s: StatusConfig) => void;
  onToggle: (s: StatusConfig) => void;
  onDelete: (id: string) => void;
  setEditingId: (id: string | null) => void;
}

function SortableItem({ status, editingId, loading, onUpdate, onSave, onToggle, onDelete, setEditingId }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: status.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: `${transition}, opacity 0.2s`,
  };

  return (
    <div ref={setNodeRef} style={style} className="group">
      <div className={`relative p-4 rounded-xl border-2 transition-all ${
        status.ativo
          ? 'bg-card border-border hover:border-primary/40 shadow-sm'
          : 'bg-muted/30 border-muted-foreground/20'
      } ${isDragging ? 'opacity-50 scale-[1.02] shadow-xl' : ''}`}>
        <div className="flex items-center gap-3">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1.5 rounded hover:bg-accent">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: status.cor }} />

          <Input
            value={status.nome}
            onChange={(e) => { onUpdate({ ...status, nome: e.target.value }); setEditingId(status.id); }}
            className="flex-1"
            placeholder="Nome do status"
          />

          <div className="flex items-center gap-1.5">
            <Input
              type="color"
              value={status.cor}
              onChange={(e) => { onUpdate({ ...status, cor: e.target.value }); setEditingId(status.id); }}
              className="h-8 w-12 cursor-pointer p-0.5"
            />

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

interface GestaoAssociacaoStatusConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: () => void;
}

export function GestaoAssociacaoStatusConfig({ open, onOpenChange, onStatusChange }: GestaoAssociacaoStatusConfigProps) {
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  const [availableSituacoes, setAvailableSituacoes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const loadData = async () => {
    try {
      // Load existing configs
      const { data: configs, error: configError } = await supabase
        .from('gestao_associacao_status_config')
        .select('*')
        .order('ordem');
      if (configError) throw configError;
      setStatuses((configs || []) as StatusConfig[]);

      // Load distinct situacao_evento values from sga_eventos
      const { data: situacoes, error: sitError } = await supabase
        .from('sga_eventos')
        .select('situacao_evento')
        .not('situacao_evento', 'is', null);
      if (sitError) throw sitError;

      const uniqueSituacoes = [...new Set((situacoes || []).map(s => s.situacao_evento).filter(Boolean))] as string[];
      setAvailableSituacoes(uniqueSituacoes.sort());
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar configurações');
    }
  };

  const handleImportSituacao = async (nome: string) => {
    if (statuses.some(s => s.nome === nome)) {
      toast.error('Este status já está configurado');
      return;
    }
    try {
      setLoading(true);
      const maxOrdem = Math.max(...statuses.map(s => s.ordem), 0);
      const { data, error } = await supabase
        .from('gestao_associacao_status_config')
        .insert({ nome, cor: '#3b82f6', ordem: maxOrdem + 1, ativo: true })
        .select()
        .single();
      if (error) throw error;
      setStatuses([...statuses, data as StatusConfig]);
      toast.success(`Status "${nome}" adicionado`);
      onStatusChange();
    } catch (error) {
      console.error('Erro ao adicionar:', error);
      toast.error('Erro ao adicionar status');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (status: StatusConfig) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('gestao_associacao_status_config')
        .update({ nome: status.nome, cor: status.cor })
        .eq('id', status.id);
      if (error) throw error;
      setEditingId(null);
      toast.success('Salvo');
      onStatusChange();
    } catch (error) {
      toast.error('Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (status: StatusConfig) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('gestao_associacao_status_config')
        .update({ ativo: !status.ativo })
        .eq('id', status.id);
      if (error) throw error;
      setStatuses(statuses.map(s => s.id === status.id ? { ...s, ativo: !s.ativo } : s));
      toast.success(`Status ${!status.ativo ? 'ativado' : 'desativado'}`);
      onStatusChange();
    } catch (error) {
      toast.error('Erro ao alterar');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este status?')) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('gestao_associacao_status_config').delete().eq('id', id);
      if (error) throw error;
      setStatuses(statuses.filter(s => s.id !== id));
      toast.success('Excluído');
      onStatusChange();
    } catch (error) {
      toast.error('Erro ao excluir');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = statuses.findIndex(s => s.id === active.id);
      const newIndex = statuses.findIndex(s => s.id === over.id);
      const newStatuses = arrayMove(statuses, oldIndex, newIndex).map((s, i) => ({ ...s, ordem: i + 1 }));
      setStatuses(newStatuses);
      try {
        await Promise.all(newStatuses.map(s =>
          supabase.from('gestao_associacao_status_config').update({ ordem: s.ordem }).eq('id', s.id)
        ));
        toast.success('Ordem atualizada');
        onStatusChange();
      } catch {
        toast.error('Erro ao reordenar');
        loadData();
      }
    }
  };

  // Status from BI not yet configured
  const unconfiguredSituacoes = availableSituacoes.filter(s => !statuses.some(st => st.nome === s));

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Configurar Status - Gestão Associação</DialogTitle>
          <DialogDescription>
            Escolha quais situações dos eventos serão exibidas como colunas no kanban e defina a ordem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Unconfigured statuses from BI */}
          {unconfiguredSituacoes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Situações disponíveis no BI (clique para adicionar)</Label>
              <div className="flex flex-wrap gap-2">
                {unconfiguredSituacoes.map(s => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => handleImportSituacao(s)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Configured statuses */}
          <ScrollArea className="h-[calc(90vh-350px)] pr-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={statuses.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {statuses.map(status => (
                    <SortableItem
                      key={status.id}
                      status={status}
                      editingId={editingId}
                      loading={loading}
                      onUpdate={(s) => setStatuses(statuses.map(st => st.id === s.id ? s : st))}
                      onSave={handleSave}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                      setEditingId={setEditingId}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </ScrollArea>

          <Button variant="outline" onClick={loadData} disabled={loading} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Recarregar situações do BI
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
