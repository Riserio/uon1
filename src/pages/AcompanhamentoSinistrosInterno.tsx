import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Search, ArrowLeft, Clock, CheckCircle2, AlertCircle, 
  FileText, Calendar, MapPin, Car, User, Phone, Mail,
  TrendingUp, DollarSign, Package, Wrench
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Vistoria {
  id: string;
  numero: number;
  status: string;
  tipo_vistoria: string;
  tipo_sinistro: string | null;
  cliente_nome: string | null;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  veiculo_placa: string | null;
  veiculo_marca: string | null;
  veiculo_modelo: string | null;
  veiculo_ano: string | null;
  data_incidente: string | null;
  created_at: string;
  completed_at: string | null;
  custo_total: number;
  endereco: string | null;
}

export default function AcompanhamentoSinistrosInterno() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [filteredVistorias, setFilteredVistorias] = useState<Vistoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('all');

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

      const vistoriasWithCusto = (data || []).map(v => ({
        ...v,
        custo_total: (Number(v.custo_oficina) || 0) + 
                     (Number(v.custo_reparo) || 0) + 
                     (Number(v.custo_acordo) || 0) + 
                     (Number(v.custo_terceiros) || 0) + 
                     (Number(v.custo_perda_total) || 0) + 
                     (Number(v.custo_perda_parcial) || 0)
      }));

      setVistorias(vistoriasWithCusto);
    } catch (error) {
      toast.error('Erro ao carregar vistorias');
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
        v.cliente_nome?.toLowerCase().includes(term) ||
        v.cliente_cpf?.includes(term) ||
        v.veiculo_placa?.toLowerCase().includes(term)
      );
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(v => v.status === selectedStatus);
    }

    setFilteredVistorias(filtered);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concluida': return 'bg-green-500/10 text-green-600 border-green-200';
      case 'em_analise': return 'bg-blue-500/10 text-blue-600 border-blue-200';
      case 'aguardando_fotos': return 'bg-amber-500/10 text-amber-600 border-amber-200';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'concluida': return <CheckCircle2 className="h-4 w-4" />;
      case 'em_analise': return <Clock className="h-4 w-4" />;
      case 'aguardando_fotos': return <AlertCircle className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'concluida': return 'Concluída';
      case 'em_analise': return 'Em Análise';
      case 'aguardando_fotos': return 'Aguardando Fotos';
      default: return status;
    }
  };

  const stats = {
    total: vistorias.length,
    aguardando: vistorias.filter(v => v.status === 'aguardando_fotos').length,
    analise: vistorias.filter(v => v.status === 'em_analise').length,
    concluidas: vistorias.filter(v => v.status === 'concluida').length,
    custoTotal: vistorias.reduce((sum, v) => sum + v.custo_total, 0)
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-card/95 via-card to-card/95 backdrop-blur-md border-b border-border/50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Acompanhamento de Sinistros
                </h1>
                <p className="text-sm text-muted-foreground">Monitore todos os processos em tempo real</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package className="h-4 w-4" />
                Total de Processos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.total}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Aguardando
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600">{stats.aguardando}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Em Análise
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.analise}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Concluídas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.concluidas}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Custo Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.custoTotal)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número, cliente, CPF ou placa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={selectedStatus === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStatus('all')}
                >
                  Todos
                </Button>
                <Button
                  variant={selectedStatus === 'aguardando_fotos' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStatus('aguardando_fotos')}
                >
                  Aguardando
                </Button>
                <Button
                  variant={selectedStatus === 'em_analise' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStatus('em_analise')}
                >
                  Em Análise
                </Button>
                <Button
                  variant={selectedStatus === 'concluida' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStatus('concluida')}
                >
                  Concluídas
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vistorias List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Carregando processos...</p>
            </div>
          </div>
        ) : filteredVistorias.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum processo encontrado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredVistorias.map((vistoria) => (
              <Card 
                key={vistoria.id} 
                className="hover:shadow-lg transition-all cursor-pointer border-l-4"
                style={{ borderLeftColor: vistoria.status === 'concluida' ? '#22c55e' : vistoria.status === 'em_analise' ? '#3b82f6' : '#f59e0b' }}
                onClick={() => navigate(`/vistorias/${vistoria.id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Left Side - Main Info */}
                    <div className="flex-1 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl font-bold text-foreground">#{vistoria.numero}</span>
                            <Badge className={`${getStatusColor(vistoria.status)} border flex items-center gap-1`}>
                              {getStatusIcon(vistoria.status)}
                              {getStatusLabel(vistoria.status)}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            Criado em {format(new Date(vistoria.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </div>
                        </div>
                      </div>

                      {/* Cliente Info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{vistoria.cliente_nome || 'Não informado'}</span>
                          </div>
                          {vistoria.cliente_cpf && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <FileText className="h-4 w-4" />
                              CPF: {vistoria.cliente_cpf}
                            </div>
                          )}
                          {vistoria.cliente_telefone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="h-4 w-4" />
                              {vistoria.cliente_telefone}
                            </div>
                          )}
                          {vistoria.cliente_email && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Mail className="h-4 w-4" />
                              {vistoria.cliente_email}
                            </div>
                          )}
                        </div>

                        {/* Veículo Info */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Car className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {vistoria.veiculo_marca} {vistoria.veiculo_modelo}
                            </span>
                          </div>
                          {vistoria.veiculo_placa && (
                            <div className="text-sm text-muted-foreground">
                              Placa: {vistoria.veiculo_placa}
                            </div>
                          )}
                          {vistoria.veiculo_ano && (
                            <div className="text-sm text-muted-foreground">
                              Ano: {vistoria.veiculo_ano}
                            </div>
                          )}
                          {vistoria.tipo_sinistro && (
                            <Badge variant="outline" className="text-xs">
                              {vistoria.tipo_sinistro}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {vistoria.endereco && (
                        <div className="flex items-start gap-2 text-sm text-muted-foreground pt-2 border-t">
                          <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{vistoria.endereco}</span>
                        </div>
                      )}
                    </div>

                    {/* Right Side - Costs */}
                    {vistoria.custo_total > 0 && (
                      <div className="md:w-48 bg-muted/30 rounded-lg p-4 flex flex-col justify-center">
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-2">
                            <DollarSign className="h-4 w-4" />
                            <span>Custo Estimado</span>
                          </div>
                          <div className="text-2xl font-bold text-primary">
                            {new Intl.NumberFormat('pt-BR', { 
                              style: 'currency', 
                              currency: 'BRL' 
                            }).format(vistoria.custo_total)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
