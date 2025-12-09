import LogoUon1 from "@/assets/logo-uon1.png";
import { useState, useMemo, useEffect } from "react";
import { Atendimento, StatusType } from "@/types/atendimento";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ListView } from "@/components/ListView";
import { Toolbar } from "@/components/Toolbar";
import { AtendimentoDialog } from "@/components/AtendimentoDialog";
import { AndamentosDialog } from "@/components/AndamentosDialog";
import { StatusConfigDialog } from "@/components/StatusConfigDialog";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertasDialog } from "@/components/AlertasDialog";
import { ArquivoDialog } from "@/components/ArquivoDialog";
import { UserProfile } from "@/components/UserProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useAuth } from "@/hooks/useAuth";
import { useOverdueAtendimentos } from "@/hooks/useOverdueAtendimentos";
import { useFluxoPermissions } from "@/hooks/useFluxoPermissions";
import { toUTC, now } from "@/utils/dateUtils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Settings2, Workflow, Link2 } from "lucide-react";
import { FluxoSelector } from "@/components/FluxoSelector";
import { WorkflowConfigDialog } from "@/components/WorkflowConfigDialog";
import { FluxoVisualizationDialog } from "@/components/FluxoVisualizationDialog";
import { AcompanhamentoLinkDialog } from "@/components/AcompanhamentoLinkDialog";
import { NovoAtendimentoDialog } from "@/components/NovoAtendimentoDialog";
import { ConcluirFluxoManualDialog } from "@/components/ConcluirFluxoManualDialog";

