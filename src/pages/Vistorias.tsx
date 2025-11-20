import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, FileText, Eye, Download, Plus } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Histórico de Vistorias
            </h1>
            <p className="text-muted-foreground mt-1">
              Todas as vistorias realizadas
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => navigate('/vistorias')}
              variant="outline"
              size="lg"
            >
              Dashboard
            </Button>
            <Button
              onClick={() => navigate('/vistorias/nova/digital')}
              size="lg"
              className="gap-2 bg-gradient-to-r from-primary to-primary/80"
            >
              <Camera className="h-5 w-5" />
              Nova Vistoria
            </Button>
          </div>
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
                <p className="text-muted-foreground mb-4">
                  Nenhuma vistoria cadastrada ainda
                </p>
                <Button
                  onClick={() => navigate('/vistorias/nova/digital')}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Criar Primeira Vistoria
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {vistorias.map((vistoria) => (
                  <Card
                    key={vistoria.id}
                    className="hover:shadow-md transition-all cursor-pointer"
                    onClick={() => navigate(`/vistorias/${vistoria.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col">
                            <span className="text-sm text-muted-foreground">
                              Vistoria #{vistoria.numero}
                            </span>
                            <span className="font-semibold">
                              {vistoria.cliente_nome || 'Cliente não informado'}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {vistoria.veiculo_placa} - {vistoria.veiculo_modelo}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <Badge variant={vistoria.tipo_abertura === 'digital' ? 'default' : 'secondary'}>
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
