import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Download, Eye, FileText, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { generateVistoriaPDF } from '@/components/VistoriaPDF';

export default function VistoriaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vistoria, setVistoria] = useState<any>(null);
  const [fotos, setFotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [corretora, setCorretora] = useState<any>(null);
  const [administradora, setAdministradora] = useState<any>(null);

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

      const { data: fotosData, error: fotosError } = await supabase
        .from('vistoria_fotos')
        .select('*')
        .eq('vistoria_id', id)
        .order('ordem');

      if (fotosError) throw fotosError;
      setFotos(fotosData || []);

      // Carregar corretora se existir
      if (vistoriaData.corretora_id) {
        const { data: corretoraData } = await supabase
          .from('corretoras')
          .select('*')
          .eq('id', vistoriaData.corretora_id)
          .single();
        if (corretoraData) setCorretora(corretoraData);
      }

      // Carregar administradora
      const { data: adminData } = await supabase
        .from('administradora')
        .select('*')
        .limit(1)
        .single();
      if (adminData) setAdministradora(adminData);

    } catch (error) {
      console.error('Erro ao carregar vistoria:', error);
      toast.error('Erro ao carregar detalhes da vistoria');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      toast.loading('Gerando PDF...');
      await generateVistoriaPDF(vistoria, fotos, corretora, administradora);
      toast.dismiss();
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.dismiss();
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate('/vistorias')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          {vistoria.status === 'concluida' && (
            <Button className="gap-2" onClick={handleExportPDF}>
              <Download className="h-4 w-4" />
              Exportar PDF
            </Button>
          )}
        </div>

        {/* Header Card */}
        <Card className="shadow-lg border-primary/20">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-3xl mb-2">
                  Vistoria #{vistoria.numero}
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant={vistoria.tipo_abertura === 'digital' ? 'default' : 'secondary'}>
                    {vistoria.tipo_abertura === 'digital' ? (
                      <><Camera className="h-3 w-3 mr-1" /> Digital</>
                    ) : (
                      <><FileText className="h-3 w-3 mr-1" /> Manual</>
                    )}
                  </Badge>
                  <Badge variant="outline">
                    {vistoria.tipo_vistoria === 'sinistro' ? 'Sinistro' : 'Reativação'}
                  </Badge>
                  <Badge className={getStatusColor(vistoria.status)}>
                    {getStatusLabel(vistoria.status)}
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground">
              Criada em {format(new Date(vistoria.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              {vistoria.completed_at && ` • Concluída em ${format(new Date(vistoria.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Dados do Veículo */}
          <Card>
            <CardHeader>
              <CardTitle>Dados do Veículo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-sm text-muted-foreground">Placa:</span>
                <p className="font-semibold">{vistoria.veiculo_placa || 'Não informado'}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Marca/Modelo:</span>
                <p className="font-semibold">
                  {vistoria.veiculo_marca} {vistoria.veiculo_modelo} {vistoria.veiculo_ano}
                </p>
              </div>
              {vistoria.veiculo_cor && (
                <div>
                  <span className="text-sm text-muted-foreground">Cor:</span>
                  <p className="font-semibold">{vistoria.veiculo_cor}</p>
                </div>
              )}
              {vistoria.veiculo_chassi && (
                <div>
                  <span className="text-sm text-muted-foreground">Chassi:</span>
                  <p className="font-mono text-sm">{vistoria.veiculo_chassi}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dados do Cliente */}
          <Card>
            <CardHeader>
              <CardTitle>Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-sm text-muted-foreground">Nome:</span>
                <p className="font-semibold">{vistoria.cliente_nome || 'Não informado'}</p>
              </div>
              {vistoria.cliente_cpf && (
                <div>
                  <span className="text-sm text-muted-foreground">CPF:</span>
                  <p className="font-mono text-sm">{vistoria.cliente_cpf}</p>
                </div>
              )}
              {vistoria.cliente_email && (
                <div>
                  <span className="text-sm text-muted-foreground">Email:</span>
                  <p>{vistoria.cliente_email}</p>
                </div>
              )}
              {vistoria.cliente_telefone && (
                <div>
                  <span className="text-sm text-muted-foreground">Telefone:</span>
                  <p>{vistoria.cliente_telefone}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Relato do Incidente */}
        {vistoria.relato_incidente && (
          <Card>
            <CardHeader>
              <CardTitle>Relato do Incidente</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{vistoria.relato_incidente}</p>
              {vistoria.data_incidente && (
                <p className="text-sm text-muted-foreground mt-2">
                  Data do incidente: {format(new Date(vistoria.data_incidente), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Fotos */}
        {fotos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Fotos do Veículo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {fotos.map((foto) => (
                  <div key={foto.id} className="space-y-2">
                    <img
                      src={foto.arquivo_url}
                      alt={getPosicaoNome(foto.posicao)}
                      className="w-full h-64 object-cover rounded-lg shadow-md"
                    />
                    <div className="text-center">
                      <p className="font-semibold">{getPosicaoNome(foto.posicao)}</p>
                      {foto.analise_ia?.analise && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {foto.analise_ia.analise.substring(0, 100)}...
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Análise IA */}
        {vistoria.status === 'concluida' && vistoria.observacoes_ia && (
          <Card className="border-green-500/50">
            <CardHeader className="bg-green-500/10">
              <CardTitle className="text-green-700 dark:text-green-400">
                Análise por Inteligência Artificial
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {vistoria.danos_detectados && vistoria.danos_detectados.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-semibold mb-2">Danos Detectados:</h4>
                  <div className="flex gap-2 flex-wrap">
                    {vistoria.danos_detectados.map((dano: string, index: number) => (
                      <Badge key={index} variant="destructive">{dano}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h4 className="font-semibold mb-2">Resumo Executivo:</h4>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {vistoria.observacoes_ia}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Geolocalização */}
        {vistoria.latitude && vistoria.longitude && (
          <Card>
            <CardHeader>
              <CardTitle>Localização</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                {vistoria.endereco}
              </p>
              <a
                href={`https://www.google.com/maps?q=${vistoria.latitude},${vistoria.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm"
              >
                Ver no Google Maps →
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
