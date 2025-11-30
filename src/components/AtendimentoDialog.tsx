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
  ClipboardList,
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
import { EntrevistaTab } from "@/components/EntrevistaTab";

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

const FIPE_BASE_URL = "https://parallelum.com.br/fipe/api/v1";

const getFipeTipo = (vehicleType: string) => {
  switch (vehicleType) {
    case "carro":
      return "carros";
    case "moto":
      return "motos";
    case "caminhao_onibus":
      return "caminhoes";
    default:
      return "carros";
  }
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
  const { user, userRole } = useAuth();
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
  const [reloadKey, setReloadKey] = useState(0);

  // Conclusão manual / fluxo
  const [showConclusaoDialog, setShowConclusaoDialog] = useState(false);
  const [fluxos, setFluxos] = useState<any[]>([]);
  const [statusList, setStatusList] = useState<any[]>([]);
  const [selectedFluxoConclusao, setSelectedFluxoConclusao] = useState<string>("");
  const [selectedStatusConclusao, setSelectedStatusConclusao] = useState<string>("");

  // Dados de vistoria / sinistro
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

  // FIPE externa
  const [marcas, setMarcas] = useState<Array<{ codigo: string; nome: string }>>([]);
  const [modelos, setModelos] = useState<Array<{ codigo: string; nome: string }>>([]);
  const [anos, setAnos] = useState<Array<{ codigo: string; nome: string }>>([]);

  const [selectedMarcaCode, setSelectedMarcaCode] = useState("");
  const [selectedModeloCode, setSelectedModeloCode] = useState("");
  const [selectedAnoCode, setSelectedAnoCode] = useState("");

  const [loadingFipe, setLoadingFipe] = useState(false);
  const [fipeError, setFipeError] = useState<string | null>(null);
  const [enableManualFipe, setEnableManualFipe] = useState(false);

  // Hook realtime para atualizar custos/vistoria
  useAtendimentoRealtime({
    atendimentoId: atendimento?.id || null,
    onUpdate: () => {
      if (atendimento?.id) {
        loadVistoriaCustos(atendimento.id);
        setReloadKey((prev) => prev + 1);
      }
    },
  });

  useEffect(() => {
    if (atendimento) {
      const loadNomes = async () => {
        let corretoraName = atendimento.corretora || "";

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

        let responsavelId = user?.id || "";
        if (atendimento.responsavel) {
          if (atendimento.responsavel.length > 30) {
            responsavelId = atendimento.responsavel;
          } else {
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
      setEnableManualFipe(false);
      setMarcas([]);
      setModelos([]);
      setAnos([]);
      setSelectedMarcaCode("");
      setSelectedModeloCode("");
      setSelectedAnoCode("");
      setFipeError(null);
    }
    setCorretoraSearch("");
    setFilteredCorretoras([]);
  }, [atendimento, open, user]);

  useEffect(() => {
    const loadFluxos = async () => {
      const { data } = await supabase.from("fluxos").select("*").eq("ativo", true).order("ordem");
      if (data) setFluxos(data);
    };

    const loadProfiles = async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (data) setProfiles(data);
    };

    loadFluxos();
    loadProfiles();
  }, []);

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

        setEnableManualFipe(!vistoriaInfo.veiculo_valor_fipe);
      } else {
        setEnableManualFipe(false);
      }
    } catch (error) {
      console.error("Erro ao carregar vistoria:", error);
    }
  };

  // FIPE – marcas
  useEffect(() => {
    const fetchMarcas = async () => {
      if (!vehicleType) {
        setMarcas([]);
        setModelos([]);
        setAnos([]);
        setSelectedMarcaCode("");
        setSelectedModeloCode("");
        setSelectedAnoCode("");
        return;
      }

      try {
        const tipoFipe = getFipeTipo(vehicleType);
        const res = await fetch(`${FIPE_BASE_URL}/${tipoFipe}/marcas`);
        if (!res.ok) throw new Error("Erro ao buscar marcas FIPE");
        const data = await res.json();
        setMarcas(data || []);

        if (vistoriaData.veiculo_marca) {
          const found = data.find((m: any) => m.nome === vistoriaData.veiculo_marca);
          if (found) {
            setSelectedMarcaCode(found.codigo);
          }
        } else {
          setSelectedMarcaCode("");
        }

        setModelos([]);
        setAnos([]);
        setSelectedModeloCode("");
        setSelectedAnoCode("");
      } catch (err) {
        console.error(err);
        setMarcas([]);
      }
    };

    fetchMarcas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleType]);

  // FIPE – modelos
  useEffect(() => {
    const fetchModelos = async () => {
      if (!vehicleType || !selectedMarcaCode) {
        setModelos([]);
        setAnos([]);
        setSelectedModeloCode("");
        setSelectedAnoCode("");
        return;
      }

      try {
        const tipoFipe = getFipeTipo(vehicleType);
        const res = await fetch(`${FIPE_BASE_URL}/${tipoFipe}/marcas/${selectedMarcaCode}/modelos`);
        if (!res.ok) throw new Error("Erro ao buscar modelos FIPE");
        const data = await res.json();
        const modelosList = data?.modelos || [];
        setModelos(modelosList);

        if (vistoriaData.veiculo_modelo) {
          const found = modelosList.find((m: any) => m.nome === vistoriaData.veiculo_modelo);
          if (found) {
            setSelectedModeloCode(found.codigo);
          }
        } else {
          setSelectedModeloCode("");
        }

        setAnos([]);
        setSelectedAnoCode("");
      } catch (err) {
        console.error(err);
        setModelos([]);
      }
    };

    fetchModelos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMarcaCode, vehicleType]);

  // FIPE – anos
  useEffect(() => {
    const fetchAnos = async () => {
      if (!vehicleType || !selectedMarcaCode || !selectedModeloCode) {
        setAnos([]);
        setSelectedAnoCode("");
        return;
      }

      try {
        const tipoFipe = getFipeTipo(vehicleType);
        const res = await fetch(
          `${FIPE_BASE_URL}/${tipoFipe}/marcas/${selectedMarcaCode}/modelos/${selectedModeloCode}/anos`,
        );
        if (!res.ok) throw new Error("Erro ao buscar anos FIPE");
        const data = await res.json();
        setAnos(data || []);

        if (vistoriaData.veiculo_ano) {
          const found = data.find((a: any) => a.nome === vistoriaData.veiculo_ano);
          if (found) {
            setSelectedAnoCode(found.codigo);
          }
        } else {
          setSelectedAnoCode("");
        }
      } catch (err) {
        console.error(err);
        setAnos([]);
      }
    };

    fetchAnos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModeloCode, vehicleType, selectedMarcaCode]);

  // FIPE – valor
  useEffect(() => {
    const fetchValorFipe = async () => {
      if (!vehicleType || !selectedMarcaCode || !selectedModeloCode || !selectedAnoCode) return;

      try {
        setLoadingFipe(true);
        setFipeError(null);

        const tipoFipe = getFipeTipo(vehicleType);
        const res = await fetch(
          `${FIPE_BASE_URL}/${tipoFipe}/marcas/${selectedMarcaCode}/modelos/${selectedModeloCode}/anos/${selectedAnoCode}`,
        );

        if (!res.ok) throw new Error("Erro ao consultar valor FIPE");

        const data = await res.json();

        if (!data || !data.Valor) {
          setVistoriaData((prev) => ({
            ...prev,
            veiculo_valor_fipe: null,
            veiculo_fipe_data_consulta: null,
            veiculo_fipe_codigo: null,
          }));
          setFipeError("Não foi possível obter o valor FIPE automaticamente.");
          setEnableManualFipe(true);
        } else {
          const numericValue = Number(String(data.Valor).replace("R$", "").replace(/\./g, "").replace(",", ".").trim());

          setVistoriaData((prev) => ({
            ...prev,
            veiculo_valor_fipe: isNaN(numericValue) ? null : numericValue,
            veiculo_fipe_data_consulta: data.DataConsulta || new Date().toISOString(),
            veiculo_fipe_codigo: data.CodigoFipe || null,
            veiculo_ano: data.AnoModelo ? String(data.AnoModelo) : prev.veiculo_ano,
          }));

          setEnableManualFipe(false);
        }
      } catch (err) {
        console.error(err);
        setFipeError("Erro ao consultar valor FIPE.");
        setVistoriaData((prev) => ({
          ...prev,
          veiculo_valor_fipe: null,
          veiculo_fipe_data_consulta: null,
          veiculo_fipe_codigo: null,
        }));
        setEnableManualFipe(true);
      } finally {
        setLoadingFipe(false);
      }
    };

    fetchValorFipe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleType, selectedMarcaCode, selectedModeloCode, selectedAnoCode]);

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

    if (vistoriaData.cliente_cpf && !validateCPF(vistoriaData.cliente_cpf)) {
      toast.error("CPF inválido");
      return;
    }

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

      const { tipo_atendimento, ...vistoriaDataOnly } = vistoriaData;

      const cleanedVistoriaData = Object.entries(vistoriaDataOnly).reduce((acc, [key, value]) => {
        if (key === "data_incidente" && value === "") {
          acc[key] = null;
        } else {
          acc[key] = value;
        }
        return acc;
      }, {} as any);

      if (vistoriaId) {
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
        const { data: newVistoria, error: vistoriaError } = await supabase
          .from("vistorias")
          .insert({
            id: atendimento.id,
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

      await loadVistoriaCustos(atendimento.id);

      const atendimentoAtualizado = {
        ...atendimento,
        assunto: novoAssunto,
        updatedAt: new Date().toISOString(),
      };
      onSave(atendimentoAtualizado as Atendimento);
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
      if (!vistoriaData.veiculo_placa) {
        toast.error("Preencha a placa do veículo");
        return;
      }

      if (!validatePlaca(vistoriaData.veiculo_placa)) {
        toast.error("Placa inválida");
        return;
      }

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

      if (error) throw error;

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

      const { error: updateError } = await supabase
        .from("atendimentos")
        .update({
          fluxo_id: selectedFluxoConclusao,
          status: selectedStatusConclusao,
          status_changed_at: new Date().toISOString(),
        })
        .eq("id", atendimento.id);

      if (updateError) throw updateError;

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

      if (atendimento?.id) {
        const corretoraId = formData.corretora || null;

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

          await loadVistoriaCustos(atendimento.id);
        }

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

        const atendimentoAtualizado = {
          ...atendimento,
          assunto: formData.assunto || atendimento.assunto,
          updatedAt: now,
        };
        onSave(atendimentoAtualizado as Atendimento);
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
            <TabsList className="grid w-full grid-cols-7 mb-4 flex-shrink-0">
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
              <TabsTrigger value="entrevista" className="gap-2">
                <ClipboardList className="h-4 w-4" />
                Análise
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
              {/* ABA GERAL */}
              <TabsContent value="geral" className="mt-0 px-1">
                <form onSubmit={handleSubmit} className="space-y-4 pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Corretora */}
                    <div className="space-y-2">
                      <Label>Corretora</Label>
                      <Popover open={corretoraSearchOpen} onOpenChange={setCorretoraSearchOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={corretoraSearchOpen}
                            className="w-full justify-between"
                          >
                            {corretoraDisplay || "Selecione uma corretora"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                          <Command>
                            <CommandInput
                              placeholder="Digite o nome da corretora..."
                              value={corretoraSearch}
                              onValueChange={setCorretoraSearch}
                            />
                            <CommandEmpty>Nenhuma corretora encontrada.</CommandEmpty>
                            <CommandGroup>
                              {filteredCorretoras.map((corretoraNome) => (
                                <CommandItem
                                  key={corretoraNome}
                                  onSelect={() => {
                                    const selected = corretoras.find((c) => c === corretoraNome);
                                    setFormData({
                                      ...formData,
                                      corretora: selected || "",
                                    });
                                    setCorretoraDisplay(corretoraNome);
                                    setCorretoraSearchOpen(false);
                                  }}
                                >
                                  {corretoraNome}
                                  {corretoraNome === corretoraDisplay && (
                                    <Check className="ml-auto h-4 w-4 opacity-100" />
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Contato */}
                    <div className="space-y-2">
                      <Label>Contato</Label>
                      <Input
                        value={formData.contato || ""}
                        onChange={(e) => setFormData({ ...formData, contato: e.target.value })}
                        placeholder="Nome do contato / associado"
                      />
                    </div>
                  </div>

                  {/* Assunto */}
                  <div className="space-y-2">
                    <Label>Assunto</Label>
                    <Input
                      value={formData.assunto || ""}
                      onChange={(e) => setFormData({ ...formData, assunto: e.target.value })}
                      placeholder="Ex: Sinistro colisão frontal - veículo XYZ"
                    />
                  </div>

                  {/* Prioridade, Responsável, Data Retorno */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Prioridade */}
                    <div className="space-y-2">
                      <Label>Prioridade</Label>
                      <Select
                        value={formData.prioridade as PriorityType}
                        onValueChange={(value) => setFormData({ ...formData, prioridade: value as PriorityType })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a prioridade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Baixa">Baixa</SelectItem>
                          <SelectItem value="Média">Média</SelectItem>
                          <SelectItem value="Alta">Alta</SelectItem>
                          <SelectItem value="Crítica">Crítica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Responsável */}
                    <div className="space-y-2">
                      <Label>Responsável</Label>
                      <Select
                        value={formData.responsavel || ""}
                        onValueChange={(value) => setFormData({ ...formData, responsavel: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o responsável" />
                        </SelectTrigger>
                        <SelectContent>
                          {profiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Data de retorno */}
                    <div className="space-y-2">
                      <Label>Data de retorno</Label>
                      <Input
                        type="date"
                        value={formData.dataRetorno || ""}
                        onChange={(e) => setFormData({ ...formData, dataRetorno: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <div className="flex gap-2">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="Ex: colisão, guincho, aumento prêmio..."
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={addTag}>
                        Adicionar
                      </Button>
                    </div>
                    {formData.tags && formData.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formData.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium"
                          >
                            {tag}
                            <button
                              type="button"
                              className="ml-2 text-muted-foreground hover:text-destructive"
                              onClick={() => removeTag(tag)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Observações */}
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={formData.observacoes || ""}
                      onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                      placeholder="Informações adicionais sobre o atendimento"
                      rows={4}
                    />
                  </div>

                  {/* Primeiro Andamento (novo atendimento) */}
                  {!atendimento && (
                    <div className="space-y-2">
                      <Label>Primeiro andamento</Label>
                      <Textarea
                        value={primeiroAndamento}
                        onChange={(e) => setPrimeiroAndamento(e.target.value)}
                        placeholder="Descreva o primeiro andamento desse atendimento"
                        rows={3}
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Salvar</Button>
                  </div>
                </form>
              </TabsContent>

              {/* ABA DADOS PESSOAIS / SINISTRO */}
              <TabsContent
                value="dados_pessoais"
                className="mt-0 space-y-6 p-4 overflow-y-auto max-h-[calc(90vh-300px)]"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo de Atendimento</Label>
                      <Select
                        value={vistoriaData.tipo_atendimento}
                        onValueChange={(value) =>
                          setVistoriaData((prev) => ({ ...prev, tipo_atendimento: value as "sinistro" | "geral" }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="geral">Geral</SelectItem>
                          <SelectItem value="sinistro">Sinistro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo de Sinistro</Label>
                      <Input
                        value={vistoriaData.tipo_sinistro || ""}
                        onChange={(e) => setVistoriaData({ ...vistoriaData, tipo_sinistro: e.target.value })}
                        placeholder="Ex: colisão frontal, roubo/furto..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Data do Incidente</Label>
                      <Input
                        type="date"
                        value={vistoriaData.data_incidente || ""}
                        onChange={(e) => setVistoriaData({ ...vistoriaData, data_incidente: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Placa do Veículo</Label>
                      <Input
                        value={vistoriaData.veiculo_placa || ""}
                        onChange={(e) => setVistoriaData({ ...vistoriaData, veiculo_placa: e.target.value })}
                        placeholder="ABC1234 ou ABC1D23"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Relato do Incidente</Label>
                    <Textarea
                      value={vistoriaData.relato_incidente || ""}
                      onChange={(e) => setVistoriaData({ ...vistoriaData, relato_incidente: e.target.value })}
                      rows={3}
                    />
                  </div>

                  {/* Dados do Cliente */}
                  <div className="border rounded-lg p-4 space-y-4">
                    <h3 className="font-semibold text-sm text-muted-foreground">Dados do Cliente</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input
                          value={vistoriaData.cliente_nome || ""}
                          onChange={(e) => setVistoriaData({ ...vistoriaData, cliente_nome: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>CPF</Label>
                        <MaskedInput
                          mask="cpf"
                          value={vistoriaData.cliente_cpf || ""}
                          onChange={(value) => setVistoriaData({ ...vistoriaData, cliente_cpf: value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Telefone</Label>
                        <MaskedInput
                          mask="phone"
                          value={vistoriaData.cliente_telefone || ""}
                          onChange={(value) => setVistoriaData({ ...vistoriaData, cliente_telefone: value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          value={vistoriaData.cliente_email || ""}
                          onChange={(e) => setVistoriaData({ ...vistoriaData, cliente_email: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dados do Veículo */}
                  <div className="border rounded-lg p-4 space-y-4">
                    <h3 className="font-semibold text-sm text-muted-foreground">Dados do Veículo</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Tipo de Veículo</Label>
                        <Select
                          value={vehicleType || vistoriaData.veiculo_tipo || ""}
                          onValueChange={(value) => {
                            setVehicleType(value);
                            setVistoriaData((prev) => ({ ...prev, veiculo_tipo: value }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="carro">Carro</SelectItem>
                            <SelectItem value="moto">Moto</SelectItem>
                            <SelectItem value="caminhao_onibus">Caminhão/Ônibus</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Marca (FIPE)</Label>
                        <Select
                          value={selectedMarcaCode}
                          onValueChange={(value) => {
                            setSelectedMarcaCode(value);
                            const marcaNome = marcas.find((m) => m.codigo === value)?.nome || "";
                            setVistoriaData((prev) => ({ ...prev, veiculo_marca: marcaNome }));
                          }}
                          disabled={!vehicleType}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={vehicleType ? "Selecione a marca" : "Selecione o tipo primeiro"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {marcas.map((marca) => (
                              <SelectItem key={marca.codigo} value={marca.codigo}>
                                {marca.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Modelo (FIPE)</Label>
                        <Select
                          value={selectedModeloCode}
                          onValueChange={(value) => {
                            setSelectedModeloCode(value);
                            const modeloNome = modelos.find((m) => m.codigo === value)?.nome || "";
                            setVistoriaData((prev) => ({ ...prev, veiculo_modelo: modeloNome }));
                          }}
                          disabled={!selectedMarcaCode}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={selectedMarcaCode ? "Selecione o modelo" : "Selecione a marca"} />
                          </SelectTrigger>
                          <SelectContent>
                            {modelos.map((modelo) => (
                              <SelectItem key={modelo.codigo} value={modelo.codigo}>
                                {modelo.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Ano (FIPE)</Label>
                        <Select
                          value={selectedAnoCode}
                          onValueChange={(value) => {
                            setSelectedAnoCode(value);
                            const anoNome = anos.find((a) => a.codigo === value)?.nome || "";
                            setVistoriaData((prev) => ({ ...prev, veiculo_ano: anoNome }));
                          }}
                          disabled={!selectedModeloCode}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={selectedModeloCode ? "Selecione o ano" : "Selecione o modelo"} />
                          </SelectTrigger>
                          <SelectContent>
                            {anos.map((ano) => (
                              <SelectItem key={ano.codigo} value={ano.codigo}>
                                {ano.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Cor</Label>
                        <Select
                          value={vistoriaData.veiculo_cor || ""}
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
                        <Label>Chassi</Label>
                        <Input
                          value={vistoriaData.veiculo_chassi || ""}
                          onChange={(e) => setVistoriaData({ ...vistoriaData, veiculo_chassi: e.target.value })}
                          placeholder="Número do chassi"
                        />
                      </div>
                    </div>

                    {/* Valor FIPE */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Valor FIPE</Label>
                        {loadingFipe && (
                          <span className="text-xs text-muted-foreground">Consultando FIPE automaticamente...</span>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <CurrencyInput
                          value={vistoriaData.veiculo_valor_fipe || 0}
                          onValueChange={(value) =>
                            setVistoriaData((prev) => ({
                              ...prev,
                              veiculo_valor_fipe: value,
                            }))
                          }
                          disabled={!enableManualFipe}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setEnableManualFipe((prev) => !prev)}
                        >
                          <Lock className={cn("h-4 w-4", enableManualFipe && "text-amber-500")} />
                        </Button>
                      </div>
                      {fipeError && <p className="text-xs text-amber-600 mt-1">{fipeError}</p>}
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <Button type="button" variant="outline" onClick={handleSalvarCustos}>
                      Salvar Dados
                    </Button>

                    <div className="flex gap-2">
                      {vistoriaId && (
                        <Button type="button" variant="outline" onClick={handleGerarLinkVistoria}>
                          <Link2 className="mr-2 h-4 w-4" />
                          Gerar/Atualizar Link de Vistoria
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ABA ANÁLISE (EntrevistaTab) */}
              <TabsContent value="entrevista" className="mt-0 p-4">
                {atendimento?.id ? (
                  <EntrevistaTab atendimentoId={atendimento.id} vistoriaData={vistoriaData} />
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    Salve o atendimento para acessar a Análise
                  </div>
                )}
              </TabsContent>

              {/* ABA ANDAMENTOS */}
              <TabsContent value="andamentos" className="mt-0 p-4">
                {atendimento?.id ? (
                  <AndamentosList
                    key={reloadKey}
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

              {/* ABA ANEXOS */}
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

              {/* ABA CUSTOS */}
              <TabsContent value="custos" className="mt-0 p-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Custo Oficina</Label>
                      <CurrencyInput
                        value={custos.custo_oficina}
                        onValueChange={(value) => setCustos((prev) => ({ ...prev, custo_oficina: value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Custo Reparo</Label>
                      <CurrencyInput
                        value={custos.custo_reparo}
                        onValueChange={(value) => setCustos((prev) => ({ ...prev, custo_reparo: value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Custo Acordo</Label>
                      <CurrencyInput
                        value={custos.custo_acordo}
                        onValueChange={(value) => setCustos((prev) => ({ ...prev, custo_acordo: value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Custo Terceiros</Label>
                      <CurrencyInput
                        value={custos.custo_terceiros}
                        onValueChange={(value) => setCustos((prev) => ({ ...prev, custo_terceiros: value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Custo Perda Total</Label>
                      <CurrencyInput
                        value={custos.custo_perda_total}
                        onValueChange={(value) => setCustos((prev) => ({ ...prev, custo_perda_total: value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Custo Perda Parcial</Label>
                      <CurrencyInput
                        value={custos.custo_perda_parcial}
                        onValueChange={(value) => setCustos((prev) => ({ ...prev, custo_perda_parcial: value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor Franquia</Label>
                      <CurrencyInput
                        value={custos.valor_franquia}
                        onValueChange={(value) => setCustos((prev) => ({ ...prev, valor_franquia: value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor Indenização</Label>
                      <CurrencyInput
                        value={custos.valor_indenizacao}
                        onValueChange={(value) => setCustos((prev) => ({ ...prev, valor_indenizacao: value }))}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <Button type="button" variant="outline" onClick={handleSalvarCustos}>
                      Salvar Custos
                    </Button>

                    {userRole === "admin" && (
                      <Button type="button" variant="destructive" onClick={() => setShowConclusaoDialog(true)}>
                        Concluir Manualmente
                      </Button>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ABA HISTÓRICO */}
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

      {/* DIALOG CONCLUSÃO MANUAL */}
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
