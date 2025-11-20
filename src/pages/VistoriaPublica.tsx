import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Upload, ArrowRight, ArrowLeft } from 'lucide-react';
import { VistoriaOverlay } from '@/components/VistoriaOverlay';

const POSICOES = [
  { id: 'frontal', nome: 'Frontal', descricao: 'Tire uma foto da frente do veículo' },
  { id: 'traseira', nome: 'Traseira', descricao: 'Tire uma foto da traseira do veículo' },
  { id: 'lateral_esquerda', nome: 'Lateral Esquerda', descricao: 'Tire uma foto do lado esquerdo' },
  { id: 'lateral_direita', nome: 'Lateral Direita', descricao: 'Tire uma foto do lado direito' }
];

export default function VistoriaPublica() {
  const { token } = useParams();
  const [vistoria, setVistoria] = useState<any>(null);
  const [corretora, setCorretora] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [fotos, setFotos] = useState<{ [key: string]: File }>({});
  const [fotoPreviews, setFotoPreviews] = useState<{ [key: string]: string }>({});
  const [uploading, setUploading] = useState(false);
  const [geolocation, setGeolocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);

  useEffect(() => {
    loadVistoria();
    getGeolocation();
  }, [token]);

  const loadVistoria = async () => {
    try {
      const { data, error } = await supabase
        .from('vistorias')
        .select('*, corretoras(*)')
        .eq('link_token', token)
        .gt('link_expires_at', new Date().toISOString())
        .single();

      if (error) throw error;
      if (!data) {
        toast.error('Link de vistoria inválido ou expirado');
        return;
      }

      setVistoria(data);
      if (data.corretora_id) {
        const { data: corretoraData } = await supabase
          .from('corretoras')
          .select('*')
          .eq('id', data.corretora_id)
          .single();
        
        if (corretoraData) setCorretora(corretoraData);
      }
    } catch (error) {
      console.error('Erro ao carregar vistoria:', error);
      toast.error('Erro ao carregar vistoria');
    } finally {
      setLoading(false);
    }
  };

  const getGeolocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeolocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          console.error('Erro ao obter geolocalização:', error);
        }
      );
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const posicaoAtual = POSICOES[currentStep];
    setFotos({ ...fotos, [posicaoAtual.id]: file });

    const reader = new FileReader();
    reader.onload = (e) => {
      setFotoPreviews({ ...fotoPreviews, [posicaoAtual.id]: e.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const nextStep = () => {
    if (currentStep < POSICOES.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleUpload();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleUpload = async () => {
    if (Object.keys(fotos).length < 4) {
      toast.error('Por favor, tire todas as 4 fotos');
      return;
    }

    setUploading(true);
    try {
      // Upload das fotos
      for (const [posicao, file] of Object.entries(fotos)) {
        const fileName = `${vistoria.id}/${posicao}_${Date.now()}.${file.name.split('.').pop()}`;
        
        const { error: uploadError } = await supabase.storage
          .from('vistorias')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('vistorias')
          .getPublicUrl(fileName);

        // Salvar registro da foto
        const { error: fotoError } = await supabase
          .from('vistoria_fotos')
          .insert({
            vistoria_id: vistoria.id,
            posicao,
            arquivo_url: publicUrl,
            arquivo_nome: file.name,
            arquivo_tamanho: file.size,
            ordem: POSICOES.findIndex(p => p.id === posicao) + 1
          });

        if (fotoError) throw fotoError;
      }

      // Atualizar vistoria com status e geolocalização
      const { error: updateError } = await supabase
        .from('vistorias')
        .update({
          status: 'em_analise',
          latitude: geolocation?.latitude,
          longitude: geolocation?.longitude,
          endereco: geolocation 
            ? `Lat: ${geolocation.latitude.toFixed(6)}, Long: ${geolocation.longitude.toFixed(6)}`
            : null
        })
        .eq('id', vistoria.id);

      if (updateError) throw updateError;

      // Buscar fotos e iniciar análise
      const { data: fotosList } = await supabase
        .from('vistoria_fotos')
        .select('*')
        .eq('vistoria_id', vistoria.id);

      if (fotosList && fotosList.length === 4) {
        // Chamar edge function para análise
        await supabase.functions.invoke('analisar-vistoria-ia', {
          body: {
            vistoria_id: vistoria.id,
            fotos: fotosList.map(f => ({
              id: f.id,
              posicao: f.posicao,
              url: f.arquivo_url
            }))
          }
        });
      }

      toast.success('Fotos enviadas com sucesso! A análise será realizada em breve.');
      setCurrentStep(POSICOES.length); // Mostrar tela de conclusão
    } catch (error) {
      console.error('Erro ao enviar fotos:', error);
      toast.error('Erro ao enviar fotos');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center p-6">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p>Carregando vistoria...</p>
        </div>
      </div>
    );
  }

  if (!vistoria) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Link Inválido</h2>
            <p className="text-muted-foreground">
              Este link de vistoria é inválido ou expirou. Entre em contato com a seguradora.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep >= POSICOES.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center p-6">
        <Card className="max-w-md shadow-2xl">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-20 w-20 text-green-600 mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">Vistoria Concluída!</h2>
            
            <div className="bg-white/90 dark:bg-gray-900/90 p-6 rounded-lg mb-6">
              <p className="text-sm text-muted-foreground mb-2">Número do Sinistro</p>
              <p className="text-4xl font-bold text-primary">#{vistoria.numero}</p>
            </div>

            <p className="text-muted-foreground mb-6">
              Suas fotos foram enviadas com sucesso. Nossa equipe analisará as imagens e entrará em contato em breve.
            </p>
            <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg text-sm text-green-800 dark:text-green-200">
              <strong>Próximos passos:</strong>
              <ul className="list-disc list-inside mt-2 text-left">
                <li>Análise automática por IA</li>
                <li>Revisão pela equipe técnica</li>
                <li>Contato em até 24h úteis</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const posicaoAtual = POSICOES[currentStep];
  const fotoAtual = fotoPreviews[posicaoAtual.id];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary/90 to-primary/80 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header with Corretora Logo */}
        <div className="text-center mb-8">
          {corretora?.logo_url && (
            <div className="mb-6 flex justify-center">
              <img 
                src={corretora.logo_url} 
                alt={corretora.nome}
                className="h-16 w-auto object-contain bg-white/10 backdrop-blur-sm rounded-lg p-3"
              />
            </div>
          )}
          <h1 className="text-4xl font-bold mb-2 text-white">Vistoria Digital</h1>
          <p className="text-white/80 text-lg">
            {vistoria.tipo_vistoria === 'sinistro' ? 'Sinistro' : 'Reativação'}
          </p>
          {corretora?.nome && (
            <p className="text-white/70 text-sm mt-2">{corretora.nome}</p>
          )}
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between mb-2 text-white text-sm">
            <span>Progresso</span>
            <span>{currentStep + 1} de {POSICOES.length}</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-3">
            <div
              className="bg-white h-3 rounded-full transition-all duration-500"
              style={{ width: `${((currentStep + 1) / POSICOES.length) * 100}%` }}
            />
          </div>
        </div>

        <Card className="shadow-2xl">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
            <CardTitle className="text-2xl text-center">
              {posicaoAtual.nome}
            </CardTitle>
            <p className="text-muted-foreground text-center">
              {posicaoAtual.descricao}
            </p>
          </CardHeader>
          <CardContent className="p-6">
            {fotoAtual ? (
              <div className="space-y-4">
                <img
                  src={fotoAtual}
                  alt={posicaoAtual.nome}
                  className="w-full rounded-lg shadow-lg"
                />
                <div className="flex gap-3">
                  {currentStep > 0 && (
                    <Button
                      onClick={prevStep}
                      variant="outline"
                      className="flex-1"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Anterior
                    </Button>
                  )}
                  <Button
                    onClick={nextStep}
                    disabled={uploading}
                    className="flex-1 bg-gradient-to-r from-primary to-primary/80"
                  >
                    {uploading ? (
                      'Enviando...'
                    ) : currentStep === POSICOES.length - 1 ? (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Finalizar
                      </>
                    ) : (
                      <>
                        Próxima
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Label htmlFor={`foto-${posicaoAtual.id}`} className="cursor-pointer block">
                  <div className="border-2 border-dashed border-primary/30 rounded-lg overflow-hidden relative aspect-video bg-gradient-to-br from-primary/5 to-primary/10 hover:border-primary transition-colors">
                    {showOverlay && (
                      <VistoriaOverlay posicao={posicaoAtual.id as 'frontal' | 'traseira' | 'lateral_esquerda' | 'lateral_direita'} />
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                      <Camera className="h-16 w-16 text-primary mb-3" />
                      <p className="text-lg font-semibold text-foreground">
                        Tire uma foto {posicaoAtual.nome.toLowerCase()}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Alinhe o veículo com o gabarito
                      </p>
                    </div>
                  </div>
                </Label>
                <Input
                  id={`foto-${posicaoAtual.id}`}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {currentStep > 0 && (
                  <Button
                    onClick={prevStep}
                    variant="outline"
                    className="w-full mt-4"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instruções */}
        <Card className="mt-6 bg-white/10 backdrop-blur border-white/20 text-white">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">📋 Instruções:</h3>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>Tire fotos em local bem iluminado</li>
              <li>Enquadre todo o veículo na foto</li>
              <li>Evite sombras e reflexos</li>
              <li>Mantenha o celular na horizontal</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