const Index = () => {
  const isMobile = useIsMobile();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [corretoras, setCorretoras] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"kanban" | "list">(isMobile ? "list" : "kanban");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterResponsavel, setFilterResponsavel] = useState("all");
  const [filterCorretora, setFilterCorretora] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAtendimento, setEditingAtendimento] = useState<Atendimento | null>(null);
  const [andamentosDialogOpen, setAndamentosDialogOpen] = useState(false);
  const [selectedAtendimento, setSelectedAtendimento] = useState<Atendimento | null>(null);
  const [arquivoRefreshKey, setArquivoRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [logoUrl] = useLocalStorage<string>("app-logo-url", "");
  const [statusConfigOpen, setStatusConfigOpen] = useState(false);
  const [workflowConfigOpen, setWorkflowConfigOpen] = useState(false);
  const [fluxoVisualizationOpen, setFluxoVisualizationOpen] = useState(false);
  const [acompanhamentoLinkOpen, setAcompanhamentoLinkOpen] = useState(false);
  const [novoAtendimentoDialogOpen, setNovoAtendimentoDialogOpen] = useState(false);
  const [concluirFluxoDialogOpen, setConcluirFluxoDialogOpen] = useState(false);
  const [pendingConcluirData, setPendingConcluirData] = useState<{
    atendimentoId: string;
    currentFluxoId: string;
    currentStatus: string;
  } | null>(null);
  const [selectedFluxoId, setSelectedFluxoId] = useState<string | null>(null);
  const [statusPrazo, setStatusPrazo] = useState<Record<string, number>>({});
  const [userRole, setUserRole] = useState<string>("");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { overdueCount, refresh: refreshOverdue } = useOverdueAtendimentos();
  const { canViewFluxo, canEditFluxo } = useFluxoPermissions(user?.id);

  // Capitalize user name
  const userName = user?.user_metadata?.nome
    ? user.user_metadata.nome.charAt(0).toUpperCase() + user.user_metadata.nome.slice(1)
    : "";

  // Load atendimentos from Supabase
  useEffect(() => {
    loadAtendimentos();
    loadCorretoras();
    loadStatusPrazo();
    loadUserRole();

    // Subscribe to realtime changes - with debounce to avoid constant reloads
    const atendimentosChannel = supabase
      .channel("atendimentos_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "atendimentos",
        },
        () => {
          // Only reload if dialog is not open to avoid losing user input
          if (!dialogOpen) {
            loadAtendimentos();
          }
        },
      )
      .subscribe();

    // Subscribe to realtime changes for status_config
    const statusConfigChannel = supabase
      .channel("status_config_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "status_config",
        },
        () => {
          loadStatusPrazo();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(atendimentosChannel);
      supabase.removeChannel(statusConfigChannel);
    };
  }, [selectedFluxoId, dialogOpen]);

  // *** AJUSTADO: aceita fluxoId opcional para evitar bug de estado assíncrono ***
  const loadAtendimentos = async (fluxoId?: string | null) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        sonnerToast.error("Você precisa estar logado");
        return;
      }

      let query = supabase
        .from("atendimentos")
        .select(
          `
          *,
          corretora:corretoras(nome, email),
          contato:contatos(nome),
          responsavel:profiles(nome)
        `,
        )
        .eq("arquivado", false);

      const fluxoFiltro = fluxoId ?? selectedFluxoId;

      // Filter by fluxo if selected
      if (fluxoFiltro) {
        query = query.eq("fluxo_id", fluxoFiltro);
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });
      if (error) throw error;

      const mappedData: Atendimento[] = data.map((item: any) => ({
        id: item.id,
        numero: item.numero,
        corretora: item.corretora?.nome || "",
        corretoraId: item.corretora_id,
        corretoraEmail: item.corretora?.email || "",
        contato: item.contato?.nome || "",
        assunto: item.assunto,
        prioridade: item.prioridade,
        responsavel: item.responsavel?.nome || "",
        status: item.status,
        tags: item.tags || [],
        observacoes: item.observacoes || "",
        dataRetorno: item.data_retorno,
        dataConcluido: item.data_concluido,
        fluxoConcluido: item.fluxo_concluido_nome,
        fluxoConcluidoId: item.fluxo_concluido_id,
        fluxoId: item.fluxo_id,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));
      setAtendimentos(mappedData);
    } catch (error: any) {
      console.error("Erro ao carregar atendimentos:", error);
      sonnerToast.error("Erro ao carregar atendimentos");
    } finally {
      setLoading(false);
    }
  };

  const loadCorretoras = async () => {
    try {
      const { data, error } = await supabase.from("corretoras").select("nome").order("nome");
      if (error) throw error;
      setCorretoras(data.map((c) => c.nome));
    } catch (error: any) {
      console.error("Erro ao carregar corretoras:", error);
    }
  };

  const loadStatusPrazo = async () => {
    try {
      const { data, error } = await supabase.from("status_config").select("nome, prazo_horas").eq("ativo", true);
      if (error) throw error;
      const prazoMap: Record<string, number> = {};
      data?.forEach((status) => {
        prazoMap[status.nome] = status.prazo_horas;
      });
      setStatusPrazo(prazoMap);
    } catch (error: any) {
      console.error("Erro ao carregar prazos de status:", error);
    }
  };

  const loadUserRole = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
      if (error) throw error;
      setUserRole(data?.role || "");
    } catch (error: any) {
      console.error("Erro ao carregar role do usuário:", error);
    }
  };

  const canManageStatus = userRole === "superintendente" || userRole === "admin";

  // Get unique responsaveis from atendimentos
  const responsaveis = useMemo(() => {
    const unique = new Set(atendimentos.map((a) => a.responsavel).filter(Boolean));
    return Array.from(unique);
  }, [atendimentos]);

  // Filter atendimentos
  const filteredAtendimentos = useMemo(() => {
    return atendimentos.filter((atendimento) => {
      // Filtro de permissões de fluxo
      if (!canViewFluxo(atendimento.fluxoId || selectedFluxoId)) {
        return false;
      }

      const matchesSearch =
        searchTerm === "" ||
        atendimento.assunto.toLowerCase().includes(searchTerm.toLowerCase()) ||
        atendimento.corretora.toLowerCase().includes(searchTerm.toLowerCase()) ||
        atendimento.contato?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        atendimento.tags?.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesPriority = filterPriority === "all" || atendimento.prioridade === filterPriority;
      const matchesResponsavel = filterResponsavel === "all" || atendimento.responsavel === filterResponsavel;
      const matchesCorretora = filterCorretora === "all" || atendimento.corretora === filterCorretora;

      return matchesSearch && matchesPriority && matchesResponsavel && matchesCorretora;
    });
  }, [atendimentos, searchTerm, filterPriority, filterResponsavel, filterCorretora, canViewFluxo, selectedFluxoId]);

  const handleSaveAtendimento = async (atendimento: Atendimento) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        sonnerToast.error("Você precisa estar logado");
        return;
      }

      const existing = atendimentos.find((a) => a.id === atendimento.id);

      // Get corretora_id if exists
      let corretoraId = atendimento.corretoraId;
      if (!corretoraId && atendimento.corretora) {
        const { data: corretoraData } = await supabase
          .from("corretoras")
          .select("id")
          .eq("nome", atendimento.corretora)
          .maybeSingle();

        if (!corretoraData) {
          // Create new corretora
          const { data: newCorretora, error: corretoraError } = await supabase
            .from("corretoras")
            .insert({
              nome: atendimento.corretora,
            })
            .select()
            .single();

          if (corretoraError) throw corretoraError;
          corretoraId = newCorretora.id;
        } else {
          corretoraId = corretoraData.id;
        }
      }

      // Get contato_id if exists
      let contatoId = null;
      if (atendimento.contato) {
        const { data: contatoData } = await supabase
          .from("contatos")
          .select("id")
          .eq("nome", atendimento.contato)
          .maybeSingle();
        if (contatoData) {
          contatoId = contatoData.id;
        }
      }

      // Get responsavel_id
      let responsavelId = user.id;
      if (atendimento.responsavel) {
        const { data: responsavelData } = await supabase
          .from("profiles")
          .select("id")
          .eq("nome", atendimento.responsavel)
          .maybeSingle();
        if (responsavelData) {
          responsavelId = responsavelData.id;
        }
      }

      // Get first status of selected fluxo for new atendimentos
      let statusToUse = atendimento.status;
      if (!existing && selectedFluxoId) {
        const { data: firstStatus } = await supabase
          .from("status_config")
          .select("nome")
          .eq("fluxo_id", selectedFluxoId)
          .eq("ativo", true)
          .order("ordem")
          .limit(1)
          .single();
        if (firstStatus) {
          statusToUse = firstStatus.nome;
        }
      }

      const dataToSave = {
        assunto: atendimento.assunto,
        observacoes: atendimento.observacoes,
        prioridade: atendimento.prioridade,
        status: statusToUse,
        tags: atendimento.tags,
        corretora_id: corretoraId,
        contato_id: contatoId,
        responsavel_id: responsavelId || user.id,
        user_id: user.id,
        data_retorno: atendimento.dataRetorno || null,
        fluxo_id: selectedFluxoId,
      };

      if (existing) {
        // Track changes for history
        const camposAlterados: string[] = [];
        const valoresAnteriores: Record<string, any> = {};
        const valoresNovos: Record<string, any> = {};

        // Compare values to detect changes
        const fieldsToTrack = [
          "assunto",
          "status",
          "prioridade",
          "observacoes",
          "data_retorno",
          "responsavel_id",
          "corretora_id",
          "contato_id",
          "tags",
        ];

        const { data: oldData } = await supabase.from("atendimentos").select("*").eq("id", atendimento.id).single();

        if (oldData) {
          fieldsToTrack.forEach((field) => {
            const oldValue = oldData[field];
            const newValue = (dataToSave as any)[field];
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
              camposAlterados.push(field);
              valoresAnteriores[field] = oldValue;
              valoresNovos[field] = newValue;
            }
          });
        }

        const { error } = await supabase.from("atendimentos").update(dataToSave).eq("id", atendimento.id);
        if (error) throw error;

        // Register history if there are changes
        if (camposAlterados.length > 0) {
          const { data: session } = await supabase.auth.getSession();
          if (session?.session) {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/registrar-historico-atendimento`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                atendimento_id: atendimento.id,
                acao: "Atualização",
                campos_alterados: camposAlterados,
                valores_anteriores: valoresAnteriores,
                valores_novos: valoresNovos,
              }),
            });
          }
        }
        sonnerToast.success("Atendimento atualizado com sucesso!");
      } else {
        const { data: newAtendimento, error } = await supabase
          .from("atendimentos")
          .insert(dataToSave)
          .select()
          .single();
        if (error) throw error;

        // Register creation in history
        const { data: session } = await supabase.auth.getSession();
        if (session?.session && newAtendimento) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/registrar-historico-atendimento`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              atendimento_id: newAtendimento.id,
              acao: "Criação",
            }),
          });
        }
        sonnerToast.success("Atendimento criado com sucesso!");
      }

      // Reload data
      await loadAtendimentos();
      await loadCorretoras();

      // Create or update calendar event if dataRetorno is set
      if (atendimento.dataRetorno) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const dataRetorno = new Date(atendimento.dataRetorno);
        dataRetorno.setHours(12, 0, 0, 0);

        const eventoData = {
          titulo: `Follow-up: ${atendimento.assunto}`,
          data_inicio: toUTC(dataRetorno),
          data_fim: toUTC(dataRetorno),
          descricao: `Retorno de atendimento\nCorretora: ${atendimento.corretora}\nContato: ${atendimento.contato}\n\n${
            atendimento.observacoes || ""
          }`,
          tipo: "follow-up",
          cor: "#f59e0b",
          lembrete_minutos: [30, 60],
          user_id: user.id,
        };

        await supabase.from("eventos").insert(eventoData);
        sonnerToast.success("Compromisso criado na agenda!");
      }

      setEditingAtendimento(null);
      setDialogOpen(false);
    } catch (error: any) {
      console.error("Erro ao salvar atendimento:", error);
      sonnerToast.error(error.message || "Erro ao salvar atendimento");
    }
  };

  // *** AJUSTADO: já muda fluxo_id, pega primeiro status do novo fluxo e recarrega usando esse fluxo ***
  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      // Busca o atendimento para pegar o fluxo atual
      const { data: atendimentoData, error: atendimentoError } = await supabase
        .from("atendimentos")
        .select("fluxo_id")
        .eq("id", id)
        .single();

      if (atendimentoError) throw atendimentoError;

      const fluxoAtualId = atendimentoData?.fluxo_id || selectedFluxoId;

      // Verificar se pode editar o fluxo
      if (!canEditFluxo(fluxoAtualId)) {
        sonnerToast.error("Você não tem permissão para editar atendimentos deste fluxo");
        return;
      }

      let fluxoParaSalvar = fluxoAtualId;
      let statusParaSalvar = newStatus;

      // Checar config do status atual
      const { data: statusConfig } = await supabase
        .from("status_config")
        .select("is_final, tipo_etapa, fluxo_id, nome")
        .eq("nome", newStatus)
        .eq("fluxo_id", fluxoAtualId)
        .eq("ativo", true)
        .single();

      // Se for status final, verifica se precisa mudar de fluxo
      if (statusConfig?.is_final && fluxoAtualId) {
        const { data: fluxoData } = await supabase
          .from("fluxos")
          .select("gera_proximo_automatico, proximo_fluxo_id")
          .eq("id", fluxoAtualId)
          .single();

        if (fluxoData?.gera_proximo_automatico && fluxoData.proximo_fluxo_id) {
          fluxoParaSalvar = fluxoData.proximo_fluxo_id;

          // Buscar o primeiro status do próximo fluxo
          const { data: firstStatusNextFluxo } = await supabase
            .from("status_config")
            .select("nome")
            .eq("fluxo_id", fluxoParaSalvar)
            .eq("ativo", true)
            .order("ordem")
            .limit(1)
            .single();

          if (firstStatusNextFluxo) {
            statusParaSalvar = firstStatusNextFluxo.nome;
          }

          // Atualiza o fluxo selecionado na UI para acompanhar o card
          setSelectedFluxoId(fluxoParaSalvar);
        } else {
          // Não tem encadeamento automático - mostrar dialog para escolha manual
          // Primeiro salva o status atual
          const updateData: any = {
            status: statusParaSalvar,
            updated_at: new Date().toISOString(),
            status_changed_at: new Date().toISOString(),
            fluxo_id: fluxoParaSalvar,
          };
          
          await supabase.from("atendimentos").update(updateData).eq("id", id);
          await loadAtendimentos(fluxoParaSalvar);
          
          // Abre o dialog perguntando se quer mover para outro fluxo
          setPendingConcluirData({
            atendimentoId: id,
            currentFluxoId: fluxoAtualId,
            currentStatus: newStatus,
          });
          setConcluirFluxoDialogOpen(true);
          return;
        }
      }

      const updateData: any = {
        status: statusParaSalvar,
        updated_at: new Date().toISOString(),
        status_changed_at: new Date().toISOString(),
        fluxo_id: fluxoParaSalvar,
      };

      // Atualiza no banco
      const { error: updateError } = await supabase.from("atendimentos").update(updateData).eq("id", id);
      if (updateError) throw updateError;

      // Recarrega usando já o novo fluxo (se tiver mudado)
      await loadAtendimentos(fluxoParaSalvar);

      if (fluxoParaSalvar !== fluxoAtualId) {
        sonnerToast.success("Card movido para o próximo fluxo e posicionado no primeiro status!");
      } else if (!statusConfig?.is_final) {
        sonnerToast.success("Status atualizado!");
      }
    } catch (error: any) {
      console.error("Erro ao atualizar status:", error);
      sonnerToast.error("Erro ao atualizar status");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("atendimentos").delete().eq("id", id);
      if (error) throw error;
      await loadAtendimentos();
      sonnerToast.success("Atendimento excluído!");
    } catch (error: any) {
      console.error("Erro ao excluir atendimento:", error);
      sonnerToast.error("Erro ao excluir atendimento");
    }
  };

  const handleArquivar = async (id: string) => {
    try {
      // Mark as archived in database instead of localStorage
      const { error } = await supabase
        .from("atendimentos")
        .update({
          arquivado: true,
        })
        .eq("id", id);
      if (error) throw error;
      await loadAtendimentos();

      // Trigger refresh of ArquivoDialog
      setArquivoRefreshKey((prev) => prev + 1);
      sonnerToast.success("Atendimento arquivado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao arquivar atendimento:", error);
      sonnerToast.error("Erro ao arquivar atendimento");
    }
  };

  const handleRestaurar = async (atendimento: Atendimento) => {
    try {
      // Restore from archive by updating arquivado flag
      const { error } = await supabase
        .from("atendimentos")
        .update({
          arquivado: false,
        })
        .eq("id", atendimento.id);
      if (error) throw error;
      await loadAtendimentos();

      // Trigger refresh of ArquivoDialog
      setArquivoRefreshKey((prev) => prev + 1);
      sonnerToast.success("Atendimento restaurado!");
    } catch (error: any) {
      console.error("Erro ao restaurar atendimento:", error);
      sonnerToast.error("Erro ao restaurar atendimento");
    }
  };

  const handleEdit = (atendimento: Atendimento) => {
    // Verificar se pode editar o fluxo
    if (!canEditFluxo(atendimento.fluxoId || selectedFluxoId)) {
      sonnerToast.error("Você não tem permissão para editar atendimentos deste fluxo");
      return;
    }
    setEditingAtendimento(atendimento);
    setDialogOpen(true);
  };

  const handleViewAndamentos = (atendimento: Atendimento) => {
    setSelectedAtendimento(atendimento);
    setAndamentosDialogOpen(true);
  };

  const handleNewAtendimento = () => {
    setNovoAtendimentoDialogOpen(true);
  };

  const handleConcluirFluxoManual = async (fluxoId: string | null, status: string | null) => {
    if (!pendingConcluirData) return;
    
    if (fluxoId && status) {
      try {
        // Mover para o novo fluxo e status
        const { error } = await supabase
          .from("atendimentos")
          .update({
            fluxo_id: fluxoId,
            status: status,
            updated_at: new Date().toISOString(),
            status_changed_at: new Date().toISOString(),
          })
          .eq("id", pendingConcluirData.atendimentoId);
        
        if (error) throw error;
        
        setSelectedFluxoId(fluxoId);
        await loadAtendimentos(fluxoId);
        sonnerToast.success("Card movido para o fluxo selecionado!");
      } catch (error) {
        console.error("Erro ao mover card:", error);
        sonnerToast.error("Erro ao mover card para o novo fluxo");
      }
    } else {
      sonnerToast.success("Card finalizado com sucesso!");
    }
    
    setPendingConcluirData(null);
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(atendimentos, null, 2);
    const dataBlob = new Blob([dataStr], {
      type: "application/json",
    });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `atendimentos-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    toast({
      title: "JSON exportado com sucesso!",
    });
  };

  const handleExportCSV = () => {
    const headers = [
      "ID",
      "Corretora",
      "Contato",
      "Assunto",
      "Prioridade",
      "Responsável",
      "Status",
      "Tags",
      "Observações",
      "Criado em",
    ];
    const rows = atendimentos.map((a) => [
      a.id,
      a.corretora,
      a.contato || "",
      a.assunto,
      a.prioridade,
      a.responsavel,
      a.status,
      a.tags?.join("; ") || "",
      a.observacoes || "",
      new Date(a.createdAt).toLocaleString("pt-BR"),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `atendimentos-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast({
      title: "CSV exportado com sucesso!",
    });
  };

  const handleImportJSON = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target?.result as string);
            setAtendimentos(imported);
            toast({
              title: "Dados importados com sucesso!",
            });
          } catch {
            toast({
              title: "Erro ao importar arquivo",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleManageCorretoras = () => {
    navigate("/corretoras");
  };

  const handleManageContatos = () => {
    navigate("/contatos");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Gestão de Atendimentos</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <AlertasDialog overdueCount={overdueCount} />

              {canManageStatus && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAcompanhamentoLinkOpen(true)}
                    title="Link de Acompanhamento para Clientes"
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate("/configuracao-status-publico")}
                    title="Configurar Status Públicos"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFluxoVisualizationOpen(true)}
                    title="Visualizar Fluxo Completo"
                  >
                    <Workflow className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setWorkflowConfigOpen(true)}
                    title="Configurar Fluxos e Status"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </>
              )}

              <ArquivoDialog onRestaurar={handleRestaurar} refreshKey={arquivoRefreshKey} />
              <UserProfile />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-b border-border/50">
        <div className="container mx-auto px-6 py-4">
          <Toolbar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            filterPriority={filterPriority}
            onFilterPriorityChange={setFilterPriority}
            filterResponsavel={filterResponsavel}
            onFilterResponsavelChange={setFilterResponsavel}
            filterCorretora={filterCorretora}
            onFilterCorretoraChange={setFilterCorretora}
            corretoras={corretoras}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onNewAtendimento={handleNewAtendimento}
            onExportJSON={handleExportJSON}
            onImportJSON={handleImportJSON}
            onManageCorretoras={handleManageCorretoras}
            onManageContatos={handleManageContatos}
            responsaveis={responsaveis}
          />
        </div>
      </div>

      <div className="bg-card border-b border-border/50">
        <div className="container mx-auto px-6 py-3 bg-slate-100">
          <FluxoSelector
            selectedFluxoId={selectedFluxoId}
            onFluxoSelect={setSelectedFluxoId}
            onConfigureFluxos={() => setWorkflowConfigOpen(true)}
          />
        </div>
      </div>

      <main className="container mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Carregando atendimentos...</p>
            </div>
          </div>
        ) : viewMode === "kanban" ? (
          <KanbanBoard
            atendimentos={filteredAtendimentos}
            onUpdateStatus={handleUpdateStatus}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onArquivar={handleArquivar}
            onViewAndamentos={handleViewAndamentos}
            statusPrazo={statusPrazo}
            selectedFluxoId={selectedFluxoId}
          />
        ) : (
          <ListView
            atendimentos={filteredAtendimentos}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onArquivar={handleArquivar}
            onViewAndamentos={handleViewAndamentos}
          />
        )}
      </main>

      <AtendimentoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        atendimento={editingAtendimento}
        onSave={handleSaveAtendimento}
        corretoras={corretoras}
        responsaveis={responsaveis}
      />

      <AndamentosDialog
        open={andamentosDialogOpen}
        onOpenChange={setAndamentosDialogOpen}
        atendimentoId={selectedAtendimento?.id || ""}
        atendimentoAssunto={selectedAtendimento?.assunto || ""}
        atendimentoNumero={selectedAtendimento?.numero}
        mode="view"
      />

      <WorkflowConfigDialog
        open={workflowConfigOpen}
        onOpenChange={setWorkflowConfigOpen}
        onConfigChange={() => {
          loadStatusPrazo();
          loadAtendimentos();
          refreshOverdue();
        }}
      />

      <FluxoVisualizationDialog open={fluxoVisualizationOpen} onOpenChange={setFluxoVisualizationOpen} />

      <AcompanhamentoLinkDialog open={acompanhamentoLinkOpen} onOpenChange={setAcompanhamentoLinkOpen} />

      <NovoAtendimentoDialog open={novoAtendimentoDialogOpen} onOpenChange={setNovoAtendimentoDialogOpen} />

      {pendingConcluirData && (
        <ConcluirFluxoManualDialog
          open={concluirFluxoDialogOpen}
          onOpenChange={setConcluirFluxoDialogOpen}
          atendimentoId={pendingConcluirData.atendimentoId}
          currentFluxoId={pendingConcluirData.currentFluxoId}
          currentStatus={pendingConcluirData.currentStatus}
          onConfirm={handleConcluirFluxoManual}
        />
      )}
    </div>
  );
};

export default Index;
