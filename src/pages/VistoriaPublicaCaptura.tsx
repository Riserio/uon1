import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Upload, ArrowRight, ArrowLeft } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const POSICOES = [
  { id: 'cnh', nome: 'CNH', descricao: 'Tire uma foto da sua CNH (Carteira de Motorista)' },
  { id: 'frontal', nome: 'Frontal', descricao: 'Tire uma foto da frente do veículo' },
  { id: 'traseira', nome: 'Traseira', descricao: 'Tire uma foto da traseira do veículo' },
  { id: 'lateral_esquerda', nome: 'Lateral Esquerda', descricao: 'Tire uma foto do lado esquerdo' },
  { id: 'lateral_direita', nome: 'Lateral Direita', descricao: 'Tire uma foto do lado direito' }
];

export default function VistoriaPublicaCaptura() {
  const { token } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [vistoria, setVistoria] = useState<any>(null);
  const [corretora, setCorretora] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [fotos, setFotos] = useState<{ [key: string]: File }>({});
  const [fotoPreviews, setFotoPreviews] = useState<{ [key: string]: string }>({});
  const [uploading, setUploading] = useState(false);
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
      toast.error('Erro ao extrair dados da imagem');
    } finally {
      setProcessingOcr(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const posicaoAtual = POSICOES[currentStep];
    setFotos({ ...fotos, [posicaoAtual.id]: file });

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setFotoPreviews({ ...fotoPreviews, [posicaoAtual.id]: base64 });
      
      // Processar OCR para CNH
      if (posicaoAtual.id === 'cnh') {
        await processOcr(base64, 'cnh');
      }
      // Processar OCR para foto frontal do veículo (onde geralmente aparece a placa)
      else if (posicaoAtual.id === 'frontal') {
        await processOcr(base64, 'veiculo');
      }
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
    if (Object.keys(fotos).length < 5) {
      toast.error('Por favor, tire todas as 5 fotos (CNH + 4 fotos do veículo)');
      return;
    }

    setUploading(true);
    try {
      let cnhUrl = '';
      
      for (const [posicao, file] of Object.entries(fotos)) {
        const fileName = `${vistoria.id}/${posicao}_${Date.now()}.${file.name.split('.').pop()}`;
        
        const { error: uploadError } = await supabase.storage
          .from('vistorias')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('vistorias')
          .getPublicUrl(fileName);

        if (posicao === 'cnh') {
          cnhUrl = publicUrl;
        } else {
          const { error: fotoError } = await supabase
            .from('vistoria_fotos')
            .insert({
              vistoria_id: vistoria.id,
              posicao,
              arquivo_url: publicUrl,
              arquivo_nome: file.name,
              arquivo_tamanho: file.size,
              ordem: POSICOES.findIndex(p => p.id === posicao)
            });

          if (fotoError) throw fotoError;
        }
      }

      const updateData: any = {
        status: 'em_analise',
        cnh_url: cnhUrl,
        latitude: geolocation?.latitude,
        longitude: geolocation?.longitude,
        completed_at: new Date().toISOString()
      };

      // Adicionar dados da CNH se foram extraídos
      if (cnhData) {
        updateData.cnh_dados = cnhData;
        if (cnhData.nome) updateData.cliente_nome = cnhData.nome;
        if (cnhData.cpf) updateData.cliente_cpf = cnhData.cpf;
      }

      // Adicionar dados do veículo se foram extraídos
      if (vehicleData) {
        if (vehicleData.placa) updateData.veiculo_placa = vehicleData.placa;
        if (vehicleData.marca) updateData.veiculo_marca = vehicleData.marca;
        if (vehicleData.modelo) updateData.veiculo_modelo = vehicleData.modelo;
      }

      await supabase
        .from('vistorias')
        .update(updateData)
        .eq('id', vistoria.id);

      // Atualizar tags do atendimento
      if (vistoria.atendimento_id) {
        const { data: atendimento } = await supabase
          .from('atendimentos')
          .select('tags')
          .eq('id', vistoria.atendimento_id)
          .single();

        if (atendimento?.tags) {
          const newTags = atendimento.tags
            .filter((tag: string) => tag !== 'aguardando_vistoria_digital')
            .concat('vistoria_concluida');

          await supabase
            .from('atendimentos')
            .update({ tags: newTags })
            .eq('id', vistoria.atendimento_id);
        }
      }

      toast.success('Vistoria enviada com sucesso!');
      navigate(`/vistoria/${token}/conclusao`);
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
    <div className="min-h-screen bg-background p-2 sm:p-3 md:p-6">
      <div className="container mx-auto max-w-2xl space-y-2 sm:space-y-3">
        <Card className="border-border/40">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              {corretora?.logo_url && (
                <img src={corretora.logo_url} alt={corretora.nome} className="h-8 md:h-10 object-contain" />
              )}
              <div>
                <h1 className="text-base md:text-lg font-semibold">Vistoria Digital</h1>
                <p className="text-xs md:text-sm text-muted-foreground">Sinistro #{vistoria.numero}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="p-3 md:p-4 space-y-2">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Progresso</span>
              <span>{Object.keys(fotos).length}/{POSICOES.length} fotos</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="p-3 md:p-4 space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base md:text-lg font-semibold">{posicaoAtual.nome}</h2>
                <p className="text-xs md:text-sm text-muted-foreground">{posicaoAtual.descricao}</p>
              </div>
              <div className="bg-muted px-2 md:px-3 py-1 md:py-1.5 rounded-full">
                <span className="text-xs md:text-sm font-medium">{currentStep + 1}/{POSICOES.length}</span>
              </div>
            </div>

            {!fotoPreviews[posicaoAtual.id] ? (
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept="image/*" 
                  capture={posicaoAtual.id === 'cnh' ? undefined : 'environment'}
                  onChange={handleFileSelect} 
                  className="hidden" 
                />
                <button onClick={() => fileInputRef.current?.click()} className="absolute inset-0 flex items-center justify-center hover:bg-accent/50 transition-colors">
                  <div className="bg-background/80 backdrop-blur-sm p-4 md:p-6 rounded-full">
                    <Camera className="h-8 w-8 md:h-12 md:w-12 text-foreground" />
                  </div>
                </button>
                {processingOcr && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="bg-background/90 backdrop-blur-sm p-4 rounded-lg flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      <span className="text-sm">Extraindo dados...</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2 md:space-y-3">
                <div className="relative rounded-lg overflow-hidden border-2 border-green-500">
                  <img src={fotoPreviews[posicaoAtual.id]} alt={posicaoAtual.nome} className="w-full" />
                  <div className="absolute top-2 right-2 bg-green-500 text-white px-2 md:px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 md:gap-1.5">
                    <CheckCircle2 className="h-3 w-3 md:h-3.5 md:w-3.5" />Foto OK
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

            <div className="pt-3 md:pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Fotos capturadas:</p>
              <div className="grid grid-cols-5 gap-1.5 md:gap-2">
                {POSICOES.map((pos, idx) => (
                  <button key={pos.id} onClick={() => setCurrentStep(idx)} className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${currentStep === idx ? 'border-primary ring-2 ring-primary' : fotos[pos.id] ? 'border-green-500' : 'border-border opacity-50'}`}>
                    {fotoPreviews[pos.id] ? (
                      <>
                        <img src={fotoPreviews[pos.id]} alt={pos.nome} className="w-full h-full object-cover" />
                        {currentStep !== idx && (
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                            <CheckCircle2 className="h-3 w-3 md:h-4 md:w-4 text-white drop-shadow-lg" />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Camera className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[8px] md:text-[10px] py-0.5 md:py-1 px-0.5 text-center font-medium leading-tight">
                      {pos.id === 'cnh' ? 'CNH' : pos.nome.split(' ')[0]}
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
