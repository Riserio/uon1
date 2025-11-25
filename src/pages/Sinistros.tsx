import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Eye,
  Link2,
  MessageCircle,
  Mail,
  Search,
  Filter,
  XCircle,
  Activity,
} from "lucide-react";
import { ClaimCard, Claim } from "@/components/ClaimCard";
import { useAuth } from "@/hooks/useAuth";
import { useFluxoPermissions } from "@/hooks/useFluxoPermissions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  Legend,
  AreaChart,
  Area,
} from "recharts";

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];

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
  atendimento_id?: string | null;
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
  const [activeTab, setActiveTab] = useState<TabType>("acompanhamento");
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [loading, setLoading] = useState(false);

  // Acompanhamento states
  const [claims, setClaims] = useState<Claim[]>([]);
  const [statusConfigs, setStatusConfigs] = useState<StatusConfig[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCorretora, setSelectedCorretora] = useState("all");
  const [corretoras, setCorretoras] = useState<any[]>([]);

  // Vistorias filtro
  const [vistoriaSearchTerm, setVistoriaSearchTerm] = useState("");

  // Dashboard states
  const [dashboardStats, setDashboardStats] = useState<any>({});
  const [statusData, setStatusData] = useState<any[]>([]);
  const [tipoData, setTipoData] = useState<any[]>([]);
  const [fluxoData, setFluxoData] = useState<any[]>([]);
  const [dashboardCorretoras, setDashboardCorretoras] = useState<any[]>([]);
  const [selectedDashboardCorretora, setSelectedDashboardCorretora] = useState("all");
  const [timelineData, setTimelineData] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === "vistorias") {
      loadVistorias();
    } else if (activeTab === "acompanhamento") {
      loadAcompanhamento();
    } else if (activeTab === "dashboard") {
      loadDashboard();
    }
  }, [activeTab, selectedDashboardCorretora, selectedCorretora]);

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

      const { data: corretorasData } = await supabase.from("corretoras").select("id, nome").order("nome");
      setCorretoras(corretorasData || []);

      let atendimentosQuery = supabase
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
          fluxo_id,
          corretora_id,
          corretoras(nome)
        `,
        )
        .order("created_at", { ascending: false });

      if (selectedCorretora !== "all") {
        atendimentosQuery = atendimentosQuery.eq("corretora_id", selectedCorretora);
      }

      const { data: atendimentosData, error: atendimentosError } = await atendimentosQuery;

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
            corretoraInfo: atendimento.corretoras,
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
        canceladas: vistoriasData.filter((v) => v.status === "cancelada").length,
        custoTotal,
        custoMedio: vistoriasData.length > 0 ? custoTotal / vistoriasData.length : 0,
      });

      setStatusData([
        { name: "Aguardando", value: vistoriasData.filter((v) => v.status === "aguardando_fotos").length },
        { name: "Em Análise", value: vistoriasData.filter((v) => v.status === "em_analise").length },
        { name: "Concluídas", value: vistoriasData.filter((v) => v.status === "concluida").length },
        { name: "Canceladas", value: vistoriasData.filter((v) => v.status === "cancelada").length },
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
          quantidade: data.count,
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

      const timelineMap: any = {};
      vistoriasData.forEach((v) => {
        const month = format(new Date(v.created_at), "MMM/yy", { locale: ptBR });
        if (!timelineMap[month]) {
          timelineMap[month] = { month, total: 0, custos: 0 };
        }
        timelineMap[month].total++;
        timelineMap[month].custos +=
          (Number(v.custo_oficina) || 0) +
          (Number(v.custo_reparo) || 0) +
          (Number(v.custo_acordo) || 0) +
          (Number(v.custo_terceiros) || 0);
      });
      setTimelineData(Object.values(timelineMap).slice(-6));
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
      pendente: "Pendente novas fotos",
      aguardando_fotos: "Aguardando fotos",
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

  const filteredVistorias = vistorias.filter((vistoria) => {
    if (!vistoriaSearchTerm) return true;
    const term = vistoriaSearchTerm.toLowerCase();
    return (
      vistoria.numero.toString().includes(term) ||
      vistoria.cliente_nome?.toLowerCase().includes(term) ||
      vistoria.veiculo_placa?.toLowerCase().includes(term) ||
      getStatusLabel(vistoria.status).toLowerCase().includes(term)
    );
  });

  const getVistoriaPublicLink = (vistoria: Vistoria) => {
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

  const handleGoToSinistroFromVistoria = (vistoria: Vistoria) => {
    if (!vistoria.atendimento_id) {
      toast.error("Esta vistoria ainda não está vinculada a um sinistro.");
      return;
    }

    // troca para aba de acompanhamento e tenta filtrar pelo número do sinistro
    setActiveTab("acompanhamento");
    setSelectedStatus("all");
    setSelectedCorretora("all");

    const claim = claims.find((c) => c.id === vistoria.atendimento_id);
    if (claim) {
      setSearchTerm(claim.numero.toString());
    } else {
      // se não encontrar, limpa busca mas mesmo assim vai para a aba
      setSearchTerm("");
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl">
            <AlertTriangle className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Sinistros
            </h1>
            <p className="text-sm text-muted-foreground">Gestão integrada de sinistros, vistorias e acompanhamento</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => navigate("/vistorias/nova/manual")} size="lg" className="gap-2 shadow-lg">
            <Plus className="h-4 w-4" />
            Nova Abertura Manual
          </Button>
          <Button
            onClick={() => navigate("/vistorias/nova/digital")}
            variant="outline"
            size="lg"
            className="gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Nova Abertura Digital
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-2 border-b">
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary" />
        </div>
      ) : (
        <>
          {/* ACOMPANHAMENTO TAB */}
          {activeTab === "acompanhamento" && (
            <div className="space-y-6">
              {/* Filtros Compactos */}
              <Card className="border-2">
                <CardContent className="p-6">
                  <div className="flex gap-4 flex-wrap items-center">
                    <div className="flex-1 min-w-[280px] relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por número, assunto ou observações..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 h-11"
                      />
                    </div>

                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger className="w-[200px] h-11">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Filtrar Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os Status</SelectItem>
                        {statusConfigs.map((s) => (
                          <SelectItem key={s.nome} value={s.nome}>
                            {s.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
                      <SelectTrigger className="w-[220px] h-11">
                        <Building2 className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Filtrar Corretora" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as Corretoras</SelectItem>
                        {corretoras.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Lista de Claims */}
              <div className="space-y-4">
                {filteredClaims.map((claim) => (
                  <ClaimCard key={claim.id} claim={claim} onEdit={() => {}} />
                ))}
                {filteredClaims.length === 0 && (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Nenhum sinistro encontrado com os filtros aplicados</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* VISTORIAS TAB */}
          {activeTab === "vistorias" && (
            <div className="space-y-6">
              {/* Header de Vistorias com contagem por status */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="text-muted-foreground">Total de Vistorias</span>
                      <FileText className="h-5 w-5 text-blue-500" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{vistorias.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">Registros totais</p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-yellow-500 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="text-muted-foreground">Pendentes novas fotos</span>
                      <Clock className="h-5 w-5 text-yellow-500" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{vistorias.filter((v) => v.status === "pendente").length}</div>
                    <p className="text-xs text-muted-foreground mt-1">Aguardando envio inicial</p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="text-muted-foreground">Aguardando fotos</span>
                      <Camera className="h-5 w-5 text-blue-500" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {vistorias.filter((v) => v.status === "aguardando_fotos").length}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Cliente em processo de envio</p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="text-muted-foreground">Concluídas</span>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{vistorias.filter((v) => v.status === "concluida").length}</div>
                    <p className="text-xs text-muted-foreground mt-1">Vistorias finalizadas</p>
                  </CardContent>
                </Card>
              </div>

              {/* Filtro / busca de vistorias */}
              <Card className="border-2">
                <CardContent className="p-4">
                  <div className="flex gap-4 flex-wrap items-center">
                    <div className="flex-1 min-w-[280px] relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por número, cliente, placa ou status..."
                        value={vistoriaSearchTerm}
                        onChange={(e) => setVistoriaSearchTerm(e.target.value)}
                        className="pl-10 h-11"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Lista de Vistorias */}
              <div className="grid gap-4">
                {filteredVistorias.map((vistoria) => (
                  <Card
                    key={vistoria.id}
                    className="hover:shadow-lg transition-shadow border border-border/70 bg-gradient-to-br from-background to-muted/40"
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold">Vistoria #{vistoria.numero}</h3>
                            <Badge className={getStatusColor(vistoria.status)}>{getStatusLabel(vistoria.status)}</Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                            <div>
                              <span className="font-medium">Cliente:</span> {vistoria.cliente_nome}
                            </div>
                            <div>
                              <span className="font-medium">Placa:</span> {vistoria.veiculo_placa}
                            </div>
                            <div>
                              <span className="font-medium">Data:</span>{" "}
                              {format(new Date(vistoria.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Atalho para o sinistro vinculado */}
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleGoToSinistroFromVistoria(vistoria)}
                            title="Ir para o sinistro vinculado"
                            className="rounded-full"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => navigate(`/vistorias/${vistoria.id}`)}
                            title="Visualizar vistoria"
                            className="rounded-full"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleOpenPublicLink(vistoria)}
                            title="Abrir link da vistoria"
                            className="rounded-full"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleShareWhatsApp(vistoria)}
                            title="Enviar link por WhatsApp"
                            className="rounded-full"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleShareEmail(vistoria)}
                            title="Enviar link por e-mail"
                            className="rounded-full"
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {filteredVistorias.length === 0 && (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        Nenhuma vistoria encontrada com os filtros / busca aplicados
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* DASHBOARD TAB */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Filtro de Corretora */}
              <Card>
                <CardContent className="p-4">
                  <Select value={selectedDashboardCorretora} onValueChange={setSelectedDashboardCorretora}>
                    <SelectTrigger className="w-full max-w-xs">
                      <Building2 className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filtrar por corretora" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Corretoras</SelectItem>
                      {dashboardCorretoras.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Removidos os cards de header duplicados aqui no dashboard */}

              {/* Cards de Custos */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                      <DollarSign className="h-5 w-5" />
                      Custo Total
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-4xl font-bold">{formatCurrency(dashboardStats.custoTotal || 0)}</p>
                    <p className="text-sm text-muted-foreground mt-2">Soma de todos os custos</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/30 dark:to-violet-900/20 border-violet-200 dark:border-violet-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-violet-700 dark:text-violet-400">
                      <TrendingUp className="h-5 w-5" />
                      Custo Médio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-4xl font-bold">{formatCurrency(dashboardStats.custoMedio || 0)}</p>
                    <p className="text-sm text-muted-foreground mt-2">Por vistoria</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/30 dark:to-orange-900/20 border-orange-200 dark:border-orange-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                      <Activity className="h-5 w-5" />
                      Taxa de Conclusão
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-4xl font-bold">
                      {dashboardStats.total > 0
                        ? Math.round((dashboardStats.concluidas / dashboardStats.total) * 100)
                        : 0}
                      %
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">Vistorias concluídas</p>
                  </CardContent>
                </Card>
              </div>

              {/* Gráficos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Distribuição por Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.name}: ${entry.value}`}
                          outerRadius={110}
                          innerRadius={60} // rosca (doughnut)
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Tipos de Sinistro
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={tipoData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} fontSize={12} />
                        <YAxis />
                        <Tooltip formatter={(value) => (typeof value === "number" ? formatCurrency(value) : value)} />
                        <Legend />
                        <Bar dataKey="quantidade" fill="#3b82f6" name="Quantidade" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="custo" fill="#22c55e" name="Custo Total" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Gráfico de Fluxos */}
              {fluxoData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Distribuição por Fluxo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={fluxoData} layout="horizontal">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={150} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#8b5cf6" name="Atendimentos" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Evolução Temporal */}
              {timelineData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Evolução nos Últimos Meses
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <AreaChart data={timelineData}>
                        <defs>
                          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorCustos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value) => (typeof value === "number" ? formatCurrency(value) : value)} />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="#3b82f6"
                          fillOpacity={1}
                          fill="url(#colorTotal)"
                          name="Total de Vistorias"
                        />
                        <Area
                          type="monotone"
                          dataKey="custos"
                          stroke="#22c55e"
                          fillOpacity={1}
                          fill="url(#colorCustos)"
                          name="Custos (R$)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
