import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2 } from "lucide-react";

type FormData = {
  nome: string;
  nome_condutor: string;
  cpf: string;
  cpf_condutor: string;
  placa: string;
  marca: string;
  modelo: string;
  observacoes: string;
};

export default function VistoriaPublicaFormulario() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { fotos?: { [key: string]: File[] } } };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vistoriaId, setVistoriaId] = useState<string | null>(null);
  const [geolocation, setGeolocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      nome: "",
      nome_condutor: "",
      cpf: "",
      cpf_condutor: "",
      placa: "",
      marca: "",
      modelo: "",
      observacoes: "",
    },
  });

  // Carrega dados temporários salvos na etapa de captura (incluindo OCR)
  useEffect(() => {
    try {
      const tempRaw = localStorage.getItem("vistoria_temp");
      if (!tempRaw) {
        setLoading(false);
        return;
      }

      const temp = JSON.parse(tempRaw) as {
        cnhData?: any;
        vehicleData?: any;
        geolocation?: { latitude: number; longitude: number };
        vistoriaId?: string;
      };

      const cnh = temp.cnhData || {};
      const veiculo = temp.vehicleData || {};

      if (temp.vistoriaId) {
        setVistoriaId(temp.vistoriaId);
      }

      if (temp.geolocation) {
        setGeolocation(temp.geolocation);
      }

      // ---- CAMPOS DA CNH (segurado/condutor) ----
      const nomeFromCnh =
        cnh.nome || cnh.nome_condutor || cnh.nome_condutor_principal || cnh.nome_completo || cnh.nome_segurado;

      const cpfFromCnh = cnh.cpf || cnh.cpf_condutor || cnh.cpf_numero || cnh.cpf_segurado;

      if (nomeFromCnh) {
        setValue("nome", nomeFromCnh);
        setValue("nome_condutor", nomeFromCnh); // nome do condutor preenchido com o nome lido
      }

      if (cpfFromCnh) {
        setValue("cpf", cpfFromCnh);
        setValue("cpf_condutor", cpfFromCnh);
      }

      // ---- CAMPOS DO VEÍCULO (CRLV + frontal) ----
      const placaFromOcr = veiculo.placa || veiculo.placa_veiculo || veiculo.vehicle_plate;
      const marcaFromOcr = veiculo.marca || veiculo.marca_veiculo || veiculo.vehicle_brand;
      const modeloFromOcr = veiculo.modelo || veiculo.modelo_veiculo || veiculo.vehicle_model;

      if (placaFromOcr) setValue("placa", placaFromOcr);
      if (marcaFromOcr) setValue("marca", marcaFromOcr);
      if (modeloFromOcr) setValue("modelo", modeloFromOcr);
    } catch (err) {
      console.error("Erro ao aplicar dados de OCR no formulário:", err);
    } finally {
      setLoading(false);
    }
  }, [setValue]);

  const onSubmit = async (data: FormData) => {
    if (!vistoriaId) {
      toast.error("Vistoria não identificada. Tente novamente pelo link enviado.");
      return;
    }

    setSaving(true);

    try {
      // Se você quiser salvar as fotos no storage, faça isso aqui usando location.state.fotos
      // Exemplo: const fotos = location.state?.fotos || {};

      const { error } = await supabase
        .from("vistorias_formulario_publico")
        .insert({
          vistoria_id: vistoriaId,
          token,
          nome_segurado: data.nome,
          nome_condutor: data.nome_condutor,
          cpf_segurado: data.cpf,
          cpf_condutor: data.cpf_condutor,
          placa: data.placa,
          marca: data.marca,
          modelo: data.modelo,
          observacoes: data.observacoes,
          geolocation_latitude: geolocation?.latitude ?? null,
          geolocation_longitude: geolocation?.longitude ?? null,
          // aqui você pode guardar JSON de OCR se quiser:
          // cnh_ocr: temp.cnhData,
          // veiculo_ocr: temp.vehicleData,
        })
        .single();

      if (error) {
        console.error(error);
        toast.error("Erro ao salvar os dados da vistoria.");
        return;
      }

      toast.success("Vistoria enviada com sucesso!");
      localStorage.removeItem("vistoria_temp");
      navigate("/vistoria/concluida");
    } catch (err) {
      console.error(err);
      toast.error("Erro inesperado ao salvar a vistoria.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="border-none shadow-lg">
          <CardContent className="p-8 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Carregando dados da vistoria...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--vistoria-bg))] to-white py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Dados da Vistoria</h1>
              <p className="text-sm text-muted-foreground">
                Confira e complete as informações abaixo antes de finalizar.
              </p>
            </div>
            <Button variant="outline" size="icon" className="rounded-full" type="button" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Formulário */}
        <Card className="border-none shadow-xl">
          <CardContent className="p-6 md:p-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Dados do segurado / condutor */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Segurado / Condutor</h2>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nome">Nome do segurado</Label>
                    <Input
                      id="nome"
                      placeholder="Nome completo do segurado"
                      {...register("nome", { required: true })}
                    />
                    {errors.nome && <span className="text-xs text-red-500">Informe o nome do segurado.</span>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="nome_condutor">Nome do condutor</Label>
                    <Input
                      id="nome_condutor"
                      placeholder="Nome completo do condutor"
                      {...register("nome_condutor", { required: true })}
                    />
                    {errors.nome_condutor && <span className="text-xs text-red-500">Informe o nome do condutor.</span>}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cpf">CPF do segurado</Label>
                    <Input id="cpf" placeholder="000.000.000-00" {...register("cpf", { required: true })} />
                    {errors.cpf && <span className="text-xs text-red-500">Informe o CPF do segurado.</span>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cpf_condutor">CPF do condutor</Label>
                    <Input
                      id="cpf_condutor"
                      placeholder="000.000.000-00"
                      {...register("cpf_condutor", { required: true })}
                    />
                    {errors.cpf_condutor && <span className="text-xs text-red-500">Informe o CPF do condutor.</span>}
                  </div>
                </div>
              </div>

              {/* Dados do veículo */}
              <div className="space-y-4 pt-4 border-t">
                <h2 className="text-lg font-semibold text-gray-900">Veículo</h2>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="placa">Placa</Label>
                    <Input id="placa" placeholder="ABC1D23" {...register("placa", { required: true })} />
                    {errors.placa && <span className="text-xs text-red-500">Informe a placa do veículo.</span>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="marca">Marca</Label>
                    <Input id="marca" placeholder="Ex: FIAT" {...register("marca", { required: true })} />
                    {errors.marca && <span className="text-xs text-red-500">Informe a marca do veículo.</span>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="modelo">Modelo</Label>
                    <Input id="modelo" placeholder="Ex: ARGO DRIVE 1.3" {...register("modelo", { required: true })} />
                    {errors.modelo && <span className="text-xs text-red-500">Informe o modelo do veículo.</span>}
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="observacoes">Observações adicionais</Label>
                <Textarea
                  id="observacoes"
                  rows={4}
                  placeholder="Informe qualquer observação relevante sobre o veículo, avarias, acessórios, etc."
                  {...register("observacoes")}
                />
              </div>

              {/* Botões */}
              <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t">
                <Button type="button" variant="outline" className="w-full sm:flex-1" onClick={() => navigate(-1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar para fotos
                </Button>

                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:flex-1 bg-[hsl(var(--vistoria-primary))] hover:bg-[hsl(var(--vistoria-primary))]/90 text-white font-semibold"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Finalizar Vistoria
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
