import { useState, useEffect } from 'react';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, GripVertical, Eye, EyeOff, Link2, Link2Off } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

interface Fluxo {
  id: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  cor: string;
  proximo_fluxo_id: string | null;
  gera_proximo_automatico: boolean;
}

interface FluxosConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFluxoChange: () => void;
  embedded?: boolean;
}

interface SortableFluxoItemProps {
  fluxo: Fluxo;
  fluxos: Fluxo[];
  editingId: string | null;
  loading: boolean;
  onUpdate: (fluxo: Fluxo) => void;
  onSave: (fluxo: Fluxo) => void;
  onToggleActive: (fluxo: Fluxo) => void;
  onDelete: (id: string) => void;
  setEditingId: (id: string | null) => void;
}

function SortableFluxoItem({
  fluxo,
  fluxos,
  editingId,
  loading,
  onUpdate,
  onSave,
  onToggleActive,
  onDelete,
  setEditingId,
}: SortableFluxoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fluxo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: `${transition}, opacity 0.2s`,
  };

  const availableNextFluxos = fluxos.filter(f => f.id !== fluxo.id && f.ativo);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group"
    >
      <div className={`relative p-5 rounded-xl border-2 transition-all duration-200 ${
        fluxo.ativo 
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
                <Label className="text-sm font-medium">Nome do Fluxo</Label>
                <Input
                  value={fluxo.nome}
                  onChange={(e) => {
                    onUpdate({ ...fluxo, nome: e.target.value });
                    setEditingId(fluxo.id);
                  }}
                  className="mt-1.5"
                  placeholder="Ex: Pré-abertura"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Descrição</Label>
                <Input
                  value={fluxo.descricao || ''}
                  onChange={(e) => {
                    onUpdate({ ...fluxo, descricao: e.target.value });
                    setEditingId(fluxo.id);
                  }}
                  className="mt-1.5"
                  placeholder="Descrição do fluxo"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Cor do Fluxo</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    type="color"
                    value={fluxo.cor || '#3b82f6'}
                    onChange={(e) => {
                      onUpdate({ ...fluxo, cor: e.target.value });
                      setEditingId(fluxo.id);
                    }}
                    className="h-10 w-20 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={fluxo.cor || '#3b82f6'}
                    onChange={(e) => {
                      onUpdate({ ...fluxo, cor: e.target.value });
                      setEditingId(fluxo.id);
                    }}
                    className="flex-1"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
            </div>

            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={fluxo.gera_proximo_automatico}
                    onCheckedChange={(checked) => {
                      onUpdate({ ...fluxo, gera_proximo_automatico: checked });
                      setEditingId(fluxo.id);
                    }}
                  />
                  <div>
                    <Label className="text-sm font-medium">Encadeamento Automático</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Gerar próximo fluxo automaticamente
                    </p>
                  </div>
                </div>
              </div>

              {fluxo.gera_proximo_automatico && (
                <div className="pl-11 animate-in slide-in-from-top-2 duration-200">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary" />
                    Próximo Fluxo
                  </Label>
                  <Select
                    value={fluxo.proximo_fluxo_id || 'none'}
                    onValueChange={(value) => {
                      onUpdate({ ...fluxo, proximo_fluxo_id: value === 'none' ? null : value });
                      setEditingId(fluxo.id);
                    }}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Selecione o próximo fluxo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <div className="flex items-center gap-2">
                          <Link2Off className="h-4 w-4" />
                          Nenhum
                        </div>
                      </SelectItem>
                      {availableNextFluxos.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggleActive(fluxo)}
                className="shrink-0"
              >
                {fluxo.ativo ? (
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
              {editingId === fluxo.id && (
                <Button
                  size="sm"
                  onClick={() => onSave(fluxo)}
                  disabled={loading}
                  className="shrink-0"
                >
                  Salvar Alterações
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(fluxo.id)}
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

export function FluxosConfigDialog({ open, onOpenChange, onFluxoChange, embedded = false }: FluxosConfigDialogProps) {
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
      loadFluxos();
    }
  }, [open]);

  const loadFluxos = async () => {
    try {
      const { data, error } = await supabase
        .from('fluxos')
        .select('*')
        .order('ordem');

      if (error) throw error;
      setFluxos(data || []);
    } catch (error) {
      console.error('Erro ao carregar fluxos:', error);
      toast.error('Erro ao carregar fluxos');
    }
  };

  const handleAddFluxo = async () => {
    try {
      setLoading(true);
      const maxOrdem = Math.max(...fluxos.map(f => f.ordem), 0);
      
      const { data, error } = await supabase
        .from('fluxos')
        .insert({
          nome: 'Novo Fluxo',
          descricao: '',
          ordem: maxOrdem + 1,
          ativo: true,
          gera_proximo_automatico: false,
          proximo_fluxo_id: null,
        })
        .select()
        .single();

      if (error) throw error;

      setFluxos([...fluxos, data]);
      setEditingId(data.id);
      toast.success('Fluxo adicionado');
      onFluxoChange();
    } catch (error) {
      console.error('Erro ao adicionar fluxo:', error);
      toast.error('Erro ao adicionar fluxo');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateFluxo = (updatedFluxo: Fluxo) => {
    setFluxos(fluxos.map(f => f.id === updatedFluxo.id ? updatedFluxo : f));
  };

  const handleSaveFluxo = async (fluxo: Fluxo) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('fluxos')
        .update({
          nome: fluxo.nome,
          descricao: fluxo.descricao,
          cor: fluxo.cor,
          gera_proximo_automatico: fluxo.gera_proximo_automatico,
          proximo_fluxo_id: fluxo.proximo_fluxo_id,
        })
        .eq('id', fluxo.id);

      if (error) throw error;

      setEditingId(null);
      toast.success('Fluxo salvo com sucesso');
      onFluxoChange();
    } catch (error) {
      console.error('Erro ao salvar fluxo:', error);
      toast.error('Erro ao salvar fluxo');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (fluxo: Fluxo) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('fluxos')
        .update({ ativo: !fluxo.ativo })
        .eq('id', fluxo.id);

      if (error) throw error;

      setFluxos(fluxos.map(f => f.id === fluxo.id ? { ...f, ativo: !f.ativo } : f));
      toast.success(`Fluxo ${!fluxo.ativo ? 'ativado' : 'desativado'}`);
      onFluxoChange();
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast.error('Erro ao alterar status do fluxo');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFluxo = async (id: string) => {
    if (!confirm('Deseja realmente excluir este fluxo?')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('fluxos')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setFluxos(fluxos.filter(f => f.id !== id));
      toast.success('Fluxo excluído');
      onFluxoChange();
    } catch (error) {
      console.error('Erro ao excluir fluxo:', error);
      toast.error('Erro ao excluir fluxo');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = fluxos.findIndex((f) => f.id === active.id);
      const newIndex = fluxos.findIndex((f) => f.id === over.id);

      const newFluxos = arrayMove(fluxos, oldIndex, newIndex).map((f, index) => ({
        ...f,
        ordem: index + 1,
      }));

      setFluxos(newFluxos);

      try {
        const updates = newFluxos.map((f) =>
          supabase.from('fluxos').update({ ordem: f.ordem }).eq('id', f.id)
        );

        await Promise.all(updates);
        toast.success('Ordem atualizada');
        onFluxoChange();
      } catch (error) {
        console.error('Erro ao atualizar ordem:', error);
        toast.error('Erro ao atualizar ordem');
        loadFluxos();
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
          <SortableContext items={fluxos.map(f => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {fluxos.map((fluxo) => (
                <SortableFluxoItem
                  key={fluxo.id}
                  fluxo={fluxo}
                  fluxos={fluxos}
                  editingId={editingId}
                  loading={loading}
                  onUpdate={handleUpdateFluxo}
                  onSave={handleSaveFluxo}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDeleteFluxo}
                  setEditingId={setEditingId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>

      <Button
        onClick={handleAddFluxo}
        disabled={loading}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Adicionar Novo Fluxo
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
          <DialogTitle>Configurar Fluxos</DialogTitle>
          <DialogDescription>
            Configure os fluxos de trabalho do sistema
          </DialogDescription>
        </DialogHeader>
        {content}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
