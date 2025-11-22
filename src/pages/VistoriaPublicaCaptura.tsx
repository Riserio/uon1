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
        () => {},
      );
    }
  };

  const processOcr = async (imageBase64: string, tipo: "cnh" | "veiculo") => {
    setProcessingOcr(true);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-cnh", {
        body: { image: imageBase64, tipo },
      });

      if (!error) {
        if (tipo === "cnh") setCnhData(data);
        else setVehicleData(data);
      }
    } finally {
      setProcessingOcr(false);
    }
  };

  const getFileType = (file: File) => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type === "application/pdf") return "pdf";
    return "image";
  };

  const getFileIcon = (type: string) =>
    type === "video" ? (
      <Film className="h-4 w-4" />
    ) : type === "pdf" ? (
      <FileText className="h-4 w-4" />
    ) : (
      <ImageIcon className="h-4 w-4" />
    );

  const handleFileSelect = async (e: any) => {
    const files = e.target.files;
    if (!files?.length) return;

    const posicao = POSICOES[currentStep];
    const valid: File[] = [];

    for (const file of files) {
      if (file.size <= 100 * 1024 * 1024) valid.push(file);
    }

    if (valid.length === 0) return;

    if (posicao.multiple) {
      const previews = [...(fotoPreviews[posicao.id] || [])];
      const stored = [...(fotos[posicao.id] || [])];

      for (const file of valid) {
        stored.push(file);

        if (getFileType(file) === "image") {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target?.result as string);
            reader.readAsDataURL(file);
          });
          previews.push(base64);
        } else {
          previews.push(file.type);
        }
      }

      setFotos({ ...fotos, [posicao.id]: stored });
      setFotoPreviews({ ...fotoPreviews, [posicao.id]: previews });
    } else {
      const file = valid[0];

      setFotos({ ...fotos, [posicao.id]: [file] });

      const type = getFileType(file);
      if (type === "image") {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.readAsDataURL(file);
        });

        setFotoPreviews({ ...fotoPreviews, [posicao.id]: [base64] });

        if (posicao.id === "cnh") processOcr(base64, "cnh");
        if (posicao.id === "frontal") processOcr(base64, "veiculo");
      } else {
        setFotoPreviews({ ...fotoPreviews, [posicao.id]: [file.type] });
      }
    }

    e.target.value = "";
  };

  const nextStep = () => {
    const posicao = POSICOES[currentStep];
    if (!fotos[posicao.id]?.length) return toast.error("Adicione uma foto");

    if (currentStep < POSICOES.length - 1) setCurrentStep(currentStep + 1);
    else handleContinue();
  };

  const prevStep = () => currentStep > 0 && setCurrentStep(currentStep - 1);

  const removeFoto = (id: string, index: number) => {
    const f = fotos[id].filter((_, i) => i !== index);
    const p = fotoPreviews[id].filter((_, i) => i !== index);

    const nf = { ...fotos };
    const np = { ...fotoPreviews };

    if (f.length === 0) {
      delete nf[id];
      delete np[id];
    } else {
      nf[id] = f;
      np[id] = p;
    }

    setFotos(nf);
    setFotoPreviews(np);
  };

  const handleContinue = () => {
    localStorage.setItem(
      "vistoria_temp",
      JSON.stringify({
        fotoPreviews,
        geolocation,
        cnhData,
        vehicleData,
        vistoriaId: vistoria.id,
      }),
    );

    navigate(`/vistoria/${token}/formulario`, { state: { fotos } });
  };

  const totalFotos = Object.values(fotos).reduce((acc, f) => acc + f.length, 0);
  const progress = ((currentStep + 1) / POSICOES.length) * 100;

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p>Carregando...</p>
      </div>
    );

  const posicaoAtual = POSICOES[currentStep];
  const previews = fotoPreviews[posicaoAtual.id] || [];
  const arquivos = fotos[posicaoAtual.id] || [];
  const IconePosicao = posicaoAtual.icon;

  return (
    <div className="min-h-screen py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* HEADER */}
        <Card className="shadow-lg border-none">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {corretora?.logo_url && <img src={corretora.logo_url} className="h-12" />}
              <div>
                <h1 className="text-xl font-bold">Vistoria Digital</h1>
                <p className="text-sm text-muted-foreground">Sinistro #{vistoria.numero}</p>
              </div>
            </div>

            <Badge className="px-4 py-2 text-base bg-blue-600 text-white">
              {currentStep + 1}/{POSICOES.length}
            </Badge>
          </CardContent>
        </Card>

        {/* PROGRESSO */}
        <Card className="shadow-lg border-none">
          <CardContent className="p-6">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-semibold">Progresso</span>
              <span className="text-sm font-bold text-blue-600">{totalFotos} foto(s)</span>
            </div>

            <Progress value={progress} className="h-3" />
          </CardContent>
        </Card>

        {/* CAPTURA */}
        <Card className="shadow-xl border-none overflow-hidden">
          <div className="bg-blue-600 p-8 text-white flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <IconePosicao className="h-7 w-7" />
            </div>

            <div>
              <h2 className="text-3xl font-bold">{posicaoAtual.nome}</h2>
              <p className="text-blue-100 text-lg">{posicaoAtual.descricao}</p>
            </div>
          </div>

          <CardContent className="p-8 space-y-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,application/pdf"
              multiple={posicaoAtual.multiple}
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* SEM FOTO */}
            {arquivos.length === 0 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[250px] border-4 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-white hover:from-blue-50 hover:to-blue-100 transition-all"
              >
                <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mb-4 text-white">
                  <Camera className="h-10 w-10" />
                </div>
                <h3 className="text-2xl font-bold">Tirar foto ou enviar da galeria</h3>
                <p className="text-gray-500 text-sm">Abrir câmera, galeria ou arquivos</p>
              </button>
            )}

            {/* COM FOTO */}
            {arquivos.length > 0 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  {previews.map((prev, i) => {
                    const file = arquivos[i];
                    const type = getFileType(file);

                    return (
                      <div key={i} className="relative group">
                        <div className="aspect-[4/3] rounded-xl border-2 border-green-400 overflow-hidden flex items-center justify-center">
                          {type === "image" ? (
                            <img src={prev} className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center justify-center">
                              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                                {getFileIcon(type)}
                              </div>
                              <p className="text-sm">{file.name}</p>
                              <Badge className="bg-blue-600">{type.toUpperCase()}</Badge>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => removeFoto(posicaoAtual.id, i)}
                          className="absolute top-3 right-3 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {posicaoAtual.multiple && (
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="w-full h-20 border-2 border-dashed text-lg"
                  >
                    <Upload className="h-6 w-6 mr-2" />
                    Adicionar mais fotos
                  </Button>
                )}
              </div>
            )}

            {processingOcr && (
              <div className="border rounded-xl p-6 flex items-center gap-4 bg-blue-50">
                <Sparkles className="h-6 w-6 text-blue-600 animate-spin" />
                <div>
                  <p className="font-bold text-blue-800">Processando com IA...</p>
                  <p className="text-sm text-blue-700">Extraindo informações...</p>
                </div>
              </div>
            )}

            {/* Navegação */}
            <div className="flex gap-3 pt-6 border-t">
              <Button onClick={prevStep} variant="outline" className="w-full" disabled={currentStep === 0}>
                <ArrowLeft className="h-5 w-5 mr-2" /> Voltar
              </Button>

              <Button onClick={nextStep} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                {currentStep === POSICOES.length - 1 ? "Preencher Dados" : "Próxima Foto"}
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* MINIETAPAS */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <p className="text-sm font-bold mb-4">Etapas:</p>
            <div className="grid grid-cols-6 gap-3">
              {POSICOES.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setCurrentStep(i)}
                  className={`aspect-square rounded-xl border flex items-center justify-center ${
                    i === currentStep ? "border-blue-600 ring-2 ring-blue-300" : "border-gray-300"
                  }`}
                >
                  {fotos[p.id]?.length ? (
                    <CheckCircle2 className="text-green-600 h-6 w-6" />
                  ) : (
                    <Camera className="text-gray-400 h-5 w-5" />
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-sm bg-white px-4 py-2 rounded-full shadow">
            <AlertCircle className="h-4 w-4" />
            <span>Mantenha as fotos nítidas e bem iluminadas.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
