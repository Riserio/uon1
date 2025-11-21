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
  link_token?: string;
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
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Camera className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Vistorias Veiculares</h1>
            <p className="text-sm text-muted-foreground">Gerencie vistorias digitais e manuais</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate('/vistorias/nova/manual')}
            variant="outline"
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Vistoria Manual
          </Button>
          <Button
            onClick={() => navigate('/vistorias/nova/digital')}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
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
            <div className="text-3xl font-bold text-primary">
              {vistorias.length}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aguardando Fotos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {vistorias.filter(v => v.status === 'aguardando_fotos').length}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Concluídas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {vistorias.filter(v => v.status === 'concluida').length}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Canceladas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {vistorias.filter(v => v.status === 'cancelada').length}
            </div>
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
                          <h3 className="font-semibold text-lg">
                            {vistoria.veiculo_placa || 'Sem placa'} - {vistoria.veiculo_modelo || 'Modelo não informado'}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {vistoria.cliente_nome || 'Cliente não informado'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right space-y-1">
                          <Badge variant="outline" className="bg-background">
                            {getTipoLabel(vistoria.tipo_vistoria)}
                          </Badge>
                          <div>
                            <Badge className={`${getStatusColor(vistoria.status)} text-white`}>
                              {getStatusLabel(vistoria.status)}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {vistoria.tipo_abertura === 'digital' ? 'Digital' : 'Manual'}
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/vistorias/${vistoria.id}`);
                            }}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          
                          {vistoria.link_token && vistoria.status === 'aguardando_fotos' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                const link = `${window.location.origin}/vistoria/${vistoria.link_token}`;
                                navigator.clipboard.writeText(link);
                                toast.success('Link de vistoria copiado!');
                              }}
                              title="Copiar link de vistoria"
                              className="text-blue-600 hover:text-blue-700"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {vistoria.status === 'concluida' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                // TODO: Exportar PDF
                              }}
                              title="Baixar relatório"
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
  );
}
