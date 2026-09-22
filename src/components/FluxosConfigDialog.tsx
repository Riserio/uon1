import { useState, useEffect, useMemo } from 'react';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  Link2,
  Link2Off,
  Search,
  ChevronDown,
  Pencil,
  ArrowRight,
  Workflow,
} from 'lucide-react';
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
  posicao: number;
  qtdStatus: number;
  editingId: string | null;
  expanded: boolean;
  loading: boolean;
  onToggleExpand: (id: string) => void;
  onUpdate: (fluxo: Fluxo) => void;
  onSave: (fluxo: Fluxo) => void;
  onToggleActive: (fluxo: Fluxo) => void;
  onDelete: (id: string) => void;
  setEditingId: (id: string | null) => void;
}

function SortableFluxoItem({
  fluxo,
  fluxos,
  posicao,
  qtdStatus,
  editingId,
  expanded,
  loading,
  onToggleExpand,
  onUpdate,
  onSave,
  onToggleActive,
  onDelete,
  setEditingId,
}: SortableFluxoItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fluxo.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: `${transition}, opacity 0.2s`,
  };

  const availableNextFluxos = fluxos.filter((f) => f.id !== fluxo.id && f.ativo);
  const proximo = fluxos.find((f) => f.id === fluxo.proximo_fluxo_id);

  return (
    <div ref={setNodeRef} style={style} className="group">
      <div
        className={`rounded-xl border transition-all duration-200 ${
          fluxo.ativo ? 'bg-card border-border' : 'bg-muted/30 border-dashed border-muted-foreground/30'
        } ${isDragging ? 'opacity-50 shadow-xl ring-2 ring-primary/20' : 'hover:border-primary/40'}`}
      >
        {/* Linha compacta */}
        <div className="flex items-center gap-2 px-2.5 py-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 rounded-md hover:bg-accent transition-colors"
            title="Arraste para reordenar"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>

          <span className="text-[11px] font-semibold text-muted-foreground tabular-nums w-5 text-center">
            {posicao}
          </span>

          <span
            className="h-3 w-3 rounded-full shrink-0 border border-black/10"
            style={{ backgroundColor: fluxo.cor || '#3b82f6' }}
          />

          <button type="button" onClick={() => onToggleExpand(fluxo.id)} className="flex-1 min-w-0 text-left">
            <span className={`text-sm font-medium truncate ${!fluxo.ativo ? 'text-muted-foreground line-through' : ''}`}>
              {fluxo.nome}
            </span>
            {fluxo.descricao && (
              <span className="hidden lg:inline ml-2 text-[11px] text-muted-foreground truncate">
                {fluxo.descricao}
              </span>
            )}
          </button>

          <Badge variant="outline" className="hidden sm:inline-flex text-[10px] tabular-nums">
            {qtdStatus} status
          </Badge>

          {fluxo.gera_proximo_automatico && proximo && (
            <Badge variant="secondary" className="hidden md:inline-flex items-center gap-1 text-[10px]">
              <ArrowRight className="h-3 w-3" />
              {proximo.nome}
            </Badge>
          )}

          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onToggleActive(fluxo)}
            title={fluxo.ativo ? 'Ativo' : 'Inativo'}
          >
            {fluxo.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onToggleExpand(fluxo.id)} title="Editar">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </Button>
        </div>

        {/* Detalhes */}
        {expanded && (
          <div className="border-t px-3 py-3 space-y-3 animate-in slide-in-from-top-1 duration-150">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium">Nome do Fluxo</Label>
                <Input
                  value={fluxo.nome}
                  onChange={(e) => {
                    onUpdate({ ...fluxo, nome: e.target.value });
                    setEditingId(fluxo.id);
                  }}
                  className="mt-1 h-9"
                  placeholder="Ex: Pré-abertura"
                />
              </div>

              <div>
                <Label className="text-xs font-medium">Descrição</Label>
                <Input
                  value={fluxo.descricao || ''}
                  onChange={(e) => {
                    onUpdate({ ...fluxo, descricao: e.target.value });
                    setEditingId(fluxo.id);
                  }}
                  className="mt-1 h-9"
                  placeholder="Descrição do fluxo"
                />
              </div>

              <div>
                <Label className="text-xs font-medium">Cor do Fluxo</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="color"
                    value={fluxo.cor || '#3b82f6'}
                    onChange={(e) => {
                      onUpdate({ ...fluxo, cor: e.target.value });
                      setEditingId(fluxo.id);
                    }}
                    className="h-9 w-16 cursor-pointer p-1"
                  />
                  <Input
                    type="text"
                    value={fluxo.cor || '#3b82f6'}
                    onChange={(e) => {
                      onUpdate({ ...fluxo, cor: e.target.value });
                      setEditingId(fluxo.id);
                    }}
                    className="flex-1 h-9"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={fluxo.gera_proximo_automatico}
                  onCheckedChange={(checked) => {
                    onUpdate({ ...fluxo, gera_proximo_automatico: checked });
                    setEditingId(fluxo.id);
                  }}
                />
                <div>
                  <Label className="text-xs font-medium">Encadeamento Automático</Label>
                  <p className="text-[11px] text-muted-foreground">Gerar próximo fluxo automaticamente</p>
                </div>
              </div>

              {fluxo.gera_proximo_automatico && (
                <div className="pl-11 animate-in slide-in-from-top-1 duration-150">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5 text-primary" />
                    Próximo Fluxo
                  </Label>
                  <Select
                    value={fluxo.proximo_fluxo_id || 'none'}
                    onValueChange={(value) => {
                      onUpdate({ ...fluxo, proximo_fluxo_id: value === 'none' ? null : value });
                      setEditingId(fluxo.id);
                    }}
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue placeholder="Selecione o próximo fluxo" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      sideOffset={4}
                      className="bg-background z-[100001] max-h-[280px] overflow-y-auto"
                    >
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

            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(fluxo.id)}
                disabled={loading}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
              {editingId === fluxo.id && (
                <Button size="sm" onClick={() => onSave(fluxo)} disabled={loading}>
                  Salvar Alterações
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FluxosConfigDialog({ open, onOpenChange, onFluxoChange, embedded = false }: FluxosConfigDialogProps) {
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [contagemStatus, setContagemStatus] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (open) {
      loadFluxos();
    }
  }, [open]);

  const loadFluxos = async () => {
    try {
      const [fluxosRes, statusRes] = await Promise.all([
        supabase.from('fluxos').select('*').order('ordem'),
        supabase.from('status_config').select('fluxo_id'),
      ]);

      if (fluxosRes.error) throw fluxosRes.error;

      setFluxos(fluxosRes.data || []);

      const contagem: Record<string, number> = {};
      (statusRes.data || []).forEach((s: { fluxo_id: string | null }) => {
        if (s.fluxo_id) contagem[s.fluxo_id] = (contagem[s.fluxo_id] || 0) + 1;
      });
      setContagemStatus(contagem);
    } catch (error) {
      console.error('Erro ao carregar fluxos:', error);
      toast.error('Erro ao carregar fluxos');
    }
  };

  const fluxosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return fluxos;
    return fluxos.filter(
      (f) => f.nome.toLowerCase().includes(termo) || (f.descricao || '').toLowerCase().includes(termo)
    );
  }, [fluxos, busca]);

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const handleAddFluxo = async () => {
    try {
      setLoading(true);
      const maxOrdem = Math.max(...fluxos.map((f) => f.ordem), 0);

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
      setExpandedId(data.id);
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
    setFluxos(fluxos.map((f) => (f.id === updatedFluxo.id ? updatedFluxo : f)));
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
      const { error } = await supabase.from('fluxos').update({ ativo: !fluxo.ativo }).eq('id', fluxo.id);

      if (error) throw error;

      setFluxos(fluxos.map((f) => (f.id === fluxo.id ? { ...f, ativo: !f.ativo } : f)));
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
      const { error } = await supabase.from('fluxos').delete().eq('id', id);

      if (error) throw error;

      setFluxos(fluxos.filter((f) => f.id !== id));
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
    if (!over || active.id === over.id) return;

    const oldIndex = fluxos.findIndex((f) => f.id === active.id);
    const newIndex = fluxos.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const newFluxos = arrayMove(fluxos, oldIndex, newIndex).map((f, index) => ({
      ...f,
      ordem: index + 1,
    }));

    setFluxos(newFluxos);

    try {
      await Promise.all(
        newFluxos.map((f) => supabase.from('fluxos').update({ ordem: f.ordem }).eq('id', f.id))
      );
      toast.success('Sequência atualizada');
      onFluxoChange();
    } catch (error) {
      console.error('Erro ao atualizar ordem:', error);
      toast.error('Erro ao atualizar ordem');
      loadFluxos();
    }
  };

  const content = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar fluxo..."
            className="pl-9 h-9"
          />
        </div>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          {fluxos.length} fluxos
        </Badge>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Workflow className="h-3.5 w-3.5" />
        Arraste para definir a sequência dos fluxos; clique no nome para editar os detalhes.
      </p>

      <ScrollArea className="h-[calc(90vh-260px)] pr-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fluxosFiltrados.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {fluxosFiltrados.map((fluxo, index) => (
                <SortableFluxoItem
                  key={fluxo.id}
                  fluxo={fluxo}
                  fluxos={fluxos}
                  posicao={index + 1}
                  qtdStatus={contagemStatus[fluxo.id] || 0}
                  editingId={editingId}
                  expanded={expandedId === fluxo.id}
                  loading={loading}
                  onToggleExpand={toggleExpand}
                  onUpdate={handleUpdateFluxo}
                  onSave={handleSaveFluxo}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDeleteFluxo}
                  setEditingId={setEditingId}
                />
              ))}
              {fluxosFiltrados.length === 0 && (
                <div className="rounded-xl border border-dashed border-muted-foreground/30 py-8 text-center text-xs text-muted-foreground">
                  Nenhum fluxo encontrado
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>

      <Button onClick={handleAddFluxo} disabled={loading} className="w-full">
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
          <DialogDescription>Defina a sequência e os detalhes dos fluxos de trabalho</DialogDescription>
        </DialogHeader>
        {content}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
