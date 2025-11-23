import { useState, useEffect } from "react";
import { Atendimento, PriorityType, StatusType } from "@/types/atendimento";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AndamentosList } from "@/components/AndamentosList";
import { AnexosUpload } from "@/components/AnexosUpload";
import {
  Check,
  ChevronsUpDown,
  FileText,
  MessageSquare,
  Paperclip,
  History,
  DollarSign,
  User,
  Link2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { CurrencyInput } from "@/components/ui/currency-input";
import { validateCPF, validatePlaca } from "@/lib/validators";
import { MaskedInput } from "@/components/ui/masked-input";
import { useAtendimentoRealtime } from "@/hooks/useAtendimentoRealtime";

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

const getAnosDisponiveis = () => {
  const anoAtual = new Date().getFullYear();
  const anos = [];
  for (let ano = anoAtual; ano >= 1980; ano--) {
    anos.push(ano.toString());
  }
  return anos;
};

interface AtendimentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimento?: Atendimento | null;
  onSave: (atendimento: Atendimento) => void;
  corretoras: string[];
  responsaveis: string[];
}

export function AtendimentoDialog({
  open,
  onOpenChange,
  atendimento,
  onSave,
  corretoras,
  responsaveis,
}: AtendimentoDialogProps) {
  const [formData, setFormData] = useState<Partial<Atendimento>>({
    corretora: "",
    contato: "",
    assunto: "",
    prioridade: "Média",
    responsavel: "",
    tags: [],
    observacoes: "",
    dataRetorno: "",
  });

  const [tagInput, setTagInput] = useState("");
  const [primeiroAndamento, setPrimeiroAndamento] = useState("");
  const [anexos, setAnexos] = useState<any[]>([]);
  const [vistoriaData, setVistoriaData] = useState({
    tipo_atendimento: "geral" as "sinistro" | "geral",
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
  const [custos, setCustos] = useState({
    custo_oficina: 0,
    custo_reparo: 0,
    custo_acordo: 0,
    custo_terceiros: 0,
    custo_perda_total: 0,
    custo_perda_parcial: 0,
    valor_franquia: 0,
    valor_indenizacao: 0,
  });
  const [vistoriaId, setVistoriaId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("geral");
  const { userRole } = useAuth();

  // Realtime
  useAtendimentoRealtime({
    atendimentoId: atendimento?.id || null,
    onUpdate: () => {
      if (atendimento?.id) loadVistoriaCustos(atendimento.id);
    },
  });

  useEffect(() => {
    if (atendimento) {
      setFormData(atendimento);
      setPrimeiroAndamento("");
      setAnexos([]);
      loadVistoriaCustos(atendimento.id);
    }
  }, [atendimento, open]);

  const loadVistoriaCustos = async (atendimentoId: string) => {
    try {
      const { data, error } = await supabase
        .from("vistorias")
        .select("*")
        .eq("atendimento_id", atendimentoId)
        .maybeSingle();

      if (data) {
        setVistoriaId(data.id);
        setVistoriaData({
          tipo_atendimento: "sinistro",
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
        });
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
      }
    } catch (error) {
      console.error("Erro ao carregar vistoria:", error);
    }
  };

  const handleSalvarCustos = async () => {
    if (!atendimento?.id) return toast.error("Atendimento não encontrado");
    if (vistoriaData.cliente_cpf && !validateCPF(vistoriaData.cliente_cpf)) return toast.error("CPF inválido");
    if (vistoriaData.veiculo_placa && !validatePlaca(vistoriaData.veiculo_placa)) return toast.error("Placa inválida");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return toast.error("Usuário não autenticado");

      const { tipo_atendimento, ...vistoriaDataOnly } = vistoriaData;
      const cleanedVistoriaData = Object.entries(vistoriaDataOnly).reduce((acc, [key, value]) => {
        acc[key] = value === "" ? null : value;
        return acc;
      }, {} as any);

      if (vistoriaId) {
        const { error } = await supabase
          .from("vistorias")
          .update({ ...cleanedVistoriaData, ...custos })
          .eq("id", vistoriaId);
        if (error) throw error;
      } else {
        const { data: newVistoria, error } = await supabase
          .from("vistorias")
          .insert({
            atendimento_id: atendimento.id,
            created_by: user.id,
            tipo_vistoria: "sinistro",
            tipo_abertura: "interno",
            status: "rascunho",
            ...cleanedVistoriaData,
            ...custos,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (newVistoria) setVistoriaId(newVistoria.id);
      }

      const { error: atendError } = await supabase
        .from("atendimentos")
        .update({ tipo_atendimento })
        .eq("id", atendimento.id);
      if (atendError) throw atendError;

      toast.success("Dados salvos com sucesso");
      await loadVistoriaCustos(atendimento.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Erro ao salvar dados");
    }
  };

  const handleGerarLinkVistoria = async () => {
    if (!atendimento?.id) return toast.error("Atendimento não encontrado");
    if (!vistoriaData.veiculo_placa || !validatePlaca(vistoriaData.veiculo_placa)) return toast.error("Placa inválida");

    await handleSalvarCustos();

    const linkToken = crypto.randomUUID();
    const diasValidade = 7;
    const linkExpiresAt = new Date();
    linkExpiresAt.setDate(linkExpiresAt.getDate() + diasValidade);

    const { error } = await supabase
      .from("vistorias")
      .update({
        link_token: linkToken,
        link_expires_at: linkExpiresAt.toISOString(),
        dias_validade: diasValidade,
        status: "aguardando_fotos",
      })
      .eq("id", vistoriaId);

    if (error) return toast.error("Erro ao gerar link de vistoria");

    const link = `${window.location.origin}/vistoria/${linkToken}`;
    await navigator.clipboard.writeText(link);
    toast.success("Link gerado e copiado!", { description: `O link é válido por ${diasValidade} dias` });
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...(formData.tags || []), tagInput.trim()] });
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => setFormData({ ...formData, tags: formData.tags?.filter((t) => t !== tag) || [] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return toast.error("Usuário não autenticado");

      const now = new Date().toISOString();

      if (atendimento?.id) {
        const { error } = await supabase
          .from("atendimentos")
          .update({
            assunto: formData.assunto || "",
            prioridade: formData.prioridade || "Média",
            responsavel_id: formData.responsavel || null,
            tags: formData.tags || [],
            observacoes: formData.observacoes || "",
            data_retorno: formData.dataRetorno || null,
            updated_at: now,
          })
          .eq("id", atendimento.id);
        if (error) throw error;
      } else {
        const savedAtendimento: Atendimento = {
          id: `atd-${Date.now()}`,
          numero: 0,
          corretora: formData.corretora || "",
          contato: formData.contato || "",
          assunto: formData.assunto || "",
          prioridade: (formData.prioridade as PriorityType) || "Média",
          responsavel: formData.responsavel || "",
          status: "novo" as StatusType,
          tags: formData.tags || [],
          observacoes: formData.observacoes || "",
          dataRetorno: formData.dataRetorno || undefined,
          createdAt: now,
          updatedAt: now,
        };
        onSave(savedAtendimento);
      }

      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Erro ao salvar atendimento");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="pb-4 border-b flex-shrink-0">
          <DialogTitle className="text-2xl">{atendimento ? "Editar Atendimento" : "Novo Atendimento"}</DialogTitle>
          <DialogDescription>
            {atendimento ? "Gerencie todas as informações do atendimento" : "Preencha as informações do atendimento"}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-6 mb-4 flex-shrink-0">
            <TabsTrigger value="geral" className="gap-2">
              <FileText className="h-4 w-4" />
              Geral
            </TabsTrigger>
            <TabsTrigger
              value="dados_pessoais"
              className="gap-2"
              onClick={() => atendimento && loadVistoriaCustos(atendimento.id)}
            >
              <User className="h-4 w-4" />
              Dados Pessoais
            </TabsTrigger>
            <TabsTrigger value="andamentos" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Andamentos
            </TabsTrigger>
            <TabsTrigger value="anexos" className="gap-2">
              <Paperclip className="h-4 w-4" />
              Anexos
            </TabsTrigger>
            <TabsTrigger value="custos" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Custos
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto">
            <TabsContent value="geral" className="mt-0 px-1">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* ... restante do formulário segue igual ... */}
              </form>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
