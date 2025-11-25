import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VehicleTypeSelector } from "@/components/VehicleTypeSelector";
import { SearchableVehicleSelect } from "@/components/SearchableVehicleSelect";
import { useVeiculos } from "@/hooks/useVeiculos";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Camera, Upload, X, Save } from "lucide-react";
import { MaskedInput } from "@/components/ui/masked-input";
import { useAuth } from "@/hooks/useAuth";

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

const CORES = [
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
];

const TIPOS_SINISTRO = [
  "Colisão",
  "Roubo/Furto",
  "Incêndio",
  "Enchente/Alagamento",
  "Danos a Terceiros",
  "Quebra de Vidros",
  "Outros",
];

const getAnosDisponiveis = () => {
  const anoAtual = new Date().getFullYear();
  const anos = [];
  for (let ano = anoAtual; ano >= 1980; ano--) {
    anos.push(ano.toString());
  }
  return anos;
};

export default function VistoriaManual() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tipoVistoria, setTipoVistoria] = useState<"sinistro" | "reativacao">("sinistro");
  const [loading, setLoading] = useState(false);
  const [corretoras, setCorretoras] = useState<any[]>([]);
  
  // Fotos específicas
  const [fotoCNH, setFotoCNH] = useState<File | null>(null);
  const [fotoCRLV, setFotoCRLV] = useState<File | null>(null);
  const [fotoFrontal, setFotoFrontal] = useState<File | null>(null);
  const [fotoTraseira, setFotoTraseira] = useState<File | null>(null);
  const [fotoLateralEsq, setFotoLateralEsq] = useState<File | null>(null);
  const [fotoLateralDir, setFotoLateralDir] = useState<File | null>(null);
  const [fotosAdicionais, setFotosAdicionais] = useState<File[]>([]);
  
  // Previews
  const [previewCNH, setPreviewCNH] = useState<string>("");
  const [previewCRLV, setPreviewCRLV] = useState<string>("");
  const [previewFrontal, setPreviewFrontal] = useState<string>("");
  const [previewTraseira, setPreviewTraseira] = useState<string>("");
  const [previewLateralEsq, setPreviewLateralEsq] = useState<string>("");
  const [previewLateralDir, setPreviewLateralDir] = useState<string>("");
  const [previewsAdicionais, setPreviewsAdicionais] = useState<string[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<string>("");
  const [vehicleType, setVehicleType] = useState("");
  const { marcas, modelos, marcaSelecionada, setMarcaSelecionada } = useVeiculos();
  const [formData, setFormData] = useState({
    // Veículo
    veiculo_placa: "",
    veiculo_marca: "",
    veiculo_modelo: "",
    veiculo_ano: "",
    veiculo_cor: "",
    veiculo_chassi: "",
    // Cliente
    cliente_nome: "",
    cliente_email: "",
    cliente_telefone: "",
    cliente_cpf: "",
    // Sinistro
    tipo_sinistro: "",
    relato_incidente: "",
    data_incidente: "",
    hora_evento: "",
    condutor_veiculo: "",
    vitima_ou_causador: "",
    tem_terceiros: null as boolean | null,
    local_tem_camera: null as boolean | null,
    policia_foi_local: null as boolean | null,
    fez_bo: null as boolean | null,
    foi_hospital: null as boolean | null,
    motorista_faleceu: null as boolean | null,
    // Vinculação
    corretora_id: "",
  });

  // Estados para anexos/documentos
  const [boFile, setBoFile] = useState<File | null>(null);
  const [laudoMedicoFile, setLaudoMedicoFile] = useState<File | null>(null);
  const [laudoAlcoolemiaFile, setLaudoAlcoolemiaFile] = useState<File | null>(null);
  const [atestadoObitoFile, setAtestadoObitoFile] = useState<File | null>(null);
  const [croquiFile, setCroquiFile] = useState<File | null>(null);

  useEffect(() => {
    loadCorretoras();
  }, []);

  const loadCorretoras = async () => {
    try {
      const { data, error } = await supabase.from("corretoras").select("*").order("nome");

      if (error) throw error;
      setCorretoras(data || []);
    } catch (error) {
      console.error("Erro ao carregar corretoras:", error);
    }
  };

  const handleFotoSelect = (
    file: File | null,
    setFoto: (file: File | null) => void,
    setPreview: (preview: string) => void
  ) => {
    if (!file) return;
    
    setFoto(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = e.target?.result as string;
      setPreview(preview);
      setSelectedPreview(preview);
    };
    reader.readAsDataURL(file);
  };

  const handleAdicionaisSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    setFotosAdicionais([...fotosAdicionais, ...files]);
    
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewsAdicionais((prev) => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFotoAdicional = (index: number) => {
    setFotosAdicionais(fotosAdicionais.filter((_, i) => i !== index));
    setPreviewsAdicionais(previewsAdicionais.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fotoFrontal || !fotoTraseira || !fotoLateralEsq || !fotoLateralDir) {
      toast.error("São necessárias as 4 fotos obrigatórias do veículo");
      return;
    }

    if (!formData.data_incidente) {
      toast.error("Por favor, preencha a data do incidente");
      return;
    }

    if (!formData.tipo_sinistro) {
      toast.error("Por favor, selecione o tipo de sinistro");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data: fluxos } = await supabase.from("fluxos").select("id").eq("ativo", true).order("ordem").limit(1);

      if (!fluxos || fluxos.length === 0) {
        toast.error("Nenhum fluxo ativo encontrado");
        return;
      }

      const primeiroFluxoId = fluxos[0].id;

      const { data: statusList } = await supabase
        .from("status_config")
        .select("nome")
        .eq("fluxo_id", primeiroFluxoId)
        .eq("ativo", true)
        .order("ordem")
        .limit(1);

      if (!statusList || statusList.length === 0) {
        toast.error("Nenhum status ativo encontrado para o fluxo");
        return;
      }

      const primeiroStatus = statusList[0].nome;

      let latitude, longitude, endereco;
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        endereco = `Lat: ${latitude.toFixed(6)}, Long: ${longitude.toFixed(6)}`;
      } catch (error) {
        console.error("Erro ao obter localização:", error);
      }

      const { data: vistoria, error: vistoriaError } = await supabase
        .from("vistorias")
        .insert({
          tipo_abertura: "manual",
          tipo_vistoria: tipoVistoria,
          status: "em_analise",
          created_by: user.id,
          corretora_id: formData.corretora_id || null,
          link_token: crypto.randomUUID(),
          dias_validade: 7,
          latitude,
          longitude,
          endereco,
          cliente_nome: formData.cliente_nome,
          cliente_cpf: formData.cliente_cpf,
          cliente_email: formData.cliente_email,
          cliente_telefone: formData.cliente_telefone,
          veiculo_placa: formData.veiculo_placa,
          veiculo_marca: formData.veiculo_marca,
          veiculo_modelo: formData.veiculo_modelo,
          veiculo_ano: formData.veiculo_ano,
          veiculo_cor: formData.veiculo_cor,
          veiculo_chassi: formData.veiculo_chassi,
          tipo_sinistro: formData.tipo_sinistro,
          relato_incidente: formData.relato_incidente,
          data_incidente: formData.data_incidente,
          hora_evento: formData.hora_evento || null,
          condutor_veiculo: formData.condutor_veiculo || null,
          vitima_ou_causador: formData.vitima_ou_causador || null,
          tem_terceiros: formData.tem_terceiros,
          local_tem_camera: formData.local_tem_camera,
          policia_foi_local: formData.policia_foi_local,
          fez_bo: formData.fez_bo,
          foi_hospital: formData.foi_hospital,
          motorista_faleceu: formData.motorista_faleceu,
        })
        .select()
        .single();

      if (vistoriaError) throw vistoriaError;

      // Upload fotos obrigatórias do veículo
      const fotosVeiculo = [
        { foto: fotoFrontal, posicao: "frontal" },
        { foto: fotoTraseira, posicao: "traseira" },
        { foto: fotoLateralEsq, posicao: "lateral_esquerda" },
        { foto: fotoLateralDir, posicao: "lateral_direita" },
      ];

      for (let i = 0; i < fotosVeiculo.length; i++) {
        const { foto, posicao } = fotosVeiculo[i];
        if (!foto) continue;

        const fileName = `${vistoria.id}/${posicao}_${Date.now()}.${foto.name.split(".").pop()}`;
        const { error: uploadError } = await supabase.storage.from("vistorias").upload(fileName, foto);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("vistorias").getPublicUrl(fileName);

        const { error: fotoError } = await supabase.from("vistoria_fotos").insert({
          vistoria_id: vistoria.id,
          posicao,
          arquivo_url: publicUrl,
          arquivo_nome: foto.name,
          arquivo_tamanho: foto.size,
          ordem: i + 1,
        });

        if (fotoError) throw fotoError;
      }

      // Upload CNH
      if (fotoCNH) {
        const fileName = `${vistoria.id}/cnh_${Date.now()}.${fotoCNH.name.split(".").pop()}`;
        const { error: uploadError } = await supabase.storage.from("vistorias").upload(fileName, fotoCNH);
        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("vistorias").getPublicUrl(fileName);
          await supabase.from("vistorias").update({ cnh_url: publicUrl }).eq("id", vistoria.id);
        }
      }

      // Upload CRLV como array
      if (fotoCRLV) {
        const fileName = `${vistoria.id}/crlv_${Date.now()}.${fotoCRLV.name.split(".").pop()}`;
        const { error: uploadError } = await supabase.storage.from("vistorias").upload(fileName, fotoCRLV);
        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("vistorias").getPublicUrl(fileName);
          await supabase.from("vistorias").update({ crlv_fotos_urls: [publicUrl] }).eq("id", vistoria.id);
        }
      }

      // Upload fotos adicionais
      for (const foto of fotosAdicionais) {
        const fileName = `${vistoria.id}/adicional_${Date.now()}_${foto.name}`;
        const { error: uploadError } = await supabase.storage.from("vistorias").upload(fileName, foto);

        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("vistorias").getPublicUrl(fileName);

          await supabase.from("vistoria_fotos").insert({
            vistoria_id: vistoria.id,
            posicao: "adicional",
            arquivo_url: publicUrl,
            arquivo_nome: foto.name,
            arquivo_tamanho: foto.size,
            ordem: 100 + fotosAdicionais.indexOf(foto),
          });
        }
      }

      // Upload de documentos anexos
      const documentUpdates: any = {};

      if (boFile) {
        const fileName = `${vistoria.id}/bo_${Date.now()}.${boFile.name.split(".").pop()}`;
        const { error: uploadError } = await supabase.storage.from("vistorias").upload(fileName, boFile);
        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("vistorias").getPublicUrl(fileName);
          documentUpdates.bo_url = publicUrl;
        }
      }

      if (laudoMedicoFile) {
        const fileName = `${vistoria.id}/laudo_medico_${Date.now()}.${laudoMedicoFile.name.split(".").pop()}`;
        const { error: uploadError } = await supabase.storage.from("vistorias").upload(fileName, laudoMedicoFile);
        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("vistorias").getPublicUrl(fileName);
          documentUpdates.laudo_medico_url = publicUrl;
        }
      }

      if (laudoAlcoolemiaFile) {
        const fileName = `${vistoria.id}/laudo_alcoolemia_${Date.now()}.${laudoAlcoolemiaFile.name.split(".").pop()}`;
        const { error: uploadError } = await supabase.storage.from("vistorias").upload(fileName, laudoAlcoolemiaFile);
        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("vistorias").getPublicUrl(fileName);
          documentUpdates.laudo_alcoolemia_url = publicUrl;
        }
      }

      if (atestadoObitoFile) {
        const fileName = `${vistoria.id}/atestado_obito_${Date.now()}.${atestadoObitoFile.name.split(".").pop()}`;
        const { error: uploadError } = await supabase.storage.from("vistorias").upload(fileName, atestadoObitoFile);
        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("vistorias").getPublicUrl(fileName);
          documentUpdates.atestado_obito_url = publicUrl;
        }
      }

      if (croquiFile) {
        const fileName = `${vistoria.id}/croqui_${Date.now()}.${croquiFile.name.split(".").pop()}`;
        const { error: uploadError } = await supabase.storage.from("vistorias").upload(fileName, croquiFile);
        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("vistorias").getPublicUrl(fileName);
          documentUpdates.croqui_acidente_url = publicUrl;
        }
      }

      // Atualizar vistoria com URLs dos documentos
      if (Object.keys(documentUpdates).length > 0) {
        await supabase.from("vistorias").update(documentUpdates).eq("id", vistoria.id);
      }

      const { data: atendimento, error: atendimentoError } = await supabase
        .from("atendimentos")
        .insert({
          user_id: user.id,
          corretora_id: formData.corretora_id || null,
          responsavel_id: user.id,
          assunto: `Vistoria ${tipoVistoria === "sinistro" ? "Sinistro" : "Reativação"} - ${formData.veiculo_placa || "Placa não informada"}`,
          prioridade: "Média",
          observacoes: formData.relato_incidente,
          tags: ["pendente_vistoria"],
          tipo_atendimento: "sinistro",
          fluxo_id: primeiroFluxoId,
          status: primeiroStatus,
        })
        .select()
        .single();

      if (atendimentoError) throw atendimentoError;

      toast.success("Vistoria manual criada com sucesso!");
      navigate(`/sinistros`);
    } catch (error) {
      console.error("Erro ao criar vistoria:", error);
      toast.error("Erro ao criar vistoria manual");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="mb-6">
        <Button variant="outline" onClick={() => navigate("/sinistros")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-6 w-6" />
              Abertura Manual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Tipo de Vistoria */}
            <div>
              <Label className="text-base mb-4 block">Tipo de Vistoria</Label>
              <RadioGroup
                value={tipoVistoria}
                onValueChange={(value) => setTipoVistoria(value as "sinistro" | "reativacao")}
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2 p-4 rounded-lg border hover:border-primary transition-colors">
                    <RadioGroupItem value="sinistro" id="m-sinistro" />
                    <Label htmlFor="m-sinistro" className="flex-1 cursor-pointer">
                      Sinistro
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-4 rounded-lg border hover:border-primary transition-colors">
                    <RadioGroupItem value="reativacao" id="m-reativacao" />
                    <Label htmlFor="m-reativacao" className="flex-1 cursor-pointer">
                      Reativação
                    </Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Dados do Veículo */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Dados do Veículo</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Placa *</Label>
                  <MaskedInput
                    required
                    format="@@@#@##"
                    mask=""
                    patternChar="@"
                    allowEmptyFormatting={false}
                    value={formData.veiculo_placa}
                    onValueChange={(values) => 
                      setFormData({ ...formData, veiculo_placa: values.value.toUpperCase() })
                    }
                    placeholder="ABC1D23"
                    className="uppercase"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Formato: ABC1D23 ou ABC-1234
                  </p>
                </div>
              </div>
              
              <div className="mt-4">
                <VehicleTypeSelector
                  value={vehicleType}
                  onChange={(value) => {
                    setVehicleType(value);
                    setFormData({ ...formData, veiculo_marca: "", veiculo_modelo: "" });
                    setMarcaSelecionada("");
                  }}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <SearchableVehicleSelect
                  label="Marca *"
                  value={formData.veiculo_marca || ""}
                  options={marcas}
                  onChange={(value) => {
                    setFormData({ ...formData, veiculo_marca: value, veiculo_modelo: "" });
                    setMarcaSelecionada(value);
                  }}
                  placeholder="Selecione a marca"
                  vehicleType={vehicleType}
                />
                <SearchableVehicleSelect
                  label="Modelo *"
                  value={formData.veiculo_modelo || ""}
                  options={modelos}
                  onChange={(value) => setFormData({ ...formData, veiculo_modelo: value })}
                  placeholder="Selecione o modelo"
                  disabled={!formData.veiculo_marca}
                  vehicleType={vehicleType}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>Ano *</Label>
                  <Select
                    required
                    value={formData.veiculo_ano}
                    onValueChange={(value) => setFormData({ ...formData, veiculo_ano: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAnosDisponiveis().map((ano) => (
                        <SelectItem key={ano} value={ano}>
                          {ano}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cor *</Label>
                  <Select
                    required
                    value={formData.veiculo_cor}
                    onValueChange={(value) => setFormData({ ...formData, veiculo_cor: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a cor" />
                    </SelectTrigger>
                    <SelectContent>
                      {CORES.map((cor) => (
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
                    onChange={(e) => setFormData({ ...formData, veiculo_chassi: e.target.value.toUpperCase() })}
                    placeholder="9BWZZZ377VT004251"
                    maxLength={17}
                  />
                </div>
              </div>
            </div>

            {/* Dados do Cliente */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Dados do Cliente</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nome *</Label>
                  <Input
                    required
                    value={formData.cliente_nome}
                    onChange={(e) => setFormData({ ...formData, cliente_nome: e.target.value })}
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <Label>CPF</Label>
                  <MaskedInput
                    format="###.###.###-##"
                    mask="_"
                    value={formData.cliente_cpf}
                    onValueChange={(values) => setFormData({ ...formData, cliente_cpf: values.value })}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.cliente_email}
                    onChange={(e) => setFormData({ ...formData, cliente_email: e.target.value })}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <MaskedInput
                    format="(##) #####-####"
                    mask="_"
                    value={formData.cliente_telefone}
                    onValueChange={(values) => setFormData({ ...formData, cliente_telefone: values.value })}
                    placeholder="(11) 99999-9999"
                  />
                </div>
              </div>
            </div>

            {/* Dados do Incidente */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Dados do Sinistro</h3>
              <div className="space-y-4">
                <div>
                  <Label>Tipo de Sinistro *</Label>
                  <Select
                    required
                    value={formData.tipo_sinistro}
                    onValueChange={(value) => setFormData({ ...formData, tipo_sinistro: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_SINISTRO.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {tipo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data do Incidente *</Label>
                    <Input
                      required
                      type="date"
                      value={formData.data_incidente}
                      onChange={(e) => setFormData({ ...formData, data_incidente: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Hora do Incidente</Label>
                    <Input
                      type="time"
                      value={formData.hora_evento}
                      onChange={(e) => setFormData({ ...formData, hora_evento: e.target.value })}
                    />
                  </div>
                </div>
                
                <div>
                  <Label>Nome do Condutor do Veículo</Label>
                  <Input
                    value={formData.condutor_veiculo}
                    onChange={(e) => setFormData({ ...formData, condutor_veiculo: e.target.value })}
                    placeholder="Nome de quem conduzia o veículo"
                  />
                </div>

                <div>
                  <Label>Relato do Incidente *</Label>
                  <Textarea
                    required
                    value={formData.relato_incidente}
                    onChange={(e) => setFormData({ ...formData, relato_incidente: e.target.value })}
                    placeholder="Descreva o que aconteceu..."
                    rows={4}
                  />
                </div>

                {/* Perguntas Adicionais */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-4 border border-primary/20">
                    <Label className="text-base font-semibold mb-3 block">Você foi vítima ou causador?</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, vitima_ou_causador: "vitima" })}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          formData.vitima_ou_causador === "vitima"
                            ? "border-primary bg-primary text-primary-foreground shadow-md"
                            : "border-border bg-card hover:border-primary/50"
                        }`}
                      >
                        <span className="font-medium">Vítima</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, vitima_ou_causador: "causador" })}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          formData.vitima_ou_causador === "causador"
                            ? "border-primary bg-primary text-primary-foreground shadow-md"
                            : "border-border bg-card hover:border-primary/50"
                        }`}
                      >
                        <span className="font-medium">Causador</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Houve terceiros */}
                    <div className="bg-muted/50 rounded-lg p-4 border">
                      <Label className="text-sm font-semibold mb-3 block">Houve terceiros envolvidos?</Label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, tem_terceiros: true })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.tem_terceiros === true
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, tem_terceiros: false })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.tem_terceiros === false
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Não
                        </button>
                      </div>
                    </div>

                    {/* Local possui câmeras */}
                    <div className="bg-muted/50 rounded-lg p-4 border">
                      <Label className="text-sm font-semibold mb-3 block">O local possui câmeras de segurança?</Label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, local_tem_camera: true })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.local_tem_camera === true
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, local_tem_camera: false })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.local_tem_camera === false
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Não
                        </button>
                      </div>
                    </div>

                    {/* Polícia foi ao local */}
                    <div className="bg-muted/50 rounded-lg p-4 border">
                      <Label className="text-sm font-semibold mb-3 block">A polícia foi ao local?</Label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, policia_foi_local: true })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.policia_foi_local === true
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, policia_foi_local: false })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.policia_foi_local === false
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Não
                        </button>
                      </div>
                    </div>

                    {/* Fez BO */}
                    <div className="bg-muted/50 rounded-lg p-4 border">
                      <Label className="text-sm font-semibold mb-3 block">Fez Boletim de Ocorrência?</Label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, fez_bo: true })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.fez_bo === true
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, fez_bo: false })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.fez_bo === false
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Não
                        </button>
                      </div>
                    </div>

                    {/* Foi ao hospital */}
                    <div className="bg-muted/50 rounded-lg p-4 border">
                      <Label className="text-sm font-semibold mb-3 block">Foi ao hospital?</Label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, foi_hospital: true })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.foi_hospital === true
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, foi_hospital: false })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.foi_hospital === false
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Não
                        </button>
                      </div>
                    </div>

                    {/* Motorista faleceu */}
                    <div className="bg-muted/50 rounded-lg p-4 border">
                      <Label className="text-sm font-semibold mb-3 block">O motorista faleceu?</Label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, motorista_faleceu: true })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.motorista_faleceu === true
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, motorista_faleceu: false })}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                            formData.motorista_faleceu === false
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/50"
                          }`}
                        >
                          Não
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Anexar Documentos */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Documentos e Laudos (Opcional)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bo">Boletim de Ocorrência</Label>
                  <Input
                    id="bo"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setBoFile(e.target.files?.[0] || null)}
                  />
                  {boFile && <p className="text-xs text-muted-foreground mt-1">{boFile.name}</p>}
                </div>

                <div>
                  <Label htmlFor="laudo-medico">Laudo Médico</Label>
                  <Input
                    id="laudo-medico"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setLaudoMedicoFile(e.target.files?.[0] || null)}
                  />
                  {laudoMedicoFile && <p className="text-xs text-muted-foreground mt-1">{laudoMedicoFile.name}</p>}
                </div>

                <div>
                  <Label htmlFor="laudo-alcoolemia">Laudo de Alcoolemia</Label>
                  <Input
                    id="laudo-alcoolemia"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setLaudoAlcoolemiaFile(e.target.files?.[0] || null)}
                  />
                  {laudoAlcoolemiaFile && (
                    <p className="text-xs text-muted-foreground mt-1">{laudoAlcoolemiaFile.name}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="atestado-obito">Atestado de Óbito</Label>
                  <Input
                    id="atestado-obito"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setAtestadoObitoFile(e.target.files?.[0] || null)}
                  />
                  {atestadoObitoFile && <p className="text-xs text-muted-foreground mt-1">{atestadoObitoFile.name}</p>}
                </div>

                <div>
                  <Label htmlFor="croqui">Croqui do Acidente</Label>
                  <Input
                    id="croqui"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setCroquiFile(e.target.files?.[0] || null)}
                  />
                  {croquiFile && <p className="text-xs text-muted-foreground mt-1">{croquiFile.name}</p>}
                </div>
              </div>
            </div>

            {/* Vinculação */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Vinculação</h3>
              <div>
                <Label>Corretora</Label>
                <Select
                  value={formData.corretora_id}
                  onValueChange={(value) => setFormData({ ...formData, corretora_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a corretora" />
                  </SelectTrigger>
                  <SelectContent>
                    {corretoras.map((corretora) => (
                      <SelectItem key={corretora.id} value={corretora.id}>
                        {corretora.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Upload de Fotos */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Fotos do Veículo *</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Envie fotos claras de todas as posições do veículo
                </p>
              </div>

              {/* Preview Grande */}
              {selectedPreview && (
                <div className="relative rounded-lg overflow-hidden bg-muted">
                  <img
                    src={selectedPreview}
                    alt="Preview"
                    className="w-full h-[400px] object-contain"
                  />
                </div>
              )}

              {/* Grid de Miniaturas - Documentos */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Documentos</h4>
                <div className="grid grid-cols-2 gap-4">
                  {/* CNH */}
                  <div>
                    <Label htmlFor="foto-cnh" className="cursor-pointer">
                      <div
                        className={`relative rounded-lg border-2 ${
                          fotoCNH ? "border-primary" : "border-dashed border-muted-foreground/30"
                        } overflow-hidden hover:border-primary transition-colors group`}
                      >
                        {previewCNH ? (
                          <>
                            <img src={previewCNH} alt="CNH" className="w-full h-32 object-cover" onClick={() => setSelectedPreview(previewCNH)} />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 right-2 h-6 w-6"
                              onClick={(e) => {
                                e.preventDefault();
                                setFotoCNH(null);
                                setPreviewCNH("");
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground group-hover:text-primary transition-colors">
                            <Camera className="h-8 w-8 mb-1" />
                            <span className="text-xs font-medium">CNH</span>
                          </div>
                        )}
                      </div>
                    </Label>
                    <Input
                      id="foto-cnh"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handleFotoSelect(e.target.files?.[0] || null, setFotoCNH, setPreviewCNH)
                      }
                    />
                  </div>

                  {/* CRLV */}
                  <div>
                    <Label htmlFor="foto-crlv" className="cursor-pointer">
                      <div
                        className={`relative rounded-lg border-2 ${
                          fotoCRLV ? "border-primary" : "border-dashed border-muted-foreground/30"
                        } overflow-hidden hover:border-primary transition-colors group`}
                      >
                        {previewCRLV ? (
                          <>
                            <img src={previewCRLV} alt="CRLV" className="w-full h-32 object-cover" onClick={() => setSelectedPreview(previewCRLV)} />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 right-2 h-6 w-6"
                              onClick={(e) => {
                                e.preventDefault();
                                setFotoCRLV(null);
                                setPreviewCRLV("");
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground group-hover:text-primary transition-colors">
                            <Camera className="h-8 w-8 mb-1" />
                            <span className="text-xs font-medium">CRLV</span>
                          </div>
                        )}
                      </div>
                    </Label>
                    <Input
                      id="foto-crlv"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handleFotoSelect(e.target.files?.[0] || null, setFotoCRLV, setPreviewCRLV)
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Grid de Miniaturas - Veículo */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Fotos do Veículo (Obrigatórias) *</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Frontal */}
                  <div>
                    <Label htmlFor="foto-frontal" className="cursor-pointer">
                      <div
                        className={`relative rounded-lg border-2 ${
                          fotoFrontal ? "border-primary" : "border-dashed border-destructive"
                        } overflow-hidden hover:border-primary transition-colors group`}
                      >
                        {previewFrontal ? (
                          <>
                            <img src={previewFrontal} alt="Frontal" className="w-full h-32 object-cover" onClick={() => setSelectedPreview(previewFrontal)} />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 right-2 h-6 w-6"
                              onClick={(e) => {
                                e.preventDefault();
                                setFotoFrontal(null);
                                setPreviewFrontal("");
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground group-hover:text-primary transition-colors">
                            <Camera className="h-8 w-8 mb-1" />
                            <span className="text-xs font-medium">Frontal</span>
                          </div>
                        )}
                      </div>
                    </Label>
                    <Input
                      id="foto-frontal"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      required
                      onChange={(e) =>
                        handleFotoSelect(e.target.files?.[0] || null, setFotoFrontal, setPreviewFrontal)
                      }
                    />
                  </div>

                  {/* Traseira */}
                  <div>
                    <Label htmlFor="foto-traseira" className="cursor-pointer">
                      <div
                        className={`relative rounded-lg border-2 ${
                          fotoTraseira ? "border-primary" : "border-dashed border-destructive"
                        } overflow-hidden hover:border-primary transition-colors group`}
                      >
                        {previewTraseira ? (
                          <>
                            <img src={previewTraseira} alt="Traseira" className="w-full h-32 object-cover" onClick={() => setSelectedPreview(previewTraseira)} />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 right-2 h-6 w-6"
                              onClick={(e) => {
                                e.preventDefault();
                                setFotoTraseira(null);
                                setPreviewTraseira("");
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground group-hover:text-primary transition-colors">
                            <Camera className="h-8 w-8 mb-1" />
                            <span className="text-xs font-medium">Traseira</span>
                          </div>
                        )}
                      </div>
                    </Label>
                    <Input
                      id="foto-traseira"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      required
                      onChange={(e) =>
                        handleFotoSelect(e.target.files?.[0] || null, setFotoTraseira, setPreviewTraseira)
                      }
                    />
                  </div>

                  {/* Lateral Esquerda */}
                  <div>
                    <Label htmlFor="foto-lat-esq" className="cursor-pointer">
                      <div
                        className={`relative rounded-lg border-2 ${
                          fotoLateralEsq ? "border-primary" : "border-dashed border-destructive"
                        } overflow-hidden hover:border-primary transition-colors group`}
                      >
                        {previewLateralEsq ? (
                          <>
                            <img src={previewLateralEsq} alt="Lateral Esq" className="w-full h-32 object-cover" onClick={() => setSelectedPreview(previewLateralEsq)} />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 right-2 h-6 w-6"
                              onClick={(e) => {
                                e.preventDefault();
                                setFotoLateralEsq(null);
                                setPreviewLateralEsq("");
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground group-hover:text-primary transition-colors">
                            <Camera className="h-8 w-8 mb-1" />
                            <span className="text-xs font-medium">Lateral Esq.</span>
                          </div>
                        )}
                      </div>
                    </Label>
                    <Input
                      id="foto-lat-esq"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      required
                      onChange={(e) =>
                        handleFotoSelect(e.target.files?.[0] || null, setFotoLateralEsq, setPreviewLateralEsq)
                      }
                    />
                  </div>

                  {/* Lateral Direita */}
                  <div>
                    <Label htmlFor="foto-lat-dir" className="cursor-pointer">
                      <div
                        className={`relative rounded-lg border-2 ${
                          fotoLateralDir ? "border-primary" : "border-dashed border-destructive"
                        } overflow-hidden hover:border-primary transition-colors group`}
                      >
                        {previewLateralDir ? (
                          <>
                            <img src={previewLateralDir} alt="Lateral Dir" className="w-full h-32 object-cover" onClick={() => setSelectedPreview(previewLateralDir)} />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 right-2 h-6 w-6"
                              onClick={(e) => {
                                e.preventDefault();
                                setFotoLateralDir(null);
                                setPreviewLateralDir("");
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground group-hover:text-primary transition-colors">
                            <Camera className="h-8 w-8 mb-1" />
                            <span className="text-xs font-medium">Lateral Dir.</span>
                          </div>
                        )}
                      </div>
                    </Label>
                    <Input
                      id="foto-lat-dir"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      required
                      onChange={(e) =>
                        handleFotoSelect(e.target.files?.[0] || null, setFotoLateralDir, setPreviewLateralDir)
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Fotos Adicionais */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Fotos Adicionais (Opcional)</h4>
                <div className="space-y-4">
                  <Label htmlFor="fotos-adicionais" className="cursor-pointer">
                    <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center hover:border-primary transition-colors">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Clique para adicionar fotos extras de danos ou detalhes
                      </p>
                    </div>
                  </Label>
                  <Input
                    id="fotos-adicionais"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleAdicionaisSelect}
                  />

                  {previewsAdicionais.length > 0 && (
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                      {previewsAdicionais.map((preview, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={preview}
                            alt={`Adicional ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg cursor-pointer"
                            onClick={() => setSelectedPreview(preview)}
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeFotoAdicional(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-4">
              <Button type="button" variant="outline" onClick={() => navigate("/sinistros")} className="flex-1">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading || !fotoFrontal || !fotoTraseira || !fotoLateralEsq || !fotoLateralDir}
                className="flex-1 bg-gradient-to-r from-primary to-primary/80"
              >
                {loading ? (
                  "Salvando..."
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Criar Vistoria
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
