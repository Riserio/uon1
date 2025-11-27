import { useState, useEffect, ChangeEvent } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MaskedInput } from "@/components/ui/masked-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, User, Calendar, FileText, AlertCircle, CheckCircle, MapPin, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import SketchPad from "@/components/SketchPad";
import { validateCPF, validatePhone } from "@/lib/validators";
import { VehicleFipeSelector } from "@/components/VehicleFipeSelector";

// Fallback de marcas/modelos (igual na vistoria manual) - Mantido, mas VehicleFipeSelector provavelmente usa API
const MARCAS = [
  "Audi",
  "BMW",
  "Chevrolet",
  "Citroën",
  "Fiat",
  "Ford",
  "Honda",
  "Hyundai",
  "Jeep",
  "Kia",
  "Mercedes-Benz",
  "Mitsubishi",
  "Nissan",
  "Peugeot",
  "Renault",
  "Toyota",
  "Volkswagen",
  "Volvo",
  "Outros",
];

const MODELOS_POR_MARCA: { [key: string]: string[] } = {
  Volkswagen: ["Gol", "Fox", "Polo", "Virtus", "T-Cross", "Nivus", "Taos", "Tiguan", "Amarok"],
  Chevrolet: ["Onix", "Prisma", "Tracker", "Cruze", "S10", "Spin", "Montana"],
  Fiat: ["Argo", "Cronos", "Mobi", "Pulse", "Fastback", "Toro", "Strada"],
  Ford: ["Ka", "EcoSport", "Ranger", "Territory", "Maverick"],
  Toyota: ["Corolla", "Yaris", "Hilux", "SW4", "Etios", "Corolla Cross"],
  Honda: ["Civic", "City", "HR-V", "CR-V", "Fit"],
  Hyundai: ["HB20", "Creta", "Tucson", "Santa Fe", "ix35"],
  Jeep: ["Renegade", "Compass", "Commander"],
  Renault: ["Kwid", "Sandero", "Logan", "Duster", "Oroch", "Captur"],
  Nissan: ["Kicks", "Versa", "Frontier", "Sentra"],
  Peugeot: ["208", "2008", "3008", "5008"],
  Citroën: ["C3", "C4 Cactus"],
  Outros: [],
};

const STEPS = [
  { id: 0, title: "Dados Pessoais", icon: User, description: "Informações do segurado" },
  { id: 1, title: "Dados do Evento", icon: Calendar, description: "Quando e onde ocorreu" },
  { id: 2, title: "Informações Gerais", icon: AlertCircle, description: "Detalhes do incidente" },
  { id: 3, title: "Documentos", icon: FileText, description: "Anexos necessários" },
  { id: 4, title: "Croqui", icon: MapPin, description: "Desenho do acidente" },
];

