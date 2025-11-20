import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

export default function VistoriaPublicaCaptura() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [vistoria, setVistoria] = useState<any>(null);
  const [corretora, setCorretora] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [fotos, setFotos] = useState<{ [key: string]: File }>({});
  const [fotoPreviews, setFotoPreviews] = useState<{ [key: string]: string }>({});
  const [uploading, setUploading] = useState(false);
  const [geolocation, setGeolocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [cnhFile, setCnhFile] = useState<File | null>(null);
  const [cnhPreview, setCnhPreview] = useState<string | null>(null);

  useEffect(() => {
    loadVistoria();
    getGeolocation();
  }, [token]);

  const loadVistoria = async () => {
    try {
      const { data, error } = await supabase
        .from('vistorias')
        .select('*, corretoras(nome, logo_url)')
        .eq('link_token', token)
        .gt('link_expires_at', new Date().toISOString())
        .single();

      if (error) throw error;
      if (!data) {
        toast.error('Link de vistoria inválido ou expirado');
        navigate('/');
        return;
      }

      setVistoria(data);
      setCorretora(data.corretoras);
    } catch (error) {
      console.error('Erro ao carregar vistoria:', error);
      toast.error('Erro ao carregar vistoria');
      navigate('/');
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

  const handleCnhSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCnhFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setCnhPreview(e.target?.result as string);
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

    if (!cnhFile) {
      toast.error('Por favor, anexe a foto da CNH');
      return;
    }

    setUploading(true);
    try {
      // Upload da CNH
      const cnhFileName = `${vistoria.id}/cnh_${Date.now()}.${cnhFile.name.split('.').pop()}`;
      const { error: cnhUploadError } = await supabase.storage
        .from('vistorias')
        .upload(cnhFileName, cnhFile);

      if (cnhUploadError) throw cnhUploadError;

      const { data: { publicUrl: cnhUrl } } = supabase.storage
        .from('vistorias')
        .getPublicUrl(cnhFileName);

      // Upload das fotos do veículo
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
            })),
            cnh_url: cnhUrl
          }
        });
      }

      toast.success('Fotos enviadas com sucesso!');
      navigate(`/vistoria/${token}/conclusao`);
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

  const posicaoAtual = POSICOES[currentStep];
  const fotoAtual = fotoPreviews[posicaoAtual.id];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 text-white">
          {corretora?.logo_url && (
            <img 
              src={corretora.logo_url} 
              alt={corretora.nome}
              className="h-12 mx-auto mb-4 brightness-0 invert"
            />
          )}
          <h1 className="text-4xl font-bold mb-2">Vistoria Digital</h1>
          <p className="text-blue-100">
            {vistoria.tipo_vistoria === 'sinistro' ? 'Sinistro' : 'Reativação'} - #{vistoria.numero}
          </p>
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

        {/* CNH Section - Before taking photos */}
        {currentStep === 0 && !cnhFile && (
          <Card className="shadow-2xl mb-6">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
              <CardTitle className="text-xl text-center">
                Primeiro, anexe sua CNH
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <Label htmlFor="cnh-upload" className="cursor-pointer">
                <div className="border-2 border-dashed border-primary/30 rounded-lg p-8 text-center hover:border-primary transition-colors bg-gradient-to-br from-primary/5 to-primary/10">
                  <Upload className="h-12 w-12 mx-auto mb-3 text-primary" />
                  <p className="font-semibold mb-2">Clique para anexar sua CNH</p>
                  <p className="text-sm text-muted-foreground">
                    Tire uma foto clara da sua CNH
                  </p>
                </div>
              </Label>
              <Input
                id="cnh-upload"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCnhSelect}
                className="hidden"
              />
            </CardContent>
          </Card>
        )}

        {/* CNH Preview */}
        {cnhPreview && (
          <Card className="shadow-2xl mb-6">
            <CardContent className="p-4">
              <img src={cnhPreview} alt="CNH" className="w-full rounded-lg" />
              <Button
                onClick={() => {
                  setCnhFile(null);
                  setCnhPreview(null);
                }}
                variant="outline"
                className="w-full mt-3"
              >
                Tirar outra foto da CNH
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Vehicle Photos */}
        {cnhFile && (
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
                  <div className="relative">
                    <img
                      src={fotoAtual}
                      alt={posicaoAtual.nome}
                      className="w-full rounded-lg shadow-lg"
                    />
                    <VistoriaOverlay posicao={posicaoAtual.id as any} />
                  </div>
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
                <div>
                  <Label htmlFor={`foto-${posicaoAtual.id}`} className="cursor-pointer">
                    <div className="border-2 border-dashed border-primary/30 rounded-lg p-12 text-center hover:border-primary transition-colors bg-gradient-to-br from-primary/5 to-primary/10 relative">
                      <VistoriaOverlay posicao={posicaoAtual.id as any} />
                      <Camera className="h-20 w-20 mx-auto mb-4 text-primary relative z-10" />
                      <p className="text-lg font-semibold mb-2 relative z-10">
                        Tire uma foto {posicaoAtual.nome.toLowerCase()}
                      </p>
                      <p className="text-sm text-muted-foreground relative z-10">
                        Toque para abrir a câmera
                      </p>
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
        )}

        {/* Instruções */}
        <Card className="mt-6 bg-white/10 backdrop-blur border-white/20 text-white">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">📋 Instruções:</h3>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>Tire fotos em local bem iluminado</li>
              <li>Enquadre todo o veículo na foto</li>
              <li>Evite sombras e reflexos</li>
              <li>Mantenha o celular na horizontal</li>
              <li>Alinhe o veículo com o gabarito exibido</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
