import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatters';
import { useAuth } from '@/hooks/useAuth';
import { useMenuPermissions } from '@/hooks/useMenuPermissions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FileText, AlertCircle, DollarSign, ChevronDown, ChevronUp,
  Clock, Car, User, Plus, FileDown, Wrench, Shield,
  Receipt, AlertTriangle, CheckCircle2, XCircle
} from 'lucide-react';

interface PortalSinistrosProps {
  corretoraId?: string;
}

interface Andamento {
  id: string;
  descricao: string;
  created_at: string;
  created_by: string;
}

// Helper function to safely format dates
const safeFormatDate = (date: string | Date | null | undefined): string => {
  if (!date) return 'N/A';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Verificar se a data é válida e está em um range razoável
    if (isNaN(dateObj.getTime())) return 'N/A';
    
    const year = dateObj.getFullYear();
    if (year < 1900 || year > 2100) return 'N/A';
    
    return dateObj.toLocaleDateString('pt-BR');
  } catch {
    return 'N/A';
  }
};

const safeFormatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return 'N/A';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Verificar se a data é válida e está em um range razoável
    if (isNaN(dateObj.getTime())) return 'N/A';
    
    const year = dateObj.getFullYear();
    if (year < 1900 || year > 2100) return 'N/A';
    
    return dateObj.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'N/A';
  }
};

