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
  Copy,
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
  const [parecerFinal, setParecerFinal] = useState("");
  const [emailConclusao, setEmailConclusao] = useState("");
  const [enviandoEmailConclusao, setEnviandoEmailConclusao] = useState(false);
  const [corretoraSearchOpen, setCorretoraSearchOpen] = useState(false);
  const [corretoraSearch, setCorretoraSearch] = useState("");
  const [filteredCorretoras, setFilteredCorretoras] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("geral");
  const { userRole } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  // Hook para escutar mudanças em tempo real
  useAtendimentoRealtime({
    atendimentoId: atendimento?.id || null,
    onUpdate: () => {
      console.log("🔄 Recarregando dados do atendimento...");
      if (atendimento?.id) {
        // Apenas recarregar custos e histórico, não sobrescrever formData
        loadVistoriaCustos(atendimento.id);
        // Incrementar reloadKey apenas para forçar re-render das abas de histórico/andamentos
        setReloadKey((prev) => prev + 1);
      }
    },
  });

  // Estados para conclusão manual
  const [showConclusaoDialog, setShowConclusaoDialog] = useState(false);
  const [fluxos, setFluxos] = useState<any[]>([]);
  const [statusList, setStatusList] = useState<any[]>([]);
  const [selectedFluxoConclusao, setSelectedFluxoConclusao] = useState<string>("");
  const [selectedStatusConclusao, setSelectedStatusConclusao] = useState<string>("");

  // Estados para custos e dados do sinistro
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

  useEffect(() => {
    if (atendimento) {
      // Carregar nomes de corretora e contato baseado nos IDs
      const loadNomes = async () => {
        let corretoraName = "";
        let contatoName = "";

        // Buscar nome da corretora se houver ID
        if (atendimento.corretora) {
          const { data: corretoraData } = await supabase
            .from("corretoras")
            .select("nome")
            .eq("id", atendimento.corretora)
            .single();
          
          if (corretoraData) {
            corretoraName = corretoraData.nome;
          }
        }

        // Buscar nome do contato se houver ID
        if (atendimento.contato) {
          const { data: contatoData } = await supabase
            .from("contatos")
            .select("nome")
            .eq("id", atendimento.contato)
            .single();
          
          if (contatoData) {
            contatoName = contatoData.nome;
          }
        }

        // Atualizar formData com os nomes
        setFormData({
          ...atendimento,
          corretora: corretoraName,
          contato: contatoName,
        });
      };

      loadNomes();
      setPrimeiroAndamento("");
      setAnexos([]);
      loadVistoriaCustos(atendimento.id);

      // Carregar tipo_atendimento do atendimento
      const loadTipoAtendimento = async () => {
        const { data } = await supabase
          .from("atendimentos")
          .select("tipo_atendimento")
          .eq("id", atendimento.id)
          .single();

        if (data?.tipo_atendimento) {
          setVistoriaData((prev) => ({
            ...prev,
            tipo_atendimento: data.tipo_atendimento as "sinistro" | "geral",
          }));
        }
      };

      loadTipoAtendimento();
    } else {
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
      setParecerFinal("");
      setEmailConclusao("");
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
    }
    setCorretoraSearch("");
    setFilteredCorretoras([]);
  }, [atendimento, open]);

  // Carregar fluxos
  useEffect(() => {
    const loadFluxos = async () => {
      const { data } = await supabase.from("fluxos").select("*").eq("ativo", true).order("ordem");

      if (data) {
        setFluxos(data);
      }
    };

    loadFluxos();
  }, []);

  // Carregar status quando fluxo é selecionado
  useEffect(() => {
    const loadStatus = async () => {
      if (!selectedFluxoConclusao) {
        setStatusList([]);
        return;
      }

      const { data } = await supabase
        .from("status_config")
        .select("*")
        .eq("fluxo_id", selectedFluxoConclusao)
        .eq("ativo", true)
        .order("ordem");

      if (data) {
        setStatusList(data);
        if (data.length > 0) {
          setSelectedStatusConclusao(data[0].nome);
        }
      }
    };

    loadStatus();
  }, [selectedFluxoConclusao]);

  const loadVistoriaCustos = async (atendimentoId: string) => {
    try {
      const { data, error } = await supabase
        .from("vistorias")
        .select("*")
        .eq("atendimento_id", atendimentoId)
        .maybeSingle();

      if (error) {
        console.error("Erro ao carregar vistoria:", error);
        return;
      }

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

  useEffect(() => {
    if (corretoraSearch.length >= 3) {
      const filtered = corretoras.filter((c) => c.toLowerCase().includes(corretoraSearch.toLowerCase()));
      setFilteredCorretoras(filtered);
    } else {
      setFilteredCorretoras([]);
    }
  }, [corretoraSearch, corretoras]);

  const handleSalvarCustos = async () => {
    if (!atendimento?.id) {
      toast.error("Atendimento não encontrado");
      return;
    }

    // Validar CPF se preenchido
    if (vistoriaData.cliente_cpf && !validateCPF(vistoriaData.cliente_cpf)) {
      toast.error("CPF inválido");
      return;
    }

    // Validar placa se preenchida
    if (vistoriaData.veiculo_placa && !validatePlaca(vistoriaData.veiculo_placa)) {
      toast.error("Placa inválida (formato: ABC-1234 ou ABC1D23)");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Separar dados da vistoria (sem tipo_atendimento)
      const { tipo_atendimento, ...vistoriaDataOnly } = vistoriaData;

      // Converter strings vazias de timestamp para null
      const cleanedVistoriaData = Object.entries(vistoriaDataOnly).reduce((acc, [key, value]) => {
        if (key === "data_incidente" && value === "") {
          acc[key] = null;
        } else {
          acc[key] = value;
        }
        return acc;
      }, {} as any);

      if (vistoriaId) {
        // Atualizar vistoria existente
        const { error: vistoriaError } = await supabase
          .from("vistorias")
          .update({
            ...cleanedVistoriaData,
            ...custos,
          })
          .eq("id", vistoriaId);

        if (vistoriaError) {
          console.error("Erro ao atualizar vistoria:", vistoriaError);
          throw vistoriaError;
        }
      } else {
        // Criar nova vistoria
        const { data: newVistoria, error: vistoriaError } = await supabase
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

        if (vistoriaError) {
          console.error("Erro ao criar vistoria:", vistoriaError);
          throw vistoriaError;
        }
        if (newVistoria) setVistoriaId(newVistoria.id);
      }

      // Atualizar tipo_atendimento na tabela atendimentos
      const { error: atendError } = await supabase
        .from("atendimentos")
        .update({ tipo_atendimento: vistoriaData.tipo_atendimento })
        .eq("id", atendimento.id);

      if (atendError) {
        console.error("Erro ao atualizar tipo atendimento:", atendError);
        throw atendError;
      }

      toast.success("Dados salvos com sucesso");

      // Recarregar os dados para garantir sincronização
      await loadVistoriaCustos(atendimento.id);
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      toast.error(error?.message || "Erro ao salvar dados");
    }
  };

  const handleGerarLinkVistoria = async () => {
    if (!atendimento?.id) {
      toast.error("Atendimento não encontrado");
      return;
    }

    try {
      // Validar dados obrigatórios
      if (!vistoriaData.veiculo_placa) {
        toast.error("Preencha a placa do veículo");
        return;
      }

      if (!validatePlaca(vistoriaData.veiculo_placa)) {
        toast.error("Placa inválida");
        return;
      }

      // Salvar dados primeiro
      await handleSalvarCustos();

      // Gerar token de acesso
      const linkToken = crypto.randomUUID();
      const diasValidade = 7;
      const linkExpiresAt = new Date();
      linkExpiresAt.setDate(linkExpiresAt.getDate() + diasValidade);

      // Atualizar vistoria com link
      const { error } = await supabase
        .from("vistorias")
        .update({
          link_token: linkToken,
          link_expires_at: linkExpiresAt.toISOString(),
          dias_validade: diasValidade,
          status: "aguardando_fotos",
        })
        .eq("id", vistoriaId);

      if (error) throw error;

      // Copiar link para clipboard
      const link = `${window.location.origin}/vistoria/${linkToken}`;
      await navigator.clipboard.writeText(link);

      toast.success("Link gerado e copiado!", {
        description: "O link é válido por 7 dias",
      });
    } catch (error) {
      console.error("Erro ao gerar link:", error);
      toast.error("Erro ao gerar link de vistoria");
    }
  };

  const handleConcluirManual = async () => {
    if (!atendimento?.id) {
      toast.error("Atendimento não encontrado");
      return;
    }

    if (!selectedFluxoConclusao || !selectedStatusConclusao) {
      toast.error("Selecione fluxo e status de destino");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Buscar nomes para histórico
      const { data: fluxoData } = await supabase
        .from("fluxos")
        .select("nome")
        .eq("id", selectedFluxoConclusao)
        .single();

      const { data: fluxoAnteriorData } = await supabase
        .from("fluxos")
        .select("nome")
        .eq("id", atendimento.fluxoId)
        .single();

      // Atualizar atendimento
      const { error: updateError } = await supabase
        .from("atendimentos")
        .update({
          fluxo_id: selectedFluxoConclusao,
          status: selectedStatusConclusao,
          status_changed_at: new Date().toISOString(),
        })
        .eq("id", atendimento.id);

      if (updateError) throw updateError;

      // Registrar no histórico
      const { data: profileData } = await supabase.from("profiles").select("nome").eq("id", user.id).single();

      await supabase.from("atendimentos_historico").insert({
        atendimento_id: atendimento.id,
        user_id: user.id,
        user_nome: profileData?.nome || user.email || "Usuário",
        acao: `Conclusão Manual: ${fluxoAnteriorData?.nome || "Anterior"} → ${fluxoData?.nome || "Novo"}`,
        campos_alterados: ["fluxo_id", "status"],
        valores_anteriores: {
          fluxo_id: atendimento.fluxoId,
          status: atendimento.status,
        },
        valores_novos: {
          fluxo_id: selectedFluxoConclusao,
          status: selectedStatusConclusao,
        },
      });

      toast.success("Atendimento concluído com sucesso");
      setShowConclusaoDialog(false);
      onOpenChange(false);

      // Recarregar dados
      window.location.reload();
    } catch (error) {
      console.error("Erro ao concluir:", error);
      toast.error("Erro ao concluir atendimento");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const now = new Date().toISOString();

      // Se for edição, atualizar o atendimento existente
      if (atendimento?.id) {
        // Buscar IDs de corretora e contato baseado nos nomes
        let corretoraId = atendimento.corretora; // Mantém o ID original se não mudou
        let contatoId = atendimento.contato; // Mantém o ID original se não mudou

        // Se o nome da corretora mudou, buscar novo ID
        if (formData.corretora && formData.corretora !== atendimento.corretora) {
          const { data: corretoraData } = await supabase
            .from("corretoras")
            .select("id")
            .eq("nome", formData.corretora)
            .single();
          
          if (corretoraData) {
            corretoraId = corretoraData.id;
          }
        }

        // Se o nome do contato mudou, buscar novo ID
        if (formData.contato && formData.contato !== atendimento.contato) {
          const { data: contatoData } = await supabase
            .from("contatos")
            .select("id")
            .eq("nome", formData.contato)
            .single();
          
          if (contatoData) {
            contatoId = contatoData.id;
          }
        }

        const { error: updateError } = await supabase
          .from("atendimentos")
          .update({
            assunto: formData.assunto || "",
            prioridade: formData.prioridade || "Média",
            responsavel_id: formData.responsavel || null,
            corretora_id: corretoraId || null,
            contato_id: contatoId || null,
            tags: formData.tags || [],
            observacoes: formData.observacoes || "",
            data_retorno: formData.dataRetorno || null,
            updated_at: now,
          })
          .eq("id", atendimento.id);

        if (updateError) {
          console.error("Erro ao atualizar atendimento:", updateError);
          toast.error("Erro ao atualizar atendimento");
          return;
        }

        // Upload de novos anexos
        if (anexos.length > 0) {
          for (const file of anexos) {
            const fileExt = file.name.split(".").pop();
            const fileName = `${atendimento.id}/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage.from("atendimento-anexos").upload(fileName, file);

            if (uploadError) {
              console.error("Erro no upload:", uploadError);
              toast.error(`Erro ao fazer upload de ${file.name}`);
              continue;
            }

            const { error: dbError } = await supabase.from("atendimento_anexos").insert({
              atendimento_id: atendimento.id,
              arquivo_nome: file.name,
              arquivo_url: fileName,
              arquivo_tamanho: file.size,
              tipo_arquivo: file.type,
              created_by: user.id,
            });

            if (dbError) {
              console.error("Erro ao salvar anexo no DB:", dbError);
              toast.error(`Erro ao salvar informações de ${file.name}`);
            }
          }
        }

        toast.success("Atendimento atualizado com sucesso");
      } else {
        // Criar novo atendimento
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

        // Upload de anexos para novo atendimento
        if (anexos.length > 0) {
          for (const file of anexos) {
            const fileExt = file.name.split(".").pop();
            const fileName = `${savedAtendimento.id}/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage.from("atendimento-anexos").upload(fileName, file);

            if (uploadError) {
              toast.error(`Erro ao fazer upload de ${file.name}`);
              continue;
            }

            const { error: dbError } = await supabase.from("atendimento_anexos").insert({
              atendimento_id: savedAtendimento.id,
              arquivo_nome: file.name,
              arquivo_url: fileName,
              arquivo_tamanho: file.size,
              tipo_arquivo: file.type,
              created_by: user.id,
            });

            if (dbError) {
              toast.error(`Erro ao salvar informações de ${file.name}`);
            }
          }
        }

        // Adicionar primeiro andamento se houver
        if (primeiroAndamento.trim()) {
          await supabase.from("andamentos").insert({
            atendimento_id: savedAtendimento.id,
            descricao: primeiroAndamento,
            created_by: user.id,
          });
        }
      }

      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro no handleSubmit:", error);
      toast.error(error?.message || "Erro ao salvar atendimento");
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

  return (
    <>
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="corretora">Corretora *</Label>
                      <Popover open={corretoraSearchOpen} onOpenChange={setCorretoraSearchOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={corretoraSearchOpen}
                            className="w-full justify-between"
                          >
                            {formData.corretora || "Selecione uma corretora..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                          <Command>
                            <CommandInput
                              placeholder="Digite pelo menos 3 caracteres..."
                              value={corretoraSearch}
                              onValueChange={setCorretoraSearch}
                            />
                            <CommandEmpty>
                              {corretoraSearch.length < 3
                                ? "Digite pelo menos 3 caracteres para buscar"
                                : "Nenhuma corretora encontrada"}
                            </CommandEmpty>
                            {filteredCorretoras.length > 0 && (
                              <CommandGroup>
                                {filteredCorretoras.map((c) => (
                                  <CommandItem
                                    key={c}
                                    value={c}
                                    onSelect={(currentValue) => {
                                      setFormData({ ...formData, corretora: currentValue });
                                      setCorretoraSearchOpen(false);
                                      setCorretoraSearch("");
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.corretora === c ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    {c}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contato">Contato</Label>
                      <Input
                        id="contato"
                        value={formData.contato}
                        onChange={(e) => setFormData({ ...formData, contato: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="assunto">Assunto *</Label>
                    <Input
                      id="assunto"
                      value={formData.assunto}
                      onChange={(e) => setFormData({ ...formData, assunto: e.target.value })}
                      required
                    />
                  </div>

                  {/* Tipo de Atendimento e Tipo de Sinistro */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tipo_atendimento">Tipo de Atendimento *</Label>
                      <Select
                        value={vistoriaData.tipo_atendimento}
                        onValueChange={(value: "sinistro" | "geral") =>
                          setVistoriaData({ ...vistoriaData, tipo_atendimento: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sinistro">Sinistro</SelectItem>
                          <SelectItem value="geral">Geral</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {vistoriaData.tipo_atendimento === "sinistro" && (
                      <div className="space-y-2">
                        <Label htmlFor="tipo_sinistro">Tipo de Sinistro *</Label>
                        <Select
                          value={vistoriaData.tipo_sinistro}
                          onValueChange={(value) => setVistoriaData({ ...vistoriaData, tipo_sinistro: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o tipo de sinistro" />
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
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="prioridade">Prioridade</Label>
                      <Select
                        value={formData.prioridade}
                        onValueChange={(value) => setFormData({ ...formData, prioridade: value as PriorityType })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Baixa">Baixa</SelectItem>
                          <SelectItem value="Média">Média</SelectItem>
                          <SelectItem value="Alta">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="responsavel">Responsável</Label>
                      <Input
                        id="responsavel"
                        list="responsaveis-list"
                        value={formData.responsavel}
                        onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
                      />
                      <datalist id="responsaveis-list">
                        {responsaveis.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <div className="flex gap-2">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                        placeholder="Adicionar tag..."
                      />
                      <Button type="button" onClick={addTag} variant="outline">
                        +
                      </Button>
                    </div>
                    {formData.tags && formData.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formData.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-sm"
                          >
                            {tag}
                            <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {!atendimento && (
                    <div className="space-y-2">
                      <Label htmlFor="primeiroAndamento">Primeiro Andamento</Label>
                      <Textarea
                        id="primeiroAndamento"
                        value={primeiroAndamento}
                        onChange={(e) => setPrimeiroAndamento(e.target.value)}
                        placeholder="Descreva o primeiro andamento deste atendimento..."
                        rows={3}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="observacoes">Observações</Label>
                    <Textarea
                      id="observacoes"
                      value={formData.observacoes}
                      onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dataRetorno">Data de Retorno (Follow-up)</Label>
                    <Input
                      id="dataRetorno"
                      type="datetime-local"
                      value={formData.dataRetorno || ""}
                      onChange={(e) => setFormData({ ...formData, dataRetorno: e.target.value })}
                    />
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t">
                    {atendimento && (
                      <Button type="button" variant="default" onClick={() => setShowConclusaoDialog(true)}>
                        Concluir Manualmente
                      </Button>
                    )}
                    <div className="flex gap-2 ml-auto">
                      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit">Salvar</Button>
                    </div>
                  </div>
                </form>
              </TabsContent>

              <TabsContent
                value="dados_pessoais"
                className="mt-0 space-y-6 p-4 overflow-y-auto max-h-[calc(90vh-300px)]"
              >
                {/* Dados do Sinistro - apenas se tipo_atendimento === 'sinistro' */}
                {vistoriaData.tipo_atendimento === "sinistro" && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                    <h4 className="font-medium">Dados do Sinistro</h4>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="data_incidente">Data do Incidente</Label>
                        <Input
                          id="data_incidente"
                          type="date"
                          value={vistoriaData.data_incidente}
                          onChange={(e) => setVistoriaData({ ...vistoriaData, data_incidente: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cof">COF</Label>
                        <Input
                          id="cof"
                          value={vistoriaData.cof}
                          onChange={(e) => setVistoriaData({ ...vistoriaData, cof: e.target.value })}
                          placeholder="Código de Ocorrência"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="relato_incidente">Relato do Incidente</Label>
                      <Textarea
                        id="relato_incidente"
                        value={vistoriaData.relato_incidente}
                        onChange={(e) => setVistoriaData({ ...vistoriaData, relato_incidente: e.target.value })}
                        rows={4}
                        placeholder="Descreva o que aconteceu..."
                      />
                    </div>
                  </div>
                )}

                {/* Dados do Veículo */}
                <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                  <h4 className="font-medium">Dados do Veículo</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="veiculo_placa">Placa</Label>
                      <Input
                        id="veiculo_placa"
                        value={vistoriaData.veiculo_placa}
                        onChange={(e) => {
                          const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
                          const formatted =
                            value.length > 3 && !value.includes("-")
                              ? value.slice(0, 3) + "-" + value.slice(3, 7)
                              : value;
                          setVistoriaData({ ...vistoriaData, veiculo_placa: formatted });
                        }}
                        placeholder="ABC-1234"
                        maxLength={8}
                        className={
                          vistoriaData.veiculo_placa && !validatePlaca(vistoriaData.veiculo_placa)
                            ? "border-destructive"
                            : ""
                        }
                      />
                      {vistoriaData.veiculo_placa && !validatePlaca(vistoriaData.veiculo_placa) && (
                        <p className="text-xs text-destructive">Placa inválida</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="veiculo_marca">Marca</Label>
                      <Select
                        value={vistoriaData.veiculo_marca}
                        onValueChange={(value) =>
                          setVistoriaData({ ...vistoriaData, veiculo_marca: value, veiculo_modelo: "" })
                        }
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
                    <div className="space-y-2">
                      <Label htmlFor="veiculo_modelo">Modelo</Label>
                      <Select
                        value={vistoriaData.veiculo_modelo}
                        onValueChange={(value) => setVistoriaData({ ...vistoriaData, veiculo_modelo: value })}
                        disabled={!vistoriaData.veiculo_marca}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o modelo" />
                        </SelectTrigger>
                        <SelectContent>
                          {vistoriaData.veiculo_marca &&
                            MODELOS_POR_MARCA[vistoriaData.veiculo_marca]?.map((modelo) => (
                              <SelectItem key={modelo} value={modelo}>
                                {modelo}
                              </SelectItem>
                            ))}
                          <SelectItem value="Outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="veiculo_ano">Ano</Label>
                      <Select
                        value={vistoriaData.veiculo_ano}
                        onValueChange={(value) => setVistoriaData({ ...vistoriaData, veiculo_ano: value })}
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
                    <div className="space-y-2">
                      <Label htmlFor="veiculo_cor">Cor</Label>
                      <Select
                        value={vistoriaData.veiculo_cor}
                        onValueChange={(value) => setVistoriaData({ ...vistoriaData, veiculo_cor: value })}
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
                    <div className="space-y-2">
                      <Label htmlFor="veiculo_chassi">Chassi</Label>
                      <Input
                        id="veiculo_chassi"
                        value={vistoriaData.veiculo_chassi}
                        onChange={(e) =>
                          setVistoriaData({ ...vistoriaData, veiculo_chassi: e.target.value.toUpperCase() })
                        }
                        maxLength={17}
                        placeholder="17 caracteres"
                      />
                    </div>
                  </div>
                </div>

                {/* Dados do Cliente */}
                <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                  <h4 className="font-medium">Dados do Cliente</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cliente_nome">Nome Completo</Label>
                      <Input
                        id="cliente_nome"
                        value={vistoriaData.cliente_nome}
                        onChange={(e) => setVistoriaData({ ...vistoriaData, cliente_nome: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cliente_cpf">CPF</Label>
                      <MaskedInput
                        id="cliente_cpf"
                        format="###.###.###-##"
                        mask="_"
                        value={vistoriaData.cliente_cpf}
                        onValueChange={(values) => setVistoriaData({ ...vistoriaData, cliente_cpf: values.value })}
                        placeholder="000.000.000-00"
                        className={
                          vistoriaData.cliente_cpf && !validateCPF(vistoriaData.cliente_cpf) ? "border-destructive" : ""
                        }
                      />
                      {vistoriaData.cliente_cpf && !validateCPF(vistoriaData.cliente_cpf) && (
                        <p className="text-xs text-destructive">CPF inválido</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cliente_telefone">Telefone</Label>
                      <MaskedInput
                        id="cliente_telefone"
                        format="(##) #####-####"
                        mask="_"
                        value={vistoriaData.cliente_telefone}
                        onValueChange={(values) => setVistoriaData({ ...vistoriaData, cliente_telefone: values.value })}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cliente_email">Email</Label>
                      <Input
                        id="cliente_email"
                        type="email"
                        value={vistoriaData.cliente_email}
                        onChange={(e) => setVistoriaData({ ...vistoriaData, cliente_email: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Botões de Ação */}
                {vistoriaData.tipo_atendimento === "sinistro" && (
                  <div className="flex gap-2 justify-end pt-4 border-t">
                    <Button
                      type="button"
                      onClick={handleGerarLinkVistoria}
                      variant="outline"
                      className="gap-2"
                      disabled={!vistoriaData.veiculo_placa || !validatePlaca(vistoriaData.veiculo_placa)}
                    >
                      <Link2 className="h-4 w-4" />
                      Gerar Link de Vistoria
                    </Button>
                    <Button type="button" onClick={handleSalvarCustos}>
                      Salvar Dados
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="andamentos" className="mt-0 p-4">
                {atendimento?.id ? (
                  <AndamentosList
                    atendimentoId={atendimento.id}
                    atendimentoNumero={atendimento.numero}
                    atendimentoAssunto={atendimento.assunto}
                  />
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    Salve o atendimento para adicionar andamentos
                  </div>
                )}
              </TabsContent>

              <TabsContent value="anexos" className="mt-0 p-4">
                {atendimento?.id ? (
                  <AnexosUpload atendimentoId={atendimento.id} anexos={anexos} onAnexosChange={setAnexos} />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Paperclip className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Anexos indisponíveis</p>
                    <p className="text-sm mt-2">Salve o atendimento primeiro para adicionar anexos</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="custos" className="mt-0 p-4">
                <div className="space-y-4">
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                    <h4 className="font-medium">Custos e Valores</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="custo_oficina_tab">Custo Oficina</Label>
                        <CurrencyInput
                          id="custo_oficina_tab"
                          value={custos.custo_oficina}
                          onValueChange={(values) => setCustos({ ...custos, custo_oficina: values?.floatValue || 0 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="custo_reparo_tab">Custo Reparo</Label>
                        <CurrencyInput
                          id="custo_reparo_tab"
                          value={custos.custo_reparo}
                          onValueChange={(values) => setCustos({ ...custos, custo_reparo: values?.floatValue || 0 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="custo_acordo_tab">Custo Acordo</Label>
                        <CurrencyInput
                          id="custo_acordo_tab"
                          value={custos.custo_acordo}
                          onValueChange={(values) => setCustos({ ...custos, custo_acordo: values?.floatValue || 0 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="custo_terceiros_tab">Custo Terceiros</Label>
                        <CurrencyInput
                          id="custo_terceiros_tab"
                          value={custos.custo_terceiros}
                          onValueChange={(values) => setCustos({ ...custos, custo_terceiros: values?.floatValue || 0 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="custo_perda_total_tab">Perda Total</Label>
                        <CurrencyInput
                          id="custo_perda_total_tab"
                          value={custos.custo_perda_total}
                          onValueChange={(values) =>
                            setCustos({ ...custos, custo_perda_total: values?.floatValue || 0 })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="custo_perda_parcial_tab">Perda Parcial</Label>
                        <CurrencyInput
                          id="custo_perda_parcial_tab"
                          value={custos.custo_perda_parcial}
                          onValueChange={(values) =>
                            setCustos({ ...custos, custo_perda_parcial: values?.floatValue || 0 })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="valor_franquia_tab">Valor Franquia</Label>
                        <CurrencyInput
                          id="valor_franquia_tab"
                          value={custos.valor_franquia}
                          onValueChange={(values) => setCustos({ ...custos, valor_franquia: values?.floatValue || 0 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="valor_indenizacao_tab">Valor Indenização</Label>
                        <CurrencyInput
                          id="valor_indenizacao_tab"
                          value={custos.valor_indenizacao}
                          onValueChange={(values) =>
                            setCustos({ ...custos, valor_indenizacao: values?.floatValue || 0 })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t">
                    <Button onClick={handleSalvarCustos}>Salvar Custos</Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="andamentos" className="mt-0">
                {atendimento?.id ? (
                  <AndamentosList atendimentoId={atendimento.id} />
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    Salve o atendimento para adicionar andamentos
                  </div>
                )}
              </TabsContent>

              <TabsContent value="anexos" className="mt-0">
                {atendimento?.id ? (
                  <div className="p-4">
                    <AnexosUpload atendimentoId={atendimento.id} anexos={anexos} onAnexosChange={setAnexos} />
                  </div>
                ) : (
                  <div className="p-4 text-center text-muted-foreground">Salve o atendimento para adicionar anexos</div>
                )}
              </TabsContent>

              <TabsContent value="historico" className="mt-0">
                {atendimento?.id ? (
                  <HistoricoList
                    atendimentoId={atendimento.id}
                    atendimentoNumero={atendimento.numero}
                    atendimentoAssunto={atendimento.assunto}
                  />
                ) : (
                  <div className="p-4 text-center text-muted-foreground">Salve o atendimento para ver o histórico</div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Dialog de Conclusão Manual */}
      <Dialog open={showConclusaoDialog} onOpenChange={setShowConclusaoDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Concluir Atendimento</DialogTitle>
            <DialogDescription>Selecione para qual fluxo e status deseja enviar este atendimento</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Fluxo de Destino</Label>
              <Select value={selectedFluxoConclusao} onValueChange={setSelectedFluxoConclusao}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o fluxo" />
                </SelectTrigger>
                <SelectContent>
                  {fluxos.map((fluxo) => (
                    <SelectItem key={fluxo.id} value={fluxo.id}>
                      {fluxo.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedFluxoConclusao && (
              <div className="space-y-2">
                <Label>Status de Destino</Label>
                <Select value={selectedStatusConclusao} onValueChange={setSelectedStatusConclusao}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusList.map((status) => (
                      <SelectItem key={status.id} value={status.nome}>
                        {status.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowConclusaoDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConcluirManual} disabled={!selectedFluxoConclusao || !selectedStatusConclusao}>
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
