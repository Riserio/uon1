import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Download, MapPin, Star, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { generateVistoriaPDF } from '@/components/PDFGenerator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

export default function VistoriaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vistoria, setVistoria] = useState<any>(null);
  const [fotos, setFotos] = useState<any[]>([]);
  const [corretora, setCorretora] = useState<any>(null);
  const [administradora, setAdministradora] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFoto, setSelectedFoto] = useState<any>(null);
  const [avaliacao, setAvaliacao] = useState(0);

  useEffect(() => {
    loadVistoria();
  }, [id]);

  const loadVistoria = async () => {
    try {
      const { data: vistoriaData, error: vistoriaError } = await supabase
        .from('vistorias')
        .select('*')
        .eq('id', id)
        .single();

      if (vistoriaError) throw vistoriaError;
      setVistoria(vistoriaData);

      // Load corretora
      if (vistoriaData.corretora_id) {
        const { data: corretoraData } = await supabase
          .from('corretoras')
          .select('*')
          .eq('id', vistoriaData.corretora_id)
          .single();
        if (corretoraData) setCorretora(corretoraData);
      }

      // Load administradora
      const { data: adminData } = await supabase
        .from('administradora')
        .select('*')
        .limit(1)
        .single();
      if (adminData) setAdministradora(adminData);

      const { data: fotosData, error: fotosError } = await supabase
        .from('vistoria_fotos')
        .select('*')
        .eq('vistoria_id', id)
        .order('ordem');

      if (fotosError) throw fotosError;
      setFotos(fotosData || []);

      // Calculate average rating from AI analysis
      if (fotosData && fotosData.length > 0) {
        const ratings = fotosData
          .map(f => {
            try {
              const analise = typeof f.analise_ia === 'string' ? JSON.parse(f.analise_ia) : f.analise_ia;
              return analise?.rating || 0;
            } catch {
              return 0;
            }
          })
          .filter(r => r > 0);
        
        if (ratings.length > 0) {
          setAvaliacao(ratings.reduce((a, b) => a + b, 0) / ratings.length);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar vistoria:', error);
      toast.error('Erro ao carregar detalhes da vistoria');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      toast.info('Gerando PDF...');
      const pdf = await generateVistoriaPDF({
        vistoria,
        fotos,
        corretora,
        administradora
      });
      
      pdf.save(`vistoria-${vistoria.numero}.pdf`);
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF');
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

  const getPosicaoNome = (posicao: string) => {
    const nomes: Record<string, string> = {
      frontal: 'Frontal',
      traseira: 'Traseira',
      lateral_esquerda: 'Lateral Esquerda',
      lateral_direita: 'Lateral Direita'
    };
    return nomes[posicao] || posicao;
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-5 w-5 ${
              star <= rating 
                ? 'fill-yellow-400 text-yellow-400' 
                : 'text-gray-300'
            }`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
        <div className="text-center py-12">Carregando...</div>
      </div>
    );
  }

  if (!vistoria) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
        <div className="text-center py-12">Vistoria não encontrada</div>
      </div>
    );
  }

  const analiseGeral = vistoria.analise_ia 
    ? (typeof vistoria.analise_ia === 'string' ? JSON.parse(vistoria.analise_ia) : vistoria.analise_ia)
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate('/vistorias')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          {vistoria.status === 'concluida' && (
            <Button onClick={handleExportPDF} className="gap-2">
              <Download className="h-4 w-4" />
              Exportar PDF
            </Button>
          )}
        </div>

        {/* Dashboard Header */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="col-span-1 md:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-3xl">Vistoria #{vistoria.numero}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {format(new Date(vistoria.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </p>
                </div>
                <Badge className={`${getStatusColor(vistoria.status)} text-white`}>
                  {getStatusLabel(vistoria.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tipo:</span>
                  <span className="font-medium">
                    {vistoria.tipo_vistoria === 'sinistro' ? 'Sinistro' : 'Reativação'}
                  </span>
                </div>
                {corretora && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Corretora:</span>
                    <span className="font-medium">{corretora.nome}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Avaliação Geral</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-2">
                {renderStars(Math.round(avaliacao))}
                <p className="text-3xl font-bold">{avaliacao.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Baseado na análise por IA</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Fotos Analisadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-2">
                <ImageIcon className="h-10 w-10 text-primary" />
                <p className="text-3xl font-bold">{fotos.length}</p>
                <Progress value={(fotos.length / 4) * 100} className="w-full" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="photos">Análise de Fotos</TabsTrigger>
            <TabsTrigger value="vehicle">Dados do Veículo</TabsTrigger>
            <TabsTrigger value="location">Localização</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Client Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Dados do Cliente</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {vistoria.cliente_nome && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nome:</span>
                      <span className="font-medium">{vistoria.cliente_nome}</span>
                    </div>
                  )}
                  {vistoria.cliente_cpf && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CPF:</span>
                      <span className="font-medium">{vistoria.cliente_cpf}</span>
                    </div>
                  )}
                  {vistoria.cliente_telefone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Telefone:</span>
                      <span className="font-medium">{vistoria.cliente_telefone}</span>
                    </div>
                  )}
                  {vistoria.cliente_email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="font-medium">{vistoria.cliente_email}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Analysis Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Resumo da Análise</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {analiseGeral?.danos_detectados?.length > 0 ? (
                    <>
                      <div className="flex items-center gap-2 text-amber-600">
                        <AlertCircle className="h-5 w-5" />
                        <span className="font-medium">
                          {analiseGeral.danos_detectados.length} dano(s) detectado(s)
                        </span>
                      </div>
                      <ul className="space-y-1 text-sm">
                        {analiseGeral.danos_detectados.map((dano: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-amber-600">•</span>
                            <span>{dano}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-green-600">
                      <AlertCircle className="h-5 w-5" />
                      <span className="font-medium">Nenhum dano significativo detectado</span>
                    </div>
                  )}
                  {analiseGeral?.observacoes && (
                    <div className="mt-4 p-3 bg-muted rounded-lg">
                      <p className="text-sm">{analiseGeral.observacoes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="photos" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fotos.map((foto) => {
                let fotoAnalise = null;
                try {
                  fotoAnalise = foto.analise_ia 
                    ? (typeof foto.analise_ia === 'string' ? JSON.parse(foto.analise_ia) : foto.analise_ia)
                    : null;
                } catch (error) {
                  console.error('Erro ao parsear análise da foto:', error);
                }
                
                return (
                  <Card key={foto.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{getPosicaoNome(foto.posicao)}</CardTitle>
                        {fotoAnalise?.rating && renderStars(fotoAnalise.rating)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <img
                        src={foto.arquivo_url}
                        alt={getPosicaoNome(foto.posicao)}
                        className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setSelectedFoto(foto)}
                      />
                      
                      {fotoAnalise?.descricao && (
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm">{fotoAnalise.descricao}</p>
                        </div>
                      )}
                      
                      {fotoAnalise?.danos?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-amber-600">Danos detectados:</p>
                          <ul className="space-y-1">
                            {fotoAnalise.danos.map((dano: string, idx: number) => (
                              <li key={idx} className="text-sm flex items-start gap-2">
                                <span className="text-amber-600">•</span>
                                <span>{dano}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="vehicle" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Informações do Veículo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vistoria.veiculo_placa && (
                    <div className="flex justify-between p-3 bg-muted rounded-lg">
                      <span className="text-muted-foreground">Placa:</span>
                      <span className="font-bold text-lg">{vistoria.veiculo_placa}</span>
                    </div>
                  )}
                  {vistoria.veiculo_marca && (
                    <div className="flex justify-between p-3 bg-muted rounded-lg">
                      <span className="text-muted-foreground">Marca:</span>
                      <span className="font-medium">{vistoria.veiculo_marca}</span>
                    </div>
                  )}
                  {vistoria.veiculo_modelo && (
                    <div className="flex justify-between p-3 bg-muted rounded-lg">
                      <span className="text-muted-foreground">Modelo:</span>
                      <span className="font-medium">{vistoria.veiculo_modelo}</span>
                    </div>
                  )}
                  {vistoria.veiculo_ano && (
                    <div className="flex justify-between p-3 bg-muted rounded-lg">
                      <span className="text-muted-foreground">Ano:</span>
                      <span className="font-medium">{vistoria.veiculo_ano}</span>
                    </div>
                  )}
                  {vistoria.veiculo_cor && (
                    <div className="flex justify-between p-3 bg-muted rounded-lg">
                      <span className="text-muted-foreground">Cor:</span>
                      <span className="font-medium">{vistoria.veiculo_cor}</span>
                    </div>
                  )}
                  {vistoria.veiculo_chassi && (
                    <div className="flex justify-between p-3 bg-muted rounded-lg">
                      <span className="text-muted-foreground">Chassi:</span>
                      <span className="font-medium">{vistoria.veiculo_chassi}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="location" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Localização da Vistoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vistoria.latitude && vistoria.longitude ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="flex justify-between mb-2">
                        <span className="text-muted-foreground">Latitude:</span>
                        <span className="font-medium">{vistoria.latitude.toFixed(6)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Longitude:</span>
                        <span className="font-medium">{vistoria.longitude.toFixed(6)}</span>
                      </div>
                    </div>
                    
                    {vistoria.endereco && (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm">{vistoria.endereco}</p>
                      </div>
                    )}

                    <div className="aspect-video rounded-lg overflow-hidden border">
                      <iframe
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        src={`https://www.google.com/maps?q=${vistoria.latitude},${vistoria.longitude}&output=embed`}
                        title="Mapa da localização"
                      />
                    </div>

                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => window.open(`https://www.google.com/maps?q=${vistoria.latitude},${vistoria.longitude}`, '_blank')}
                    >
                      <MapPin className="h-4 w-4 mr-2" />
                      Abrir no Google Maps
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <MapPin className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>Localização não disponível</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Photo Modal */}
        {selectedFoto && (
          <div 
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6"
            onClick={() => setSelectedFoto(null)}
          >
            <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
              <img
                src={selectedFoto.arquivo_url}
                alt={getPosicaoNome(selectedFoto.posicao)}
                className="w-full h-auto rounded-lg"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
