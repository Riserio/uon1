import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, FileText, MapPin, User, Clock as ClockIcon, FileUp } from "lucide-react";

export default function VistoriaNovaManual() {
  const navigate = useNavigate();

  const [dataSinistro, setDataSinistro] = useState<string>(() => {
    const hoje = new Date();
    const year = hoje.getFullYear();
    const month = String(hoje.getMonth() + 1).padStart(2, "0");
    const day = String(hoje.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  const [horaSinistro, setHoraSinistro] = useState("");
  const [nomeCondutor, setNomeCondutor] = useState("");
  const [papelCondutor, setPapelCondutor] = useState<"vitima" | "causador" | "nao_informado" | "">("");
  const [houveTerceiros, setHouveTerceiros] = useState<"sim" | "nao" | "nao_informado" | "">("");
  const [localTemCameras, setLocalTemCameras] = useState<"sim" | "nao" | "nao_informado" | "">("");
  const [policiaFoi, setPoliciaFoi] = useState<"sim" | "nao" | "nao_informado" | "">("");
  const [fezBO, setFezBO] = useState<"sim" | "nao" | "nao_informado" | "">("");
  const [foiHospital, setFoiHospital] = useState<"sim" | "nao" | "nao_informado" | "">("");
  const [motoristaFaleceu, setMotoristaFaleceu] = useState<"sim" | "nao" | "nao_informado" | "">("");
  const [croquiFile, setCroquiFile] = useState<File | null>(null);
  const [localAcidente, setLocalAcidente] = useState("");
  const [informacoesAdicionais, setInformacoesAdicionais] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!dataSinistro || !horaSinistro || !nomeCondutor || !papelCondutor) {
      toast.error("Preencha pelo menos data, hora, nome do condutor e se ele foi vítima ou causador.");
      return;
    }

    // Aqui você faz o insert de fato no Supabase (atendimentos / sinistros / vistorias)
    // Exemplo (AJUSTE para o seu schema):
    //
    // const { error } = await supabase.from("sinistros").insert({
    //   data_sinistro: dataSinistro,
    //   hora_sinistro: horaSinistro,
    //   condutor_nome: nomeCondutor,
    //   condutor_papel: papelCondutor,
    //   houve_terceiros: houveTerceiros || null,
    //   local_tem_cameras: localTemCameras || null,
    //   policia_foi_local: policiaFoi || null,
    //   fez_bo: fezBO || null,
    //   foi_hospital: foiHospital || null,
    //   motorista_faleceu: motoristaFaleceu || null,
    //   local_acidente: localAcidente || null,
    //   informacoes_adicionais: informacoesAdicionais || null,
    //   // croqui: você pode subir para o storage e salvar a URL
    // });
    //
    // if (error) { ... }

    console.log("Dados da abertura manual (mock):", {
      dataSinistro,
      horaSinistro,
      nomeCondutor,
      papelCondutor,
      houveTerceiros,
      localTemCameras,
      policiaFoi,
      fezBO,
      foiHospital,
      motoristaFaleceu,
      croquiFile,
      localAcidente,
      informacoesAdicionais,
    });

    toast.success("Sinistro manual registrado (mock). Integre com o Supabase no ponto indicado no código.");
    navigate("/sinistros");
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate("/sinistros")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Abertura Manual de Sinistro
            </h1>
            <p className="text-sm text-muted-foreground">
              Preencha os dados principais do evento para registrar o sinistro.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClockIcon className="h-5 w-5 text-primary" />
              Dados do Evento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Data do sinistro</Label>
                <Input type="date" value={dataSinistro} onChange={(e) => setDataSinistro(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>Hora do sinistro</Label>
                <Input type="time" value={horaSinistro} onChange={(e) => setHoraSinistro(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>Local do acidente (rua, bairro, cidade)</Label>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Ex: Av. Brasil, 123 - Centro - Belo Horizonte/MG"
                    value={localAcidente}
                    onChange={(e) => setLocalAcidente(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Condutor e Dinâmica
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nome do condutor do veículo</Label>
                <Input
                  placeholder="Nome completo do motorista"
                  value={nomeCondutor}
                  onChange={(e) => setNomeCondutor(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>O condutor foi vítima ou causador?</Label>
                <Select value={papelCondutor} onValueChange={(value: any) => setPapelCondutor(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma opção" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vitima">Vítima</SelectItem>
                    <SelectItem value="causador">Causador</SelectItem>
                    <SelectItem value="nao_informado">Não informado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Houve terceiros envolvidos?</Label>
                <Select value={houveTerceiros} onValueChange={(v: any) => setHouveTerceiros(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="nao_informado">Não informado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>O local possui câmeras de segurança?</Label>
                <Select value={localTemCameras} onValueChange={(v: any) => setLocalTemCameras(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="nao_informado">Não informado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>A polícia foi ao local?</Label>
                <Select value={policiaFoi} onValueChange={(v: any) => setPoliciaFoi(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="nao_informado">Não informado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Foi feito Boletim de Ocorrência?</Label>
                <Select value={fezBO} onValueChange={(v: any) => setFezBO(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="nao_informado">Não informado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Alguém foi ao hospital?</Label>
                <Select value={foiHospital} onValueChange={(v: any) => setFoiHospital(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="nao_informado">Não informado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>O motorista faleceu?</Label>
                <Select value={motoristaFaleceu} onValueChange={(v: any) => setMotoristaFaleceu(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="nao_informado">Não informado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5 text-primary" />
              Croqui e Informações Adicionais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Croqui do acidente (opcional)</Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setCroquiFile(file);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Anexe um desenho, foto ou documento com o croqui do acidente.
              </p>
            </div>

            <div className="space-y-1">
              <Label>Informações adicionais do sinistro</Label>
              <Textarea
                placeholder="Descreva brevemente como aconteceu o acidente, sentido da via, sinais, etc."
                rows={4}
                value={informacoesAdicionais}
                onChange={(e) => setInformacoesAdicionais(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                As perguntas sobre chuva, assistência 24h e remoção do veículo ficarão apenas na abertura digital.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => navigate("/sinistros")}>
              Cancelar
            </Button>
            <Button type="submit">Registrar Sinistro</Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
