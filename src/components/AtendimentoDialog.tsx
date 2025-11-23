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
import { HistoricoList } from "@/components/HistoricoList";
import { useAuth } from "@/hooks/useAuth";
import { CurrencyInput } from "@/components/ui/currency-input";
import { validateCPF, validatePlaca } from "@/lib/validators";
import { MaskedInput } from "@/components/ui/masked-input";
import { useAtendimentoRealtime } from "@/hooks/useAtendimentoRealtime";

const MARCAS = [
  /* ... suas marcas ... */
];
const MODELOS_POR_MARCA: { [key: string]: string[] } = {
  /* ... seus modelos ... */
};
const CORES = [
  /* ... cores ... */
];

const getAnosDisponiveis = () => {
  const anoAtual = new Date().getFullYear();
  const anos = [];
  for (let ano = anoAtual; ano >= 1980; ano--) anos.push(ano.toString());
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
  // --- Estados ---
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
  const [activeTab, setActiveTab] = useState("geral");
  const [corretoraSearchOpen, setCorretoraSearchOpen] = useState(false);
  const [corretoraSearch, setCorretoraSearch] = useState("");
  const [filteredCorretoras, setFilteredCorretoras] = useState<string[]>([]);

  const [vistoriaId, setVistoriaId] = useState<string | null>(null);
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

  const { userRole } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  // --- Hook de realtime ---
  useAtendimentoRealtime({
    atendimentoId: atendimento?.id || null,
    onUpdate: () => {
      if (atendimento?.id) loadVistoriaCustos(atendimento.id);
      setReloadKey((prev) => prev + 1);
    },
  });

  // --- UseEffects ---
  useEffect(() => {
    if (atendimento) {
      setFormData(atendimento);
      loadVistoriaCustos(atendimento.id);
    } else {
      resetForm();
    }
  }, [atendimento, open]);

  useEffect(() => {
    if (corretoraSearch.length >= 3) {
      const filtered = corretoras.filter((c) => c.toLowerCase().includes(corretoraSearch.toLowerCase()));
      setFilteredCorretoras(filtered);
    } else setFilteredCorretoras([]);
  }, [corretoraSearch, corretoras]);

  // --- Funções ---
  const resetForm = () => {
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
    setPrimeiroAndamento("");
    setAnexos([]);
    setVistoriaId(null);
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
  };

  const loadVistoriaCustos = async (atendimentoId: string) => {
    try {
      const { data } = await supabase.from("vistorias").select("*").eq("atendimento_id", atendimentoId).maybeSingle();
      if (data) {
        setVistoriaId(data.id);
        setVistoriaData((prev) => ({
          ...prev,
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
      }
    } catch (err) {
      console.error("Erro ao carregar vistoria:", err);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...(formData.tags || []), tagInput.trim()] });
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags?.filter((t) => t !== tag) || [] });
  };

  // --- Retorno JSX (Tabs, Dialogs, Forms) ---
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <DialogHeader className="pb-4 border-b">
            <DialogTitle>{atendimento ? "Editar Atendimento" : "Novo Atendimento"}</DialogTitle>
            <DialogDescription>
              {atendimento ? "Gerencie todas as informações do atendimento" : "Preencha as informações do atendimento"}
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-6 mb-4 flex-shrink-0">
              <TabsTrigger value="geral" className="gap-2">
                <FileText className="h-4 w-4" />
                Geral
              </TabsTrigger>
              <TabsTrigger value="dados_pessoais" className="gap-2">
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

            {/* Conteúdos das Tabs */}
            <div className="flex-1 overflow-y-auto">
              <TabsContent value="geral" className="mt-0 px-1">
                {/* Aqui vai o formulário geral */}
              </TabsContent>

              <TabsContent value="dados_pessoais" className="mt-0 p-4 overflow-y-auto max-h-[calc(90vh-300px)]">
                {/* Dados do Sinistro + Veículo + Cliente */}
              </TabsContent>

              <TabsContent value="andamentos" className="mt-0 p-4">
                {atendimento?.id ? (
                  <AndamentosList atendimentoId={atendimento.id} />
                ) : (
                  <div className="text-center text-muted-foreground">Salve o atendimento para adicionar andamentos</div>
                )}
              </TabsContent>

              <TabsContent value="anexos" className="mt-0 p-4">
                {atendimento?.id ? (
                  <AnexosUpload atendimentoId={atendimento.id} anexos={anexos} onAnexosChange={setAnexos} />
                ) : (
                  <div className="text-center text-muted-foreground">Salve o atendimento para adicionar anexos</div>
                )}
              </TabsContent>

              <TabsContent value="custos" className="mt-0 p-4">
                {/* Custos */}
              </TabsContent>

              <TabsContent value="historico" className="mt-0 p-4">
                {atendimento?.id ? (
                  <HistoricoList
                    atendimentoId={atendimento.id}
                    atendimentoNumero={atendimento.numero}
                    atendimentoAssunto={atendimento.assunto}
                  />
                ) : (
                  <div className="text-center text-muted-foreground">Salve o atendimento para ver o histórico</div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
