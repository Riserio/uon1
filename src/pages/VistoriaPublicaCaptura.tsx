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
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md border-border/40">
          <CardContent className="p-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-3"></div>
            <p className="text-sm font-medium">Carregando vistoria...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const posicaoAtual = POSICOES[currentStep];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="container mx-auto max-w-2xl space-y-4">
        <Card className="border-border/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {corretora?.logo_url && (
                <img src={corretora.logo_url} alt={corretora.nome} className="h-10 object-contain" />
              )}
              <div>
                <h1 className="text-lg font-semibold">Vistoria Digital</h1>
                <p className="text-sm text-muted-foreground">Sinistro #{vistoria.numero}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {cnhPreview && (
          <Card className="border-border/40">
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-xs font-medium text-muted-foreground">
                <span>Progresso</span>
                <span>{Object.keys(fotos).length}/{POSICOES.length} fotos</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </CardContent>
          </Card>
        )}

        <Card className="border-border/40">
          <CardContent className="p-4 md:p-6 space-y-4">
            {showCnhStep && !cnhPreview ? (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <div className="flex justify-center mb-3">
                    <div className="bg-primary/10 p-3 rounded-full">
                      <FileText className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold">Documento de Identificação</h2>
                  <p className="text-sm text-muted-foreground">Tire uma foto da sua CNH</p>
                </div>
                <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border-2 border-dashed border-border">
                  <input ref={cnhInputRef} type="file" accept="image/*" capture="environment" onChange={handleCnhSelect} className="hidden" />
                  <button onClick={() => cnhInputRef.current?.click()} className="absolute inset-0 flex flex-col items-center justify-center gap-3 hover:bg-accent/50 transition-colors">
                    <div className="bg-background/80 backdrop-blur-sm p-4 rounded-full">
                      <Camera className="h-10 w-10 text-foreground" />
                    </div>
                    <p className="text-sm font-medium">Tirar Foto da CNH</p>
                  </button>
                </div>
              </div>
            ) : showCnhStep && cnhPreview ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    CNH Capturada
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => { setCnhFile(null); setCnhPreview(null); }}>
                    <X className="h-4 w-4 mr-2" />Refazer
                  </Button>
                </div>
                <div className="relative rounded-lg overflow-hidden border-2 border-green-500">
                  <img src={cnhPreview} alt="CNH" className="w-full" />
                </div>
                <Button onClick={() => setShowCnhStep(false)} className="w-full">
                  Continuar para Fotos do Veículo<ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{posicaoAtual.nome}</h2>
                    <p className="text-sm text-muted-foreground">{posicaoAtual.descricao}</p>
                  </div>
                  <div className="bg-muted px-3 py-1.5 rounded-full">
                    <span className="text-sm font-medium">{currentStep + 1}/{POSICOES.length}</span>
                  </div>
                </div>

                {!fotoPreviews[posicaoAtual.id] ? (
                  <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                    <VistoriaOverlay posicao={posicaoAtual.id as any} />
                    <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="absolute inset-0 flex items-center justify-center hover:bg-accent/50 transition-colors">
                      <div className="bg-background/80 backdrop-blur-sm p-6 rounded-full">
                        <Camera className="h-12 w-12 text-foreground" />
                      </div>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative rounded-lg overflow-hidden border-2 border-green-500">
                      <img src={fotoPreviews[posicaoAtual.id]} alt={posicaoAtual.nome} className="w-full" />
                      <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />Foto OK
                      </div>
                    </div>
                    <Button variant="outline" onClick={() => { removeFoto(posicaoAtual.id); fileInputRef.current?.click(); }} className="w-full" size="sm">
                      <Camera className="h-4 w-4 mr-2" />Tirar Nova Foto
                    </Button>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={prevStep} disabled={currentStep === 0} className="flex-1" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />Anterior
                  </Button>
                  <Button onClick={nextStep} disabled={!fotos[posicaoAtual.id]} className="flex-1" size="sm">
                    {currentStep === POSICOES.length - 1 ? 'Concluir' : 'Próxima'}<ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>

                <div className="pt-4 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Fotos capturadas:</p>
                  <div className="grid grid-cols-4 gap-2">
                    {POSICOES.map((pos, idx) => (
                      <button key={pos.id} onClick={() => setCurrentStep(idx)} className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${currentStep === idx ? 'border-primary ring-2 ring-primary' : fotos[pos.id] ? 'border-green-500' : 'border-border opacity-50'}`}>
                        {fotoPreviews[pos.id] ? (
                          <>
                            <img src={fotoPreviews[pos.id]} alt={pos.nome} className="w-full h-full object-cover" />
                            {currentStep !== idx && (
                              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                <CheckCircle2 className="h-4 w-4 text-white drop-shadow-lg" />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <Camera className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] py-1 px-0.5 text-center font-medium">
                          {pos.nome.split(' ')[0]}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {Object.keys(fotos).length === POSICOES.length && (
                  <Button onClick={handleUpload} disabled={uploading} className="w-full bg-green-600 hover:bg-green-700">
                    {uploading ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Enviando...</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" />Enviar Vistoria</>
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
