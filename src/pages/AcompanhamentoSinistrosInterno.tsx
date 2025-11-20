import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Search, ArrowLeft, ChevronDown, ChevronUp, FileText, 
  Calendar, DollarSign, Edit2, Check
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Vistoria {
  id: string;
  numero: number;
  status: string;
  tipo_sinistro: string | null;
  relato_incidente: string | null;
  data_incidente: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  custo_oficina: number | null;
  custo_reparo: number | null;
  custo_acordo: number | null;
  custo_terceiros: number | null;
  custo_perda_total: number | null;
  custo_perda_parcial: number | null;
  valor_franquia: number | null;
  valor_indenizacao: number | null;
  veiculo_placa: string | null;
}

interface TimelineEvent {
  date: string;
  title: string;
  description: string;
}

export default function AcompanhamentoSinistrosInterno() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [filteredVistorias, setFilteredVistorias] = useState<Vistoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [editingVistoria, setEditingVistoria] = useState<Vistoria | null>(null);
  const [editForm, setEditForm] = useState({
    custo_oficina: 0,
    custo_reparo: 0,
    custo_acordo: 0,
    custo_terceiros: 0,
    custo_perda_total: 0,
    custo_perda_parcial: 0,
    valor_franquia: 0,
    valor_indenizacao: 0,
  });

  useEffect(() => {
    loadVistorias();
  }, []);

  useEffect(() => {
    filterVistorias();
  }, [searchTerm, vistorias, selectedStatus]);

  const loadVistorias = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vistorias')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVistorias(data || []);
    } catch (error) {
      toast.error('Erro ao carregar sinistros');
    } finally {
      setLoading(false);
    }
  };

  const filterVistorias = () => {
    let filtered = vistorias;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(v => 
        v.numero?.toString().includes(term) ||
        v.veiculo_placa?.toLowerCase().includes(term)
      );
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(v => v.status === selectedStatus);
    }

    setFilteredVistorias(filtered);
  };

  const statusConfig = {
    aguardando_fotos: { label: 'Pendente', color: 'bg-yellow-500' },
    em_analise: { label: 'Em Análise', color: 'bg-blue-500' },
    aprovada: { label: 'Aprovado', color: 'bg-green-500' },
    concluida: { label: 'Aprovado', color: 'bg-green-500' },
    rejeitada: { label: 'Negado', color: 'bg-red-500' },
  };

  const getStatusLabel = (status: string) => {
    return statusConfig[status as keyof typeof statusConfig]?.label || status;
  };

  const getStatusColor = (status: string) => {
    return statusConfig[status as keyof typeof statusConfig]?.color || 'bg-gray-500';
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const calculateTotal = (vistoria: Vistoria) => {
    return (
      (vistoria.custo_oficina || 0) +
      (vistoria.custo_reparo || 0) +
      (vistoria.custo_acordo || 0) +
      (vistoria.custo_terceiros || 0) +
      (vistoria.custo_perda_total || 0) +
      (vistoria.custo_perda_parcial || 0)
    );
  };

  const getTimeline = (vistoria: Vistoria): TimelineEvent[] => {
    const events: TimelineEvent[] = [
      {
        date: vistoria.created_at,
        title: 'Sinistro Registrado',
        description: 'Protocolo aberto automaticamente'
      }
    ];

    if (vistoria.status === 'em_analise' || vistoria.status === 'aprovada' || vistoria.status === 'concluida') {
      events.push({
        date: vistoria.updated_at,
        title: 'Documentação Enviada',
        description: 'Fotos e boletim de ocorrência anexados'
      });
    }

    if (vistoria.status === 'aprovada' || vistoria.status === 'concluida') {
      events.push({
        date: vistoria.updated_at,
        title: 'Em Análise',
        description: 'Perito designado para vistoria'
      });
    }

    if (vistoria.status === 'concluida') {
      events.push({
        date: vistoria.completed_at || vistoria.updated_at,
        title: 'Aprovado',
        description: 'Processo concluído com sucesso'
      });
    }

    return events;
  };

  const handleEditClick = (vistoria: Vistoria) => {
    setEditingVistoria(vistoria);
    setEditForm({
      custo_oficina: vistoria.custo_oficina || 0,
      custo_reparo: vistoria.custo_reparo || 0,
      custo_acordo: vistoria.custo_acordo || 0,
      custo_terceiros: vistoria.custo_terceiros || 0,
      custo_perda_total: vistoria.custo_perda_total || 0,
      custo_perda_parcial: vistoria.custo_perda_parcial || 0,
      valor_franquia: vistoria.valor_franquia || 0,
      valor_indenizacao: vistoria.valor_indenizacao || 0,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingVistoria) return;

    try {
      const { error } = await supabase
        .from('vistorias')
        .update(editForm)
        .eq('id', editingVistoria.id);

      if (error) throw error;

      toast.success('Sinistro atualizado com sucesso');
      setEditingVistoria(null);
      loadVistorias();
    } catch (error) {
      toast.error('Erro ao atualizar sinistro');
    }
  };

  const statusButtons = [
    { value: 'all', label: 'Todos' },
    { value: 'aguardando_fotos', label: 'Pendentes' },
    { value: 'em_analise', label: 'Em Análise' },
    { value: 'aprovada', label: 'Aprovados' },
    { value: 'rejeitada', label: 'Negados' },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => navigate('/sinistros')}
            variant="ghost"
            size="icon"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Acompanhamento de Sinistros</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie e acompanhe todos os sinistros
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {statusButtons.map((btn) => (
          <Button
            key={btn.value}
            onClick={() => setSelectedStatus(btn.value)}
            variant={selectedStatus === btn.value ? 'default' : 'outline'}
            size="sm"
          >
            {btn.label}
          </Button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por número ou placa..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      ) : filteredVistorias.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Nenhum sinistro encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredVistorias.map((vistoria) => {
            const isExpanded = expandedCard === vistoria.id;
            const timeline = getTimeline(vistoria);
            const total = calculateTotal(vistoria);

            return (
              <Card key={vistoria.id} className="overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-bold">
                        SIN-{new Date().getFullYear()}-{String(vistoria.numero).padStart(6, '0')}
                      </h3>
                      <Badge className={`${getStatusColor(vistoria.status)} text-white`}>
                        {getStatusLabel(vistoria.status)}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(vistoria)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExpandedCard(isExpanded ? null : vistoria.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <p className="text-muted-foreground mb-4">
                    {vistoria.relato_incidente || vistoria.tipo_sinistro || 'Sinistro registrado'}
                  </p>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Tipo</p>
                        <p className="font-medium">{vistoria.tipo_sinistro || 'Colisão Veicular'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Data</p>
                        <p className="font-medium">
                          {vistoria.data_incidente 
                            ? format(new Date(vistoria.data_incidente), 'dd/MM/yyyy', { locale: ptBR })
                            : format(new Date(vistoria.created_at), 'dd/MM/yyyy', { locale: ptBR })
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Valor</p>
                        <p className="font-medium">{formatCurrency(total)}</p>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-6 border-t pt-6">
                      <h4 className="font-semibold mb-4">Linha do Tempo</h4>
                      <div className="space-y-4">
                        {timeline.map((event, index) => (
                          <div key={index} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className={`w-3 h-3 rounded-full ${index === timeline.length - 1 ? 'bg-primary' : 'bg-muted'}`} />
                              {index < timeline.length - 1 && (
                                <div className="w-0.5 h-12 bg-muted" />
                              )}
                            </div>
                            <div className="flex-1 pb-4">
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(event.date), 'dd/MM/yyyy', { locale: ptBR })}
                              </p>
                              <p className="font-semibold">{event.title}</p>
                              <p className="text-sm text-muted-foreground">{event.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 border-t pt-6">
                        <h4 className="font-semibold mb-4">Detalhes Financeiros</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Custo Oficina</p>
                            <p className="font-medium">{formatCurrency(vistoria.custo_oficina)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Custo Reparo</p>
                            <p className="font-medium">{formatCurrency(vistoria.custo_reparo)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Custo Acordo</p>
                            <p className="font-medium">{formatCurrency(vistoria.custo_acordo)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Custo Terceiros</p>
                            <p className="font-medium">{formatCurrency(vistoria.custo_terceiros)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Franquia</p>
                            <p className="font-medium">{formatCurrency(vistoria.valor_franquia)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Indenização</p>
                            <p className="font-medium">{formatCurrency(vistoria.valor_indenizacao)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editingVistoria} onOpenChange={() => setEditingVistoria(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Custos e Valores</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Custo Oficina</Label>
                <Input
                  type="number"
                  value={editForm.custo_oficina}
                  onChange={(e) => setEditForm({ ...editForm, custo_oficina: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Custo Reparo</Label>
                <Input
                  type="number"
                  value={editForm.custo_reparo}
                  onChange={(e) => setEditForm({ ...editForm, custo_reparo: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Custo Acordo</Label>
                <Input
                  type="number"
                  value={editForm.custo_acordo}
                  onChange={(e) => setEditForm({ ...editForm, custo_acordo: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Custo Terceiros</Label>
                <Input
                  type="number"
                  value={editForm.custo_terceiros}
                  onChange={(e) => setEditForm({ ...editForm, custo_terceiros: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Custo Perda Total</Label>
                <Input
                  type="number"
                  value={editForm.custo_perda_total}
                  onChange={(e) => setEditForm({ ...editForm, custo_perda_total: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Custo Perda Parcial</Label>
                <Input
                  type="number"
                  value={editForm.custo_perda_parcial}
                  onChange={(e) => setEditForm({ ...editForm, custo_perda_parcial: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Valor Franquia</Label>
                <Input
                  type="number"
                  value={editForm.valor_franquia}
                  onChange={(e) => setEditForm({ ...editForm, valor_franquia: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Valor Indenização</Label>
                <Input
                  type="number"
                  value={editForm.valor_indenizacao}
                  onChange={(e) => setEditForm({ ...editForm, valor_indenizacao: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingVistoria(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit}>
                <Check className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
