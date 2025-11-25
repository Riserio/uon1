import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Upload, X, Save } from "lucide-react";
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
  const [fotos, setFotos] = useState<File[]>([]);
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [corretoras, setCorretoras] = useState<any[]>([]);
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
    // Vinculação
    corretora_id: "",
    // Novas perguntas
    chovia: null as boolean | null,
    acionou_assistencia: null as boolean | null,
    houve_remocao: null as boolean | null,
  });

  // Estados para anexos/documentos
  const [boFile, setBoFile] = useState<File | null>(null);
  const [laudoMedicoFile, setLaudoMedicoFile] = useState<File | null>(null);
  const [laudoAlcoolemiaFile, setLaudoAlcoolemiaFile] = useState<File | null>(null);
  const [atestadoObitoFile, setAtestadoObitoFile] = useState<File | null>(null);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fotos.length + files.length > 4) {
      toast.error("Máximo de 4 fotos permitidas");
      return;
    }

    setFotos([...fotos, ...files]);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFotoPreviews((prev) => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFoto = (index: number) => {
    setFotos(fotos.filter((_, i) => i !== index));
    setFotoPreviews(fotoPreviews.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (fotos.length < 4) {
      toast.error("São necessárias 4 fotos para a vistoria");
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
          // Novas perguntas
          estava_chovendo: formData.chovia,
          acionou_assistencia_24h: formData.acionou_assistencia,
          houve_remocao_veiculo: formData.houve_remocao,
        })
        .select()
        .single();

      if (vistoriaError) throw vistoriaError;

      const posicoes = ["frontal", "traseira", "lateral_esquerda", "lateral_direita"];
      for (let i = 0; i < fotos.length; i++) {
        const foto = fotos[i];
        const fileName = `${vistoria.id}/${posicoes[i]}_${Date.now()}.${foto.name.split(".").pop()}`;

        const { error: uploadError } = await supabase.storage.from("vistorias").upload(fileName, foto);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("vistorias").getPublicUrl(fileName);

        const { error: fotoError } = await supabase.from("vistoria_fotos").insert({
          vistoria_id: vistoria.id,
          posicao: posicoes[i],
          arquivo_url: publicUrl,
          arquivo_nome: foto.name,
          arquivo_tamanho: foto.size,
          ordem: i + 1,
        });

        if (fotoError) throw fotoError;
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
              Vistoria Manual
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
                  <Input
                    required
                    value={formData.veiculo_placa}
                    onChange={(e) => setFormData({ ...formData, veiculo_placa: e.target.value.toUpperCase() })}
                    placeholder="ABC1D23"
                    maxLength={7}
                  />
                </div>
                <div>
                  <Label>Marca *</Label>
                  <Select
                    required
                    value={formData.veiculo_marca}
                    onValueChange={(value) => setFormData({ ...formData, veiculo_marca: value, veiculo_modelo: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a marca" />
                    </SelectTrigger>
                    <SelectContent>
                      {MARCAS.map((marca) => (
                        <SelectItem key={marca} value={marca}>
                          {marca}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Modelo *</Label>
                  <Select
                    required
                    value={formData.veiculo_modelo}
                    onValueChange={(value) => setFormData({ ...formData, veiculo_modelo: value })}
                    disabled={!formData.veiculo_marca}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {formData.veiculo_marca &&
                        MODELOS_POR_MARCA[formData.veiculo_marca]?.map((modelo) => (
                          <SelectItem key={modelo} value={modelo}>
                            {modelo}
                          </SelectItem>
                        ))}
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                <div>
                  <Label>Data do Incidente *</Label>
                  <Input
                    required
                    type="datetime-local"
                    value={formData.data_incidente}
                    onChange={(e) => setFormData({ ...formData, data_incidente: e.target.value })}
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

                {/* Novas Perguntas */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div>
                    <Label>Estava chovendo?</Label>
                    <RadioGroup
                      value={formData.chovia === null ? "" : formData.chovia ? "sim" : "nao"}
                      onValueChange={(value) => setFormData({ ...formData, chovia: value === "sim" })}
                    >
                      <div className="flex gap-4 mt-2">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="sim" id="chovia-m-sim" />
                          <Label htmlFor="chovia-m-sim">Sim</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="nao" id="chovia-m-nao" />
                          <Label htmlFor="chovia-m-nao">Não</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>

                  <div>
                    <Label>Acionou assistência 24h?</Label>
                    <RadioGroup
                      value={formData.acionou_assistencia === null ? "" : formData.acionou_assistencia ? "sim" : "nao"}
                      onValueChange={(value) => setFormData({ ...formData, acionou_assistencia: value === "sim" })}
                    >
                      <div className="flex gap-4 mt-2">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="sim" id="assist-m-sim" />
                          <Label htmlFor="assist-m-sim">Sim</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="nao" id="assist-m-nao" />
                          <Label htmlFor="assist-m-nao">Não</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>

                  <div>
                    <Label>Houve remoção do veículo?</Label>
                    <RadioGroup
                      value={formData.houve_remocao === null ? "" : formData.houve_remocao ? "sim" : "nao"}
                      onValueChange={(value) => setFormData({ ...formData, houve_remocao: value === "sim" })}
                    >
                      <div className="flex gap-4 mt-2">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="sim" id="remocao-m-sim" />
                          <Label htmlFor="remocao-m-sim">Sim</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="nao" id="remocao-m-nao" />
                          <Label htmlFor="remocao-m-nao">Não</Label>
                        </div>
                      </div>
                    </RadioGroup>
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
            <div>
              <h3 className="text-lg font-semibold mb-4">Fotos do Veículo (4 obrigatórias)</h3>
              <div className="space-y-4">
                {fotos.length < 4 && (
                  <div>
                    <Label htmlFor="fotos" className="cursor-pointer">
                      <div className="border-2 border-dashed border-primary/30 rounded-lg p-8 text-center hover:border-primary transition-colors">
                        <Upload className="h-12 w-12 mx-auto mb-2 text-primary" />
                        <p className="text-sm text-muted-foreground">Clique para adicionar fotos ({fotos.length}/4)</p>
                      </div>
                    </Label>
                    <Input
                      id="fotos"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                )}

                {fotoPreviews.length > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    {fotoPreviews.map((preview, index) => (
                      <div key={index} className="relative group">
                        <img src={preview} alt={`Foto ${index + 1}`} className="w-full h-48 object-cover rounded-lg" />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeFoto(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
                          {["Frontal", "Traseira", "Lateral Esq.", "Lateral Dir."][index]}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-4">
              <Button type="button" variant="outline" onClick={() => navigate("/sinistros")} className="flex-1">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading || fotos.length < 4}
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
