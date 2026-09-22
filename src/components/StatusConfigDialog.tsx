import { useState, useEffect, useMemo } from 'react';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  Search,
  ChevronDown,
  ChevronRight,
  Layers,
  List,
  Workflow,
  Pencil,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
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
  cor?: string | null;
}

interface StatusConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: () => void;
  embedded?: boolean;
}

const TIPO_LABEL: Record<StatusConfig['tipo_etapa'], string> = {
  backlog: 'Backlog',
  aguardando: 'Aguardando',
  em_andamento: 'Em andamento',
  revisao: 'Revisão',
  finalizado: 'Finalizado',
};

const SEM_FLUXO = 'none';

interface SortableStatusItemProps {
  status: StatusConfig;
  fluxos: Fluxo[];
  editingId: string | null;
  expanded: boolean;
  loading: boolean;
  onToggleExpand: (id: string) => void;
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
  expanded,
  loading,
  onToggleExpand,
  onUpdate,
  onSave,
  onToggleActive,
  onDelete,
  setEditingId,
}: SortableStatusItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: status.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: `${transition}, opacity 0.2s`,
  };

  return (
    <div ref={setNodeRef} style={style} className="group">
      <div
        className={`rounded-xl border transition-all duration-200 ${
          status.ativo ? 'bg-card border-border' : 'bg-muted/30 border-dashed border-muted-foreground/30'
        } ${isDragging ? 'opacity-50 shadow-xl ring-2 ring-primary/20' : 'hover:border-primary/40'}`}
      >
        {/* Linha compacta */}
        <div className="flex items-center gap-2 px-2.5 py-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 rounded-md hover:bg-accent transition-colors"
            title="Arraste para reordenar ou mover de fluxo"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>

          <span
            className="h-3 w-3 rounded-full shrink-0 border border-black/10"
            style={{ backgroundColor: status.cor }}
          />

          <button
            type="button"
            onClick={() => onToggleExpand(status.id)}
            className="flex-1 min-w-0 text-left"
          >
            <span className={`text-sm font-medium truncate ${!status.ativo ? 'text-muted-foreground line-through' : ''}`}>
              {status.nome}
            </span>
          </button>

          <Badge variant="secondary" className="hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wide">
            {TIPO_LABEL[status.tipo_etapa || 'em_andamento']}
          </Badge>
          <span className="hidden md:inline text-[11px] text-muted-foreground tabular-nums">
            {status.prazo_horas}h
          </span>

          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onToggleActive(status)}
            title={status.ativo ? 'Ativo' : 'Inativo'}
          >
            {status.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onToggleExpand(status.id)}
            title="Editar"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </Button>
        </div>

        {/* Detalhes */}
        {expanded && (
          <div className="border-t px-3 py-3 space-y-3 animate-in slide-in-from-top-1 duration-150">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium">Nome do Status</Label>
                <Input
                  value={status.nome}
                  onChange={(e) => {
                    onUpdate({ ...status, nome: e.target.value });
                    setEditingId(status.id);
                  }}
                  className="mt-1 h-9"
                />
              </div>

              <div>
                <Label className="text-xs font-medium">Fluxo</Label>
                <Select
                  value={status.fluxo_id || SEM_FLUXO}
                  onValueChange={(value) => {
                    onUpdate({ ...status, fluxo_id: value === SEM_FLUXO ? null : value });
                    setEditingId(status.id);
                  }}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Selecione o fluxo" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4} className="bg-background z-[100001] max-h-[280px] overflow-y-auto">
                    <SelectItem value={SEM_FLUXO}>Sem fluxo</SelectItem>
                    {fluxos.map((fluxo) => (
                      <SelectItem key={fluxo.id} value={fluxo.id}>
                        {fluxo.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-medium">Tipo de Etapa</Label>
                <Select
                  value={status.tipo_etapa || 'em_andamento'}
                  onValueChange={(value) => {
                    const isBacklog = value === 'backlog';
                    const isFinalizado = value === 'finalizado';
                    onUpdate({
                      ...status,
                      tipo_etapa: value as StatusConfig['tipo_etapa'],
                      is_final: isFinalizado || (isBacklog ? false : status.is_final),
                    });
                    setEditingId(status.id);
                  }}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4} className="bg-background z-[100001] max-h-[280px] overflow-y-auto">
                    <SelectItem value="backlog">Backlog (Início)</SelectItem>
                    <SelectItem value="aguardando">Aguardando</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="revisao">Revisão</SelectItem>
                    <SelectItem value="finalizado">Finalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Cor do Status</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="color"
                    value={status.cor}
                    onChange={(e) => {
                      onUpdate({ ...status, cor: e.target.value });
                      setEditingId(status.id);
                    }}
                    className="h-9 w-16 cursor-pointer p-1"
                  />
                  <Input
                    type="text"
                    value={status.cor}
                    onChange={(e) => {
                      onUpdate({ ...status, cor: e.target.value });
                      setEditingId(status.id);
                    }}
                    className="flex-1 h-9"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium">Prazo (horas)</Label>
                <Input
                  type="number"
                  min="0"
                  value={status.prazo_horas}
                  onChange={(e) => {
                    onUpdate({ ...status, prazo_horas: Number(e.target.value) });
                    setEditingId(status.id);
                  }}
                  className="mt-1 h-9"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(status.id)}
                disabled={loading}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
              {editingId === status.id && (
                <Button size="sm" onClick={() => onSave(status)} disabled={loading}>
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

interface StatusGroupProps {
  groupId: string;
  nome: string;
  cor?: string | null;
  statuses: StatusConfig[];
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
  onAdd: (fluxoId: string | null) => void;
  children: (status: StatusConfig) => React.ReactNode;
}

function StatusGroup({
  groupId,
  nome,
  cor,
  statuses,
  collapsed,
  onToggleCollapse,
  onAdd,
  children,
}: StatusGroupProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-${groupId}` });

  return (
    <div
      className={`rounded-2xl border bg-muted/20 transition-colors ${
        isOver ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onToggleCollapse(groupId)}
          className="p-1 rounded-md hover:bg-accent transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: cor || 'hsl(var(--muted-foreground))' }}
        />
        <h4 className="font-serif text-base font-semibold truncate">{nome}</h4>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          {statuses.length}
        </Badge>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => onAdd(groupId === SEM_FLUXO ? null : groupId)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Status
        </Button>
      </div>

      {!collapsed && (
        <div ref={setNodeRef} className="px-3 pb-3 space-y-2 min-h-[56px]">
          <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {statuses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-muted-foreground/30 py-5 text-center text-xs text-muted-foreground">
                Arraste um status para cá ou clique em “Status”
              </div>
            ) : (
              statuses.map((s) => <div key={s.id}>{children(s)}</div>)
            )}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

export function StatusConfigDialog({ open, onOpenChange, onStatusChange, embedded = false }: StatusConfigDialogProps) {
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [busca, setBusca] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
        supabase.from('fluxos').select('id, nome, cor, ordem').eq('ativo', true).order('ordem'),
      ]);

      if (statusesData.error) throw statusesData.error;
      if (fluxosData.error) throw fluxosData.error;

      setStatuses((statusesData.data || []) as StatusConfig[]);
      setFluxos((fluxosData.data || []) as Fluxo[]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar configurações');
    }
  };

  const statusesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return statuses;
    return statuses.filter((s) => s.nome.toLowerCase().includes(termo));
  }, [statuses, busca]);

  const grupos = useMemo(() => {
    const lista = fluxos.map((f) => ({
      id: f.id,
      nome: f.nome,
      cor: f.cor,
      statuses: statusesFiltrados
        .filter((s) => s.fluxo_id === f.id)
        .sort((a, b) => a.ordem - b.ordem),
    }));

    const semFluxo = statusesFiltrados
      .filter((s) => !s.fluxo_id || !fluxos.some((f) => f.id === s.fluxo_id))
      .sort((a, b) => a.ordem - b.ordem);

    lista.push({ id: SEM_FLUXO, nome: 'Sem fluxo', cor: null, statuses: semFluxo });
    return lista;
  }, [fluxos, statusesFiltrados]);

  const toggleCollapse = (id: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const handleAddStatus = async (fluxoId: string | null = fluxos[0]?.id ?? null) => {
    try {
      setLoading(true);

      if (fluxos.length === 0 && fluxoId) {
        toast.error('Crie um fluxo primeiro antes de adicionar status');
        return;
      }

      const maxOrdem = Math.max(...statuses.map((s) => s.ordem), 0);

      const { data, error } = await supabase
        .from('status_config')
        .insert({
          nome: `Novo Status ${Date.now()}`,
          cor: '#3b82f6',
          prazo_horas: 24,
          ordem: maxOrdem + 1,
          ativo: true,
          tipo_etapa: 'em_andamento',
          is_final: false,
          fluxo_id: fluxoId,
        })
        .select()
        .single();

      if (error) throw error;

      setStatuses([...statuses, data as StatusConfig]);
      setEditingId(data.id);
      setExpandedId(data.id);
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
    setStatuses(statuses.map((s) => (s.id === updatedStatus.id ? updatedStatus : s)));
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

      setStatuses(statuses.map((s) => (s.id === status.id ? { ...s, ativo: !s.ativo } : s)));
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
      const { error } = await supabase.from('status_config').delete().eq('id', id);

      if (error) throw error;

      setStatuses(statuses.filter((s) => s.id !== id));
      toast.success('Status excluído');
      onStatusChange();
    } catch (error) {
      console.error('Erro ao excluir status:', error);
      toast.error('Erro ao excluir status');
    } finally {
      setLoading(false);
    }
  };

  const persistOrdem = async (lista: StatusConfig[]) => {
    try {
      await Promise.all(
        lista.map((s) =>
          supabase
            .from('status_config')
            .update({ ordem: s.ordem, fluxo_id: s.fluxo_id })
            .eq('id', s.id)
        )
      );
      toast.success('Sequência atualizada');
      onStatusChange();
    } catch (error) {
      console.error('Erro ao atualizar ordem:', error);
      toast.error('Erro ao atualizar ordem');
      loadData();
    }
  };

  const handleFlatDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = statuses.findIndex((s) => s.id === active.id);
    const newIndex = statuses.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const novos = arrayMove(statuses, oldIndex, newIndex).map((s, index) => ({
      ...s,
      ordem: index + 1,
    }));
    setStatuses(novos);
    await persistOrdem(novos);
  };

  const handleGroupedDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeStatus = statuses.find((s) => s.id === active.id);
    if (!activeStatus) return;

    const overId = String(over.id);
    let destinoFluxoId: string | null;
    let posicaoDestino: string | null = null;

    if (overId.startsWith('group-')) {
      const gid = overId.replace('group-', '');
      destinoFluxoId = gid === SEM_FLUXO ? null : gid;
    } else {
      const overStatus = statuses.find((s) => s.id === overId);
      if (!overStatus) return;
      destinoFluxoId = overStatus.fluxo_id;
      posicaoDestino = overStatus.id;
    }

    if (posicaoDestino === activeStatus.id) return;

    // Monta nova sequência global respeitando a ordem dos grupos
    const restante = statuses.filter((s) => s.id !== activeStatus.id);
    const atualizado: StatusConfig = { ...activeStatus, fluxo_id: destinoFluxoId };

    const ordemGrupos = [...fluxos.map((f) => f.id), SEM_FLUXO];
    const resultado: StatusConfig[] = [];

    for (const gid of ordemGrupos) {
      const doGrupo = restante
        .filter((s) =>
          gid === SEM_FLUXO
            ? !s.fluxo_id || !fluxos.some((f) => f.id === s.fluxo_id)
            : s.fluxo_id === gid
        )
        .sort((a, b) => a.ordem - b.ordem);

      const ehDestino = gid === SEM_FLUXO ? destinoFluxoId === null : destinoFluxoId === gid;

      if (ehDestino) {
        const idx = posicaoDestino ? doGrupo.findIndex((s) => s.id === posicaoDestino) : -1;
        if (idx >= 0) doGrupo.splice(idx, 0, atualizado);
        else doGrupo.push(atualizado);
      }

      resultado.push(...doGrupo);
    }

    const comOrdem = resultado.map((s, index) => ({ ...s, ordem: index + 1 }));
    setStatuses(comOrdem);
    await persistOrdem(comOrdem);
  };

  const renderItem = (status: StatusConfig) => (
    <SortableStatusItem
      status={status}
      fluxos={fluxos}
      editingId={editingId}
      expanded={expandedId === status.id}
      loading={loading}
      onToggleExpand={toggleExpand}
      onUpdate={handleUpdateStatus}
      onSave={handleSaveStatus}
      onToggleActive={handleToggleActive}
      onDelete={handleDeleteStatus}
      setEditingId={setEditingId}
    />
  );

  const content = (
    <div className="space-y-3">
      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar status..."
            className="pl-9 h-9"
          />
        </div>

        <div className="inline-flex gap-1 rounded-2xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setViewMode('grouped')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === 'grouped' ? 'bg-card shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Por fluxo
          </button>
          <button
            type="button"
            onClick={() => setViewMode('flat')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === 'flat' ? 'bg-card shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Lista
          </button>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Workflow className="h-3.5 w-3.5" />
        Arraste um status para outro fluxo para trocá-lo de etapa; a sequência é salva automaticamente.
      </p>

      <ScrollArea className="h-[calc(90vh-260px)] pr-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={viewMode === 'grouped' ? handleGroupedDragEnd : handleFlatDragEnd}
        >
          {viewMode === 'grouped' ? (
            <div className="space-y-3">
              {grupos.map((grupo) => (
                <StatusGroup
                  key={grupo.id}
                  groupId={grupo.id}
                  nome={grupo.nome}
                  cor={grupo.cor}
                  statuses={grupo.statuses}
                  collapsed={!!collapsedGroups[grupo.id]}
                  onToggleCollapse={toggleCollapse}
                  onAdd={handleAddStatus}
                >
                  {renderItem}
                </StatusGroup>
              ))}
            </div>
          ) : (
            <SortableContext
              items={statusesFiltrados.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {statusesFiltrados.map((status) => (
                  <div key={status.id}>{renderItem(status)}</div>
                ))}
              </div>
            </SortableContext>
          )}
        </DndContext>
      </ScrollArea>

      <Button onClick={() => handleAddStatus()} disabled={loading} className="w-full">
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
            Organize os status agrupados por fluxo e defina a sequência
          </DialogDescription>
        </DialogHeader>
        {content}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