export default function VistoriaPublicaFormulario() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as {
    fotos?: { [key: string]: File[] };
  } | null;

  const [vistoria, setVistoria] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tempData, setTempData] = useState<any>(null);

  const [formData, setFormData] = useState({
    // Cliente
    cliente_nome: "",
    cliente_cpf: "",
    cliente_email: "",
    cliente_telefone: "",
    // Evento
    data_evento: "",
    hora_evento: "",
    condutor_veiculo: "",
    // Veículo
    veiculo_placa: "",
    veiculo_marca: "",
    veiculo_modelo: "",
    veiculo_ano: "",
    veiculo_tipo: "",
    veiculo_cor: "",
    veiculo_chassi: "",
    veiculo_valor_fipe: null as number | null,
    veiculo_fipe_data_consulta: null as Date | null,
    veiculo_fipe_codigo: null as string | null,
    // Sinistro
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

  const [vehicleType, setVehicleType] = useState<string>("");

  const [boFile, setBoFile] = useState<File | null>(null);
  const [laudoMedico, setLaudoMedico] = useState<File | null>(null);
  const [atestadoObito, setAtestadoObito] = useState<File | null>(null);
  const [laudoAlcoolemia, setLaudoAlcoolemia] = useState<File | null>(null);
  const [croqui, setCroqui] = useState<string>("");

  useEffect(() => {
    loadVistoria();
    loadTempData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTempData = () => {
    const temp = localStorage.getItem("vistoria_temp");
    const stored = temp ? JSON.parse(temp) : null;

    const fotosFromState = locationState?.fotos || {};

    const data = {
      ...stored,
      fotos: fotosFromState,
    };

    setTempData(data);

    if (data?.cnhData) {
      setFormData((prev) => ({
        ...prev,
        cliente_nome: data.cnhData.nome || "",
        cliente_cpf: data.cnhData.cpf || "",
        condutor_veiculo: data.cnhData.nome || "",
      }));
    }

    if (data?.vehicleData) {
      setFormData((prev) => ({
        ...prev,
        veiculo_placa: data.vehicleData.placa || "",
        veiculo_marca: data.vehicleData.marca || "",
        veiculo_modelo: data.vehicleData.modelo || "",
        veiculo_ano: data.vehicleData.ano || "",
      }));
    }
  };

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
        toast.error("Link inválido");
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

  const normalizePlate = (value: string) => {
    let v = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (v.length > 7) v = v.slice(0, 7);
    if (v.length > 3) v = v.slice(0, 3) + "-" + v.slice(3);
    return v;
  };

  const handlePlacaChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = normalizePlate(e.target.value);
    setFormData((prev) => ({
      ...prev,
      veiculo_placa: value,
    }));
  };

  const handlePlacaTerceiroChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = normalizePlate(e.target.value);
    setFormData((prev) => ({
      ...prev,
      placa_terceiro: value,
    }));
  };

  // Mesma lógica da vistoria manual: trocar tipo limpa marca/modelo/ano
  const handleVehicleTypeChange = (value: string) => {
    setVehicleType(value);
    setFormData((prev) => ({
      ...prev,
      veiculo_tipo: value,
      veiculo_marca: "",
      veiculo_modelo: "",
      veiculo_ano: "",
      // Limpa dados FIPE ao trocar o tipo de veículo
      veiculo_valor_fipe: null,
      veiculo_fipe_data_consulta: null,
      veiculo_fipe_codigo: null,
    }));
  };

  const handleSubmit = async () => {
    const camposObrigatorios: string[] = [];

    if (!formData.cliente_nome?.trim()) {
      camposObrigatorios.push("Nome completo");
    }

    if (!formData.cliente_cpf?.trim()) {
      camposObrigatorios.push("CPF");
    } else if (!validateCPF(formData.cliente_cpf)) {
      toast.error("CPF inválido. Por favor, verifique o número digitado.");
      setCurrentStep(0);
      return;
    }

    if (!formData.data_evento) {
      camposObrigatorios.push("Data do evento");
    }

    if (!formData.hora_evento) {
      camposObrigatorios.push("Hora do evento");
    }

    if (!formData.narrar_fatos?.trim()) {
      camposObrigatorios.push("Descrição dos fatos");
    }

    if (!vehicleType) {
      camposObrigatorios.push("Tipo de veículo (Carro, Moto ou Caminhão)");
    }

    if (!formData.veiculo_marca) {
      camposObrigatorios.push("Marca do veículo");
    }

    if (!formData.veiculo_modelo) {
      camposObrigatorios.push("Modelo do veículo");
    }

    if (!formData.veiculo_cor) {
      camposObrigatorios.push("Cor do veículo");
    }

    if (formData.cliente_telefone && !validatePhone(formData.cliente_telefone)) {
      toast.error("Telefone inválido. Use o formato (00) 00000-0000");
      setCurrentStep(0);
      return;
    }

    if (formData.fez_bo && !boFile) {
      camposObrigatorios.push("Boletim de Ocorrência (arquivo)");
    }

    if (formData.foi_hospital && !laudoMedico) {
      camposObrigatorios.push("Laudo Médico (arquivo)");
    }

    if (formData.motorista_faleceu && !atestadoObito) {
      camposObrigatorios.push("Atestado de Óbito (arquivo)");
    }

    if (camposObrigatorios.length > 0) {
      toast.error(`Por favor, preencha os seguintes campos obrigatórios: ${camposObrigatorios.join(", ")}`, {
        duration: 5000,
      });
      setCurrentStep(0);
      return;
    }

    setUploading(true);
    try {
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
      const horaEvento = formData.hora_evento ? parseInt(formData.hora_evento.split(":")[0]) : 0;
      if ((horaEvento >= 20 || horaEvento < 6) && laudoAlcoolemia) {
        laudoAlcoolemiaUrl = await uploadFile(laudoAlcoolemia, "alcoolemia");
      }

      // Fotos para análise por IA
      const fotosParaAnalise: { id: string; posicao: string; url: string }[] = [];

      if (tempData?.fotos) {
        for (const [posicao, files] of Object.entries(tempData.fotos) as [string, File[]][]) {
          if (posicao === "cnh" || posicao === "crlv") continue;

          for (const file of files) {
            const url = await uploadFile(file, "veiculo");

            const { data: inserted, error: insertError } = await supabase
              .from("vistoria_fotos")
              .insert({
                vistoria_id: vistoria.id,
                posicao,
                arquivo_url: url,
                arquivo_nome: file.name,
                arquivo_tamanho: file.size,
                ordem: ["frontal", "traseira", "lateral_esquerda", "lateral_direita"].indexOf(posicao) + 1,
              })
              .select("id, posicao, arquivo_url")
              .single();

            if (insertError) {
              console.error("Erro ao inserir foto na vistoria_fotos:", insertError);
              throw insertError;
            }

            if (inserted) {
              fotosParaAnalise.push({
                id: inserted.id,
                posicao: inserted.posicao,
                url: inserted.arquivo_url,
              });
            }
          }
        }
      }

      let cnhUrl = "";
      if (tempData?.fotos?.cnh?.[0]) {
        cnhUrl = await uploadFile(tempData.fotos.cnh[0], "cnh");
      }

      const crlvUrls: string[] = [];
      if (tempData?.fotos?.crlv) {
        for (const file of tempData.fotos.crlv) {
          const url = await uploadFile(file, "crlv");
          crlvUrls.push(url);
        }
      }

      const croquiUrl = croqui ? await uploadDataUrl(croqui, "croqui") : null;

      const payload: any = {
        ...formData,
        veiculo_tipo: vehicleType, // Garantir que o tipo está no payload
        latitude: tempData?.geolocation?.latitude,
        longitude: tempData?.geolocation?.longitude,
        cnh_url: cnhUrl,
        cnh_dados: tempData?.cnhData,
        crlv_fotos_urls: crlvUrls,
        bo_url: boUrl,
        laudo_medico_url: laudoMedicoUrl,
        atestado_obito_url: atestadoObitoUrl,
        laudo_alcoolemia_url: laudoAlcoolemiaUrl,
        croqui_acidente_url: croquiUrl,
      };

      if (formData.veiculo_fipe_data_consulta) {
        payload.veiculo_fipe_data_consulta = formData.veiculo_fipe_data_consulta.toISOString();
      }

      console.log("📝 Salvando vistoria com dados do veículo:", {
        tipo: payload.veiculo_tipo,
        marca: payload.veiculo_marca,
        modelo: payload.veiculo_modelo,
        ano: payload.veiculo_ano,
        cor: payload.veiculo_cor,
        chassi: payload.veiculo_chassi,
        valorFipe: payload.veiculo_valor_fipe,
      });

      const { error: updateError } = await supabase.from("vistorias").update(payload).eq("id", vistoria.id);

      if (updateError) {
        console.error("Erro ao atualizar vistoria:", updateError);
        throw new Error(`Falha ao salvar os dados: ${updateError.message}`);
      }

      // Chamada automática da função de IA
      if (fotosParaAnalise.length > 0) {
        supabase.functions
          .invoke("analisar-vistoria-ia", {
            body: {
              vistoria_id: vistoria.id,
              fotos: fotosParaAnalise,
            },
          })
          .then(({ data, error }) => {
            if (error) {
              console.error("Erro na análise IA automática:", error);
              return;
            }
            console.log("Análise IA concluída:", data);
          })
          .catch((err) => {
            console.error("Erro ao chamar função de IA:", err);
          });
      }

      const { data: verificacao, error: errorVerificacao } = await supabase
        .from("vistorias")
        .select("id, cliente_nome, cliente_cpf")
        .eq("id", vistoria.id)
        .single();

      if (errorVerificacao || !verificacao) {
        throw new Error("Não foi possível verificar o salvamento dos dados");
      }

      console.log("Vistoria salva com sucesso:", verificacao);
      toast.success("Dados salvos com sucesso! Agora aceite os termos.");
      navigate(`/vistoria/${token}/termos`);
    } catch (error: any) {
      console.error("Erro ao enviar vistoria:", error);
      const mensagemErro = error?.message || "Erro ao enviar vistoria";
      toast.error(`Erro: ${mensagemErro}. Por favor, tente novamente ou entre em contato com o suporte.`, {
        duration: 6000,
      });
    } finally {
      setUploading(false);
    }
  };

  if (loading || !vistoria) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--vistoria-bg))] to-white flex items-center justify-center p-6">
        <Card className="border-none shadow-xl">
          <CardContent className="p-12 text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-[hsl(var(--vistoria-primary))]/20 border-t-[hsl(var(--vistoria-primary))]"></div>
            </div>
            <p className="text-lg font-semibold text-muted-foreground">Carregando formulário...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStepInfo = STEPS[currentStep];
  const StepIcon = currentStepInfo.icon;
  const stepProgress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--vistoria-bg))] to-white py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {vistoria.corretoras?.logo_url && (
                  <img src={vistoria.corretoras.logo_url} alt="Logo" className="h-12 object-contain" />
                )}
                <div>
                  <h1 className="text-xl md:text-2xl font-bold text-gray-900">Informações da Vistoria</h1>
                  <p className="text-sm text-muted-foreground">Sinistro #{vistoria.numero}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Steps Progress */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-bold text-gray-700">
                Etapa {currentStep + 1} de {STEPS.length}
              </span>
              <span className="text-sm font-semibold text-[hsl(var(--vistoria-primary))]">
                {Math.round(stepProgress)}%
              </span>
            </div>
            <Progress value={stepProgress} className="h-3 mb-4" />

            <div className="flex justify-between gap-2">
              {STEPS.map((step, idx) => (
                <div
                  key={step.id}
                  className={`flex-1 text-center ${idx <= currentStep ? "opacity-100" : "opacity-30"}`}
                >
                  <div
                    className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-2 transition-all ${
                      idx < currentStep
                        ? "bg-green-500 text-white"
                        : idx === currentStep
                          ? "bg-[hsl(var(--vistoria-primary))] text-white scale-110"
                          : "bg-gray-200 text-gray-400"
                    }`}
                  >
                    {idx < currentStep ? <CheckCircle className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
                  </div>
                  <p className="text-xs font-medium hidden sm:block">{step.title}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main Form Card */}
        <Card className="border-none shadow-2xl">
          <div className="bg-gradient-to-r from-[hsl(var(--vistoria-primary))] to-blue-600 p-8 text-white">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <StepIcon className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-3xl font-bold">{currentStepInfo.title}</h2>
                <p className="text-blue-100 text-lg">{currentStepInfo.description}</p>
              </div>
            </div>
          </div>

          <CardContent className="p-8 space-y-6">
            {/* Step 0: Dados Pessoais */}
            {currentStep === 0 && (
              <div className="space-y-6">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-blue-800">
                    Alguns dados foram preenchidos automaticamente via OCR da CNH. Confira e complete se necessário.
                  </p>
                </div>

                <div>
                  <Label className="text-base font-semibold">Nome Completo *</Label>
                  <Input
                    value={formData.cliente_nome}
                    onChange={(e) => setFormData({ ...formData, cliente_nome: e.target.value })}
                    placeholder="Digite seu nome completo"
                    className="mt-2 h-12 text-lg"
                  />
                </div>

                <div>
                  <Label className="text-base font-semibold">CPF *</Label>
                  <MaskedInput
                    format="###.###.###-##"
                    value={formData.cliente_cpf}
                    onValueChange={(values) => setFormData({ ...formData, cliente_cpf: values.value })}
                    placeholder="000.000.000-00"
                    className="mt-2 h-12 text-lg"
                  />
                </div>

                <div>
                  <Label className="text-base font-semibold">Email</Label>
                  <Input
                    type="email"
                    value={formData.cliente_email}
                    onChange={(e) => setFormData({ ...formData, cliente_email: e.target.value })}
                    placeholder="seu@email.com"
                    className="mt-2 h-12 text-lg"
                  />
                </div>

                <div>
                  <Label className="text-base font-semibold">Telefone</Label>
                  <MaskedInput
                    format="(##) #####-####"
                    value={formData.cliente_telefone}
                    onValueChange={(values) => setFormData({ ...formData, cliente_telefone: values.value })}
                    placeholder="(11) 99999-9999"
                    className="mt-2 h-12 text-lg"
                  />
                </div>
              </div>
            )}

            {/* Step 1: Dados do Evento + Veículo + Narração (CORRIGIDO) */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-base font-semibold">Data do Evento *</Label>
                    <Input
                      type="date"
                      value={formData.data_evento}
                      onChange={(e) => setFormData({ ...formData, data_evento: e.target.value })}
                      className="mt-2 h-12"
                    />
                  </div>
                  <div>
                    <Label className="text-base font-semibold">Hora do Evento *</Label>
                    <Input
                      type="time"
                      value={formData.hora_evento}
                      onChange={(e) => setFormData({ ...formData, hora_evento: e.target.value })}
                      className="mt-2 h-12"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-base font-semibold">Condutor do Veículo</Label>
                  <Input
                    value={formData.condutor_veiculo}
                    onChange={(e) => setFormData({ ...formData, condutor_veiculo: e.target.value })}
                    placeholder="Nome de quem estava dirigindo"
                    className="mt-2 h-12"
                  />
                </div>

                {/* ÚNICO VehicleFipeSelector - CORRIGIDO para carregar dados FIPE */}
                <div className="mt-4 space-y-3">
                  <VehicleFipeSelector
                    // Vehicle Type
                    vehicleType={vehicleType}
                    onVehicleTypeChange={handleVehicleTypeChange} // Mantido para resetar marca/modelo/ano
                    // Marca
                    marca={formData.veiculo_marca}
                    onMarcaChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        veiculo_marca: value,
                        veiculo_modelo: "", // Limpar modelo ao trocar marca
                        veiculo_ano: "", // Limpar ano ao trocar marca
                        veiculo_valor_fipe: null,
                        veiculo_fipe_data_consulta: null,
                      }))
                    }
                    // Modelo
                    modelo={formData.veiculo_modelo}
                    onModeloChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        veiculo_modelo: value,
                        veiculo_ano: "", // Limpar ano ao trocar modelo
                        veiculo_valor_fipe: null,
                        veiculo_fipe_data_consulta: null,
                      }))
                    }
                    // Ano
                    ano={formData.veiculo_ano}
                    onAnoChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        veiculo_ano: value,
                        veiculo_valor_fipe: null,
                        veiculo_fipe_data_consulta: null,
                      }))
                    }
                    // FIPE Data (Campos de retorno)
                    valorFipe={formData.veiculo_valor_fipe}
                    onValorFipeChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        veiculo_valor_fipe: value,
                      }))
                    }
                    dataConsultaFipe={formData.veiculo_fipe_data_consulta}
                    onDataConsultaFipeChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        veiculo_fipe_data_consulta: value,
                      }))
                    }
                    codigoFipe={formData.veiculo_fipe_codigo}
                    onCodigoFipeChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        veiculo_fipe_codigo: value,
                      }))
                    }
                    // Configuração de exibição
                    showFipeButton={true} // Agora ele exibe e executa a lógica de FIPE
                    // showOnlySelectors removido para permitir que a lógica completa de FIPE seja inicializada
                  />
                </div>
                {/* FIM: ÚNICO VehicleFipeSelector */}

                <div>
                  <Label className="text-base font-semibold">Placa do Veículo</Label>
                  <Input
                    value={formData.veiculo_placa}
                    onChange={handlePlacaChange}
                    placeholder="ABC-1234"
                    className="mt-2 h-12 font-mono text-lg uppercase"
                    inputMode="text"
                  />
                </div>

                {/* Cor e Chassi */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Cor *</Label>
                    <Select
                      value={formData.veiculo_cor || undefined}
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          veiculo_cor: value,
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecione a cor" />
                      </SelectTrigger>
                      <SelectContent className="z-[100000] bg-popover">
                        {[
                          "Preto",
                          "Branco",
                          "Prata",
                          "Cinza",
                          "Vermelho",
                          "Azul",
                          "Verde",
                          "Amarelo",
                          "Laranja",
                          "Marrom",
                          "Bege",
                          "Dourado",
                          "Roxo",
                          "Rosa",
                          "Outros",
                        ].map((cor) => (
                          <SelectItem key={cor} value={cor}>
                            {cor}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Chassi</Label>
                    <Input
                      value={formData.veiculo_chassi}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          veiculo_chassi: e.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="9BWZZZ377VT004251"
                      maxLength={17}
                      className="mt-1 uppercase"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-base font-semibold">Narre os Fatos *</Label>
                  <Textarea
                    value={formData.narrar_fatos}
                    onChange={(e) => setFormData({ ...formData, narrar_fatos: e.target.value })}
                    placeholder="Descreva detalhadamente como o acidente aconteceu..."
                    rows={6}
                    className="mt-2 text-base"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Inclua detalhes como condições climáticas, visibilidade, velocidade aproximada, etc.
                  </p>
                </div>

                <div>
                  <Label className="text-base font-semibold mb-3 block">Você foi vítima ou causador?</Label>
                  <RadioGroup
                    value={formData.vitima_ou_causador}
                    onValueChange={(value) => setFormData({ ...formData, vitima_ou_causador: value })}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="vitima" id="vitima" />
                      <Label htmlFor="vitima" className="flex-1 cursor-pointer font-medium">
                        Vítima
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="causador" id="causador" />
                      <Label htmlFor="causador" className="flex-1 cursor-pointer font-medium">
                        Causador
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            )}

            {/* Step 2: Informações Gerais */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <Label className="text-base font-semibold mb-3 block">Houve terceiros envolvidos?</Label>
                  <RadioGroup
                    value={formData.tem_terceiros ? "sim" : "nao"}
                    onValueChange={(value) => setFormData({ ...formData, tem_terceiros: value === "sim" })}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="sim" id="terceiros-sim" />
                      <Label htmlFor="terceiros-sim" className="flex-1 cursor-pointer font-medium">
                        Sim
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="nao" id="terceiros-nao" />
                      <Label htmlFor="terceiros-nao" className="flex-1 cursor-pointer font-medium">
                        Não
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {formData.tem_terceiros && (
                  <div>
                    <Label className="text-base font-semibold">Placa do Terceiro</Label>
                    <Input
                      value={formData.placa_terceiro}
                      onChange={handlePlacaTerceiroChange}
                      placeholder="Placa do veículo de terceiros"
                      className="mt-2 h-12 font-mono text-lg uppercase"
                      inputMode="text"
                    />
                  </div>
                )}

                <div>
                  <Label className="text-base font-semibold mb-3 block">A polícia esteve no local?</Label>
                  <RadioGroup
                    value={formData.policia_foi_local ? "sim" : "nao"}
                    onValueChange={(value) => setFormData({ ...formData, policia_foi_local: value === "sim" })}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="sim" id="policia-sim" />
                      <Label htmlFor="policia-sim" className="flex-1 cursor-pointer font-medium">
                        Sim
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="nao" id="policia-nao" />
                      <Label htmlFor="policia-nao" className="flex-1 cursor-pointer font-medium">
                        Não
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-base font-semibold mb-3 block">Havia câmera de segurança no local?</Label>
                  <RadioGroup
                    value={formData.local_tem_camera ? "sim" : "nao"}
                    onValueChange={(value) => setFormData({ ...formData, local_tem_camera: value === "sim" })}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="sim" id="camera-sim" />
                      <Label htmlFor="camera-sim" className="flex-1 cursor-pointer font-medium">
                        Sim
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="nao" id="camera-nao" />
                      <Label htmlFor="camera-nao" className="flex-1 cursor-pointer font-medium">
                        Não
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-base font-semibold mb-3 block">Foi feito Boletim de Ocorrência (B.O.)?</Label>
                  <RadioGroup
                    value={formData.fez_bo ? "sim" : "nao"}
                    onValueChange={(value) => setFormData({ ...formData, fez_bo: value === "sim" })}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="sim" id="bo-sim" />
                      <Label htmlFor="bo-sim" className="flex-1 cursor-pointer font-medium">
                        Sim
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="nao" id="bo-nao" />
                      <Label htmlFor="bo-nao" className="flex-1 cursor-pointer font-medium">
                        Não
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {formData.fez_bo && (
                  <div>
                    <Label className="text-base font-semibold">Anexar B.O. *</Label>
                    <Input
                      type="file"
                      accept=".pdf, image/*"
                      onChange={(e) => setBoFile(e.target.files ? e.target.files[0] : null)}
                      className="mt-2 h-12"
                    />
                    {boFile && (
                      <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> Arquivo selecionado: **{boFile.name}**
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <Label className="text-base font-semibold mb-3 block">Houve atendimento hospitalar?</Label>
                  <RadioGroup
                    value={formData.foi_hospital ? "sim" : "nao"}
                    onValueChange={(value) => setFormData({ ...formData, foi_hospital: value === "sim" })}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="sim" id="hospital-sim" />
                      <Label htmlFor="hospital-sim" className="flex-1 cursor-pointer font-medium">
                        Sim
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="nao" id="hospital-nao" />
                      <Label htmlFor="hospital-nao" className="flex-1 cursor-pointer font-medium">
                        Não
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {formData.foi_hospital && (
                  <div>
                    <Label className="text-base font-semibold">Anexar Laudo Médico / Declaração *</Label>
                    <Input
                      type="file"
                      accept=".pdf, image/*"
                      onChange={(e) => setLaudoMedico(e.target.files ? e.target.files[0] : null)}
                      className="mt-2 h-12"
                    />
                    {laudoMedico && (
                      <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> Arquivo selecionado: **{laudoMedico.name}**
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <Label className="text-base font-semibold mb-3 block">O motorista/condutor faleceu?</Label>
                  <RadioGroup
                    value={formData.motorista_faleceu ? "sim" : "nao"}
                    onValueChange={(value) => setFormData({ ...formData, motorista_faleceu: value === "sim" })}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="sim" id="obito-sim" />
                      <Label htmlFor="obito-sim" className="flex-1 cursor-pointer font-medium">
                        Sim
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 border-2 border-gray-200 rounded-lg p-4 hover:border-[hsl(var(--vistoria-primary))] transition-all">
                      <RadioGroupItem value="nao" id="obito-nao" />
                      <Label htmlFor="obito-nao" className="flex-1 cursor-pointer font-medium">
                        Não
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {formData.motorista_faleceu && (
                  <div>
                    <Label className="text-base font-semibold">Anexar Atestado de Óbito *</Label>
                    <Input
                      type="file"
                      accept=".pdf, image/*"
                      onChange={(e) => setAtestadoObito(e.target.files ? e.target.files[0] : null)}
                      className="mt-2 h-12"
                    />
                    {atestadoObito && (
                      <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> Arquivo selecionado: **{atestadoObito.name}**
                      </p>
                    )}
                  </div>
                )}

                {formData.hora_evento &&
                  (parseInt(formData.hora_evento.split(":")[0]) >= 20 ||
                    parseInt(formData.hora_evento.split(":")[0]) < 6) && (
                    <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-yellow-800 space-y-2">
                        <p className="font-semibold">Atenção! O evento ocorreu entre 20h e 6h.</p>
                        <p>Se houver, anexe o **Laudo de Alcoolemia** ou documento similar.</p>
                        <div>
                          <Label className="text-base font-semibold">Anexar Laudo de Alcoolemia</Label>
                          <Input
                            type="file"
                            accept=".pdf, image/*"
                            onChange={(e) => setLaudoAlcoolemia(e.target.files ? e.target.files[0] : null)}
                            className="mt-2 h-12"
                          />
                          {laudoAlcoolemia && (
                            <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                              <CheckCircle className="h-4 w-4" /> Arquivo selecionado: **{laudoAlcoolemia.name}**
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            )}

            {/* Step 3: Documentos (Fotos) */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-blue-800">
                    As fotos do veículo e dos documentos (CNH e CRLV) já foram capturadas na etapa anterior do
                    aplicativo. Confira abaixo as informações reconhecidas por OCR.
                  </p>
                </div>

                {/* Seção CNH/Condutor */}
                <h3 className="text-xl font-bold text-[hsl(var(--vistoria-primary))] mt-6">Dados do Condutor (CNH)</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Nome na CNH</Label>
                    <Input readOnly value={tempData?.cnhData?.nome || "Não detectado"} className="mt-1 bg-gray-100" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">CPF na CNH</Label>
                    <Input readOnly value={tempData?.cnhData?.cpf || "Não detectado"} className="mt-1 bg-gray-100" />
                  </div>
                </div>
                {tempData?.fotos?.cnh?.[0] && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> CNH Capturada
                  </p>
                )}

                {/* Seção Veículo (CRLV) */}
                <h3 className="text-xl font-bold text-[hsl(var(--vistoria-primary))] mt-6">Dados do Veículo (CRLV)</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Placa no CRLV</Label>
                    <Input
                      readOnly
                      value={tempData?.vehicleData?.placa || "Não detectado"}
                      className="mt-1 bg-gray-100"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Chassi no CRLV</Label>
                    <Input
                      readOnly
                      value={tempData?.vehicleData?.chassi || "Não detectado"}
                      className="mt-1 bg-gray-100"
                    />
                  </div>
                </div>
                {tempData?.fotos?.crlv?.length > 0 && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> CRLV Capturado ({tempData.fotos.crlv.length} fotos)
                  </p>
                )}

                {/* Seção Fotos do Veículo */}
                <h3 className="text-xl font-bold text-[hsl(var(--vistoria-primary))] mt-6">
                  Fotos do Veículo para Análise
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {Object.entries(tempData?.fotos || {}).map(([key, files]) => {
                    if (key === "cnh" || key === "crlv") return null;
                    const fileArray = files as File[];
                    if (fileArray.length > 0) {
                      return (
                        <div key={key} className="border p-3 rounded-lg bg-white">
                          <p className="text-sm font-medium capitalize flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            **{key.replace("_", " ")}**: {fileArray.length} foto(s)
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            )}

            {/* Step 4: Croqui */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-[hsl(var(--vistoria-primary))]">Desenho do Acidente (Croqui)</h3>
                <p className="text-sm text-muted-foreground">
                  Desenhe um croqui simples do local do acidente, indicando a posição dos veículos e a direção do
                  impacto.
                </p>

                <div className="border border-gray-300 rounded-lg p-2 bg-white shadow-inner">
                  <SketchPad width={700} height={400} onEnd={(data) => setCroqui(data)} />
                </div>

                {croqui && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Prévia do Croqui:</p>
                    <img src={croqui} alt="Croqui do Acidente" className="max-w-full h-auto border rounded-lg" />
                  </div>
                )}
              </div>
            )}
            {/* Navigation and Submit */}
            <div className="flex justify-between pt-6 border-t mt-8">
              <Button
                variant="outline"
                onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
                disabled={currentStep === 0 || uploading}
                className="flex items-center gap-2 h-12"
              >
                <ArrowLeft className="h-5 w-5" />
                Anterior
              </Button>

              {currentStep < STEPS.length - 1 ? (
                <Button
                  onClick={() => setCurrentStep((prev) => Math.min(STEPS.length - 1, prev + 1))}
                  disabled={uploading}
                  className="flex items-center gap-2 bg-[hsl(var(--vistoria-primary))] hover:bg-[hsl(var(--vistoria-primary))/90] text-white h-12"
                >
                  Próxima Etapa
                  <ArrowRight className="h-5 w-5" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={uploading}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white h-12"
                >
                  {uploading ? "Enviando..." : "Finalizar Vistoria e Enviar"}
                  {uploading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <CheckCircle className="h-5 w-5" />
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
