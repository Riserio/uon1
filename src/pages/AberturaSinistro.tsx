import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { MaskedInput } from "@/components/ui/masked-input";
import { AlertTriangle, TrendingUp, ClipboardList } from "lucide-react";
import { validateCPF, validatePhone } from "@/lib/validators";

export default function AberturaSinistro() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [responsaveis, setResponsaveis] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    cliente_nome: "",
    cliente_cpf: "",
    cliente_telefone: "",
    cliente_email: "",
    veiculo_placa: "",
    veiculo_marca: "",
    veiculo_modelo: "",
    veiculo_ano: "",
    veiculo_cor: "",
    veiculo_chassi: "",
    data_incidente: "",
    relato_incidente: "",
    tipo_sinistro: "",
    solicitarVistoria: false,
    corretora_id: "",
    responsavel_id: "",
  });

  useEffect(() => {
    loadCorretoras();
    loadResponsaveis();
  }, []);

  const loadCorretoras = async () => {
    try {
      const { data, error } = await supabase.from("corretoras").select("*").order("nome");
      if (error) throw error;
      setCorretoras(data || []);
    } catch (err) {
      console.error("Erro ao carregar corretoras:", err);
    }
  };

  const loadResponsaveis = async () => {
    try {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      setResponsaveis(data || []);
    } catch (err) {
      console.error("Erro ao carregar responsáveis:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!validateCPF(formData.cliente_cpf)) {
        toast.error("CPF inválido");
        return setLoading(false);
      }

      if (!validatePhone(formData.cliente_telefone)) {
        toast.error("Telefone inválido");
        return setLoading(false);
      }

      if (!formData.tipo_sinistro) {
        toast.error("Selecione o tipo de sinistro");
        return setLoading(false);
      }

      const { data: fluxos } = await supabase.from("fluxos").select("id").eq("ativo", true).order("ordem").limit(1);

      if (!fluxos?.length) {
        toast.error("Nenhum fluxo ativo encontrado");
        return;
      }

      const fluxoId = fluxos[0].id;

      const { data: statusList } = await supabase
        .from("status_config")
        .select("nome")
        .eq("fluxo_id", fluxoId)
        .eq("ativo", true)
        .order("ordem")
        .limit(1);

      if (!statusList?.length) {
        toast.error("Nenhum status inicial encontrado");
        return;
      }

      const statusInicial = statusList[0].nome;

      const vistoriaTag = formData.solicitarVistoria ? "aguardando_vistoria_digital" : "sem_vistoria";

      const { data: atendimento, error: atendErr } = await supabase
        .from("atendimentos")
        .insert({
          user_id: user?.id,
          corretora_id: formData.corretora_id || null,
          responsavel_id: formData.responsavel_id || null,
          assunto: `Sinistro - ${formData.tipo_sinistro} - ${formData.cliente_nome}`,
          observacoes: formData.relato_incidente,
          status: statusInicial,
          fluxo_id: fluxoId,
          prioridade: "Alta",
          tags: ["sinistro", formData.tipo_sinistro.toLowerCase(), vistoriaTag],
          tipo_atendimento: "sinistro",
        })
        .select()
        .single();

      if (atendErr) throw atendErr;

      await supabase.from("vistorias").insert({
        created_by: user?.id,
        atendimento_id: atendimento.id,
        corretora_id: formData.corretora_id || null,
        tipo_vistoria: "sinistro",
        tipo_abertura: "interno",
        tipo_sinistro: formData.tipo_sinistro,
        cliente_nome: formData.cliente_nome,
        cliente_cpf: formData.cliente_cpf,
        cliente_telefone: formData.cliente_telefone,
        cliente_email: formData.cliente_email,
        veiculo_placa: formData.veiculo_placa,
        veiculo_marca: formData.veiculo_marca,
        veiculo_modelo: formData.veiculo_modelo,
        veiculo_ano: formData.veiculo_ano,
        veiculo_cor: formData.veiculo_cor,
        veiculo_chassi: formData.veiculo_chassi,
        data_incidente: formData.data_incidente,
        relato_incidente: formData.relato_incidente,
        status: formData.solicitarVistoria ? "aguardando_fotos" : "pendente",
      });

      toast.success("Sinistro registrado com sucesso!");
      navigate("/");
    } catch (err) {
      console.error("Erro ao registrar sinistro:", err);
      toast.error("Erro ao registrar sinistro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <AlertTriangle className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Sinistros</h1>
            <p className="text-sm text-muted-foreground">Registre um novo sinistro</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => navigate("/sinistros/acompanhamento")} variant="outline" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Acompanhamento
          </Button>

          <Button onClick={() => navigate("/dashboard-sinistros")} variant="outline" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Dashboard
          </Button>
        </div>
      </div>

      {/* Card */}
      <Card>
        <CardHeader>
          <CardTitle>Dados do Sinistro</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tipo de Sinistro */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Tipo de Sinistro</h3>

              <div>
                <Label>Tipo de Sinistro *</Label>
                <Select
                  value={formData.tipo_sinistro}
                  onValueChange={(v) => setFormData({ ...formData, tipo_sinistro: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Colisão">Colisão</SelectItem>
                    <SelectItem value="Roubo/Furto">Roubo/Furto</SelectItem>
                    <SelectItem value="Incêndio">Incêndio</SelectItem>
                    <SelectItem value="Danos a Terceiros">Danos a Terceiros</SelectItem>
                    <SelectItem value="Fenômenos Naturais">Fenômenos Naturais</SelectItem>
                    <SelectItem value="Vidros">Vidros</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dados do Cliente */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Dados do Cliente</h3>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome Completo *</Label>
                  <Input
                    value={formData.cliente_nome}
                    onChange={(e) => setFormData({ ...formData, cliente_nome: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label>CPF *</Label>
                  <MaskedInput
                    format="###.###.###-##"
                    value={formData.cliente_cpf}
                    onValueChange={(v) => setFormData({ ...formData, cliente_cpf: v.value })}
                  />
                </div>

                <div>
                  <Label>Telefone *</Label>
                  <MaskedInput
                    format="(##) #####-####"
                    value={formData.cliente_telefone}
                    onValueChange={(v) => setFormData({ ...formData, cliente_telefone: v.value })}
                  />
                </div>

                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={formData.cliente_email}
                    onChange={(e) => setFormData({ ...formData, cliente_email: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Dados do Veículo */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Dados do Veículo</h3>

              <div className="grid md:grid-cols-2 gap-4">
                {/* PLACA COM LETRAS */}
                <div>
                  <Label>Placa *</Label>
                  <Input
                    type="text"
                    maxLength={8}
                    placeholder="ABC-1234"
                    value={formData.veiculo_placa}
                    onChange={(e) => {
                      let value = e.target.value.toUpperCase();
                      value = value.replace(/[^A-Z0-9-]/g, "");

                      const raw = value.replace("-", "");

                      if (raw.length <= 3) {
                        value = raw;
                      } else {
                        value = raw.slice(0, 3) + "-" + raw.slice(3, 7);
                      }

                      setFormData({ ...formData, veiculo_placa: value });
                    }}
                    required
                  />
                </div>

                <div>
                  <Label>Marca *</Label>
                  <Input
                    value={formData.veiculo_marca}
                    onChange={(e) => setFormData({ ...formData, veiculo_marca: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label>Modelo *</Label>
                  <Input
                    value={formData.veiculo_modelo}
                    onChange={(e) => setFormData({ ...formData, veiculo_modelo: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label>Ano *</Label>
                  <Input
                    value={formData.veiculo_ano}
                    onChange={(e) => setFormData({ ...formData, veiculo_ano: e.target.value })}
                    placeholder="2020/2021"
                    required
                  />
                </div>

                <div>
                  <Label>Cor *</Label>
                  <Input
                    value={formData.veiculo_cor}
                    onChange={(e) => setFormData({ ...formData, veiculo_cor: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label>Chassi</Label>
                  <Input
                    maxLength={17}
                    value={formData.veiculo_chassi}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        veiculo_chassi: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="Digite o chassi"
                  />
                </div>
              </div>
            </div>

            {/* Dados do Sinistro */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Dados do Sinistro</h3>

              <div>
                <Label>Data do Incidente *</Label>
                <Input
                  type="date"
                  value={formData.data_incidente}
                  onChange={(e) => setFormData({ ...formData, data_incidente: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label>Relato do Incidente *</Label>
                <Textarea
                  rows={6}
                  placeholder="Descreva o que aconteceu..."
                  value={formData.relato_incidente}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      relato_incidente: e.target.value,
                    })
                  }
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={formData.solicitarVistoria}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      solicitarVistoria: e.target.checked,
                    })
                  }
                />
                <Label className="cursor-pointer">Solicitar vistoria digital imediatamente</Label>
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(-1)}>
                Cancelar
              </Button>

              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Registrando..." : "Registrar Sinistro"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
