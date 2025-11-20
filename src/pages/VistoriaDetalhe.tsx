import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Download, MapPin, Calendar, Car, User, Phone, Mail, FileText, Image as ImageIcon, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { generateVistoriaPDF } from '@/components/PDFGenerator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function VistoriaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vistoria, setVistoria] = useState<any>(null);
  const [fotos, setFotos] = useState<any[]>([]);
  const [corretora, setCorretora] = useState<any>(null);
  const [administradora, setAdministradora] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFoto, setSelectedFoto] = useState<any>(null);

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

      if (vistoriaData.corretora_id) {
        const { data: corretoraData } = await supabase
          .from('corretoras')
          .select('*')
          .eq('id', vistoriaData.corretora_id)
          .maybeSingle();
        if (corretoraData) setCorretora(corretoraData);
      }

      const { data: adminData } = await supabase
        .from('administradora')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (adminData) setAdministradora(adminData);

      const { data: fotosData, error: fotosError } = await supabase
        .from('vistoria_fotos')
        .select('*')
        .eq('vistoria_id', id)
        .order('ordem');

      if (fotosError) throw fotosError;
      setFotos(fotosData || []);
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
    switch (posicao) {
      case 'frontal': return 'Frontal';
      case 'traseira': return 'Traseira';
      case 'lateral_esquerda': return 'Lateral Esquerda';
      case 'lateral_direita': return 'Lateral Direita';
      default: return posicao;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando vistoria...</p>
        </div>
      </div>
    );
  }

  if (!vistoria) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-lg text-muted-foreground">Vistoria não encontrada</p>
            <Button onClick={() => navigate('/vistorias')} className="mt-4">
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/vistorias')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          {vistoria.status === 'concluida' && (
            <Button onClick={handleExportPDF} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Exportar PDF
            </Button>
          )}
        </div>

        <Card className="shadow-lg">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Badge variant="outline" className="font-mono text-lg">#{vistoria.numero}</Badge>
                  <Badge className={getStatusColor(vistoria.status)}>{getStatusLabel(vistoria.status)}</Badge>
                </div>
                <CardTitle className="text-2xl">{vistoria.cliente_nome || 'Cliente não informado'}</CardTitle>
                <p className="text-muted-foreground mt-1">{vistoria.veiculo_placa || 'N/A'} • {vistoria.veiculo_modelo || 'N/A'}</p>
              </div>
              {corretora?.logo_url && <img src={corretora.logo_url} alt={corretora.nome} className="h-16 object-contain" />}
            </div>
          </CardHeader>
        </Card>

        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="fotos">Fotos ({fotos.length})</TabsTrigger>
            <TabsTrigger value="analise">Análise IA</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Dados do Segurado</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div><label className="text-sm text-muted-foreground">Nome</label><p className="font-medium">{vistoria.cliente_nome || 'N/A'}</p></div>
                <div><label className="text-sm text-muted-foreground">CPF</label><p className="font-medium">{vistoria.cliente_cpf || 'N/A'}</p></div>
                <div><label className="text-sm text-muted-foreground">Telefone</label><p className="font-medium">{vistoria.cliente_telefone || 'N/A'}</p></div>
                <div><label className="text-sm text-muted-foreground">Email</label><p className="font-medium">{vistoria.cliente_email || 'N/A'}</p></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Dados do Veículo</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4">
                <div><label className="text-sm text-muted-foreground">Placa</label><p className="font-medium font-mono">{vistoria.veiculo_placa || 'N/A'}</p></div>
                <div><label className="text-sm text-muted-foreground">Marca</label><p className="font-medium">{vistoria.veiculo_marca || 'N/A'}</p></div>
                <div><label className="text-sm text-muted-foreground">Modelo</label><p className="font-medium">{vistoria.veiculo_modelo || 'N/A'}</p></div>
                <div><label className="text-sm text-muted-foreground">Ano</label><p className="font-medium">{vistoria.veiculo_ano || 'N/A'}</p></div>
                <div><label className="text-sm text-muted-foreground">Cor</label><p className="font-medium">{vistoria.veiculo_cor || 'N/A'}</p></div>
                <div><label className="text-sm text-muted-foreground">Chassi</label><p className="font-medium text-xs">{vistoria.veiculo_chassi || 'N/A'}</p></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fotos" className="space-y-4">
            {fotos.length === 0 ? (
              <Card><CardContent className="p-12 text-center"><ImageIcon className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" /><p className="text-lg text-muted-foreground">Nenhuma foto disponível</p></CardContent></Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {fotos.map((foto) => (
                  <Card key={foto.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3"><CardTitle className="text-lg">{getPosicaoNome(foto.posicao)}</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="relative aspect-video rounded-lg overflow-hidden cursor-pointer group" onClick={() => setSelectedFoto(foto)}>
                        <img src={foto.arquivo_url} alt={getPosicaoNome(foto.posicao)} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </div>
                      {foto.analise_ia && (
                        <div className="p-3 bg-primary/5 rounded-lg">
                          <p className="text-sm text-muted-foreground">{typeof foto.analise_ia === 'string' ? JSON.parse(foto.analise_ia).description : foto.analise_ia.description}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analise" className="space-y-4">
            {vistoria.analise_ia ? (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Análise por IA</CardTitle></CardHeader>
                <CardContent><p className="whitespace-pre-wrap">{typeof vistoria.analise_ia === 'string' ? JSON.parse(vistoria.analise_ia).summary : vistoria.analise_ia.summary}</p></CardContent>
              </Card>
            ) : (
              <Card><CardContent className="p-12 text-center"><Sparkles className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" /><p className="text-lg text-muted-foreground">Análise ainda não disponível</p></CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {selectedFoto && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setSelectedFoto(null)}>
          <img src={selectedFoto.arquivo_url} alt="Foto" className="max-w-6xl w-full h-auto rounded-lg" />
        </div>
      )}
    </div>
  );
}
