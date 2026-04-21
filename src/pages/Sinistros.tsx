import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
 import { AlertTriangle, CheckCircle2, Clock, TrendingUp, FileText, Camera, BarChart3, Plus, DollarSign, Building2, Eye, Link2, MessageCircle, Mail, Search, Filter, XCircle, Activity, Wrench, Users, Handshake, Settings, ClipboardCheck, RefreshCw, SearchCheck } from "lucide-react";
import { ClaimCard, Claim } from "@/components/ClaimCard";
import { AcompanhamentoSinistroDialog } from "@/components/AcompanhamentoSinistroDialog";
import { useAuth } from "@/hooks/useAuth";
import { useFluxoPermissions } from "@/hooks/useFluxoPermissions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from "recharts";
import { openWhatsApp } from "@/utils/whatsapp";
import { PageHeader } from "@/components/ui/page-header";

const COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

interface Vistoria {
  id: string; numero: number; status: string; cliente_nome: string; veiculo_placa: string;
  created_at: string; link_token: string; corretora_id?: string; corretora_nome?: string;
  tipo_sinistro?: string; custo_oficina?: number; custo_reparo?: number; custo_acordo?: number;
  custo_terceiros?: number; custo_perda_total?: number; custo_perda_parcial?: number;
  atendimento_id?: string | null; tipo_abertura: string;
}

interface StatusConfig { nome: string; cor: string; ordem: number; }

type TabType = "acompanhamento" | "vistorias" | "dashboard";
type TipoVistoriaFilter = "todas" | "sinistro" | "reativacao";

