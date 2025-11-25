// src/pages/SinistroAberturaManual.tsx  (exemplo de rota: /vistorias/nova/manual)

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, UploadCloud } from "lucide-react";

export default function SinistroAberturaManual() {
  const navigate = useNavigate();

  // Campos básicos (você provavelmente já tem alguns)
  const [dataOcorrencia, setDataOcorrencia] = useState(
    new Date().toISOString().slice(0, 10), // yyyy-mm-dd
  );
  const [horaOcorrencia, setHoraOcorrencia] = useState("");
  const [placa, setPlaca] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [descricao, setDescricao] = useState("");

  // Novos campos solicitados
  const [condutorNome, setCondutorNome] = useState("");
  const [condutorPapel, setCondutorPapel] = useState<"vitima" | "causador" | "nao_informado">("vitima");
  const [houveTerceiros, setHouveTerceiros] = useState<"sim" | "nao">("nao");
  const [localTemCameras, setLocalTemCameras] = useState<"sim" | "nao">("nao");
  const [policiaNoLocal, setPoliciaNoLocal] = useState<"sim" | "nao">("nao");
  const [fezBO, setFezBO] = useState<"sim" | "nao">("nao");
  const [foiHospital, setFoiHospital] = useState<"sim" | "nao">("nao");
  const [motoristaFaleceu, setMotoristaFaleceu] = useState<"sim" | "nao">("nao");

  // Croqui (arquivo)
  const [croquiFile, setCroquiFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);

  const handleCroquiChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setCroquiFile(file);
  };

  const handleSubmit = async () => {
    if (!dataOcorrencia || !horaOcorrencia || !placa) {
      toast.error("Preencha pelo menos data, hora e placa.");
      return;
    }

    try {
      setSaving(true);

      // 1) Faz upload do croqui (se existir)
      let croquiUrl: string | null = null;
      if (croquiFile) {
        const path = `croquis/${Date.now()}-${croquiFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("sinistros-croquis") // ajuste o bucket aqui
          .upload(path, croquiFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from("sinistros-croquis").getPublicUrl(path);

        croquiUrl = publicUrlData.publicUrl;
      }

      // 2) Grava o sinistro na tabela (ajuste nome da tabela/colunas conforme seu schema)
      const { error } = await supabase.from("atendimentos").insert({
        // campos já existentes
        assunto: "Abertura manual de sinistro",
        data_ocorrencia: dataOcorrencia,
        hora_ocorrencia: horaOcorrencia,
        veiculo_placa: placa,
        cliente_nome: clienteNome,
        observacoes: descricao,

        // novos campos
        condutor_nome: condutorNome,
        condutor_papel: condutorPapel, // "vitima" | "causador" | "nao_informado"
        houve_terceiros: houveTerceiros === "sim",
        local_tem_cameras: localTemCameras === "sim",
        policia_foi_ao_local: policiaNoLocal === "sim",
        fez_boletim_ocorrencia: fezBO === "sim",
        foi_hospital: foiHospital === "sim",
        motorista_faleceu: motoristaFaleceu === "sim",
        croqui_url: croquiUrl,
      });

      if (error) throw error;

      toast.success("Sinistro aberto com sucesso.");
      // depois você pode já direcionar para a tela de vistoria ou acompanhamento
      navigate("/sinistros");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao abrir sinistro manual.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>

      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl">Abertura Manual de Sinistro</CardTitle>
              <p className="text-xs text-muted-foreground">
                Preencha as informações do evento para registrar o sinistro.
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Bloco 1 - Dados básicos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Data da ocorrência</Label>
              <Input type="date" value={dataOcorrencia} onChange={(e) => setDataOcorrencia(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Hora da ocorrência</Label>
              <Input type="time" value={horaOcorrencia} onChange={(e) => setHoraOcorrencia(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Placa do veículo</Label>
              <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23" />
            </div>
          </div>

          {/* Cliente / condutor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Nome do cliente / segurado</Label>
              <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome completo" />
            </div>

            <div className="space-y-1">
              <Label>Nome do condutor do veículo</Label>
              <Input
                value={condutorNome}
                onChange={(e) => setCondutorNome(e.target.value)}
                placeholder="Quem estava dirigindo?"
              />
            </div>
          </div>

          {/* Papel do condutor */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Você foi vítima ou causador?</Label>
              <Select value={condutorPapel} onValueChange={(value: any) => setCondutorPapel(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vitima">Vítima</SelectItem>
                  <SelectItem value="causador">Causador</SelectItem>
                  <SelectItem value="nao_informado">Não informar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Houve terceiros envolvidos?</Label>
              <Select value={houveTerceiros} onValueChange={(value: any) => setHouveTerceiros(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>O local possui câmeras de segurança?</Label>
              <Select value={localTemCameras} onValueChange={(value: any) => setLocalTemCameras(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Perguntas adicionais */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label>A polícia foi ao local?</Label>
              <Select value={policiaNoLocal} onValueChange={(v: any) => setPoliciaNoLocal(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Fez Boletim de Ocorrência?</Label>
              <Select value={fezBO} onValueChange={(v: any) => setFezBO(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Foi ao hospital?</Label>
              <Select value={foiHospital} onValueChange={(v: any) => setFoiHospital(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
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
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Descrição + Croqui */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Descreva o que aconteceu</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Explique brevemente como ocorreu o evento..."
                rows={5}
              />
            </div>

            <div className="space-y-2">
              <Label>Croqui do acidente (opcional)</Label>
              <div className="border border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-2 text-sm">
                <UploadCloud className="h-6 w-6 opacity-70" />
                <span>Envie um arquivo com o croqui (imagem ou PDF)</span>
                <Input type="file" accept="image/*,application/pdf" onChange={handleCroquiChange} />
                {croquiFile && (
                  <span className="text-xs text-muted-foreground mt-1">Selecionado: {croquiFile.name}</span>
                )}
              </div>
            </div>
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => navigate(-1)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Salvando..." : "Registrar Sinistro"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
