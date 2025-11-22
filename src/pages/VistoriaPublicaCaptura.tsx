import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  FileText,
  Film,
  Image as ImageIcon,
  X,
  Upload,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const POSICOES = [
  { id: "cnh", nome: "CNH", descricao: "Carteira Nacional de Habilitação", tipo: "documento", icon: FileText },
  {
    id: "crlv",
    nome: "CRLV",
    descricao: "Documento do Veículo (pode enviar múltiplas fotos)",
    tipo: "documento",
    multiple: true,
    icon: FileText,
  },
  { id: "frontal", nome: "Frontal", descricao: "Frente completa do veículo", tipo: "veiculo", icon: Camera },
  { id: "traseira", nome: "Traseira", descricao: "Parte traseira completa", tipo: "veiculo", icon: Camera },
  {
    id: "lateral_esquerda",
    nome: "Lateral Esquerda",
    descricao: "Lado esquerdo do veículo",
    tipo: "veiculo",
    icon: Camera,
  },
  {
    id: "lateral_direita",
    nome: "Lateral Direita",
    descricao: "Lado direito do veículo",
    tipo: "veiculo",
    icon: Camera,
  },
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
        .from("vistorias")
        .select("*, corretoras(nome, logo_url)")
        .eq("link_token", token)
        .gt("link_expires_at", new Date().toISOString())
        .single();

      if (error) throw error;
      if (!data) {
        toast.error("Link de vistoria inválido ou expirado");
        navigate("/");
        return;
      }

      setVistoria(data);
      setCorretora(data.corretoras);
    } catch (error) {
      console.error("Erro ao carregar vistoria:", error);
      toast.error("Erro ao carregar vistoria");
      navigate("/");
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
            longitude: position.coords.longitude,
          });
        },
        (error) => console.error("Erro ao obter geolocalização:", error),
      );
    }
  };

  const processOcr = async (imageBase64: string, tipo: "cnh" | "veiculo") => {
    setProcessingOcr(true);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-cnh", {
        body: { image: imageBase64, tipo },
      });

      if (error) throw error;

      if (tipo === "cnh") {
        setCnhData(data);
        toast.success("Dados da CNH extraídos com sucesso!");
      } else {
        setVehicleData(data);
        if (data.placa) {
          toast.success(`Placa detectada: ${data.placa}`);
        }
      }
    } catch (error) {
      console.error("Erro ao processar OCR:", error);
    } finally {
      setProcessingOcr(false);
    }
  };

  const getFileType = (file: File): "image" | "video" | "pdf" => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type === "application/pdf") return "pdf";
    return "image";
  };

  const getFileIcon = (type: "image" | "video" | "pdf") => {
    switch (type) {
      case "video":
        return <Film className="h-4 w-4" />;
      case "pdf":
        return <FileText className="h-4 w-4" />;
      default:
        return <ImageIcon className="h-4 w-4" />;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const posicaoAtual = POSICOES[currentStep];
    const validTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "application/pdf",
    ];

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

    if (posicaoAtual.multiple) {
      const existingFiles = fotos[posicaoAtual.id] || [];
      const existingPreviews = fotoPreviews[posicaoAtual.id] || [];

      const newPreviews: string[] = [];
      for (const file of validFiles) {
        if (getFileType(file) === "image") {
          const reader = new FileReader();
          const preview = await new Promise<string>((resolve) => {
            reader.onload = (ev) => resolve(ev.target?.result as string);
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
      const file = validFiles[0];
      setFotos({ ...fotos, [posicaoAtual.id]: [file] });

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        setFotoPreviews({ ...fotoPreviews, [posicaoAtual.id]: [base64] });

        if (posicaoAtual.id === "cnh" && getFileType(file) === "image") {
          await processOcr(base64, "cnh");
        } else if (posicaoAtual.id === "frontal" && getFileType(file) === "image") {
          await processOcr(base64, "veiculo");
        }
      };

      if (getFileType(file) === "image") {
        reader.readAsDataURL(file);
      } else {
        setFotoPreviews({ ...fotoPreviews, [posicaoAtual.id]: [file.type] });
      }
    }

    // permite selecionar o mesmo arquivo de novo se precisar
    e.target.value = "";
  };

  const nextStep = () => {
    const posicaoAtual = POSICOES[currentStep];
    if (!fotos[posicaoAtual.id] || fotos[posicaoAtual.id].length === 0) {
      toast.error("Por favor, adicione pelo menos uma foto");
      return;
    }

    if (currentStep < POSICOES.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
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

  const handleContinue = () => {
    if (!vistoria) {
      toast.error("Não foi possível prosseguir com a vistoria.");
      return;
    }

    const tempData = {
      fotoPreviews,
      geolocation,
      cnhData,
      vehicleData,
      vistoriaId: vistoria.id,
    };

    try {
      localStorage.setItem("vistoria_temp", JSON.stringify(tempData));
    } catch (error) {
      console.error("Erro ao salvar vistoria_temp:", error);
    }

    navigate(`/vistoria/${token}/formulario`, {
      state: {
        fotos,
      },
    });
  };

  const totalFotos = Object.values(fotos).reduce((sum, files) => sum + files.length, 0);
  const progressPercentage = ((currentStep + 1) / POSICOES.length) * 100;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--vistoria-bg))] to-white flex items-center justify-center p-6">
        <Card className="border-none shadow-xl">
          <CardContent className="p-12 text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-[hsl(var(--vistoria-primary))]/20 border-t-[hsl(var(--vistoria-primary))]"></div>
            </div>
            <p className="text-lg font-semibold text-muted-foreground">Preparando câmera...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const posicaoAtual = POSICOES[currentStep];
  const fotosPosicaoAtual = fotos[posicaoAtual.id] || [];
  const previewsPosicaoAtual = fotoPreviews[posicaoAtual.id] || [];
  const IconePosicao = posicaoAtual.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--vistoria-bg))] to-white py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {corretora?.logo_url && (
                  <img src={corretora.logo_url} alt={corretora.nome} className="h-12 object-contain" />
                )}
                <div>
                  <h1 className="text-xl md:text-2xl font-bold text-gray-900">Vistoria Digital</h1>
                  <p className="text-sm text-muted-foreground">Sinistro #{vistoria.numero}</p>
                </div>
              </div>
              <Badge className="bg-[hsl(var(--vistoria-primary))] text-white px-4 py-2 text-base font-bold">
                {currentStep + 1}/{POSICOES.length}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Progress Bar */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-gray-700">Progresso da Captura</span>
              <span className="text-sm font-bold text-[hsl(var(--vistoria-primary))]">
                {totalFotos} foto{totalFotos !== 1 ? "s" : ""} enviada{totalFotos !== 1 ? "s" : ""}
              </span>
            </div>
            <Progress value={progressPercentage} className="h-3 bg-gray-200" />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {Math.round(progressPercentage)}% concluído
            </p>
          </CardContent>
        </Card>

        {/* Main Capture Card */}
        <Card className="border-none shadow-2xl overflow-hidden">
          {/* Header da Etapa */}
          <div className="bg-gradient-to-r from-[hsl(var(--vistoria-primary))] to-blue-600 p-8 text-white">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <IconePosicao className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <h2 className="text-3xl font-bold">{posicaoAtual.nome}</h2>
                <p className="text-blue-100 text-lg">{posicaoAtual.descricao}</p>
              </div>
            </div>
            {posicaoAtual.multiple && (
              <Badge className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm">
                <Upload className="h-3 w-3 mr-1" />
                Múltiplas fotos permitidas
              </Badge>
            )}
          </div>

          <CardContent className="p-8 space-y-6">
            {/* Upload Area */}
            <div className="space-y-6">
              {/* ÚNICO INPUT - câmera + galeria + arquivos */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,application/pdf"
                multiple={posicaoAtual.multiple}
                onChange={handleFileSelect}
                className="hidden"
              />

              {fotosPosicaoAtual.length === 0 ? (
                <div className="space-y-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full min-h-[250px] border-4 border-dashed border-gray-300 hover:border-[hsl(var(--vistoria-primary))] rounded-2xl bg-gradient-to-br from-gray-50 to-white hover:from-blue-50 hover:to-blue-100 transition-all duration-300 group"
                  >
                    <div className="flex flex-col items-center justify-center py-8">
                      <div className="w-20 h-20 bg-gradient-to-br from-[hsl(var(--vistoria-primary))] to-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg">
                        <Camera className="h-10 w-10 text-white" strokeWidth={2.5} />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">Tirar foto ou enviar da galeria</h3>
                      <p className="text-gray-500 text-sm">Clique para abrir a câmera, galeria ou arquivos</p>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Preview Grid */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {previewsPosicaoAtual.map((preview, index) => {
                      const file = fotosPosicaoAtual[index];
                      const fileType = getFileType(file);

                      return (
                        <div key={index} className="relative group">
                          <div className="relative aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl overflow-hidden border-2 border-green-400 shadow-lg">
                            {fileType === "image" ? (
                              <img
                                src={preview}
                                alt={`${posicaoAtual.nome} ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
                                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                                  {getFileIcon(fileType)}
                                </div>
                                <span className="text-sm font-semibold text-center line-clamp-2">{file.name}</span>
                                <Badge className="bg-blue-600">{fileType.toUpperCase()}</Badge>
                              </div>
                            )}

                            {/* Success Badge */}
                            <div className="absolute top-3 left-3 bg-green-500 text-white px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-xs font-bold">Enviada</span>
                            </div>

                            {/* Remove Button */}
                            <button
                              onClick={() => removeFoto(posicaoAtual.id, index)}
                              className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-md transition-all opacity-0 group-hover:opacity-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add More Button para múltiplas */}
                  {posicaoAtual.multiple && (
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      size="lg"
                      className="w-full border-2 border-dashed border-gray-300 hover:border-[hsl(var(--vistoria-primary))] h-20 text-lg"
                    >
                      <Upload className="h-6 w-6 mr-2" />
                      Adicionar Mais Fotos
                    </Button>
                  )}
                </div>
              )}

              {/* OCR Processing */}
              {processingOcr && (
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-xl p-6 flex items-center gap-4">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600"></div>
                    <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-purple-900">Processando com IA...</p>
                    <p className="text-sm text-purple-700">Extraindo dados automaticamente</p>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-6 border-t-2">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={currentStep === 0}
                size="lg"
                className="w-full sm:flex-1 h-14 text-base sm:text-lg border-2"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Anterior
              </Button>
              <Button
                onClick={nextStep}
                disabled={fotosPosicaoAtual.length === 0}
                size="lg"
                className="w-full sm:flex-1 h-14 text-base sm:text-lg bg-gradient-to-r from-[hsl(var(--vistoria-primary))] to-blue-600 hover:from-blue-600 hover:to-[hsl(var(--vistoria-primary))] disabled:opacity-50 disabled:cursor-not-allowed font-bold shadow-lg"
              >
                {currentStep === POSICOES.length - 1 ? "Preencher Dados" : "Próxima Foto"}
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Mini Thumbnails Progress */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <p className="text-sm font-bold mb-4 text-gray-700">Etapas da Vistoria:</p>
            <div className="grid grid-cols-6 gap-3">
              {POSICOES.map((pos, idx) => {
                const hasPhotos = fotos[pos.id] && fotos[pos.id].length > 0;
                const isCurrent = currentStep === idx;

                return (
                  <button
                    key={pos.id}
                    onClick={() => setCurrentStep(idx)}
                    className={`relative aspect-square rounded-xl border-2 transition-all duration-300 ${
                      isCurrent
                        ? "border-[hsl(var(--vistoria-primary))] ring-4 ring-[hsl(var(--vistoria-primary))]/30 scale-105"
                        : hasPhotos
                          ? "border-green-400 bg-green-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="w-full h-full flex items-center justify-center">
                      {hasPhotos ? (
                        <CheckCircle2 className="h-6 w-6 text-green-600" strokeWidth={2.5} />
                      ) : (
                        <Camera className="h-5 w-5 text-gray-400" />
                      )}
                    </div>

                    <div
                      className={`absolute -bottom-6 left-0 right-0 text-center text-[10px] font-medium ${
                        isCurrent ? "text-[hsl(var(--vistoria-primary))]" : "text-gray-500"
                      }`}
                    >
                      {pos.id === "cnh" ? "CNH" : pos.id === "crlv" ? "CRLV" : pos.nome.split(" ")[0]}
                    </div>

                    {hasPhotos && fotos[pos.id].length > 1 && (
                      <div className="absolute -top-2 -right-2 bg-[hsl(var(--vistoria-primary))] text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-md">
                        {fotos[pos.id].length}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Help Info */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-full shadow-md">
            <AlertCircle className="h-4 w-4" />
            <span>Certifique-se de que as fotos estejam nítidas e bem iluminadas</span>
          </div>
        </div>
      </div>
    </div>
  );
}