export default function Sinistros() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canViewFluxo } = useFluxoPermissions(user?.id);
  const [activeTab, setActiveTab] = useState<TabType>("acompanhamento");
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [statusConfigs, setStatusConfigs] = useState<StatusConfig[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCorretora, setSelectedCorretora] = useState("all");
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [vistoriaSearchTerm, setVistoriaSearchTerm] = useState("");
  const [dashboardStats, setDashboardStats] = useState<any>({});
  const [statusData, setStatusData] = useState<any[]>([]);
  const [tipoData, setTipoData] = useState<any[]>([]);
  const [fluxoData, setFluxoData] = useState<any[]>([]);
  const [dashboardCorretoras, setDashboardCorretoras] = useState<any[]>([]);
  const [selectedDashboardCorretora, setSelectedDashboardCorretora] = useState("all");
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [editingClaim, setEditingClaim] = useState<Claim | null>(null);
  const [editingValues, setEditingValues] = useState({ custo_oficina: "", custo_reparo: "", custo_acordo: "", custo_terceiros: "", custo_perda_total: "", custo_perda_parcial: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [acompanhamentoClaim, setAcompanhamentoClaim] = useState<Claim | null>(null);
  const [tipoVistoriaFilter, setTipoVistoriaFilter] = useState<TipoVistoriaFilter>("todas");

  useEffect(() => {
    if (activeTab === "vistorias") loadVistorias();
    else if (activeTab === "acompanhamento") loadAcompanhamento();
    else if (activeTab === "dashboard") loadDashboard();
  }, [activeTab, selectedDashboardCorretora, selectedCorretora, tipoVistoriaFilter]);

  const loadVistorias = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("vistorias").select("*, corretoras(nome)").order("created_at", { ascending: false });
      if (error) throw error;
      setVistorias((data || []).map((v: any) => ({ ...v, corretora_nome: v.corretoras?.nome || null })));
    } catch { toast.error("Erro ao carregar vistorias"); }
    finally { setLoading(false); }
  };

  const loadAcompanhamento = async () => {
    try {
      setLoading(true);
      const { data: statusData } = await supabase.from("status_config").select("nome, cor, ordem").eq("ativo", true).order("ordem");
      setStatusConfigs(statusData || []);
      const { data: corretorasData } = await supabase.from("corretoras").select("id, nome").order("nome");
      setCorretoras(corretorasData || []);

      let q = supabase.from("atendimentos").select("id, numero, assunto, status, observacoes, created_at, updated_at, fluxo_id, corretora_id, corretoras(nome)").order("created_at", { ascending: false });
      if (selectedCorretora !== "all") q = q.eq("corretora_id", selectedCorretora);
      const { data: atendimentosData } = await q;

      const atendimentoIds = (atendimentosData || []).map(a => a.id);
      const { data: vistoriasData } = await supabase.from("vistorias").select("id, numero, atendimento_id, veiculo_placa, custo_oficina, custo_reparo, custo_acordo, custo_terceiros, custo_perda_total, custo_perda_parcial, valor_franquia, valor_indenizacao, tipo_sinistro").in("atendimento_id", atendimentoIds);
      const { data: historicoData } = await supabase.from("atendimentos_historico").select("atendimento_id, acao, created_at, campos_alterados, valores_anteriores, valores_novos").in("atendimento_id", atendimentoIds).order("created_at", { ascending: true });
      const { data: fluxosData } = await supabase.from("fluxos").select("id, nome");
      const fluxosMap = new Map((fluxosData || []).map(f => [f.id, f.nome]));

      const claimsResult: Claim[] = (atendimentosData || []).filter(a => canViewFluxo(a.fluxo_id)).map(atendimento => {
        const sc = statusData?.find(s => s.nome === atendimento.status);
        const vistoria = vistoriasData?.find(v => v.atendimento_id === atendimento.id);
        const historico = (historicoData?.filter(h => h.atendimento_id === atendimento.id) || []).filter(h => { const c = h.campos_alterados; return Array.isArray(c) && (c.includes("status") || c.includes("fluxo_id")); });
        const timeline = [{ date: atendimento.created_at, title: "Sinistro Registrado", description: `Status: ${atendimento.status}` },
          ...historico.map(h => {
            const campos = h.campos_alterados as string[];
            const ant = h.valores_anteriores as Record<string, any> || {};
            const nov = h.valores_novos as Record<string, any> || {};
            const changes: string[] = [];
            if (campos.includes("status")) changes.push(`Status: ${ant.status || "N/A"} → ${nov.status || "N/A"}`);
            if (campos.includes("fluxo_id")) changes.push(`Fluxo: ${fluxosMap.get(ant.fluxo_id) || "N/A"} → ${fluxosMap.get(nov.fluxo_id) || "N/A"}`);
            return { date: h.created_at, title: `Alteração`, description: changes.join(" | ") };
          })];
        return { id: atendimento.id, numero: atendimento.numero, assunto: atendimento.assunto, created_at: atendimento.created_at, status: atendimento.status, statusColor: sc?.cor || "#6b7280", observacoes: atendimento.observacoes, veiculo_placa: vistoria?.veiculo_placa, custo_oficina: vistoria?.custo_oficina, custo_reparo: vistoria?.custo_reparo, custo_acordo: vistoria?.custo_acordo, custo_terceiros: vistoria?.custo_terceiros, custo_perda_total: vistoria?.custo_perda_total, custo_perda_parcial: vistoria?.custo_perda_parcial, valor_franquia: vistoria?.valor_franquia, valor_indenizacao: vistoria?.valor_indenizacao, vistoria_id: vistoria?.id, vistoria_numero: vistoria?.numero, corretora_id: atendimento.corretora_id, tipo_sinistro: vistoria?.tipo_sinistro, timeline, corretoraInfo: atendimento.corretoras } as any;
      });
      setClaims(claimsResult);
    } catch { toast.error("Erro ao carregar"); }
    finally { setLoading(false); }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const { data: corretorasData } = await supabase.from("corretoras").select("id, nome").order("nome");
      setDashboardCorretoras(corretorasData || []);
      let query = supabase.from("vistorias").select("*").order("created_at", { ascending: false });
      if (selectedDashboardCorretora !== "all") query = query.eq("corretora_id", selectedDashboardCorretora);
      if (tipoVistoriaFilter !== "todas") query = query.eq("tipo_vistoria", tipoVistoriaFilter);
      const { data: vistoriasData } = await query;
      if (!vistoriasData) return;
      let cO = 0, cR = 0, cA = 0, cT = 0, cPT = 0, cPP = 0;
      vistoriasData.forEach((v: any) => { cO += Number(v.custo_oficina) || 0; cR += Number(v.custo_reparo) || 0; cA += Number(v.custo_acordo) || 0; cT += Number(v.custo_terceiros) || 0; cPT += Number(v.custo_perda_total) || 0; cPP += Number(v.custo_perda_parcial) || 0; });
      const total = cO + cR + cA + cT + cPT + cPP;
      setDashboardStats({ total: vistoriasData.length, aguardando: vistoriasData.filter((v: any) => v.status === "aguardando_fotos").length, analise: vistoriasData.filter((v: any) => v.status === "em_analise").length, concluidas: vistoriasData.filter((v: any) => v.status === "concluida").length, canceladas: vistoriasData.filter((v: any) => v.status === "cancelada").length, custoTotal: total, custoMedio: vistoriasData.length ? total / vistoriasData.length : 0, custoOficinas: cO, custoReparos: cR, custoAcordos: cA, custoTerceiros: cT, custoPerdaTotal: cPT, custoPerdaParcial: cPP });
      setStatusData([{ name: "Aguardando", value: vistoriasData.filter((v: any) => v.status === "aguardando_fotos").length }, { name: "Em Análise", value: vistoriasData.filter((v: any) => v.status === "em_analise").length }, { name: "Concluídas", value: vistoriasData.filter((v: any) => v.status === "concluida").length }, { name: "Canceladas", value: vistoriasData.filter((v: any) => v.status === "cancelada").length }]);
      const tipos: Record<string, { count: number; custo: number }> = {};
      vistoriasData.forEach((v: any) => { const t = v.tipo_sinistro || "N/E"; if (!tipos[t]) tipos[t] = { count: 0, custo: 0 }; tipos[t].count++; tipos[t].custo += (Number(v.custo_oficina) || 0) + (Number(v.custo_reparo) || 0); });
      setTipoData(Object.entries(tipos).map(([name, d]) => ({ name, quantidade: d.count, custo: d.custo })));
      const { data: atd } = await supabase.from("atendimentos").select("fluxo_id, fluxos(nome)").not("arquivado", "eq", true);
      if (atd) { const f: Record<string, number> = {}; (atd as any[]).forEach(a => { const n = a.fluxos?.nome || "Sem fluxo"; f[n] = (f[n] || 0) + 1; }); setFluxoData(Object.entries(f).map(([name, value]) => ({ name, value }))); }
      const tm: Record<string, { month: string; total: number; custos: number }> = {};
      vistoriasData.forEach((v: any) => { const m = format(new Date(v.created_at), "MMM/yy", { locale: ptBR }); if (!tm[m]) tm[m] = { month: m, total: 0, custos: 0 }; tm[m].total++; tm[m].custos += (Number(v.custo_oficina) || 0) + (Number(v.custo_reparo) || 0) + (Number(v.custo_acordo) || 0) + (Number(v.custo_terceiros) || 0); });
      setTimelineData(Object.values(tm).slice(-6));
    } catch { toast.error("Erro dashboard"); }
    finally { setLoading(false); }
  };

  const getStatusColor = (s: string) => ({ pendente: "bg-yellow-500", pendente_novas_fotos: "bg-yellow-500", aguardando_fotos: "bg-blue-500", em_analise: "bg-purple-500", concluida: "bg-green-500", cancelada: "bg-red-500" }[s] || "bg-gray-500");
  const getStatusLabel = (s: string) => ({ pendente: "Pendente", pendente_novas_fotos: "Pend. Fotos", aguardando_fotos: "Aguardando", em_analise: "Em Análise", concluida: "Concluída", cancelada: "Cancelada" }[s] || s);
  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
  const parseCurrencyToNumber = (v: string) => { const n = Number(v.replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };

  const filteredClaims = claims.filter(c => {
    const ms = selectedStatus === "all" || c.status === selectedStatus;
    const mt = c.numero.toString().includes(searchTerm.toLowerCase()) || c.assunto.toLowerCase().includes(searchTerm.toLowerCase()) || c.observacoes?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const tipoNorm = ((c as any).tipo_vistoria || ((c as any).tipo_sinistro?.toLowerCase().includes("reativ") ? "reativacao" : "sinistro")) as string;
    const mtipo = tipoVistoriaFilter === "todas" || tipoNorm === tipoVistoriaFilter;
    return ms && mt && mtipo;
  });
  const filteredVistorias = vistorias.filter(v => {
    const tipo = ((v as any).tipo_vistoria || "sinistro") as string;
    const mtipo = tipoVistoriaFilter === "todas" || tipo === tipoVistoriaFilter;
    if (!mtipo) return false;
    if (!vistoriaSearchTerm) return true;
    const t = vistoriaSearchTerm.toLowerCase();
    return v.numero.toString().includes(t) || v.cliente_nome?.toLowerCase().includes(t) || v.veiculo_placa?.toLowerCase().includes(t);
  });

  const normalizeStatus = (s?: string | null) => (s || "").toLowerCase();
  const totalSinistros = claims.length;
  const sinistrosConcluidos = claims.filter(c => normalizeStatus(c.status).includes("conclu")).length;
  const sinistrosCancelados = claims.filter(c => normalizeStatus(c.status).includes("cancel")).length;
  const sinistrosEmAndamento = totalSinistros - sinistrosConcluidos - sinistrosCancelados;

  const handleOpenPublicLink = (v: Vistoria) => { const l = v.link_token ? `${window.location.origin}/vistoria/${v.link_token}` : null; if (!l) { toast.error("Sem link"); return; } window.open(l, "_blank"); };
  const handleShareWhatsApp = (v: Vistoria) => { const l = v.link_token ? `${window.location.origin}/vistoria/${v.link_token}` : null; if (!l) { toast.error("Sem link"); return; } openWhatsApp({ message: `Link da vistoria ${v.veiculo_placa}:\n${l}` }); };

  const handleOpenEditClaim = (claim: Claim) => {
    setEditingClaim(claim);
    setEditingValues({ custo_oficina: claim.custo_oficina != null ? String(claim.custo_oficina).replace(".", ",") : "", custo_reparo: claim.custo_reparo != null ? String(claim.custo_reparo).replace(".", ",") : "", custo_acordo: claim.custo_acordo != null ? String(claim.custo_acordo).replace(".", ",") : "", custo_terceiros: claim.custo_terceiros != null ? String(claim.custo_terceiros).replace(".", ",") : "", custo_perda_total: claim.custo_perda_total != null ? String(claim.custo_perda_total).replace(".", ",") : "", custo_perda_parcial: claim.custo_perda_parcial != null ? String(claim.custo_perda_parcial).replace(".", ",") : "" });
  };

  const handleSaveEditClaim = async () => {
    if (!editingClaim || !(editingClaim as any).vistoria_id) { toast.error("Sem vistoria vinculada"); return; }
    const payload: any = {};
    if (editingValues.custo_oficina.trim()) payload.custo_oficina = parseCurrencyToNumber(editingValues.custo_oficina);
    if (editingValues.custo_reparo.trim()) payload.custo_reparo = parseCurrencyToNumber(editingValues.custo_reparo);
    if (editingValues.custo_acordo.trim()) payload.custo_acordo = parseCurrencyToNumber(editingValues.custo_acordo);
    if (editingValues.custo_terceiros.trim()) payload.custo_terceiros = parseCurrencyToNumber(editingValues.custo_terceiros);
    if (editingValues.custo_perda_total.trim()) payload.custo_perda_total = parseCurrencyToNumber(editingValues.custo_perda_total);
    if (editingValues.custo_perda_parcial.trim()) payload.custo_perda_parcial = parseCurrencyToNumber(editingValues.custo_perda_parcial);
    if (!Object.keys(payload).length) { toast.error("Informe um valor"); return; }
    try {
      setSavingEdit(true);
      const { error } = await supabase.from("vistorias").update(payload).eq("id", (editingClaim as any).vistoria_id);
      if (error) throw error;
      toast.success("Custos atualizados!");
      setEditingClaim(null);
      await Promise.all([loadAcompanhamento(), loadDashboard(), loadVistorias()]);
    } catch { toast.error("Erro ao atualizar"); }
    finally { setSavingEdit(false); }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
       <PageHeader
         icon={SearchCheck}
         title="Vistorias"
        subtitle="Gestão integrada de vistorias de sinistros e reativações"
        actions={
          <>
            <Button onClick={() => navigate("/vistorias/nova/manual")} className="rounded-xl gap-1.5 shadow-sm">
              <Plus className="h-4 w-4" /> Abertura Manual
            </Button>
            <Button onClick={() => navigate("/vistorias/nova/digital")} variant="outline" className="rounded-xl gap-1.5">
              <Plus className="h-4 w-4" /> Abertura Digital
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
        <div className="flex items-center justify-between gap-2">
          <TabsList className="rounded-xl bg-muted/50 p-1">
            <TabsTrigger value="acompanhamento" className="gap-1.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="h-4 w-4" /> Painel
            </TabsTrigger>
            <TabsTrigger value="vistorias" className="gap-1.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Camera className="h-4 w-4" /> Vistorias
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-1.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BarChart3 className="h-4 w-4" /> Dashboard
            </TabsTrigger>
          </TabsList>
          <Button variant="ghost" onClick={() => navigate('/sinistros/configuracoes')} className="gap-1.5 rounded-xl">
            <Settings className="h-4 w-4" /> <span className="hidden sm:inline">Configurações</span>
          </Button>
        </div>

        {/* Filtro Tipo de Vistoria */}
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-muted/40 backdrop-blur p-1 w-fit">
           {([
             { value: "todas", label: "Todas", icon: SearchCheck },
             { value: "sinistro", label: "Sinistros", icon: AlertTriangle },
            { value: "reativacao", label: "Reativações", icon: RefreshCw },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => setTipoVistoriaFilter(opt.value)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                tipoVistoriaFilter === opt.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <opt.icon className="h-4 w-4" /> {opt.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary" />
          </div>
        ) : (
          <>
            {/* PAINEL */}
            <TabsContent value="acompanhamento" className="space-y-6 mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Total", value: totalSinistros, icon: FileText, color: "text-primary" },
                  { label: "Em andamento", value: sinistrosEmAndamento, icon: Clock, color: "text-muted-foreground" },
                  { label: "Concluídos", value: sinistrosConcluidos, icon: CheckCircle2, color: "text-primary" },
                  { label: "Cancelados", value: sinistrosCancelados, icon: XCircle, color: "text-destructive" },
                ].map((s, i) => (
                  <Card key={i} className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                        <s.icon className={`h-4 w-4 ${s.color}`} />
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold">{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="rounded-2xl border-border/50 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex gap-3 flex-wrap items-center">
                    <div className="flex-1 min-w-[200px] relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar número, assunto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 rounded-xl" />
                    </div>
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger className="w-[180px] rounded-xl"><Filter className="h-4 w-4 mr-1.5" /><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>{[{ value: "all", label: "Todos" }, ...statusConfigs.map(s => ({ value: s.nome, label: s.nome }))].map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
                      <SelectTrigger className="w-[200px] rounded-xl"><Building2 className="h-4 w-4 mr-1.5" /><SelectValue placeholder="Associação" /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Todas</SelectItem>{corretoras.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {filteredClaims.map(claim => <ClaimCard key={claim.id} claim={claim} />)}
                {filteredClaims.length === 0 && (
                  <Card className="rounded-2xl border-dashed border-2 border-border/50">
                    <CardContent className="p-12 text-center">
                      <FileText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                      <p className="text-muted-foreground">Nenhum sinistro encontrado</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* VISTORIAS */}
            <TabsContent value="vistorias" className="space-y-6 mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Total", value: vistorias.length, icon: FileText },
                  { label: "Pendentes", value: vistorias.filter(v => v.status === "pendente" || v.status === "pendente_novas_fotos").length, icon: Clock },
                  { label: "Aguardando", value: vistorias.filter(v => v.status === "aguardando_fotos").length, icon: Camera },
                  { label: "Concluídas", value: vistorias.filter(v => v.status === "concluida").length, icon: CheckCircle2 },
                ].map((s, i) => (
                  <Card key={i} className="rounded-2xl border-border/50 shadow-sm">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                        <s.icon className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold">{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="rounded-2xl border-border/50 shadow-sm">
                <CardContent className="p-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por número, cliente, placa..." value={vistoriaSearchTerm} onChange={e => setVistoriaSearchTerm(e.target.value)} className="pl-10 rounded-xl" />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-3">
                {filteredVistorias.map(vistoria => (
                  <Card key={vistoria.id} className="rounded-2xl hover:shadow-md transition-shadow border-border/50">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        {vistoria.corretora_nome ? (
                          <Badge className="bg-primary/10 text-primary border-0 text-[11px]"><Building2 className="h-3 w-3 mr-1" />{vistoria.corretora_nome}</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[11px]"><AlertTriangle className="h-3 w-3 mr-1" />Sem associação</Badge>
                        )}
                        {vistoria.tipo_sinistro && <Badge variant="outline" className="text-[11px]">{vistoria.tipo_sinistro}</Badge>}
                        {(vistoria as any).tipo_vistoria === "reativacao" ? (
                          <Badge variant="secondary" className="text-[11px]"><RefreshCw className="h-3 w-3 mr-1" />Reativação</Badge>
                        ) : (
                          <Badge className="bg-primary/10 text-primary border-0 text-[11px]"><AlertTriangle className="h-3 w-3 mr-1" />Sinistro</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-base font-semibold">Vistoria #{vistoria.numero}</h3>
                            <Badge className={`${getStatusColor(vistoria.status)} text-white text-[10px]`}>{getStatusLabel(vistoria.status)}</Badge>
                            <Badge variant={vistoria.tipo_abertura === "manual" ? "secondary" : "default"} className="text-[10px]">{vistoria.tipo_abertura === "manual" ? "Manual" : "Digital"}</Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-muted-foreground">
                            <span><span className="font-medium text-foreground">Cliente:</span> {vistoria.cliente_nome}</span>
                            <span><span className="font-medium text-foreground">Placa:</span> {vistoria.veiculo_placa}</span>
                            <span><span className="font-medium text-foreground">Data:</span> {format(new Date(vistoria.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={() => navigate(`/vistorias/${vistoria.id}`)} title="Ver"><Eye className="h-4 w-4" /></Button>
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={() => handleOpenPublicLink(vistoria)} title="Link"><Link2 className="h-4 w-4" /></Button>
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={() => handleShareWhatsApp(vistoria)} title="WhatsApp"><MessageCircle className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {filteredVistorias.length === 0 && (
                  <Card className="rounded-2xl border-dashed border-2 border-border/50">
                    <CardContent className="p-12 text-center">
                      <Camera className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                      <p className="text-muted-foreground">Nenhuma vistoria encontrada</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* DASHBOARD */}
            <TabsContent value="dashboard" className="space-y-6 mt-4">
              <Card className="rounded-2xl border-border/50 shadow-sm">
                <CardContent className="p-4">
                  <Select value={selectedDashboardCorretora} onValueChange={setSelectedDashboardCorretora}>
                    <SelectTrigger className="w-full max-w-xs rounded-xl"><Building2 className="h-4 w-4 mr-1.5" /><SelectValue placeholder="Filtrar" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todas</SelectItem>{dashboardCorretoras.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {[
                  { icon: BarChart3, label: "Total", value: dashboardStats.total || 0 },
                  { icon: Clock, label: "Aguardando", value: dashboardStats.aguardando || 0 },
                  { icon: Activity, label: "Em Análise", value: dashboardStats.analise || 0 },
                  { icon: CheckCircle2, label: "Concluídas", value: dashboardStats.concluidas || 0 },
                  { icon: DollarSign, label: "Custo Total", value: formatCurrency(dashboardStats.custoTotal || 0), isText: true },
                  { icon: TrendingUp, label: "Custo Médio", value: formatCurrency(dashboardStats.custoMedio || 0), isText: true },
                  { icon: Wrench, label: "Oficinas", value: formatCurrency(dashboardStats.custoOficinas || 0), isText: true },
                  { icon: Handshake, label: "Acordos", value: formatCurrency(dashboardStats.custoAcordos || 0), isText: true },
                ].map((s, i) => (
                  <Card key={i} className="rounded-2xl border-border/50 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                        <s.icon className="h-4 w-4 text-primary" />
                      </div>
                      <p className={`font-bold truncate ${(s as any).isText ? 'text-lg' : 'text-2xl'}`}>{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="rounded-2xl">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Status</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={statusData} cx="50%" cy="50%" labelLine={false} label={(e: any) => `${e.name}: ${e.value}`} outerRadius={100} innerRadius={55} dataKey="value">
                          {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Tipos</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={tipoData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} formatter={(v: any) => typeof v === "number" ? formatCurrency(v) : v} />
                        <Legend />
                        <Bar dataKey="quantidade" fill="hsl(var(--primary))" name="Qtd" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="custo" fill="hsl(var(--chart-2))" name="Custo" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {fluxoData.length > 0 && (
                <Card className="rounded-2xl">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Fluxos</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={fluxoData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" width={150} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                        <Bar dataKey="value" fill="hsl(var(--chart-4))" name="Atendimentos" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {timelineData.length > 0 && (
                <Card className="rounded-2xl">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Activity className="h-4 w-4" /> Evolução</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={timelineData}>
                        <defs>
                          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                        <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#colorTotal)" name="Vistorias" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Edit Costs Dialog */}
      <Dialog open={!!editingClaim} onOpenChange={(v) => !v && setEditingClaim(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Custos</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {(["custo_oficina", "custo_reparo", "custo_acordo", "custo_terceiros", "custo_perda_total", "custo_perda_parcial"] as const).map(field => (
              <div key={field} className="grid gap-2">
                <Label className="text-xs capitalize">{field.replace("custo_", "").replace("_", " ")}</Label>
                <Input value={editingValues[field]} onChange={e => setEditingValues({ ...editingValues, [field]: e.target.value })} placeholder="0,00" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingClaim(null)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleSaveEditClaim} disabled={savingEdit} className="rounded-xl">{savingEdit ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {acompanhamentoClaim && <AcompanhamentoSinistroDialog atendimentoId={acompanhamentoClaim.id} sinistroNumero={acompanhamentoClaim.numero} corretoraId={acompanhamentoClaim.corretora_id || undefined} open={!!acompanhamentoClaim} onOpenChange={(v) => !v && setAcompanhamentoClaim(null)} onUpdate={loadAcompanhamento} />}
    </div>
  );
}
