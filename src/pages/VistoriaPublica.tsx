import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, CheckCircle2, Upload, ArrowRight, ArrowLeft, FileText, Film, Image as ImageIcon } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import SketchPad from "@/components/SketchPad";
import { Badge } from "@/components/ui/badge";

const FOTO_POSICOES = [
  { id: "frontal", nome: "Frontal", descricao: "Foto da frente do veículo" },
  { id: "traseira", nome: "Traseira", descricao: "Foto da traseira do veículo" },
  { id: "lateral_esquerda", nome: "Lateral Esquerda", descricao: "Lado esquerdo" },
  { id: "lateral_direita", nome: "Lateral Direita", descricao: "Lado direito" },
];

export default function VistoriaPublica() {
  const { token } = useParams();
  const [vistoria, setVistoria] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [geolocation, setGeolocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Form data
  const [formData, setFormData] = useState({
    cliente_nome: "",
    cliente_cpf: "",
    cliente_email: "",
    cliente_telefone: "",
    data_evento: "",
    hora_evento: "",
    condutor_veiculo: "",
    veiculo_placa: "",
    veiculo_modelo: "",
    narrar_fatos: "",
    vitima_ou_causador: "",
    tem_terceiros: false,
    placa_terceiro: "",
    local_tem_camera: false,
    fez_bo: false,
    foi_hospital: false,
    motorista_faleceu: false,
    policia_foi_local: false,
  });

  // Files
  const [crlvFotos, setCrlvFotos] = useState<File[]>([]);
  const [boFile, setBoFile] = useState<File | null>(null);
  const [laudoMedico, setLaudoMedico] = useState<File | null>(null);
  const [atestadoObito, setAtestadoObito] = useState<File | null>(null);
  const [laudoAlcoolemia, setLaudoAlcoolemia] = useState<File | null>(null);
  const [vehicleFotos, setVehicleFotos] = useState<{ [key: string]: File }>({});
  const [fotoPreviews, setFotoPreviews] = useState<{ [key: string]: string }>({});
  const [assinatura, setAssinatura] = useState<string>("");
  const [croqui, setCroqui] = useState<string>("");

  useEffect(() => {
    loadVistoria();
    getGeolocation();
  }, [token]);

  const loadVistoria = async () => {
    try {
      const { data, error } = await supabase
        .from("vistorias")
        .select("*")
        .eq("link_token", token)
        .gt("link_expires_at", new Date().toISOString())
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error("Link de vistoria inválido ou expirado");
        return;
      }

      setVistoria(data);
    } catch (error) {
      console.error("Erro ao carregar vistoria:", error);
      toast.error("Erro ao carregar vistoria");
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

  const uploadFile = async (file: File, path: string): Promise<string> => {
    let extension = "jpg";
    if (file.type === "image/png") extension = "png";
    if (file.type === "image/jpeg") extension = "jpg";

    const safeName = `foto_${Date.now()}.${extension}`;

    const fileName = `${vistoria.id}/${path}/${safeName}`;

    const { error: uploadError } = await supabase.storage.from("vistorias").upload(fileName, file);

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("vistorias").getPublicUrl(fileName);

    return publicUrl;
  };

  const uploadDataUrl = async (dataUrl: string, path: string): Promise<string> => {
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const file = new File([blob], `${path}.png`, { type: "image/png" });
    return uploadFile(file, path);
  };

  const handleSubmit = async () => {
    setUploading(true);
    try {
      // Validações
      if (!formData.cliente_nome || !formData.cliente_cpf) {
        toast.error("Preencha todos os campos obrigatórios");
        return;
      }

      if (Object.keys(vehicleFotos).length < 4) {
        toast.error("É necessário tirar todas as 4 fotos do veículo");
        return;
      }

      if (!assinatura) {
        toast.error("É necessário assinar o termo");
        return;
      }

      // Upload CRLV
      const crlvUrls = await Promise.all(crlvFotos.map((file) => uploadFile(file, "crlv")));

      // Upload documentos condicionais
      let boUrl = null;
      if (formData.fez_bo && boFile) {
        boUrl = await uploadFile(boFile, "bo");
      }

      let laudoMedicoUrl = null;
      if (formData.foi_hospital && laudoMedico) {
        laudoMedicoUrl = await uploadFile(laudoMedico, "laudo_medico");
      }

      let atestadoObitoUrl = null;
      if (formData.motorista_faleceu && atestadoObito) {
        atestadoObitoUrl = await uploadFile(atestadoObito, "atestado_obito");
      }

      let laudoAlcoolemiaUrl = null;
      const horaEvento = parseInt(formData.hora_evento.split(":")[0]);
      if ((horaEvento >= 20 || horaEvento < 6) && laudoAlcoolemia) {
        laudoAlcoolemiaUrl = await uploadFile(laudoAlcoolemia, "alcoolemia");
      }

      // Upload fotos do veículo
      for (const [posicao, file] of Object.entries(vehicleFotos)) {
        const url = await uploadFile(file, "veiculo");

        await supabase.from("vistoria_fotos").insert({
          vistoria_id: vistoria.id,
          posicao,
          arquivo_url: url,
          arquivo_nome: file.name,
          arquivo_tamanho: file.size,
          ordem: FOTO_POSICOES.findIndex((p) => p.id === posicao) + 1,
        });
      }

      // Upload assinatura e croqui
      const assinaturaUrl = await uploadDataUrl(assinatura, "assinatura");
      const croquiUrl = croqui ? await uploadDataUrl(croqui, "croqui") : null;

      // Atualizar vistoria
      const { error: updateError } = await supabase
        .from("vistorias")
        .update({
          ...formData,
          status: "em_analise",
          latitude: geolocation?.latitude,
          longitude: geolocation?.longitude,
          crlv_fotos_urls: crlvUrls,
          bo_url: boUrl,
          assinatura_url: assinaturaUrl,
          laudo_medico_url: laudoMedicoUrl,
          atestado_obito_url: atestadoObitoUrl,
          laudo_alcoolemia_url: laudoAlcoolemiaUrl,
          croqui_acidente_url: croquiUrl,
          completed_at: new Date().toISOString(),
        })
        .eq("id", vistoria.id);

      if (updateError) throw updateError;

      // Chamar análise IA
      const { data: fotosList } = await supabase.from("vistoria_fotos").select("*").eq("vistoria_id", vistoria.id);

      if (fotosList && fotosList.length === 4) {
        await supabase.functions.invoke("analisar-vistoria-ia", {
          body: {
            vistoria_id: vistoria.id,
            fotos: fotosList.map((f) => ({
              id: f.id,
              posicao: f.posicao,
              url: f.arquivo_url,
            })),
          },
        });
      }

      toast.success("Vistoria enviada com sucesso!");
      setCurrentStep(999); // Tela de conclusão
    } catch (error) {
      console.error("Erro ao enviar vistoria:", error);
      toast.error("Erro ao enviar vistoria");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setState: any) => {
    const file = e.target.files?.[0];
    if (file) setState(file);
  };

  const handleVehiclePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, posicao: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
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
    if (!validTypes.includes(file.type)) {
      toast.error("Formato não suportado. Use imagens (PNG, JPG), vídeos (MP4, MOV) ou PDF.");
      return;
    }

    // Validar tamanho (100MB max)
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Tamanho máximo: 100MB");
      return;
    }

    setVehicleFotos({ ...vehicleFotos, [posicao]: file });

    if (file.type.startsWith("video/") || file.type === "application/pdf") {
      // Para vídeos e PDFs, não gerar preview
      setFotoPreviews({ ...fotoPreviews, [posicao]: file.type });
    } else {
      // Para imagens, gerar preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setFotoPreviews({ ...fotoPreviews, [posicao]: e.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary/20 border-t-primary mx-auto"></div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Carregando vistoria...</h3>
              <p className="text-sm text-muted-foreground">Por favor, aguarde</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!vistoria) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-destructive/5 via-destructive/10 to-destructive/5 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-destructive/20">
          <CardContent className="p-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-destructive mb-2">Link Inválido</h2>
              <p className="text-muted-foreground">
                Este link de vistoria é inválido ou expirou. Entre em contato com a seguradora.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep === 999) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 flex items-center justify-center p-6">
        <Card className="max-w-md w-full shadow-xl">
          <CardContent className="p-8 text-center space-y-6">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-3">Vistoria Concluída!</h2>
              <p className="text-muted-foreground mb-6">
                Sua vistoria foi enviada com sucesso. Nossa equipe analisará as informações e entrará em contato em
                breve.
              </p>
            </div>
            <div className="bg-primary/5 border border-primary/20 p-5 rounded-lg text-sm space-y-3">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Próximos passos
              </div>
              <ul className="space-y-2 text-left text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Análise automática por IA</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Revisão pela equipe técnica</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Contato em até 24h úteis</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalSteps = 6;
  const stepProgress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 md:mb-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full mb-4">
            <Camera className="h-5 w-5 text-primary" />
            <Badge variant="secondary" className="text-sm">
              {vistoria.tipo_vistoria === "sinistro" ? "Sinistro" : "Reativação"}
            </Badge>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2 text-foreground">Vistoria Digital</h1>
          <p className="text-muted-foreground">Preencha os dados com atenção para uma análise precisa</p>
        </div>

        {/* Progress */}
        <div className="mb-6 md:mb-8">
          <div className="flex justify-between mb-2 text-sm text-muted-foreground">
            <span className="font-medium">Progresso</span>
            <span>
              Passo {currentStep + 1} de {totalSteps}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${stepProgress}%` }}
            />
          </div>
        </div>

        <Card className="shadow-lg border-2">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b">
            <CardTitle className="text-xl md:text-2xl flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                {currentStep + 1}
              </div>
              <span>
                {currentStep === 0 && "Dados Pessoais"}
                {currentStep === 1 && "Dados do Evento"}
                {currentStep === 2 && "Documentos"}
                {currentStep === 3 && "Fotos do Veículo"}
                {currentStep === 4 && "Croqui do Acidente"}
                {currentStep === 5 && "Assinatura Digital"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 space-y-6">
            {/* Step 0: Dados Pessoais */}
            {currentStep === 0 && (
              <div className="space-y-4">
                <div>
                  <Label>Nome Completo *</Label>
                  <Input
                    value={formData.cliente_nome}
                    onChange={(e) => setFormData({ ...formData, cliente_nome: e.target.value })}
                    placeholder="Seu nome completo"
                  />
                </div>
                <div>
                  <Label>CPF *</Label>
                  <Input
                    value={formData.cliente_cpf}
                    onChange={(e) => setFormData({ ...formData, cliente_cpf: e.target.value })}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.cliente_email}
                    onChange={(e) => setFormData({ ...formData, cliente_email: e.target.value })}
                    placeholder="seu@email.com"
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={formData.cliente_telefone}
                    onChange={(e) => setFormData({ ...formData, cliente_telefone: e.target.value })}
                    placeholder="(11) 99999-9999"
                  />
                </div>
              </div>
            )}

            {/* Step 1: Dados do Evento */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data do Evento *</Label>
                    <Input
                      type="date"
                      value={formData.data_evento}
                      onChange={(e) => setFormData({ ...formData, data_evento: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Hora do Evento *</Label>
                    <Input
                      type="time"
                      value={formData.hora_evento}
                      onChange={(e) => setFormData({ ...formData, hora_evento: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Condutor do Veículo *</Label>
                  <Input
                    value={formData.condutor_veiculo}
                    onChange={(e) => setFormData({ ...formData, condutor_veiculo: e.target.value })}
                    placeholder="Nome de quem estava dirigindo"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Placa do Veículo *</Label>
                    <Input
                      value={formData.veiculo_placa}
                      onChange={(e) => setFormData({ ...formData, veiculo_placa: e.target.value.toUpperCase() })}
                      placeholder="ABC1D23"
                    />
                  </div>
                  <div>
                    <Label>Modelo</Label>
                    <Input
                      value={formData.veiculo_modelo}
                      onChange={(e) => setFormData({ ...formData, veiculo_modelo: e.target.value })}
                      placeholder="Ex: Gol G7"
                    />
                  </div>
                </div>
                <div>
                  <Label>Narrar os Fatos *</Label>
                  <Textarea
                    value={formData.narrar_fatos}
                    onChange={(e) => setFormData({ ...formData, narrar_fatos: e.target.value })}
                    placeholder="Descreva detalhadamente o que aconteceu..."
                    rows={4}
                  />
                </div>
                <div>
                  <Label>Você foi vítima ou causador?</Label>
                  <RadioGroup
                    value={formData.vitima_ou_causador}
                    onValueChange={(value) => setFormData({ ...formData, vitima_ou_causador: value })}
                  >
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="vitima" id="vitima" />
                        <Label htmlFor="vitima">Vítima</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="causador" id="causador" />
                        <Label htmlFor="causador">Causador</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <Label>Tem terceiros envolvidos?</Label>
                  <RadioGroup
                    value={formData.tem_terceiros.toString()}
                    onValueChange={(value) => setFormData({ ...formData, tem_terceiros: value === "true" })}
                  >
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="true" id="tem-sim" />
                        <Label htmlFor="tem-sim">Sim</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="false" id="tem-nao" />
                        <Label htmlFor="tem-nao">Não</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
                {formData.tem_terceiros && (
                  <div>
                    <Label>Placa do Terceiro</Label>
                    <Input
                      value={formData.placa_terceiro}
                      onChange={(e) => setFormData({ ...formData, placa_terceiro: e.target.value.toUpperCase() })}
                      placeholder="ABC1D23"
                    />
                  </div>
                )}
                <div>
                  <Label>Local possui câmera?</Label>
                  <RadioGroup
                    value={formData.local_tem_camera.toString()}
                    onValueChange={(value) => setFormData({ ...formData, local_tem_camera: value === "true" })}
                  >
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="true" id="camera-sim" />
                        <Label htmlFor="camera-sim">Sim</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="false" id="camera-nao" />
                        <Label htmlFor="camera-nao">Não</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <Label>A polícia foi ao local?</Label>
                  <RadioGroup
                    value={formData.policia_foi_local.toString()}
                    onValueChange={(value) => setFormData({ ...formData, policia_foi_local: value === "true" })}
                  >
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="true" id="policia-sim" />
                        <Label htmlFor="policia-sim">Sim</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="false" id="policia-nao" />
                        <Label htmlFor="policia-nao">Não</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            )}

            {/* Step 2: Documentos */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div>
                  <Label>Fotos do CRLV (frente e verso) *</Label>
                  <Input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    onChange={(e) => setCrlvFotos(Array.from(e.target.files || []))}
                    capture="environment"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Aceita imagens e PDF</p>
                </div>

                <div>
                  <Label>Fez BO (Boletim de Ocorrência)?</Label>
                  <RadioGroup
                    value={formData.fez_bo.toString()}
                    onValueChange={(value) => setFormData({ ...formData, fez_bo: value === "true" })}
                  >
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="true" id="bo-sim" />
                        <Label htmlFor="bo-sim">Sim</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="false" id="bo-nao" />
                        <Label htmlFor="bo-nao">Não</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                {formData.fez_bo && (
                  <div>
                    <Label>Anexar BO</Label>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => handleFileChange(e, setBoFile)}
                    />
                  </div>
                )}

                <div>
                  <Label>Foi para o hospital?</Label>
                  <RadioGroup
                    value={formData.foi_hospital.toString()}
                    onValueChange={(value) => setFormData({ ...formData, foi_hospital: value === "true" })}
                  >
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="true" id="hosp-sim" />
                        <Label htmlFor="hosp-sim">Sim</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="false" id="hosp-nao" />
                        <Label htmlFor="hosp-nao">Não</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                {formData.foi_hospital && (
                  <div>
                    <Label>Anexar Laudo Médico</Label>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => handleFileChange(e, setLaudoMedico)}
                    />
                  </div>
                )}

                <div>
                  <Label>O motorista faleceu?</Label>
                  <RadioGroup
                    value={formData.motorista_faleceu.toString()}
                    onValueChange={(value) => setFormData({ ...formData, motorista_faleceu: value === "true" })}
                  >
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="true" id="obito-sim" />
                        <Label htmlFor="obito-sim">Sim</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="false" id="obito-nao" />
                        <Label htmlFor="obito-nao">Não</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                {formData.motorista_faleceu && (
                  <div>
                    <Label>Anexar Atestado de Óbito</Label>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => handleFileChange(e, setAtestadoObito)}
                    />
                  </div>
                )}

                {formData.hora_evento &&
                  (parseInt(formData.hora_evento.split(":")[0]) >= 20 ||
                    parseInt(formData.hora_evento.split(":")[0]) < 6) && (
                    <div>
                      <Label>Laudo de Alcoolemia (acidente entre 20h e 6h)</Label>
                      <Input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => handleFileChange(e, setLaudoAlcoolemia)}
                      />
                    </div>
                  )}
              </div>
            )}

            {/* Step 3: Fotos do Veículo */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="bg-muted/50 p-4 rounded-lg border border-border">
                  <div className="flex items-start gap-3">
                    <ImageIcon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">Formatos aceitos</p>
                      <p className="text-xs text-muted-foreground">
                        Imagens (PNG, JPG, GIF, WebP), Vídeos (MP4, MOV, WebM) e PDF - Máximo 100MB por arquivo
                      </p>
                    </div>
                  </div>
                </div>

                {FOTO_POSICOES.map((posicao) => {
                  const file = vehicleFotos[posicao.id];
                  const preview = fotoPreviews[posicao.id];
                  const hasFile = !!file;

                  return (
                    <div key={posicao.id} className="border rounded-lg p-4 space-y-3 bg-card">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-semibold">{posicao.nome} *</Label>
                          <p className="text-sm text-muted-foreground">{posicao.descricao}</p>
                        </div>
                        {hasFile && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            {file.type.startsWith("video/") && <Film className="h-3 w-3" />}
                            {file.type.startsWith("image/") && <ImageIcon className="h-3 w-3" />}
                            {file.type === "application/pdf" && <FileText className="h-3 w-3" />}
                            {file.type.startsWith("video/")
                              ? "Vídeo"
                              : file.type === "application/pdf"
                                ? "PDF"
                                : "Imagem"}
                          </Badge>
                        )}
                      </div>

                      {hasFile ? (
                        <div className="space-y-2">
                          {file.type.startsWith("image/") &&
                          preview &&
                          typeof preview === "string" &&
                          !preview.startsWith("video") &&
                          preview !== "application/pdf" ? (
                            <img
                              src={preview}
                              alt={posicao.nome}
                              className="w-full rounded-lg border border-border max-h-64 object-cover"
                            />
                          ) : file.type.startsWith("video/") ? (
                            <div className="flex items-center justify-center bg-muted rounded-lg p-8 border border-border">
                              <div className="text-center space-y-2">
                                <Film className="h-12 w-12 text-primary mx-auto" />
                                <p className="text-sm font-medium">{file.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                          ) : file.type === "application/pdf" ? (
                            <div className="flex items-center justify-center bg-muted rounded-lg p-8 border border-border">
                              <div className="text-center space-y-2">
                                <FileText className="h-12 w-12 text-primary mx-auto" />
                                <p className="text-sm font-medium">{file.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newFotos = { ...vehicleFotos };
                              delete newFotos[posicao.id];
                              setVehicleFotos(newFotos);
                              const newPreviews = { ...fotoPreviews };
                              delete newPreviews[posicao.id];
                              setFotoPreviews(newPreviews);
                            }}
                            className="w-full"
                          >
                            Alterar arquivo
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            type="file"
                            accept="image/*,video/*,application/pdf"
                            capture="environment"
                            onChange={(e) => handleVehiclePhotoChange(e, posicao.id)}
                            className="cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step 4: Croqui */}
            {currentStep === 4 && (
              <div>
                <SketchPad onSave={(sketch) => setCroqui(sketch)} initialSketch={croqui} />
              </div>
            )}

            {/* Step 5: Assinatura */}
            {currentStep === 5 && (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg text-sm">
                  <p className="font-semibold mb-2">Termo de Aceite</p>
                  <p className="text-muted-foreground">
                    Declaro que as informações prestadas e os documentos anexados são verdadeiros e autorizo o uso dos
                    mesmos para análise da vistoria.
                  </p>
                </div>
                <SignaturePad onSave={(sig) => setAssinatura(sig)} initialSignature={assinatura} />
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-3 pt-6 border-t">
              {currentStep > 0 && (
                <Button onClick={() => setCurrentStep(currentStep - 1)} variant="outline" size="lg" className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Anterior
                </Button>
              )}
              <Button
                onClick={() => {
                  if (currentStep < 5) {
                    setCurrentStep(currentStep + 1);
                  } else {
                    handleSubmit();
                  }
                }}
                disabled={uploading}
                size="lg"
                className="flex-1"
              >
                {uploading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Enviando...
                  </div>
                ) : currentStep === 5 ? (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Finalizar Vistoria
                  </>
                ) : (
                  <>
                    Próximo
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
