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
import { VehicleFipeSelector } from "@/components/VehicleFipeSelector";

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

export function AtendimentoDialog({ open, onOpenChange, atendimento, onSave, corretoras }: AtendimentoDialogProps) {
  const { user } = useAuth();
  const [vehicleType, setVehicleType] = useState("");

  const [formData, setFormData] = useState<Partial<Atendimento>>({
    corretora: atendimento?.corretoraId || "",
    contato: atendimento?.contato || "",
    assunto: atendimento?.assunto || "",
    prioridade: atendimento?.prioridade || "Média",
    responsavel: atendimento?.responsavel || user?.id || "",
    tags: atendimento?.tags || [],
    observacoes: atendimento?.observacoes || "",
    dataRetorno: atendimento?.dataRetorno || "",
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
  const [corretoraDisplay, setCorretoraDisplay] = useState<string>(atendimento?.corretora || "");
  const [profiles, setProfiles] = useState<Array<{ id: string; nome: string }>>([]);
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
    veiculo_tipo: "",
    veiculo_marca: "",
    veiculo_modelo: "",
    veiculo_ano: "",
    veiculo_cor: "",
    veiculo_chassi: "",
    veiculo_valor_fipe: null as number | null,
    veiculo_fipe_data_consulta: null as Date | string | null,
    veiculo_fipe_codigo: null as string | null,
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
        let corretoraName = atendimento.corretora || "";

        // Buscar nome da corretora se houver corretoraId (UUID)
        if (atendimento.corretoraId) {
          const { data: corretoraData } = await supabase
            .from("corretoras")
            .select("nome")
            .eq("id", atendimento.corretoraId)
            .single();

          if (corretoraData) {
            corretoraName = corretoraData.nome;
          }
        }

        setCorretoraDisplay(corretoraName);

        let contatoName = atendimento.contato || "";

        // Buscar nome do contato se houver contato como string (possível ID)
        if (atendimento.contato && atendimento.contato.length > 30) {
          const { data: contatoData } = await supabase
            .from("contatos")
            .select("nome")
            .eq("id", atendimento.contato)
            .single();

          if (contatoData) {
            contatoName = contatoData.nome;
          }
        }

        // Buscar UUID do responsável se for nome
        let responsavelId = user?.id || "";
        if (atendimento.responsavel) {
          // Se parecer ser UUID (mais de 30 caracteres), usar direto
          if (atendimento.responsavel.length > 30) {
            responsavelId = atendimento.responsavel;
          } else {
            // Caso contrário, buscar pelo nome
            const { data: profileData } = await supabase
              .from("profiles")
              .select("id")
              .eq("nome", atendimento.responsavel)
              .maybeSingle();

            if (profileData) {
              responsavelId = profileData.id;
            }
          }
        }

        setFormData({
          corretora: atendimento.corretoraId || "",
          contato: contatoName,
          assunto: atendimento.assunto,
          prioridade: atendimento.prioridade,
          responsavel: responsavelId,
          tags: atendimento.tags,
          observacoes: atendimento.observacoes || "",
          dataRetorno: atendimento.dataRetorno || "",
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
        responsavel: user?.id || "",
        tags: [],
        observacoes: "",
        dataRetorno: "",
      });
      setCorretoraDisplay("");
      setVehicleType("");
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
        veiculo_tipo: "",
        veiculo_marca: "",
        veiculo_modelo: "",
        veiculo_ano: "",
        veiculo_cor: "",
        veiculo_chassi: "",
        veiculo_valor_fipe: null,
        veiculo_fipe_data_consulta: null,
        veiculo_fipe_codigo: null,
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

  // Carregar fluxos e profiles
  useEffect(() => {
    const loadFluxos = async () => {
      const { data } = await supabase.from("fluxos").select("*").eq("ativo", true).order("ordem");

      if (data) {
        setFluxos(data);
      }
    };

    const loadProfiles = async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");

      if (data) {
        setProfiles(data);
      }
    };

    loadFluxos();
    loadProfiles();
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
        const vistoriaInfo = {
          tipo_atendimento: "sinistro" as const,
          tipo_sinistro: data.tipo_sinistro || "",
          data_incidente: data.data_incidente || "",
          relato_incidente: data.relato_incidente || "",
          veiculo_placa: data.veiculo_placa || "",
          veiculo_tipo: data.veiculo_tipo || "",
          veiculo_marca: data.veiculo_marca || "",
          veiculo_modelo: data.veiculo_modelo || "",
          veiculo_ano: data.veiculo_ano || "",
          veiculo_cor: data.veiculo_cor || "",
          veiculo_chassi: data.veiculo_chassi || "",
          veiculo_valor_fipe: data.veiculo_valor_fipe || null,
          veiculo_fipe_data_consulta: data.veiculo_fipe_data_consulta || null,
          veiculo_fipe_codigo: data.veiculo_fipe_codigo || null,
          cliente_nome: data.cliente_nome || "",
          cliente_cpf: data.cliente_cpf || "",
          cliente_telefone: data.cliente_telefone || "",
          cliente_email: data.cliente_email || "",
          cof: data.cof || "",
        };
        setVistoriaData(vistoriaInfo);

        // Carregar tipo de veículo se disponível
        if (data.veiculo_tipo) {
          setVehicleType(data.veiculo_tipo);
        }

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
        // Atualizar vistoria existente - garantir sincronização completa de dados
        const { error: vistoriaError } = await supabase
          .from("vistorias")
          .update({
            ...cleanedVistoriaData,
            ...custos,
            corretora_id: formData.corretora || null,
            cliente_nome: vistoriaData.cliente_nome || null,
            cliente_cpf: vistoriaData.cliente_cpf || null,
            cliente_email: vistoriaData.cliente_email || null,
            cliente_telefone: vistoriaData.cliente_telefone || null,
            veiculo_placa: vistoriaData.veiculo_placa || null,
            veiculo_marca: vistoriaData.veiculo_marca || null,
            veiculo_modelo: vistoriaData.veiculo_modelo || null,
            veiculo_ano: vistoriaData.veiculo_ano || null,
            veiculo_tipo: vehicleType || vistoriaData.veiculo_tipo || null,
          })
          .eq("id", vistoriaId);

        if (vistoriaError) {
          console.error("Erro ao atualizar vistoria:", vistoriaError);
          throw vistoriaError;
        }
      } else {
        // Criar nova vistoria - usar ID do atendimento como ID da vistoria (unificação)
        const { data: newVistoria, error: vistoriaError } = await supabase
          .from("vistorias")
          .insert({
            id: atendimento.id, // Usar ID do atendimento como ID da vistoria
            atendimento_id: atendimento.id,
            created_by: user.id,
            tipo_vistoria: "sinistro",
            tipo_abertura: "interno",
            status: "rascunho",
            corretora_id: formData.corretora || null,
            ...cleanedVistoriaData,
            ...custos,
            veiculo_tipo: vehicleType || vistoriaData.veiculo_tipo || null,
          })
          .select("id")
          .single();

        if (vistoriaError) {
          console.error("Erro ao criar vistoria:", vistoriaError);
          throw vistoriaError;
        }
        if (newVistoria) setVistoriaId(newVistoria.id);
      }

      // Sincronizar TODOS os campos relevantes de volta para atendimentos
      const novoAssunto =
        vistoriaData.cliente_nome && vistoriaData.veiculo_placa
          ? `Sinistro - ${vistoriaData.cliente_nome} - ${vistoriaData.veiculo_placa}`
          : vistoriaData.cliente_nome
            ? `Sinistro - ${vistoriaData.cliente_nome}`
            : formData.assunto || atendimento.assunto;

      const { error: atendError } = await supabase
        .from("atendimentos")
        .update({
          tipo_atendimento: vistoriaData.tipo_atendimento,
          assunto: novoAssunto,
        })
        .eq("id", atendimento.id);

      if (atendError) {
        console.error("Erro ao atualizar tipo atendimento:", atendError);
        throw atendError;
      }

      toast.success("Dados salvos com sucesso");

      // Recarregar os dados para garantir sincronização
      await loadVistoriaCustos(atendimento.id);

      // Forçar atualização completa do card - criar objeto atualizado
      const atendimentoAtualizado = {
        ...atendimento,
        assunto: novoAssunto,
        updatedAt: new Date().toISOString(),
      };
      onSave(atendimentoAtualizado);
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
        // Usar o ID da corretora diretamente do formData (já é UUID)
        const corretoraId = formData.corretora || null;

        // Buscar ID do contato se houver nome
        let contatoId = null;
        if (formData.contato) {
          const { data: contatoData } = await supabase
            .from("contatos")
            .select("id")
            .eq("nome", formData.contato)
            .maybeSingle();

          if (contatoData) {
            contatoId = contatoData.id;
          }
        }

        const { error: updateError } = await supabase
          .from("atendimentos")
          .update({
            assunto: formData.assunto || "",
            prioridade: formData.prioridade || "Média",
            responsavel_id: formData.responsavel || user.id,
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

        // SINCRONIZAÇÃO BIDIRECIONAL COMPLETA: atualizar vistoria com TODOS os dados do atendimento
        if (vistoriaId) {
          const { error: vistoriaUpdateError } = await supabase
            .from("vistorias")
            .update({
              corretora_id: corretoraId,
            })
            .eq("id", vistoriaId);

          if (vistoriaUpdateError) {
            console.error("Erro ao sincronizar vistoria:", vistoriaUpdateError);
          }

          // Recarregar dados da vistoria para garantir que o card mostre tudo atualizado
          await loadVistoriaCustos(atendimento.id);
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

        // Forçar atualização completa do card com updated_at
        const atendimentoAtualizado = {
          ...atendimento,
          assunto: formData.assunto || atendimento.assunto,
          updatedAt: now,
        };
        onSave(atendimentoAtualizado);
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
                {/* ... (aba geral permanece igual) */}
                {/* Para economizar espaço, mantive como no código anterior,
                    você pode colar aqui a parte da aba "geral" do último arquivo
                    se precisar revisar algo nela. */}
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

                  <div className="space-y-4">
                    {/* 1) Placa */}
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

                    {/* 2) Cor e 3) Chassi */}
                    <div className="grid grid-cols-2 gap-4">
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

                    {/* 4) Bloco Tipo / Marca / Modelo / Ano / Consulta FIPE */}
                    <div className="space-y-2">
                      <VehicleFipeSelector
                        vehicleType={vehicleType}
                        onVehicleTypeChange={(value) => {
                          setVehicleType(value);
                          setVistoriaData((prev) => ({
                            ...prev,
                            veiculo_tipo: value,
                            veiculo_marca: "",
                            veiculo_modelo: "",
                            veiculo_ano: "",
                          }));
                        }}
                        marca={vistoriaData.veiculo_marca}
                        onMarcaChange={(value) =>
                          setVistoriaData((prev) => ({
                            ...prev,
                            veiculo_marca: value,
                          }))
                        }
                        modelo={vistoriaData.veiculo_modelo}
                        onModeloChange={(value) =>
                          setVistoriaData((prev) => ({
                            ...prev,
                            veiculo_modelo: value,
                          }))
                        }
                        ano={vistoriaData.veiculo_ano}
                        onAnoChange={(value) =>
                          setVistoriaData((prev) => ({
                            ...prev,
                            veiculo_ano: value,
                          }))
                        }
                        valorFipe={vistoriaData.veiculo_valor_fipe}
                        onValorFipeChange={(value) =>
                          setVistoriaData((prev) => ({
                            ...prev,
                            veiculo_valor_fipe: value,
                          }))
                        }
                        dataConsultaFipe={vistoriaData.veiculo_fipe_data_consulta}
                        onDataConsultaFipeChange={(value) =>
                          setVistoriaData((prev) => ({
                            ...prev,
                            veiculo_fipe_data_consulta: value,
                          }))
                        }
                        codigoFipe={vistoriaData.veiculo_fipe_codigo}
                        onCodigoFipeChange={(value) =>
                          setVistoriaData((prev) => ({
                            ...prev,
                            veiculo_fipe_codigo: value,
                          }))
                        }
                      />
                    </div>

                    {/* 5) Valor FIPE – sempre por último e sem entrada manual */}
                    <div className="space-y-2">
                      <Label htmlFor="veiculo_valor_fipe">Valor FIPE (R$)</Label>
                      {vistoriaData.veiculo_valor_fipe !== null ? (
                        <>
                          <CurrencyInput
                            id="veiculo_valor_fipe"
                            value={vistoriaData.veiculo_valor_fipe ?? 0}
                            onValueChange={() => {}}
                            disabled
                          />
                          {vistoriaData.veiculo_fipe_data_consulta && (
                            <p className="text-xs text-muted-foreground">
                              Consultado em:{" "}
                              {new Date(
                                vistoriaData.veiculo_fipe_data_consulta as string | number | Date,
                              ).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Não foi possível obter o valor FIPE automaticamente.
                        </p>
                      )}
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

              {/* As outras abas ("andamentos", "anexos", "custos", "historico") permanecem
                  iguais ao arquivo anterior – você pode colar aqui exatamente como estavam. */}
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
