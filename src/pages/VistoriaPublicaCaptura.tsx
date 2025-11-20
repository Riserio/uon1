import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Upload, ArrowRight, ArrowLeft, X, FileText } from 'lucide-react';
import { VistoriaOverlay } from '@/components/VistoriaOverlay';
import { Progress } from '@/components/ui/progress';

const POSICOES = [
  { id: 'frontal', nome: 'Frontal', descricao: 'Tire uma foto da frente do veículo' },
  { id: 'traseira', nome: 'Traseira', descricao: 'Tire uma foto da traseira do veículo' },
  { id: 'lateral_esquerda', nome: 'Lateral Esquerda', descricao: 'Tire uma foto do lado esquerdo' },
  { id: 'lateral_direita', nome: 'Lateral Direita', descricao: 'Tire uma foto do lado direito' }
];

export default function VistoriaPublicaCaptura() {
  const { token } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cnhInputRef = useRef<HTMLInputElement>(null);
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
  const [showCnhStep, setShowCnhStep] = useState(true);

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
    const posicaoAtual = POSICOES[currentStep];
    if (!fotos[posicaoAtual.id]) {
      toast.error('Por favor, tire a foto antes de continuar');
      return;
    }
    
    if (currentStep < POSICOES.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const removeFoto = (posicaoId: string) => {
    const newFotos = { ...fotos };
    const newPreviews = { ...fotoPreviews };
    delete newFotos[posicaoId];
    delete newPreviews[posicaoId];
    setFotos(newFotos);
    setFotoPreviews(newPreviews);
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
      const cnhFileName = `${vistoria.id}/cnh_${Date.now()}.${cnhFile.name.split('.').pop()}`;
      const { error: cnhUploadError } = await supabase.storage
        .from('vistorias')
        .upload(cnhFileName, cnhFile);

      if (cnhUploadError) throw cnhUploadError;

      const { data: { publicUrl: cnhUrl } } = supabase.storage
        .from('vistorias')
        .getPublicUrl(cnhFileName);

      for (const [posicao, file] of Object.entries(fotos)) {
        const fileName = `${vistoria.id}/${posicao}_${Date.now()}.${file.name.split('.').pop()}`;
        
        const { error: uploadError } = await supabase.storage
          .from('vistorias')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('vistorias')
          .getPublicUrl(fileName);

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

      await supabase
        .from('vistorias')
        .update({
          status: 'em_analise',
          cnh_url: cnhUrl,
          latitude: geolocation?.latitude,
          longitude: geolocation?.longitude,
          completed_at: new Date().toISOString()
        })
        .eq('id', vistoria.id);

      toast.success('Vistoria enviada com sucesso!');
      navigate(`/vistoria/${token}/concluida`);
    } catch (error) {
      console.error('Erro ao enviar fotos:', error);
      toast.error('Erro ao enviar fotos');
    } finally {
      setUploading(false);
    }
  };

  const progressPercentage = ((Object.keys(fotos).length / POSICOES.length) * 100);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary via-primary/90 to-primary/80 flex items-center justify-center p-6">
        <Card className="max-w-md shadow-2xl">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
            <p className="text-lg font-semibold">Carregando vistoria...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const posicaoAtual = POSICOES[currentStep];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary/90 to-primary/80 p-4 md:p-6">
      <div className="container mx-auto max-w-4xl space-y-6">
        <Card className="shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              {corretora?.logo_url && (
                <img src={corretora.logo_url} alt={corretora.nome} className="h-12 object-contain" />
              )}
              <div>
                <h1 className="text-2xl font-bold">Vistoria Digital</h1>
                <p className="text-muted-foreground">Sinistro #{vistoria.numero}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {cnhPreview && (
          <Card className="shadow-xl">
            <CardContent className="p-6 space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span>Progresso</span>
                <span>{Object.keys(fotos).length}/{POSICOES.length} fotos</span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
            </CardContent>
          </Card>
        )}

        <Card className="shadow-2xl">
          <CardContent className="p-6 md:p-8 space-y-6">
            {showCnhStep && !cnhPreview ? (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="flex justify-center mb-4">
                    <div className="bg-primary/10 p-4 rounded-full">
                      <FileText className="h-12 w-12 text-primary" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold">Documento de Identificação</h2>
                  <p className="text-muted-foreground">Primeiro, tire uma foto da sua CNH</p>
                </div>
                <div className="relative aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-xl overflow-hidden border-4 border-dashed border-primary/30">
                  <input ref={cnhInputRef} type="file" accept="image/*" capture="environment" onChange={handleCnhSelect} className="hidden" />
                  <button onClick={() => cnhInputRef.current?.click()} className="absolute inset-0 flex flex-col items-center justify-center gap-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <div className="bg-primary/10 backdrop-blur-sm p-6 rounded-full">
                      <Camera className="h-16 w-16 text-primary" />
                    </div>
                    <p className="text-lg font-semibold">Tirar Foto da CNH</p>
                  </button>
                </div>
              </div>
            ) : showCnhStep && cnhPreview ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    CNH Capturada
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => { setCnhFile(null); setCnhPreview(null); }}>
                    <X className="h-4 w-4 mr-2" />Refazer
                  </Button>
                </div>
                <div className="relative rounded-xl overflow-hidden border-4 border-green-500 shadow-lg">
                  <img src={cnhPreview} alt="CNH" className="w-full" />
                </div>
                <Button onClick={() => setShowCnhStep(false)} className="w-full" size="lg">
                  Continuar para Fotos do Veículo<ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{posicaoAtual.nome}</h2>
                    <p className="text-muted-foreground">{posicaoAtual.descricao}</p>
                  </div>
                  <div className="bg-primary/10 px-4 py-2 rounded-full">
                    <span className="font-bold text-primary">{currentStep + 1}/{POSICOES.length}</span>
                  </div>
                </div>

                {!fotoPreviews[posicaoAtual.id] ? (
                  <div className="relative aspect-video bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl overflow-hidden shadow-2xl">
                    <VistoriaOverlay posicao={posicaoAtual.id as any} />
                    <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-white/20 backdrop-blur-md p-8 rounded-full hover:bg-white/30 transition-colors">
                        <Camera className="h-20 w-20 text-white drop-shadow-lg" />
                      </div>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative rounded-xl overflow-hidden border-4 border-green-500 shadow-lg">
                      <img src={fotoPreviews[posicaoAtual.id]} alt={posicaoAtual.nome} className="w-full" />
                      <div className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-full font-semibold shadow-lg flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />Foto OK
                      </div>
                    </div>
                    <Button variant="outline" onClick={() => { removeFoto(posicaoAtual.id); fileInputRef.current?.click(); }} className="w-full">
                      <Camera className="h-4 w-4 mr-2" />Tirar Nova Foto
                    </Button>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep} disabled={currentStep === 0} size="lg" className="flex-1">
                    <ArrowLeft className="h-5 w-5 mr-2" />Anterior
                  </Button>
                  <Button onClick={nextStep} disabled={!fotos[posicaoAtual.id]} size="lg" className="flex-1">
                    {currentStep === POSICOES.length - 1 ? 'Concluir' : 'Próxima'}<ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </div>

                <div className="pt-6 border-t">
                  <p className="text-sm font-medium mb-3">Fotos:</p>
                  <div className="grid grid-cols-4 gap-3">
                    {POSICOES.map((pos, idx) => (
                      <button key={pos.id} onClick={() => setCurrentStep(idx)} className={`relative aspect-square rounded-lg overflow-hidden border-3 transition-all ${currentStep === idx ? 'border-primary ring-2 ring-primary' : fotos[pos.id] ? 'border-green-500' : 'border-gray-300 dark:border-gray-700 opacity-50'}`}>
                        {fotoPreviews[pos.id] ? (
                          <>
                            <img src={fotoPreviews[pos.id]} alt={pos.nome} className="w-full h-full object-cover" />
                            {currentStep !== idx && (
                              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                <CheckCircle2 className="h-6 w-6 text-white drop-shadow-lg" />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <Camera className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs py-1.5 px-1 text-center font-medium">
                          {pos.nome.split(' ')[0]}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {Object.keys(fotos).length === POSICOES.length && (
                  <Button onClick={handleUpload} disabled={uploading} className="w-full bg-green-600 hover:bg-green-700" size="lg">
                    {uploading ? (
                      <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />Enviando...</>
                    ) : (
                      <><Upload className="h-5 w-5 mr-2" />Enviar Vistoria</>
                    )}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
