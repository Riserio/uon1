import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { MessageSquare, ThumbsUp, ThumbsDown, DollarSign, TrendingUp, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface PortalComiteProps {
  corretoraId?: string;
}

// Perguntas de avaliação de sinistros baseadas no mercado de seguros
const PERGUNTAS_AVALIACAO = [
  {
    id: 'cobertura_vigente',
    pergunta: 'A cobertura estava vigente na data do sinistro?',
    categoria: 'Cobertura',
  },
  {
    id: 'pagamentos_em_dia',
    pergunta: 'O associado está com os pagamentos em dia?',
    categoria: 'Adimplência',
  },
  {
    id: 'carencia_cumprida',
    pergunta: 'O período de carência foi cumprido?',
    categoria: 'Carência',
  },
  {
    id: 'documentacao_completa',
    pergunta: 'A documentação está completa e correta?',
    categoria: 'Documentação',
  },
  {
    id: 'bo_apresentado',
    pergunta: 'O Boletim de Ocorrência foi apresentado (quando aplicável)?',
    categoria: 'Documentação',
  },
  {
    id: 'vistoria_realizada',
    pergunta: 'A vistoria foi realizada e aprovada?',
    categoria: 'Vistoria',
  },
  {
    id: 'danos_cobertos',
    pergunta: 'Os danos estão cobertos pelo plano contratado?',
    categoria: 'Cobertura',
  },
  {
    id: 'sem_fraude_indicios',
    pergunta: 'Não há indícios de fraude ou má-fé?',
    categoria: 'Análise',
  },
  {
    id: 'valores_compativeis',
    pergunta: 'Os valores solicitados são compatíveis com os danos?',
    categoria: 'Análise',
  },
  {
    id: 'terceiros_identificados',
    pergunta: 'Os terceiros envolvidos foram identificados (quando aplicável)?',
    categoria: 'Terceiros',
  },
];

export default function PortalComite({ corretoraId }: PortalComiteProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sinistros, setSinistros] = useState<any[]>([]);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [selectedSinistro, setSelectedSinistro] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [respostas, setRespostas] = useState<Record<string, boolean | null>>({});
  const [deliberacao, setDeliberacao] = useState({
    decisao: '',
    valor_aprovado: '',
    justificativa: '',
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      'rascunho': { variant: 'secondary', label: 'Rascunho' },
      'aguardando_fotos': { variant: 'outline', label: 'Aguardando' },
      'em_analise': { variant: 'default', label: 'Em Análise' },
      'aprovada': { variant: 'default', label: 'Aprovada' },
      'reprovada': { variant: 'destructive', label: 'Reprovada' },
      'concluida': { variant: 'default', label: 'Concluída' },
    };
    const config = variants[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  useEffect(() => {
    if (corretoraId) {
      fetchSinistrosParaComite();
    }
  }, [corretoraId]);

  const fetchSinistrosParaComite = async () => {
    if (!corretoraId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vistorias')
        .select('*')
        .eq('corretora_id', corretoraId)
        .in('status', ['em_analise', 'aprovada'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSinistros(data || []);
    } catch (error: any) {
      console.error('Error fetching sinistros:', error);
      toast.error('Erro ao carregar sinistros');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeliberacao = (sinistro: any) => {
    setSelectedSinistro(sinistro);
    // Resetar respostas
    const respostasIniciais: Record<string, boolean | null> = {};
    PERGUNTAS_AVALIACAO.forEach(p => {
      respostasIniciais[p.id] = null;
    });
    setRespostas(respostasIniciais);
    setDeliberacao({
      decisao: '',
      valor_aprovado: sinistro.valor_indenizacao?.toString() || sinistro.custo_reparo?.toString() || '',
      justificativa: '',
    });
    setDialogOpen(true);
  };

  const handleRespostaChange = (perguntaId: string, valor: boolean) => {
    setRespostas(prev => ({
      ...prev,
      [perguntaId]: valor,
    }));
  };

  const calcularPontuacaoAvaliacao = () => {
    const respondidas = Object.values(respostas).filter(r => r !== null);
    const positivas = Object.values(respostas).filter(r => r === true).length;
    if (respondidas.length === 0) return 0;
    return positivas / PERGUNTAS_AVALIACAO.length;
  };

  const handleSalvarDeliberacao = async () => {
    if (!selectedSinistro || !deliberacao.decisao) {
      toast.error('Selecione uma decisão');
      return;
    }

    // Verificar se todas as perguntas foram respondidas
    const todasRespondidas = PERGUNTAS_AVALIACAO.every(p => respostas[p.id] !== null);
    if (!todasRespondidas) {
      toast.error('Responda todas as perguntas de avaliação');
      return;
    }

    try {
      const pontuacao = calcularPontuacaoAvaliacao();
      
      const observacoesComite = {
        data: new Date().toISOString(),
        usuario: user?.email,
        decisao: deliberacao.decisao,
        valor_aprovado: parseFloat(deliberacao.valor_aprovado) || 0,
        justificativa: deliberacao.justificativa,
        avaliacao: {
          respostas: respostas,
          pontuacao: pontuacao,
          perguntas_positivas: Object.values(respostas).filter(r => r === true).length,
          total_perguntas: PERGUNTAS_AVALIACAO.length,
        },
      };

      const atualizacao: any = {
        observacoes_ia: JSON.stringify(observacoesComite),
      };

      if (deliberacao.decisao === 'aprovado') {
        atualizacao.valor_indenizacao = parseFloat(deliberacao.valor_aprovado) || 0;
        atualizacao.status = 'aprovada';
      } else if (deliberacao.decisao === 'negado') {
        atualizacao.status = 'reprovada';
      }

      const { error } = await supabase
        .from('vistorias')
        .update(atualizacao)
        .eq('id', selectedSinistro.id);

      if (error) throw error;

      toast.success('Deliberação registrada com sucesso');
      setDialogOpen(false);
      fetchSinistrosParaComite();
    } catch (error: any) {
      console.error('Error saving deliberacao:', error);
      toast.error('Erro ao salvar deliberação');
    }
  };

  const getValorEstimado = (sinistro: any) => {
    return sinistro.valor_indenizacao || sinistro.custo_reparo || sinistro.custo_perda_total || 0;
  };

  const sinistrosFiltrados = sinistros.filter(s => {
    if (filtroStatus === 'todos') return true;
    return s.status === filtroStatus;
  });

  const pontuacaoAtual = calcularPontuacaoAvaliacao();
  const respondidas = Object.values(respostas).filter(r => r !== null).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Comitê</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sinistros.length}</div>
            <p className="text-xs text-muted-foreground">Processos aguardando deliberação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(sinistros.reduce((sum, s) => sum + getValorEstimado(s), 0))}
            </div>
            <p className="text-xs text-muted-foreground">Valor estimado total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sinistros.length > 0 
                ? formatCurrency(sinistros.reduce((sum, s) => sum + getValorEstimado(s), 0) / sinistros.length)
                : 'R$ 0,00'}
            </div>
            <p className="text-xs text-muted-foreground">Valor médio por sinistro</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sinistros para Deliberação</CardTitle>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="em_analise">Em Análise</SelectItem>
                <SelectItem value="aprovada">Aprovados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">Carregando...</div>
          ) : sinistrosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum sinistro para deliberação
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor Estimado</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sinistrosFiltrados.map((sinistro) => (
                  <TableRow key={sinistro.id}>
                    <TableCell className="font-medium">#{sinistro.numero}</TableCell>
                    <TableCell>{sinistro.tipo_sinistro || 'N/A'}</TableCell>
                    <TableCell>{sinistro.cliente_nome || 'N/A'}</TableCell>
                    <TableCell>
                      {sinistro.veiculo_placa ? (
                        <div>
                          <div className="font-medium">{sinistro.veiculo_placa}</div>
                          <div className="text-xs text-muted-foreground">
                            {sinistro.veiculo_marca} {sinistro.veiculo_modelo}
                          </div>
                        </div>
                      ) : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {new Date(sinistro.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(getValorEstimado(sinistro))}
                    </TableCell>
                    <TableCell>{getStatusBadge(sinistro.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => handleOpenDeliberacao(sinistro)}
                      >
                        Deliberar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Deliberação */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deliberação do Comitê - Sinistro #{selectedSinistro?.numero}</DialogTitle>
          </DialogHeader>

          {selectedSinistro && (
            <div className="space-y-6">
              {/* Informações do Sinistro */}
              <Card className="bg-muted/50">
                <CardContent className="pt-6 space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Cliente</p>
                      <p className="font-medium">{selectedSinistro.cliente_nome}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tipo</p>
                      <p className="font-medium">{selectedSinistro.tipo_sinistro}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Veículo</p>
                      <p className="font-medium">
                        {selectedSinistro.veiculo_marca} {selectedSinistro.veiculo_modelo} - {selectedSinistro.veiculo_placa}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Data do Incidente</p>
                      <p className="font-medium">
                        {selectedSinistro.data_incidente 
                          ? new Date(selectedSinistro.data_incidente).toLocaleDateString('pt-BR')
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Perguntas de Avaliação */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Avaliação do Sinistro</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {respondidas}/{PERGUNTAS_AVALIACAO.length} respondidas
                    </span>
                    <Badge variant={pontuacaoAtual >= 0.7 ? 'default' : pontuacaoAtual >= 0.4 ? 'secondary' : 'destructive'}>
                      {formatPercent(pontuacaoAtual)}
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-3 border rounded-lg p-4">
                  {PERGUNTAS_AVALIACAO.map((pergunta, index) => (
                    <div key={pergunta.id} className="space-y-2">
                      {index > 0 && PERGUNTAS_AVALIACAO[index - 1].categoria !== pergunta.categoria && (
                        <Separator className="my-3" />
                      )}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <Badge variant="outline" className="mb-1 text-[10px]">
                            {pergunta.categoria}
                          </Badge>
                          <p className="text-sm">{pergunta.pergunta}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={respostas[pergunta.id] === true ? 'default' : 'outline'}
                            className={`gap-1 ${respostas[pergunta.id] === true ? 'bg-green-600 hover:bg-green-700' : ''}`}
                            onClick={() => handleRespostaChange(pergunta.id, true)}
                          >
                            <CheckCircle className="h-3 w-3" />
                            Sim
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={respostas[pergunta.id] === false ? 'default' : 'outline'}
                            className={`gap-1 ${respostas[pergunta.id] === false ? 'bg-red-600 hover:bg-red-700' : ''}`}
                            onClick={() => handleRespostaChange(pergunta.id, false)}
                          >
                            <XCircle className="h-3 w-3" />
                            Não
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Decisão */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="decisao">Decisão do Comitê *</Label>
                  <Select
                    value={deliberacao.decisao}
                    onValueChange={(value) => setDeliberacao({ ...deliberacao, decisao: value })}
                  >
                    <SelectTrigger id="decisao">
                      <SelectValue placeholder="Selecione a decisão" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aprovado">
                        <div className="flex items-center">
                          <ThumbsUp className="mr-2 h-4 w-4 text-green-600" />
                          Aprovar Indenização
                        </div>
                      </SelectItem>
                      <SelectItem value="negado">
                        <div className="flex items-center">
                          <ThumbsDown className="mr-2 h-4 w-4 text-red-600" />
                          Negar Indenização
                        </div>
                      </SelectItem>
                      <SelectItem value="mais_informacoes">
                        <div className="flex items-center">
                          <AlertCircle className="mr-2 h-4 w-4 text-amber-600" />
                          Solicitar Mais Informações
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {deliberacao.decisao === 'aprovado' && (
                  <div className="space-y-2">
                    <Label htmlFor="valor_aprovado">Valor Aprovado *</Label>
                    <CurrencyInput
                      id="valor_aprovado"
                      value={deliberacao.valor_aprovado}
                      onValueChange={(values) => setDeliberacao({ ...deliberacao, valor_aprovado: values.value || '' })}
                      placeholder="R$ 0,00"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="justificativa">Justificativa / Observações *</Label>
                  <Textarea
                    id="justificativa"
                    value={deliberacao.justificativa}
                    onChange={(e) => setDeliberacao({ ...deliberacao, justificativa: e.target.value })}
                    placeholder="Descreva a justificativa da decisão do comitê..."
                    rows={4}
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSalvarDeliberacao}
                  disabled={!deliberacao.decisao || !deliberacao.justificativa || respondidas < PERGUNTAS_AVALIACAO.length}
                >
                  Salvar Deliberação
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