export default function PortalSinistros({ corretoraId }: PortalSinistrosProps) {
  const { user } = useAuth();
  const { canEditMenu } = useMenuPermissions(user?.id);
  const canEdit = canEditMenu("pid");
  
  const [loading, setLoading] = useState(true);
  const [sinistros, setSinistros] = useState<any[]>([]);
  const [andamentos, setAndamentos] = useState<Record<string, Andamento[]>>({});
  const [stats, setStats] = useState({
    total: 0,
    emAnalise: 0,
    aguardando: 0,
    concluidos: 0,
    valorTotal: 0,
    custoTotal: 0,
  });
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [editingCosts, setEditingCosts] = useState<string | null>(null);
  const [newAndamento, setNewAndamento] = useState('');
  const [addingAndamento, setAddingAndamento] = useState<string | null>(null);
  const [editedCosts, setEditedCosts] = useState<Record<string, any>>({});

  useEffect(() => {
    if (corretoraId) {
      fetchSinistros();
    }
  }, [corretoraId, filtroStatus]);

  const fetchSinistros = async () => {
    if (!corretoraId) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('vistorias')
        .select('*')
        .eq('corretora_id', corretoraId)
        .order('created_at', { ascending: false });

      if (filtroStatus !== 'todos') {
        query = query.eq('status', filtroStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      setSinistros(data || []);

      const atendimentoIds = (data || [])
        .filter(s => s.atendimento_id)
        .map(s => s.atendimento_id);

      if (atendimentoIds.length > 0) {
        const { data: andamentosData } = await supabase
          .from('andamentos')
          .select('*')
          .in('atendimento_id', atendimentoIds)
          .order('created_at', { ascending: false });

        if (andamentosData) {
          const grouped: Record<string, Andamento[]> = {};
          andamentosData.forEach((a: any) => {
            if (!grouped[a.atendimento_id]) grouped[a.atendimento_id] = [];
            grouped[a.atendimento_id].push(a);
          });
          setAndamentos(grouped);
        }
      }

      const total = data?.length || 0;
      const emAnalise = data?.filter(s => s.status === 'em_analise').length || 0;
      const aguardando = data?.filter(s => s.status === 'aguardando_fotos').length || 0;
      const concluidos = data?.filter(s => s.status === 'concluida').length || 0;
      const valorTotal = data?.reduce((sum, s) => sum + (s.valor_indenizacao || 0), 0) || 0;
      const custoTotal = data?.reduce((sum, s) => {
        return sum + (s.custo_oficina || 0) + (s.custo_reparo || 0) + 
               (s.custo_acordo || 0) + (s.custo_terceiros || 0) + 
               (s.custo_perda_total || 0) + (s.custo_perda_parcial || 0);
      }, 0) || 0;

      setStats({ total, emAnalise, aguardando, concluidos, valorTotal, custoTotal });
    } catch (error: any) {
      console.error('Error fetching sinistros:', error);
      toast.error('Erro ao carregar sinistros');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string; icon: any }> = {
      'rascunho': { variant: 'secondary', label: 'Rascunho', icon: FileText },
      'aguardando_fotos': { variant: 'outline', label: 'Aguardando Fotos', icon: Clock },
      'em_analise': { variant: 'default', label: 'Em Análise', icon: AlertCircle },
      'aprovada': { variant: 'default', label: 'Aprovada', icon: CheckCircle2 },
      'reprovada': { variant: 'destructive', label: 'Reprovada', icon: XCircle },
      'concluida': { variant: 'default', label: 'Concluída', icon: CheckCircle2 },
    };
    const config = variants[status] || { variant: 'secondary', label: status, icon: FileText };
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const toggleCardExpand = (id: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCards(newExpanded);
  };

  const getTotalCustos = (sinistro: any) => {
    return (sinistro.custo_oficina || 0) + 
           (sinistro.custo_reparo || 0) + 
           (sinistro.custo_acordo || 0) + 
           (sinistro.custo_terceiros || 0) + 
           (sinistro.custo_perda_total || 0) + 
           (sinistro.custo_perda_parcial || 0);
  };

  const handleSaveCosts = async (sinistroId: string) => {
    const costs = editedCosts[sinistroId];
    if (!costs) return;

    try {
      const { error } = await supabase
        .from('vistorias')
        .update({
          custo_oficina: costs.custo_oficina || 0,
          custo_reparo: costs.custo_reparo || 0,
          custo_acordo: costs.custo_acordo || 0,
          custo_terceiros: costs.custo_terceiros || 0,
          custo_perda_total: costs.custo_perda_total || 0,
          custo_perda_parcial: costs.custo_perda_parcial || 0,
          valor_franquia: costs.valor_franquia || 0,
          valor_indenizacao: costs.valor_indenizacao || 0,
        })
        .eq('id', sinistroId);

      if (error) throw error;

      toast.success('Custos atualizados com sucesso!');
      setEditingCosts(null);
      fetchSinistros();
    } catch (error: any) {
      console.error('Error saving costs:', error);
      toast.error('Erro ao salvar custos');
    }
  };

  const handleAddAndamento = async (sinistroId: string, atendimentoId: string) => {
    if (!newAndamento.trim() || !user) return;

    try {
      const { error } = await supabase.from('andamentos').insert({
        atendimento_id: atendimentoId,
        descricao: newAndamento,
        created_by: user.id,
      });

      if (error) throw error;

      toast.success('Andamento adicionado!');
      setNewAndamento('');
      setAddingAndamento(null);
      fetchSinistros();
    } catch (error: any) {
      console.error('Error adding andamento:', error);
      toast.error('Erro ao adicionar andamento');
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório de Sinistros', 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 28);

    doc.setFontSize(12);
    doc.text('Resumo', 14, 40);
    doc.setFontSize(10);
    doc.text(`Total de Sinistros: ${stats.total}`, 14, 48);
    doc.text(`Em Análise: ${stats.emAnalise}`, 14, 54);
    doc.text(`Concluídos: ${stats.concluidos}`, 14, 60);
    doc.text(`Valor Total Indenizações: ${formatCurrency(stats.valorTotal)}`, 14, 66);
    doc.text(`Custo Total: ${formatCurrency(stats.custoTotal)}`, 14, 72);

    autoTable(doc, {
      startY: 80,
      head: [['Nº', 'Tipo', 'Cliente', 'Placa', 'Status', 'Custo Total', 'Indenização']],
      body: sinistros.map(s => [
        `#${s.numero}`,
        s.tipo_sinistro || 'N/A',
        s.cliente_nome || 'N/A',
        s.veiculo_placa || 'N/A',
        s.status,
        formatCurrency(getTotalCustos(s)),
        formatCurrency(s.valor_indenizacao || 0),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save('relatorio-sinistros.pdf');
    toast.success('PDF exportado com sucesso!');
  };

  const startEditCosts = (sinistro: any) => {
    setEditedCosts({
      ...editedCosts,
      [sinistro.id]: {
        custo_oficina: sinistro.custo_oficina || 0,
        custo_reparo: sinistro.custo_reparo || 0,
        custo_acordo: sinistro.custo_acordo || 0,
        custo_terceiros: sinistro.custo_terceiros || 0,
        custo_perda_total: sinistro.custo_perda_total || 0,
        custo_perda_parcial: sinistro.custo_perda_parcial || 0,
        valor_franquia: sinistro.valor_franquia || 0,
        valor_indenizacao: sinistro.valor_indenizacao || 0,
      }
    });
    setEditingCosts(sinistro.id);
  };

  const updateCostField = (sinistroId: string, field: string, value: number) => {
    setEditedCosts({
      ...editedCosts,
      [sinistroId]: {
        ...editedCosts[sinistroId],
        [field]: value,
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold">Sinistros</h2>
          <p className="text-sm text-muted-foreground">Gestão detalhada de sinistros e custos</p>
        </div>
        <Button onClick={exportToPDF} variant="outline" className="gap-2">
          <FileDown className="h-4 w-4" />
          Exportar PDF
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Análise</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.emAnalise}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aguardando</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.aguardando}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.concluidos}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custo Total</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">{formatCurrency(stats.custoTotal)}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Indenizações</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-600">{formatCurrency(stats.valorTotal)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label htmlFor="status-filter">Filtrar por Status:</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger id="status-filter" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="aguardando_fotos">Aguardando Fotos</SelectItem>
                <SelectItem value="em_analise">Em Análise</SelectItem>
                <SelectItem value="aprovada">Aprovada</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : sinistros.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum sinistro encontrado
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sinistros.map((sinistro) => {
            const isExpanded = expandedCards.has(sinistro.id);
            const sinistroAndamentos = sinistro.atendimento_id ? andamentos[sinistro.atendimento_id] || [] : [];
            const isEditingThisCost = editingCosts === sinistro.id;
            
            return (
              <Collapsible key={sinistro.id} open={isExpanded} onOpenChange={() => toggleCardExpand(sinistro.id)}>
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col">
                            <CardTitle className="text-lg">#{sinistro.numero}</CardTitle>
                            <CardDescription>{sinistro.tipo_sinistro || 'Sinistro'}</CardDescription>
                          </div>
                          {getStatusBadge(sinistro.status)}
                        </div>
                        
                        <div className="flex items-center gap-6">
                          <div className="hidden md:flex items-center gap-6 text-sm">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span>{sinistro.cliente_nome || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Car className="h-4 w-4 text-muted-foreground" />
                              <span>{sinistro.veiculo_placa || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <span className="font-semibold">{formatCurrency(getTotalCustos(sinistro))}</span>
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="border-t pt-6">
                      <Tabs defaultValue="detalhes" className="space-y-4">
                        <TabsList className="grid grid-cols-3 w-full max-w-md">
                          <TabsTrigger value="detalhes" className="text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Detalhes</TabsTrigger>
                          <TabsTrigger value="custos" className="text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Custos</TabsTrigger>
                          <TabsTrigger value="timeline" className="text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Timeline</TabsTrigger>
                        </TabsList>

                        <TabsContent value="detalhes" className="space-y-4">
                          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Cliente</p>
                              <p className="font-medium">{sinistro.cliente_nome || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">CPF</p>
                              <p className="font-medium">{sinistro.cliente_cpf || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Telefone</p>
                              <p className="font-medium">{sinistro.cliente_telefone || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Email</p>
                              <p className="font-medium">{sinistro.cliente_email || 'N/A'}</p>
                            </div>
                          </div>

                          <Separator />

                          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Veículo</p>
                              <p className="font-medium">{sinistro.veiculo_marca} {sinistro.veiculo_modelo}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Placa</p>
                              <p className="font-medium">{sinistro.veiculo_placa || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Ano</p>
                              <p className="font-medium">{sinistro.veiculo_ano || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Chassi</p>
                              <p className="font-medium">{sinistro.veiculo_chassi || 'N/A'}</p>
                            </div>
                          </div>

                          <Separator />

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Data do Incidente</p>
                              <p className="font-medium">
                                {safeFormatDate(sinistro.data_incidente)}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Local</p>
                              <p className="font-medium">{sinistro.endereco || 'N/A'}</p>
                            </div>
                          </div>

                          {sinistro.relato_incidente && (
                            <>
                              <Separator />
                              <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Relato do Incidente</p>
                                <p className="text-sm bg-muted/50 p-3 rounded-lg">{sinistro.relato_incidente}</p>
                              </div>
                            </>
                          )}
                        </TabsContent>

                        <TabsContent value="custos" className="space-y-4">
                          <div className="flex justify-between items-center">
                            <h4 className="font-semibold flex items-center gap-2">
                              <Receipt className="h-4 w-4" />
                              Custos do Sinistro
                            </h4>
                            {canEdit && !isEditingThisCost && (
                              <Button size="sm" variant="outline" onClick={() => startEditCosts(sinistro)}>
                                Editar Custos
                              </Button>
                            )}
                            {isEditingThisCost && (
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => setEditingCosts(null)}>
                                  Cancelar
                                </Button>
                                <Button size="sm" onClick={() => handleSaveCosts(sinistro.id)}>
                                  Salvar
                                </Button>
                              </div>
                            )}
                          </div>

                          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            {[
                              { key: 'custo_oficina', label: 'Custo Oficina', icon: Wrench },
                              { key: 'custo_reparo', label: 'Custo Reparo', icon: Shield },
                              { key: 'custo_acordo', label: 'Custo Acordo', icon: Receipt },
                              { key: 'custo_terceiros', label: 'Custo Terceiros', icon: User },
                              { key: 'custo_perda_total', label: 'Perda Total', icon: AlertTriangle },
                              { key: 'custo_perda_parcial', label: 'Perda Parcial', icon: AlertCircle },
                              { key: 'valor_franquia', label: 'Franquia', icon: DollarSign },
                              { key: 'valor_indenizacao', label: 'Indenização', icon: CheckCircle2 },
                            ].map(({ key, label, icon: Icon }) => (
                              <div key={key} className="space-y-2">
                                <Label className="flex items-center gap-2 text-muted-foreground">
                                  <Icon className="h-3 w-3" />
                                  {label}
                                </Label>
                                {isEditingThisCost ? (
                                  <CurrencyInput
                                    value={(editedCosts[sinistro.id]?.[key] || 0).toString()}
                                    onValueChange={(values) => updateCostField(sinistro.id, key, parseFloat(values.value || '0'))}
                                  />
                                ) : (
                                  <p className="font-semibold text-lg">{formatCurrency(sinistro[key] || 0)}</p>
                                )}
                              </div>
                            ))}
                          </div>

                          <Separator />

                          <div className="flex justify-between items-center bg-muted/50 p-4 rounded-lg">
                            <span className="font-semibold">Total de Custos</span>
                            <span className="text-2xl font-bold text-red-600">
                              {formatCurrency(getTotalCustos(sinistro))}
                            </span>
                          </div>
                        </TabsContent>

                        <TabsContent value="timeline" className="space-y-4">
                          <div className="flex justify-between items-center">
                            <h4 className="font-semibold flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              Histórico / Andamentos
                            </h4>
                            {canEdit && sinistro.atendimento_id && (
                              <Dialog open={addingAndamento === sinistro.id} onOpenChange={(open) => setAddingAndamento(open ? sinistro.id : null)}>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="outline" className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    Adicionar
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Novo Andamento</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <Textarea
                                      placeholder="Descreva o andamento..."
                                      value={newAndamento}
                                      onChange={(e) => setNewAndamento(e.target.value)}
                                      rows={4}
                                    />
                                    <div className="flex justify-end gap-2">
                                      <Button variant="outline" onClick={() => setAddingAndamento(null)}>
                                        Cancelar
                                      </Button>
                                      <Button onClick={() => handleAddAndamento(sinistro.id, sinistro.atendimento_id)}>
                                        Salvar
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>

                          <div className="space-y-4">
                            <div className="flex gap-4">
                              <div className="flex flex-col items-center">
                                <div className="w-3 h-3 rounded-full bg-primary"></div>
                                <div className="w-0.5 flex-1 bg-border"></div>
                              </div>
                              <div className="pb-4">
                                <p className="font-medium">Sinistro Criado</p>
                                <p className="text-sm text-muted-foreground">
                                  {safeFormatDateTime(sinistro.created_at)}
                                </p>
                              </div>
                            </div>

                            {sinistroAndamentos.map((and, idx) => (
                              <div key={and.id} className="flex gap-4">
                                <div className="flex flex-col items-center">
                                  <div className="w-3 h-3 rounded-full bg-muted-foreground"></div>
                                  {idx < sinistroAndamentos.length - 1 && <div className="w-0.5 flex-1 bg-border"></div>}
                                </div>
                                <div className="pb-4">
                                  <p className="text-sm">{and.descricao}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {safeFormatDateTime(and.created_at)}
                                  </p>
                                </div>
                              </div>
                            ))}

                            {sinistroAndamentos.length === 0 && !sinistro.atendimento_id && (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                Este sinistro não possui atendimento vinculado
                              </p>
                            )}
                            {sinistroAndamentos.length === 0 && sinistro.atendimento_id && (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                Nenhum andamento registrado
                              </p>
                            )}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
