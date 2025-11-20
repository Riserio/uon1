import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, FileText, Eye, Download, BarChart3 } from 'lucide-react';
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

  const totalVistorias = vistorias.length;
  const aguardandoFotos = vistorias.filter(v => v.status === 'aguardando_fotos').length;
  const emAnalise = vistorias.filter(v => v.status === 'em_analise').length;
  const concluidas = vistorias.filter(v => v.status === 'concluida').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Vistorias Veiculares
            </h1>
            <p className="text-muted-foreground mt-1">
              Gerencie vistorias digitais e manuais com análise por IA
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => navigate('/vistorias/dashboard')}
              variant="outline"
              size="lg"
              className="gap-2"
            >
              <BarChart3 className="h-5 w-5" />
              Dashboard
            </Button>
            <Button
              onClick={() => navigate('/vistorias/nova/manual')}
              variant="outline"
              size="lg"
              className="gap-2"
            >
              <FileText className="h-5 w-5" />
              Vistoria Manual
            </Button>
            <Button
              onClick={() => navigate('/vistorias/nova/digital')}
              size="lg"
              className="gap-2 bg-gradient-to-r from-primary to-primary/80"
            >
              <Camera className="h-5 w-5" />
              Vistoria Digital
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Vistorias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{totalVistorias}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Todas as vistorias
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Aguardando Fotos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{aguardandoFotos}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Pendentes de captura
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Em Análise
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{emAnalise}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Sendo processadas
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Concluídas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{concluidas}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Análise finalizada
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Vistorias */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Vistorias</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                Carregando vistorias...
              </div>
            ) : vistorias.length === 0 ? (
              <div className="text-center py-12">
                <Camera className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhuma vistoria encontrada</h3>
                <p className="text-muted-foreground mb-6">
                  Comece criando uma nova vistoria digital ou manual
                </p>
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={() => navigate('/vistorias/nova/manual')}
                    variant="outline"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Vistoria Manual
                  </Button>
                  <Button onClick={() => navigate('/vistorias/nova/digital')}>
                    <Camera className="h-4 w-4 mr-2" />
                    Vistoria Digital
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {vistorias.map((vistoria) => (
                  <Card
                    key={vistoria.id}
                    className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
                    onClick={() => navigate(`/vistorias/${vistoria.id}`)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="font-mono font-semibold text-base">
                              #{vistoria.numero}
                            </Badge>
                          </div>
                          <p className="font-semibold text-foreground text-lg">
                            {vistoria.cliente_nome || 'Cliente não informado'}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {vistoria.veiculo_placa || 'Placa não informada'} • {vistoria.veiculo_modelo || 'Modelo não informado'}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="gap-1">
                            {vistoria.tipo_abertura === 'digital' ? (
                              <><Camera className="h-3 w-3 mr-1" /> Digital</>
                            ) : (
                              <><FileText className="h-3 w-3 mr-1" /> Manual</>
                            )}
                          </Badge>
                          
                          <Badge variant="outline">
                            {getTipoLabel(vistoria.tipo_vistoria)}
                          </Badge>
                          
                          <Badge className={getStatusColor(vistoria.status)}>
                            {getStatusLabel(vistoria.status)}
                          </Badge>
                          
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/vistorias/${vistoria.id}`);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            
                            {vistoria.status === 'concluida' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // TODO: Exportar PDF
                                }}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-3 text-xs text-muted-foreground">
                        Criada em {format(new Date(vistoria.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                        {vistoria.completed_at && ` • Concluída em ${format(new Date(vistoria.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
