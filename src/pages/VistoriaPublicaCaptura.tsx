import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, CheckCircle2, ArrowRight, ArrowLeft, FileText, Film, Image as ImageIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

const POSICOES = [
  { id: 'cnh', nome: 'CNH', descricao: 'Foto da CNH (Carteira de Motorista)', tipo: 'documento' },
  { id: 'crlv', nome: 'CRLV', descricao: 'Fotos do CRLV (pode enviar múltiplas fotos)', tipo: 'documento', multiple: true },
  { id: 'frontal', nome: 'Frontal', descricao: 'Frente do veículo', tipo: 'veiculo' },
  { id: 'traseira', nome: 'Traseira', descricao: 'Traseira do veículo', tipo: 'veiculo' },
  { id: 'lateral_esquerda', nome: 'Lateral Esquerda', descricao: 'Lado esquerdo', tipo: 'veiculo' },
  { id: 'lateral_direita', nome: 'Lateral Direita', descricao: 'Lado direito', tipo: 'veiculo' }
];

export default function VistoriaPublicaCaptura() {
  const { token } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [vistoria, setVistoria] = useState<any>(null);
  const [corretora, setCorretora] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [fotos, setFotos] = useState<{ [key: string]: File[] }>({});
  const [fotoPreviews, setFotoPreviews] = useState<{ [key: string]: string[] }>({});
  const [geolocation, setGeolocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [cnhData, setCnhData] = useState<any>(null);
  const [vehicleData, setVehicleData] = useState<any>(null);
  const [processingOcr, setProcessingOcr] = useState(false);

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

  const processOcr = async (imageBase64: string, tipo: 'cnh' | 'veiculo') => {
    setProcessingOcr(true);
    try {
      const { data, error } = await supabase.functions.invoke('ocr-cnh', {
        body: { image: imageBase64, tipo }
      });

      if (error) throw error;

      if (tipo === 'cnh') {
        setCnhData(data);
        toast.success('Dados da CNH extraídos com sucesso!');
      } else {
        setVehicleData(data);
        if (data.placa) {
          toast.success(`Placa detectada: ${data.placa}`);
        }
      }
    } catch (error) {
      console.error('Erro ao processar OCR:', error);
    } finally {
      setProcessingOcr(false);
    }
  };

  const getFileType = (file: File): 'image' | 'video' | 'pdf' => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type === 'application/pdf') return 'pdf';
    return 'image';
  };

  const getFileIcon = (type: 'image' | 'video' | 'pdf') => {
    switch (type) {
      case 'video':
        return <Film className="h-4 w-4" />;
      case 'pdf':
        return <FileText className="h-4 w-4" />;
      default:
        return <ImageIcon className="h-4 w-4" />;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const posicaoAtual = POSICOES[currentStep];
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf'];
    
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (!validTypes.includes(file.type)) {
        toast.error(`${file.name}: Formato não suportado`);
        continue;
      }

      if (file.size > 100 * 1024 * 1024) {
        toast.error(`${file.name}: Arquivo muito grande (máx 100MB)`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Para posições múltiplas (CRLV), adiciona às existentes
    if (posicaoAtual.multiple) {
      const existingFiles = fotos[posicaoAtual.id] || [];
      const existingPreviews = fotoPreviews[posicaoAtual.id] || [];
      
      const newPreviews: string[] = [];
      for (const file of validFiles) {
        if (getFileType(file) === 'image') {
          const reader = new FileReader();
          const preview = await new Promise<string>((resolve) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          newPreviews.push(preview);
        } else {
          newPreviews.push(file.type);
        }
      }
      
      setFotos({ ...fotos, [posicaoAtual.id]: [...existingFiles, ...validFiles] });
      setFotoPreviews({ ...fotoPreviews, [posicaoAtual.id]: [...existingPreviews, ...newPreviews] });
    } else {
      // Para posições únicas, substitui
      const file = validFiles[0];
      setFotos({ ...fotos, [posicaoAtual.id]: [file] });

      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        setFotoPreviews({ ...fotoPreviews, [posicaoAtual.id]: [base64] });
        
        // OCR para CNH
        if (posicaoAtual.id === 'cnh' && getFileType(file) === 'image') {
          await processOcr(base64, 'cnh');
        }
        // OCR para foto frontal (placa)
        else if (posicaoAtual.id === 'frontal' && getFileType(file) === 'image') {
          await processOcr(base64, 'veiculo');
        }
      };

      if (getFileType(file) === 'image') {
        reader.readAsDataURL(file);
      } else {
        setFotoPreviews({ ...fotoPreviews, [posicaoAtual.id]: [file.type] });
      }
    }
  };

  const nextStep = () => {
    const posicaoAtual = POSICOES[currentStep];
    if (!fotos[posicaoAtual.id] || fotos[posicaoAtual.id].length === 0) {
      toast.error('Por favor, adicione pelo menos uma foto');
      return;
    }
    
    if (currentStep < POSICOES.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Última etapa, navegar para formulário
      handleContinue();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const removeFoto = (posicaoId: string, index: number) => {
    const newFotos = { ...fotos };
    const newPreviews = { ...fotoPreviews };
    
    newFotos[posicaoId] = newFotos[posicaoId].filter((_, i) => i !== index);
    newPreviews[posicaoId] = newPreviews[posicaoId].filter((_, i) => i !== index);
    
    if (newFotos[posicaoId].length === 0) {
      delete newFotos[posicaoId];
      delete newPreviews[posicaoId];
    }
    
    setFotos(newFotos);
    setFotoPreviews(newPreviews);
  };

  const handleContinue = async () => {
    // Salvar dados temporários no localStorage para usar no formulário
    const tempData = {
      fotos,
      fotoPreviews,
      geolocation,
      cnhData,
      vehicleData,
      vistoriaId: vistoria.id
    };
    localStorage.setItem('vistoria_temp', JSON.stringify(tempData));
    navigate(`/vistoria/${token}/formulario`);
  };

  const totalFotos = Object.values(fotos).reduce((sum, files) => sum + files.length, 0);
  const progressPercentage = ((currentStep + 1) / POSICOES.length) * 100;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary/20 border-t-primary mx-auto mb-4"></div>
            <p className="text-lg font-medium">Carregando vistoria...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const posicaoAtual = POSICOES[currentStep];
  const fotosPosicaoAtual = fotos[posicaoAtual.id] || [];
  const previewsPosicaoAtual = fotoPreviews[posicaoAtual.id] || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {corretora?.logo_url && (
                <img src={corretora.logo_url} alt={corretora.nome} className="h-12 object-contain" />
              )}
              <div className="flex-1">
                <h1 className="text-xl font-bold">Vistoria Digital - Fotos</h1>
                <p className="text-sm text-muted-foreground">Sinistro #{vistoria.numero}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm font-medium">
              <span>Progresso</span>
              <span>{currentStep + 1}/{POSICOES.length} etapas • {totalFotos} fotos</span>
            </div>
            <Progress value={progressPercentage} className="h-3" />
          </CardContent>
        </Card>

        {/* Captura */}
        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">{posicaoAtual.nome}</h2>
                <p className="text-muted-foreground">{posicaoAtual.descricao}</p>
                <Badge variant="outline" className="mt-2">
                  {posicaoAtual.multiple ? 'Pode enviar múltiplas fotos' : 'Uma foto'}
                </Badge>
              </div>
              <div className="bg-primary/10 px-4 py-2 rounded-full">
                <span className="text-lg font-bold">{currentStep + 1}/{POSICOES.length}</span>
              </div>
            </div>

            {/* Upload Area */}
            <div className="space-y-4">
              <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*,video/*,application/pdf" 
                capture={posicaoAtual.tipo === 'veiculo' ? 'environment' : undefined}
                multiple={posicaoAtual.multiple}
                onChange={handleFileSelect} 
                className="hidden" 
              />
              
              <Button 
                onClick={() => fileInputRef.current?.click()} 
                size="lg"
                className="w-full h-32 text-lg"
                variant="outline"
              >
                <Camera className="h-8 w-8 mr-3" />
                {posicaoAtual.multiple ? 'Adicionar Fotos' : 'Tirar/Escolher Foto'}
              </Button>

              {processingOcr && (
                <div className="bg-primary/10 p-4 rounded-lg flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary/20 border-t-primary"></div>
                  <span className="text-sm font-medium">Extraindo dados da imagem...</span>
                </div>
              )}

              {/* Preview Grid */}
              {previewsPosicaoAtual.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  {previewsPosicaoAtual.map((preview, index) => {
                    const file = fotosPosicaoAtual[index];
                    const fileType = getFileType(file);
                    
                    return (
                      <div key={index} className="relative group">
                        <div className="aspect-video bg-muted rounded-lg overflow-hidden border-2 border-green-500">
                          {fileType === 'image' ? (
                            <img src={preview} alt={`${posicaoAtual.nome} ${index + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                              {getFileIcon(fileType)}
                              <span className="text-xs font-medium">{file.name}</span>
                              <Badge>{fileType.toUpperCase()}</Badge>
                            </div>
                          )}
                          <div className="absolute top-2 right-2 bg-green-500 text-white p-2 rounded-full">
                            <CheckCircle2 className="h-4 w-4" />
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="mt-2 w-full"
                          onClick={() => removeFoto(posicaoAtual.id, index)}
                        >
                          Remover
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Navegação */}
            <div className="flex gap-3 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={prevStep} 
                disabled={currentStep === 0}
                size="lg"
                className="flex-1"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Anterior
              </Button>
              <Button 
                onClick={nextStep} 
                disabled={fotosPosicaoAtual.length === 0}
                size="lg"
                className="flex-1"
              >
                {currentStep === POSICOES.length - 1 ? 'Continuar para Formulário' : 'Próxima'}
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>

            {/* Thumbnails */}
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-3">Etapas:</p>
              <div className="grid grid-cols-6 gap-2">
                {POSICOES.map((pos, idx) => {
                  const hasPhotos = fotos[pos.id] && fotos[pos.id].length > 0;
                  return (
                    <button
                      key={pos.id}
                      onClick={() => setCurrentStep(idx)}
                      className={`relative aspect-square rounded-lg border-2 transition-all ${
                        currentStep === idx 
                          ? 'border-primary ring-2 ring-primary' 
                          : hasPhotos 
                          ? 'border-green-500' 
                          : 'border-border opacity-50'
                      }`}
                    >
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        {hasPhotos ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <Camera className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] py-1 px-1 text-center font-medium">
                        {pos.id === 'cnh' ? 'CNH' : pos.id === 'crlv' ? 'CRLV' : pos.nome.split(' ')[0]}
                      </div>
                      {hasPhotos && fotos[pos.id].length > 1 && (
                        <div className="absolute top-1 right-1 bg-primary text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                          {fotos[pos.id].length}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
