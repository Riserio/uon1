import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, FileText, Eye, Download, BarChart3, Search } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Vistoria {
  id: string;
  numero: number;
  tipo_abertura: string;
  tipo_vistoria: string;
  status: string;
  cliente_nome?: string;
  veiculo_placa?: string;
  veiculo_modelo?: string;
  created_at: string;
  completed_at?: string;
}

export default function Vistorias() {
  const navigate = useNavigate();
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadVistorias();
  }, []);

  const loadVistorias = async () => {
    try {
      const { data, error } = await supabase
        .from('vistorias')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVistorias(data || []);
    } catch (error) {
      console.error('Erro ao carregar vistorias:', error);
      toast.error('Erro ao carregar vistorias');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'aguardando_fotos': return 'bg-yellow-500';
      case 'em_analise': return 'bg-blue-500';
      case 'concluida': return 'bg-green-500';
      case 'cancelada': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'aguardando_fotos': return 'Aguardando Fotos';
      case 'em_analise': return 'Em Análise';
      case 'concluida': return 'Concluída';
      case 'cancelada': return 'Cancelada';
      default: return status;
    }
  };

  const getTipoLabel = (tipo: string) => {
    return tipo === 'sinistro' ? 'Sinistro' : 'Reativação';
  };

  const filteredVistorias = vistorias.filter(v => 
    v.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.veiculo_placa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.numero.toString().includes(searchTerm)
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Histórico de Vistorias
            </h1>
            <p className="text-muted-foreground mt-1">
              {filteredVistorias.length} vistoria{filteredVistorias.length !== 1 ? 's' : ''} encontrada{filteredVistorias.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => navigate('/vistorias/dashboard')} variant="outline" size="lg" className="gap-2">
              <BarChart3 className="h-5 w-5" />
              Dashboard
            </Button>
            <Button onClick={() => navigate('/vistorias/nova/manual')} variant="outline" size="lg" className="gap-2">
              <FileText className="h-5 w-5" />
              Manual
            </Button>
            <Button onClick={() => navigate('/vistorias/nova/digital')} size="lg" className="gap-2 bg-gradient-to-r from-primary to-primary/80">
              <Camera className="h-5 w-5" />
              Digital
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input placeholder="Buscar por cliente, placa ou número..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Carregando vistorias...</p>
          </div>
        ) : filteredVistorias.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Camera className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{searchTerm ? 'Nenhuma vistoria encontrada' : 'Nenhuma vistoria cadastrada'}</h3>
              <p className="text-muted-foreground mb-6">{searchTerm ? 'Tente outro termo de busca' : 'Comece criando uma nova vistoria'}</p>
              {!searchTerm && (
                <div className="flex gap-3 justify-center">
                  <Button onClick={() => navigate('/vistorias/nova/manual')} variant="outline"><FileText className="h-4 w-4 mr-2" />Vistoria Manual</Button>
                  <Button onClick={() => navigate('/vistorias/nova/digital')}><Camera className="h-4 w-4 mr-2" />Vistoria Digital</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredVistorias.map((vistoria) => (
              <Card key={vistoria.id} className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate(`/vistorias/${vistoria.id}`)}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline" className="font-mono font-semibold">#{vistoria.numero}</Badge>
                        <Badge className={getStatusColor(vistoria.status)}>{getStatusLabel(vistoria.status)}</Badge>
                        <Badge variant="outline">
                          {vistoria.tipo_abertura === 'digital' ? <><Camera className="h-3 w-3 mr-1" /> Digital</> : <><FileText className="h-3 w-3 mr-1" /> Manual</>}
                        </Badge>
                        <Badge variant="outline">{getTipoLabel(vistoria.tipo_vistoria)}</Badge>
                      </div>
                      <p className="font-semibold text-lg">{vistoria.cliente_nome || 'Cliente não informado'}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {vistoria.veiculo_placa || 'Placa não informada'} • {vistoria.veiculo_modelo || 'Modelo não informado'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Criada em {format(new Date(vistoria.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        {vistoria.completed_at && ` • Concluída em ${format(new Date(vistoria.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/vistorias/${vistoria.id}`); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {vistoria.status === 'concluida' && (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/vistorias/${vistoria.id}`); }}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
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
