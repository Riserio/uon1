import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  FileText,
  Camera,
  BarChart3,
  Plus,
  DollarSign,
  Building2,
  Wrench,
  Users,
  Car,
  Eye,
  Link2,
  MessageCircle,
  Mail,
} from "lucide-react";
import { ClaimCard, Claim } from "@/components/ClaimCard";
import { ClaimStats } from "@/components/ClaimStats";
import { ClaimFilters } from "@/components/ClaimFilters";
import { useAuth } from "@/hooks/useAuth";
import { useFluxoPermissions } from "@/hooks/useFluxoPermissions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];

interface Vistoria {
  id: string;
  numero: number;
  status: string;
  cliente_nome: string;
  veiculo_placa: string;
  created_at: string;
  link_token: string;
  corretora_id?: string;
  tipo_sinistro?: string;
  custo_oficina?: number;
  custo_reparo?: number;
  custo_acordo?: number;
  custo_terceiros?: number;
  custo_perda_total?: number;
  custo_perda_parcial?: number;
}

interface StatusConfig {
  nome: string;
  cor: string;
  ordem: number;
}

type TabType = "vistorias" | "acompanhamento" | "dashboard";

export default function Sinistros() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canViewFluxo } = useFluxoPermissions(user?.id);
  const [activeTab, setActiveTab] = useState<TabType>("vistorias");
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [loading, setLoading] = useState(false);

  // Acompanhamento states
  const [claims, setClaims] = useState<Claim[]>([]);
  const [statusConfigs, setStatusConfigs] = useState<StatusConfig[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCorretora, setSelectedCorretora] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [corretoras, setCorretoras] = useState<string[]>([]);

  // Dashboard states
  const [dashboardStats, setDashboardStats] = useState<any>({});
  const [statusData, setStatusData] = useState<any[]>([]);
  const [tipoData, setTipoData] = useState<any[]>([]);
  const [fluxoData, setFluxoData] = useState<any[]>([]);
  const [dashboardCorretoras, setDashboardCorretoras] = useState<any[]>([]);
  const [selectedDashboardCorretora, setSelectedDashboardCorretora] = useState("all");

  useEffect(() => {
    if (activeTab === "vistorias") {
      loadVistorias();
    } else if (activeTab === "acompanhamento") {
      loadAcompanhamento();
    } else if (activeTab === "dashboard") {
      loadDashboard();
    }
  }, [activeTab, selectedDashboardCorretora]);

  const loadVistorias = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("vistorias").select("*").order("created_at", { ascending: false });

      if (error) throw error;
      setVistorias(data || []);
    } catch (error) {
      console.error("Erro ao carregar vistorias:", error);
      toast.error("Erro ao carregar vistorias");
    } finally {
      setLoading(false);
    }
  };

  const loadAcompanhamento = async () => {
    try {
      setLoading(true);

      const { data: statusData, error: statusError } = await supabase
        .from("status_config")
        .select("nome, cor, ordem")
        .eq("ativo", true)
        .order("ordem");

      if (statusError) throw statusError;
      setStatusConfigs(statusData || []);

      const { data: corretorasData } = await supabase.from("corretoras").select("nome").order("nome");
      setCorretoras(corretorasData?.map((c) => c.nome) || []);

      const { data: atendimentosData, error: atendimentosError } = await supabase
        .from("atendimentos")
        .select(
          `
          id,
          numero,
          assunto,
          status,
          observacoes,
          created_at,
          updated_at,
          fluxo_id
        `,
        )
        .order("created_at", { ascending: false });

      if (atendimentosError) throw atendimentosError;

      const atendimentoIds = (atendimentosData || []).map((a) => a.id);
      const { data: vistoriasData } = await supabase
        .from("vistorias")
        .select(
          `
          atendimento_id,
          veiculo_placa,
          custo_oficina,
          custo_reparo,
          custo_acordo,
          custo_terceiros,
          custo_perda_total,
          custo_perda_parcial,
          valor_franquia,
          valor_indenizacao
        `,
        )
        .in("atendimento_id", atendimentoIds);

      const { data: historicoData } = await supabase
        .from("atendimentos_historico")
        .select("atendimento_id, acao, created_at, campos_alterados")
        .in("atendimento_id", atendimentoIds)
        .order("created_at", { ascending: true });

      const claimsWithTimeline: Claim[] = (atendimentosData || [])
        .filter((atendimento) => canViewFluxo(atendimento.fluxo_id))
        .map((atendimento) => {
          const statusConfig = statusData?.find((s) => s.nome === atendimento.status);
          const vistoria = vistoriasData?.find((v) => v.atendimento_id === atendimento.id);

          const historico = historicoData?.filter((h) => h.atendimento_id === atendimento.id) || [];
          const timeline = [
            {
              date: atendimento.created_at,
              title: "Sinistro Registrado",
              description: "Protocolo aberto automaticamente",
            },
            ...historico.map((h) => ({
              date: h.created_at,
              title: h.acao,
              description: Array.isArray(h.campos_alterados)
                ? `Campos alterados: ${h.campos_alterados.join(", ")}`
                : "Atualização realizada",
            })),
          ];

          return {
            id: atendimento.id,
            numero: atendimento.numero,
            assunto: atendimento.assunto,
            created_at: atendimento.created_at,
            status: atendimento.status,
            statusColor: statusConfig?.cor || "#6b7280",
            observacoes: atendimento.observacoes,
            veiculo_placa: vistoria?.veiculo_placa,
            custo_oficina: vistoria?.custo_oficina,
            custo_reparo: vistoria?.custo_reparo,
            custo_acordo: vistoria?.custo_acordo,
            custo_terceiros: vistoria?.custo_terceiros,
            custo_perda_total: vistoria?.custo_perda_total,
            custo_perda_parcial: vistoria?.custo_perda_parcial,
            valor_franquia: vistoria?.valor_franquia,
            valor_indenizacao: vistoria?.valor_indenizacao,
            timeline,
          };
        });

      setClaims(claimsWithTimeline);
    } catch (error) {
      console.error("Erro ao carregar acompanhamento:", error);
      toast.error("Erro ao carregar dados de acompanhamento");
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const { data: corretorasData } = await supabase.from("corretoras").select("id, nome").order("nome");
      setDashboardCorretoras(corretorasData || []);

      let query = supabase.from("vistorias").select("*").order("created_at", { ascending: false });
      if (selectedDashboardCorretora !== "all") query = query.eq("corretora_id", selectedDashboardCorretora);

      const { data: vistoriasData } = await query;
      if (!vistoriasData) return;

      const custoTotal = vistoriasData.reduce(
        (sum, v) =>
          sum +
          (Number(v.custo_oficina) || 0) +
          (Number(v.custo_reparo) || 0) +
          (Number(v.custo_acordo) || 0) +
          (Number(v.custo_terceiros) || 0) +
          (Number(v.custo_perda_total) || 0) +
          (Number(v.custo_perda_parcial) || 0),
        0,
      );

      setDashboardStats({
        total: vistoriasData.length,
        aguardando: vistoriasData.filter((v) => v.status === "aguardando_fotos").length,
        analise: vistoriasData.filter((v) => v.status === "em_analise").length,
        concluidas: vistoriasData.filter((v) => v.status === "concluida").length,
        custoTotal,
        custoMedio: vistoriasData.length > 0 ? custoTotal / vistoriasData.length : 0,
        custoOficina: vistoriasData.reduce((sum, v) => sum + (Number(v.custo_oficina) || 0), 0),
        custoReparo: vistoriasData.reduce((sum, v) => sum + (Number(v.custo_reparo) || 0), 0),
        custoAcordo: vistoriasData.reduce((sum, v) => sum + (Number(v.custo_acordo) || 0), 0),
        custoTerceiros: vistoriasData.reduce((sum, v) => sum + (Number(v.custo_terceiros) || 0), 0),
        custoPerdaTotal: vistoriasData.reduce((sum, v) => sum + (Number(v.custo_perda_total) || 0), 0),
        custoPerdaParcial: vistoriasData.reduce((sum, v) => sum + (Number(v.custo_perda_parcial) || 0), 0),
      });

      setStatusData([
        { name: "Aguardando", value: vistoriasData.filter((v) => v.status === "aguardando_fotos").length },
        { name: "Em Análise", value: vistoriasData.filter((v) => v.status === "em_analise").length },
        { name: "Concluídas", value: vistoriasData.filter((v) => v.status === "concluida").length },
      ]);

      const tipos: any = {};
      vistoriasData.forEach((v) => {
        const tipo = (v as any).tipo_sinistro || "Não especificado";
        if (!tipos[tipo]) tipos[tipo] = { count: 0, custo: 0 };
        tipos[tipo].count++;
        tipos[tipo].custo += (Number(v.custo_oficina) || 0) + (Number(v.custo_reparo) || 0);
      });
      setTipoData(
        Object.entries(tipos).map(([name, data]: any) => ({
          name,
          value: data.count,
          custo: data.custo,
        })),
      );

      const { data: atendimentosData } = await supabase
        .from("atendimentos")
        .select("fluxo_id, fluxos(nome)")
        .not("arquivado", "eq", true);

      if (atendimentosData) {
        const fluxos: any = {};
        atendimentosData.forEach((a: any) => {
          const fluxoNome = a.fluxos?.nome || "Sem fluxo";
          if (!fluxos[fluxoNome]) fluxos[fluxoNome] = 0;
          fluxos[fluxoNome]++;
        });
        setFluxoData(Object.entries(fluxos).map(([name, value]) => ({ name, value })));
      }
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
      toast.error("Erro ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pendente: "bg-yellow-500",
      aguardando_fotos: "bg-blue-500",
      em_analise: "bg-purple-500",
      concluida: "bg-green-500",
      cancelada: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pendente: "Pendente",
      aguardando_fotos: "Aguardando Fotos",
      em_analise: "Em Análise",
      concluida: "Concluída",
      cancelada: "Cancelada",
    };
    return labels[status] || status;
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const filteredClaims = claims.filter((claim) => {
    const matchesStatus = selectedStatus === "all" || claim.status === selectedStatus;
    const matchesSearch =
      claim.numero.toString().includes(searchTerm.toLowerCase()) ||
      claim.assunto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      claim.observacoes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      false;
    return matchesStatus && matchesSearch;
  });

  const statusOptions = statusConfigs.map((config) => ({
    value: config.nome,
    label: config.nome,
    color: config.cor,
  }));

  const statusCounts = statusConfigs.map((config) => ({
    status: config.nome,
    count: claims.filter((c) => c.status === config.nome).length,
    color: config.cor,
  }));

  // ---------- Ações de link da Vistoria ----------

  const getVistoriaPublicLink = (vistoria: Vistoria) => {
    // ajuste se sua rota pública tiver outro path
    return `${window.location.origin}/vistoria-publica/${vistoria.link_token}`;
  };

  const handleOpenPublicLink = (vistoria: Vistoria) => {
    const link = getVistoriaPublicLink(vistoria);
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const handleShareWhatsApp = (vistoria: Vistoria) => {
    const link = getVistoriaPublicLink(vistoria);
    const text = `Olá, segue o link para continuar a vistoria do veículo ${vistoria.veiculo_placa}:\n${link}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShareEmail = (vistoria: Vistoria) => {
    const link = getVistoriaPublicLink(vistoria);
    const subject = `Vistoria #${vistoria.numero} - Continuidade`;
    const body = `Olá,\n\nSegue o link para acessar e continuar a vistoria do veículo ${vistoria.veiculo_placa} (${vistoria.cliente_nome}):\n${link}\n\nQualquer dúvida, estamos à disposição.\n`;
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
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
            <p className="text-sm text-muted-foreground">
              Gerencie sinistros, vistorias e acompanhamento de forma integrada
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => navigate("/vistorias/nova/manual")} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Abertura Manual
          </Button>
          <Button onClick={() => navigate("/vistorias/nova/digital")} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Abertura Digital
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vistorias.length}</div>
            <p className="text-xs text-muted-foreground">Registros totais</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vistorias.filter((v) => v.status === "pendente" || v.status === "aguardando_fotos").length}
            </div>
            <p className="text-xs text-muted-foreground">Em andamento</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Concluídos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vistorias.filter((v) => v.status === "concluida").length}</div>
            <p className="text-xs text-muted-foreground">Finalizados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Cancelados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vistorias.filter((v) => v.status === "cancelada").length}</div>
            <p className="text-xs text-muted-foreground">Cancelados</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab Buttons - CENTRALIZADOS */}
      <div className="border-b pb-2">
        <div className="flex justify-center gap-3">
          <Button
            variant={activeTab === "acompanhamento" ? "default" : "ghost"}
            onClick={() => setActiveTab("acompanhamento")}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Acompanhamento
          </Button>
          <Button
            variant={activeTab === "vistorias" ? "default" : "ghost"}
            onClick={() => setActiveTab("vistorias")}
            className="gap-2"
          >
            <Camera className="h-4 w-4" />
            Vistorias
          </Button>
          <Button
            variant={activeTab === "dashboard" ? "default" : "ghost"}
            onClick={() => setActiveTab("dashboard")}
            className="gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </Button>
        </div>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      ) : (
        <>
          {/* Acompanhamento Tab - levemente modernizado */}
          {activeTab === "acompanhamento" && (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-[2fr,3fr]">
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Visão Geral dos Sinistros
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ClaimStats claims={claims} statusCounts={statusCounts} />
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FilterIcon />
                      Filtros avançados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ClaimFilters
                      selectedStatus={selectedStatus}
                      onStatusChange={setSelectedStatus}
                      searchTerm={searchTerm}
                      onSearchChange={setSearchTerm}
                      statusOptions={statusOptions}
                      selectedCorretora={selectedCorretora}
                      onCorretoraChange={setSelectedCorretora}
                      corretoras={corretoras}
                      selectedPriority={selectedPriority}
                      onPriorityChange={setSelectedPriority}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardIcon />
                    Linha do tempo dos casos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {filteredClaims.length > 0 ? (
                      filteredClaims.map((claim) => <ClaimCard key={claim.id} claim={claim} onEdit={() => {}} />)
                    ) : (
                      <div className="p-12 text-center">
                        <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                        <h3 className="mt-4 text-lg font-semibold">Nenhum sinistro encontrado</h3>
                        <p className="mt-2 text-sm text-muted-foreground">Tente ajustar os filtros ou termo de busca</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Vistorias Tab - cards com botões de ação */}
          {activeTab === "vistorias" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Histórico de Vistorias</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Visualize, abra o link de captura e compartilhe com o cliente
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {vistorias.length === 0 ? (
                  <div className="text-center py-12">
                    <Camera className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                    <h3 className="mt-4 text-lg font-semibold">Nenhuma vistoria encontrada</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Comece criando uma nova abertura manual ou digital
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {vistorias.map((vistoria) => (
                      <Card key={vistoria.id} className="hover:bg-accent/40 transition-colors">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <div className="font-semibold text-sm">#{vistoria.numero}</div>
                                <Badge className={`${getStatusColor(vistoria.status)} text-white`}>
                                  {getStatusLabel(vistoria.status)}
                                </Badge>
                              </div>
                              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Car className="h-4 w-4" />
                                  <span className="font-medium text-foreground">
                                    {vistoria.veiculo_placa} - {vistoria.cliente_nome}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4" />
                                  <span>
                                    {format(new Date(vistoria.created_at), "dd/MM/yyyy 'às' HH:mm", {
                                      locale: ptBR,
                                    })}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Ações principais */}
                            <div className="flex flex-col sm:flex-row gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => navigate(`/vistorias/${vistoria.id}`)}
                              >
                                <Eye className="h-4 w-4" />
                                <span className="hidden sm:inline">Visualizar</span>
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => handleOpenPublicLink(vistoria)}
                                disabled={!vistoria.link_token}
                              >
                                <Link2 className="h-4 w-4" />
                                <span className="hidden sm:inline">Abrir link</span>
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => handleShareWhatsApp(vistoria)}
                                disabled={!vistoria.link_token}
                              >
                                <MessageCircle className="h-4 w-4" />
                                <span className="hidden sm:inline">WhatsApp</span>
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => handleShareEmail(vistoria)}
                                disabled={!vistoria.link_token}
                              >
                                <Mail className="h-4 w-4" />
                                <span className="hidden sm:inline">E-mail</span>
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Dashboard Tab - gráficos em rosca (donut) */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Select value={selectedDashboardCorretora} onValueChange={setSelectedDashboardCorretora}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Filtrar corretora" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as corretoras</SelectItem>
                    {dashboardCorretoras.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-none shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Car className="h-4 w-4" />
                      Total
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">{dashboardStats.total || 0}</div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-none shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Aguardando
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-yellow-600">{dashboardStats.aguardando || 0}</div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-none shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Em Análise
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-600">{dashboardStats.analise || 0}</div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-none shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Concluídos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">{dashboardStats.concluidas || 0}</div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-none shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Custo Total
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {formatCurrency(dashboardStats.custoTotal || 0)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-none shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Custo Médio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">
                      {formatCurrency(dashboardStats.custoMedio || 0)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border-none shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Oficinas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-indigo-600">
                      {formatCurrency(dashboardStats.custoOficina || 0)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-pink-500/10 to-pink-500/5 border-none shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Reparos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-pink-600">
                      {formatCurrency(dashboardStats.custoReparo || 0)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Status - rosca */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Status das Vistorias</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {statusData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Por Tipo - mantém barra */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Por Tipo de Sinistro</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={tipoData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Fluxos - rosca */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Distribuição por Fluxos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={fluxoData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          dataKey="value"
                        >
                          {fluxoData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Ícones “internos” simples para não poluir o import principal */
function FilterIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4h14M5 9h10M8 14h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="6" y="5" width="8" height="11" rx="1.5" />
      <path d="M8 4h4a1 1 0 0 1 1 1v0.5H7V5a1 1 0 0 1 1-1z" />
    </svg>
  );
}
