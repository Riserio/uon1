import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabaseClient";

interface Atendimento {
  id?: number;
  corretora?: string;
  contato?: string;
  assunto?: string;
  prioridade?: string;
  responsavel?: string;
  tags?: string[];
  observacoes?: string;
  dataRetorno?: string;
}

interface Vistoria {
  tipo_atendimento: string;
  tipo_sinistro: string;
  data_incidente: string;
  relato_incidente: string;
  veiculo_placa: string;
  veiculo_marca: string;
  veiculo_modelo: string;
  veiculo_ano: string;
  veiculo_cor: string;
  veiculo_chassi: string;
  cliente_nome: string;
  cliente_cpf: string;
  cliente_telefone: string;
  cliente_email: string;
  cof: string;
}

interface Custos {
  custo_oficina: number;
  custo_reparo: number;
  custo_acordo: number;
  custo_terceiros: number;
  custo_perda_total: number;
  custo_perda_parcial: number;
  valor_franquia: number;
  valor_indenizacao: number;
}

interface AtendimentoDialogProps {
  open: boolean;
  onClose: () => void;
  atendimento?: Atendimento | null;
}

export default function AtendimentoDialog({ open, onClose, atendimento }: AtendimentoDialogProps) {
  const [formData, setFormData] = useState<Atendimento>({
    corretora: "",
    contato: "",
    assunto: "",
    prioridade: "Média",
    responsavel: "",
    tags: [],
    observacoes: "",
    dataRetorno: "",
  });

  const [vistoriaData, setVistoriaData] = useState<Vistoria>({
    tipo_atendimento: "geral",
    tipo_sinistro: "",
    data_incidente: "",
    relato_incidente: "",
    veiculo_placa: "",
    veiculo_marca: "",
    veiculo_modelo: "",
    veiculo_ano: "",
    veiculo_cor: "",
    veiculo_chassi: "",
    cliente_nome: "",
    cliente_cpf: "",
    cliente_telefone: "",
    cliente_email: "",
    cof: "",
  });

  const [custos, setCustos] = useState<Custos>({
    custo_oficina: 0,
    custo_reparo: 0,
    custo_acordo: 0,
    custo_terceiros: 0,
    custo_perda_total: 0,
    custo_perda_parcial: 0,
    valor_franquia: 0,
    valor_indenizacao: 0,
  });

  const [vistoriaId, setVistoriaId] = useState<number | null>(null);

  // Carrega dados do atendimento e da vistoria ao abrir o diálogo
  useEffect(() => {
    if (!open) return;

    if (atendimento) {
      // Preenche campos gerais do atendimento
      setFormData({
        corretora: atendimento.corretora || "",
        contato: atendimento.contato || "",
        assunto: atendimento.assunto || "",
        prioridade: atendimento.prioridade || "Média",
        responsavel: atendimento.responsavel || "",
        tags: atendimento.tags || [],
        observacoes: atendimento.observacoes || "",
        dataRetorno: atendimento.dataRetorno || "",
      });

      loadVistoriaCustos(atendimento.id!);
    } else {
      // Se for novo atendimento, limpa todos campos
      setFormData({
        corretora: "",
        contato: "",
        assunto: "",
        prioridade: "Média",
        responsavel: "",
        tags: [],
        observacoes: "",
        dataRetorno: "",
      });

      setVistoriaData({
        tipo_atendimento: "geral",
        tipo_sinistro: "",
        data_incidente: "",
        relato_incidente: "",
        veiculo_placa: "",
        veiculo_marca: "",
        veiculo_modelo: "",
        veiculo_ano: "",
        veiculo_cor: "",
        veiculo_chassi: "",
        cliente_nome: "",
        cliente_cpf: "",
        cliente_telefone: "",
        cliente_email: "",
        cof: "",
      });

      setCustos({
        custo_oficina: 0,
        custo_reparo: 0,
        custo_acordo: 0,
        custo_terceiros: 0,
        custo_perda_total: 0,
        custo_perda_parcial: 0,
        valor_franquia: 0,
        valor_indenizacao: 0,
      });

      setVistoriaId(null);
    }
  }, [atendimento, open]);

  const loadVistoriaCustos = async (idAtendimento: number) => {
    // Busca vistoria vinculada ao atendimento
    const { data, error } = await supabase.from("vistoria").select("*").eq("atendimento_id", idAtendimento).single();

    if (error) {
      console.error("Erro ao carregar vistoria:", error);
      return;
    }

    if (data) {
      setVistoriaData((prev) => ({
        ...prev,
        tipo_atendimento: data.tipo_atendimento || prev.tipo_atendimento,
        tipo_sinistro: data.tipo_sinistro || "",
        data_incidente: data.data_incidente || "",
        relato_incidente: data.relato_incidente || "",
        veiculo_placa: data.veiculo_placa || "",
        veiculo_marca: data.veiculo_marca || "",
        veiculo_modelo: data.veiculo_modelo || "",
        veiculo_ano: data.veiculo_ano || "",
        veiculo_cor: data.veiculo_cor || "",
        veiculo_chassi: data.veiculo_chassi || "",
        cliente_nome: data.cliente_nome || "",
        cliente_cpf: data.cliente_cpf || "",
        cliente_telefone: data.cliente_telefone || "",
        cliente_email: data.cliente_email || "",
        cof: data.cof || "",
      }));

      setCustos({
        custo_oficina: data.custo_oficina || 0,
        custo_reparo: data.custo_reparo || 0,
        custo_acordo: data.custo_acordo || 0,
        custo_terceiros: data.custo_terceiros || 0,
        custo_perda_total: data.custo_perda_total || 0,
        custo_perda_parcial: data.custo_perda_parcial || 0,
        valor_franquia: data.valor_franquia || 0,
        valor_indenizacao: data.valor_indenizacao || 0,
      });

      setVistoriaId(data.id);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVistoriaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setVistoriaData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    try {
      if (atendimento?.id) {
        // Atualiza atendimento existente
        await supabase.from("atendimento").update(formData).eq("id", atendimento.id);
      } else {
        // Cria novo atendimento
        const { data: newAtendimento } = await supabase.from("atendimento").insert(formData).select().single();
        setFormData((prev) => ({ ...prev, id: newAtendimento.id }));
      }

      if (vistoriaId) {
        await supabase
          .from("vistoria")
          .update({ ...vistoriaData, ...custos })
          .eq("id", vistoriaId);
      } else {
        await supabase.from("vistoria").insert({ ...vistoriaData, ...custos, atendimento_id: formData.id });
      }

      onClose();
    } catch (err) {
      console.error("Erro ao salvar atendimento:", err);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "hidden"} bg-black bg-opacity-50 flex items-center justify-center`}
    >
      <div className="bg-white p-6 rounded-lg w-[90%] max-w-4xl overflow-auto max-h-[90vh]">
        <h2 className="text-2xl font-bold mb-4">{atendimento ? "Editar Atendimento" : "Novo Atendimento"}</h2>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Informações Gerais</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              label="Corretora"
              name="corretora"
              value={formData.corretora}
              onChange={handleChange}
              className="mb-2"
            />
            <Input label="Contato" name="contato" value={formData.contato} onChange={handleChange} className="mb-2" />
            <Input label="Assunto" name="assunto" value={formData.assunto} onChange={handleChange} className="mb-2" />
            <Select
              value={formData.prioridade}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, prioridade: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Alta">Alta</SelectItem>
                <SelectItem value="Média">Média</SelectItem>
                <SelectItem value="Baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Vistoria / Sinistro</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              label="Tipo de Sinistro"
              name="tipo_sinistro"
              value={vistoriaData.tipo_sinistro}
              onChange={handleVistoriaChange}
              className="mb-2"
            />
            <Input
              label="Data do Incidente"
              name="data_incidente"
              type="date"
              value={vistoriaData.data_incidente}
              onChange={handleVistoriaChange}
              className="mb-2"
            />
            <Textarea
              label="Relato do Incidente"
              name="relato_incidente"
              value={vistoriaData.relato_incidente}
              onChange={handleVistoriaChange}
              className="mb-2"
            />
            <Input
              label="Placa"
              name="veiculo_placa"
              value={vistoriaData.veiculo_placa}
              onChange={handleVistoriaChange}
              className="mb-2"
            />
            <Input
              label="Marca"
              name="veiculo_marca"
              value={vistoriaData.veiculo_marca}
              onChange={handleVistoriaChange}
              className="mb-2"
            />
            <Input
              label="Modelo"
              name="veiculo_modelo"
              value={vistoriaData.veiculo_modelo}
              onChange={handleVistoriaChange}
              className="mb-2"
            />
            <Input
              label="Ano"
              name="veiculo_ano"
              value={vistoriaData.veiculo_ano}
              onChange={handleVistoriaChange}
              className="mb-2"
            />
            <Input
              label="Cor"
              name="veiculo_cor"
              value={vistoriaData.veiculo_cor}
              onChange={handleVistoriaChange}
              className="mb-2"
            />
            <Input
              label="Chassi"
              name="veiculo_chassi"
              value={vistoriaData.veiculo_chassi}
              onChange={handleVistoriaChange}
              className="mb-2"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}
