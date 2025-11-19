import { useState, useEffect } from 'react';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  prazo_horas: number;
  ordem: number;
  ativo: boolean;
  fluxo_id: string | null;
  tipo_etapa: 'backlog' | 'aguardando' | 'em_andamento' | 'revisao' | 'finalizado';
  is_final: boolean;
}

interface Fluxo {
  id: string;
  nome: string;
}

interface StatusConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: () => void;
  embedded?: boolean;
}

interface SortableStatusItemProps {
  status: StatusConfig;
  fluxos: Fluxo[];
  editingId: string | null;
  loading: boolean;
  onUpdate: (status: StatusConfig) => void;
  onSave: (status: StatusConfig) => void;
  onToggleActive: (status: StatusConfig) => void;
  onDelete: (id: string) => void;
  setEditingId: (id: string | null) => void;
}

function SortableStatusItem({
  status,
  fluxos,
  editingId,
  loading,
  onUpdate,
  onSave,
  onToggleActive,
  onDelete,
  setEditingId,
}: SortableStatusItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: `${transition}, opacity 0.2s`,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group"
    >
      <div className={`relative p-5 rounded-xl border-2 transition-all duration-200 ${
        status.ativo 
          ? 'bg-card border-border hover:border-primary/40 shadow-sm hover:shadow-md' 
          : 'bg-muted/30 border-muted-foreground/20'
      } ${isDragging ? 'opacity-50 scale-[1.02] shadow-xl ring-2 ring-primary/20' : 'opacity-100'}`}>
        <div className="flex items-start gap-4">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing flex-shrink-0 mt-1 p-2 rounded-lg hover:bg-accent transition-colors"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          
          <div className="flex-1 space-y-4 min-w-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium">Nome do Status</Label>
                <Input
                  value={status.nome}
                  onChange={(e) => {
                    onUpdate({ ...status, nome: e.target.value });
                    setEditingId(status.id);
                  }}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Fluxo</Label>
                <Select
                  value={status.fluxo_id || 'none'}
                  onValueChange={(value) => {
                    onUpdate({ ...status, fluxo_id: value === 'none' ? null : value });
                    setEditingId(status.id);
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione o fluxo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem fluxo</SelectItem>
                    {fluxos.map((fluxo) => (
                      <SelectItem key={fluxo.id} value={fluxo.id}>
                        {fluxo.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Tipo de Etapa</Label>
                <Select
                  value={status.tipo_etapa || 'em_andamento'}
                  onValueChange={(value) => {
                    const isBacklog = value === 'backlog';
                    const isFinalizado = value === 'finalizado';
                    onUpdate({ 
                      ...status, 
                      tipo_etapa: value as StatusConfig['tipo_etapa'],
                      is_final: isFinalizado || (isBacklog ? false : status.is_final)
                    });
                    setEditingId(status.id);
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="backlog">Backlog (Início)</SelectItem>
                    <SelectItem value="aguardando">Aguardando</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="revisao">Revisão</SelectItem>
                    <SelectItem value="finalizado">Finalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Cor do Status</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Input
                    type="color"
                    value={status.cor}
                    onChange={(e) => {
                      onUpdate({ ...status, cor: e.target.value });
                      setEditingId(status.id);
                    }}
                    className="h-10 w-20 cursor-pointer"
                  />
                  <div 
                    className="flex-1 h-10 rounded-md border"
                    style={{ backgroundColor: status.cor }}
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Prazo (horas)</Label>
                <Input
                  type="number"
                  min="0"
                  value={status.prazo_horas}
                  onChange={(e) => {
                    onUpdate({ ...status, prazo_horas: Number(e.target.value) });
                    setEditingId(status.id);
                  }}
                  className="mt-1.5"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggleActive(status)}
                className="shrink-0"
              >
                {status.ativo ? (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Ativo
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Inativo
                  </>
                )}
              </Button>
              {editingId === status.id && (
                <Button
                  size="sm"
                  onClick={() => onSave(status)}
                  disabled={loading}
                  className="shrink-0"
                >
                  Salvar Alterações
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(status.id)}
                disabled={loading}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatusConfigDialog({ open, onOpenChange, onStatusChange, embedded = false }: StatusConfigDialogProps) {
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    try {
      const [statusesData, fluxosData] = await Promise.all([
        supabase.from('status_config').select('*').order('ordem'),
        supabase.from('fluxos').select('id, nome').eq('ativo', true).order('ordem'),
      ]);

      if (statusesData.error) throw statusesData.error;
      if (fluxosData.error) throw fluxosData.error;

      setStatuses((statusesData.data || []) as StatusConfig[]);
      setFluxos(fluxosData.data || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar configurações');
    }
  };

  const handleAddStatus = async () => {
    try {
      setLoading(true);
      const maxOrdem = Math.max(...statuses.map(s => s.ordem), 0);
      
      const { data, error } = await supabase
        .from('status_config')
        .insert({
          nome: 'Novo Status',
          cor: '#3b82f6',
          prazo_horas: 24,
          ordem: maxOrdem + 1,
          ativo: true,
          tipo_etapa: 'em_andamento',
          is_final: false,
        })
        .select()
        .single();

      if (error) throw error;

      setStatuses([...statuses, data as StatusConfig]);
      setEditingId(data.id);
      toast.success('Status adicionado');
      onStatusChange();
    } catch (error) {
      console.error('Erro ao adicionar status:', error);
      toast.error('Erro ao adicionar status');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = (updatedStatus: StatusConfig) => {
    setStatuses(statuses.map(s => s.id === updatedStatus.id ? updatedStatus : s));
  };

  const handleSaveStatus = async (status: StatusConfig) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('status_config')
        .update({
          nome: status.nome,
          cor: status.cor,
          prazo_horas: status.prazo_horas,
          fluxo_id: status.fluxo_id,
          tipo_etapa: status.tipo_etapa,
          is_final: status.is_final,
        })
        .eq('id', status.id);

      if (error) throw error;

      setEditingId(null);
      toast.success('Status salvo com sucesso');
      onStatusChange();
    } catch (error) {
      console.error('Erro ao salvar status:', error);
      toast.error('Erro ao salvar status');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (status: StatusConfig) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('status_config')
        .update({ ativo: !status.ativo })
        .eq('id', status.id);

      if (error) throw error;

      setStatuses(statuses.map(s => s.id === status.id ? { ...s, ativo: !s.ativo } : s));
      toast.success(`Status ${!status.ativo ? 'ativado' : 'desativado'}`);
      onStatusChange();
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast.error('Erro ao alterar status');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStatus = async (id: string) => {
    if (!confirm('Deseja realmente excluir este status?')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('status_config')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setStatuses(statuses.filter(s => s.id !== id));
      toast.success('Status excluído');
      onStatusChange();
    } catch (error) {
      console.error('Erro ao excluir status:', error);
      toast.error('Erro ao excluir status');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = statuses.findIndex((s) => s.id === active.id);
      const newIndex = statuses.findIndex((s) => s.id === over.id);

      const newStatuses = arrayMove(statuses, oldIndex, newIndex).map((s, index) => ({
        ...s,
        ordem: index + 1,
      }));

      setStatuses(newStatuses);

      try {
        const updates = newStatuses.map((s) =>
          supabase.from('status_config').update({ ordem: s.ordem }).eq('id', s.id)
        );

        await Promise.all(updates);
        toast.success('Ordem atualizada');
        onStatusChange();
      } catch (error) {
        console.error('Erro ao atualizar ordem:', error);
        toast.error('Erro ao atualizar ordem');
        loadData();
      }
    }
  };

  const content = (
    <div className="space-y-4">
      <ScrollArea className="h-[calc(90vh-200px)] pr-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={statuses.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {statuses.map((status) => (
                <SortableStatusItem
                  key={status.id}
                  status={status}
                  fluxos={fluxos}
                  editingId={editingId}
                  loading={loading}
                  onUpdate={handleUpdateStatus}
                  onSave={handleSaveStatus}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDeleteStatus}
                  setEditingId={setEditingId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>

      <Button
        onClick={handleAddStatus}
        disabled={loading}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Adicionar Novo Status
      </Button>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Configurar Status</DialogTitle>
          <DialogDescription>
            Configure os status disponíveis no sistema
          </DialogDescription>
        </DialogHeader>
        {content}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
