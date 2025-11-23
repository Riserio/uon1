import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileText, TrendingUp, AlertCircle, DollarSign } from 'lucide-react';

interface PortalSinistrosProps {
  corretoraId?: string;
}

export default function PortalSinistros({ corretoraId }: PortalSinistrosProps) {
  const [loading, setLoading] = useState(true);
  const [sinistros, setSinistros] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    emAnalise: 0,
    aguardando: 0,
    concluidos: 0,
    valorTotal: 0,
  });
  const [filtroStatus, setFiltroStatus] = useState('todos');

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

      // Calcular estatísticas
      const total = data?.length || 0;
      const emAnalise = data?.filter(s => s.status === 'em_analise').length || 0;
      const aguardando = data?.filter(s => s.status === 'aguardando_fotos').length || 0;
      const concluidos = data?.filter(s => s.status === 'concluida').length || 0;
      const valorTotal = data?.reduce((sum, s) => {
        return sum + (s.valor_indenizacao || s.custo_reparo || s.custo_perda_total || 0);
      }, 0) || 0;

      setStats({ total, emAnalise, aguardando, concluidos, valorTotal });
    } catch (error: any) {
      console.error('Error fetching sinistros:', error);
      toast.error('Erro ao carregar sinistros');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      'rascunho': { variant: 'secondary', label: 'Rascunho' },
      'aguardando_fotos': { variant: 'outline', label: 'Aguardando Fotos' },
      'em_analise': { variant: 'default', label: 'Em Análise' },
      'aprovada': { variant: 'default', label: 'Aprovada' },
      'reprovada': { variant: 'destructive', label: 'Reprovada' },
      'concluida': { variant: 'default', label: 'Concluída' },
    };
    const config = variants[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Cards de Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Sinistros</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Registros totais</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Análise</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.emAnalise}</div>
            <p className="text-xs text-muted-foreground">Processos ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aguardando</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.aguardando}</div>
            <p className="text-xs text-muted-foreground">Pendentes de documentação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {stats.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Indenizações e reparos</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
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

      {/* Tabela de Sinistros */}
      {loading ? (
        <div className="text-center py-12">Carregando sinistros...</div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Custo Estimado</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sinistros.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">
                      Nenhum sinistro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  sinistros.map((sinistro) => (
                    <TableRow key={sinistro.id}>
                      <TableCell className="font-medium">#{sinistro.numero}</TableCell>
                      <TableCell>{sinistro.tipo_sinistro || 'N/A'}</TableCell>
                      <TableCell>{sinistro.cliente_nome || 'N/A'}</TableCell>
                      <TableCell>{sinistro.veiculo_placa || 'N/A'}</TableCell>
                      <TableCell>
                        {new Date(sinistro.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {(sinistro.valor_indenizacao || sinistro.custo_reparo || sinistro.custo_perda_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>{getStatusBadge(sinistro.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
