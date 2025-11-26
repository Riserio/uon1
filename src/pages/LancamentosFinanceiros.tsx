import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  FileText,
  Calendar,
  Building2,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface Lancamento {
  id: string;
  numero_lancamento: string;
  data_lancamento: string;
  data_competencia: string;
  tipo_lancamento: string;
  categoria: string;
  subcategoria?: string;
  valor_bruto: number;
  valor_desconto: number;
  valor_liquido: number;
  descricao: string;
  observacoes?: string;
  status: string;
  corretora_id?: string;
  sinistro_id?: string;
  apolice_numero?: string;
  documento_fiscal?: string;
  data_vencimento?: string;
  data_pagamento?: string;
  forma_pagamento?: string;
  conciliado: boolean;
  created_at: string;
  corretoras?: { nome: string };
  atendimentos?: { numero: number };
}

interface FormData {
  data_lancamento: string;
  data_competencia: string;
  tipo_lancamento: string;
  categoria: string;
  subcategoria: string;
  valor_bruto: string;
  valor_desconto: string;
  valor_liquido: string;
  descricao: string;
  observacoes: string;
  corretora_id: string;
  sinistro_id: string;
  apolice_numero: string;
  documento_fiscal: string;
  data_vencimento: string;
  forma_pagamento: string;
}

export default function LancamentosFinanceiros() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [filteredLancamentos, setFilteredLancamentos] = useState<Lancamento[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedLancamento, setSelectedLancamento] = useState<Lancamento | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [corretoraFilter, setCorretoraFilter] = useState("");
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [sinistros, setSinistros] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("lista");
  const [approvalAction, setApprovalAction] = useState<"aprovar" | "rejeitar" | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");

  const [formData, setFormData] = useState<FormData>({
    data_lancamento: format(new Date(), "yyyy-MM-dd"),
    data_competencia: format(new Date(), "yyyy-MM-dd"),
    tipo_lancamento: "receita",
    categoria: "premio",
    subcategoria: "",
    valor_bruto: "",
    valor_desconto: "0",
    valor_liquido: "",
    descricao: "",
    observacoes: "",
    corretora_id: "",
    sinistro_id: "",
    apolice_numero: "",
    documento_fiscal: "",
    data_vencimento: "",
    forma_pagamento: "",
  });

  useEffect(() => {
    if (userRole === "admin" || userRole === "superintendente") {
      fetchLancamentos();
      fetchCorretoras();
      fetchSinistros();
    }
  }, [userRole]);

  useEffect(() => {
    filterLancamentos();
  }, [lancamentos, searchTerm, statusFilter, tipoFilter, corretoraFilter]);

  useEffect(() => {
    // Calcular valor líquido automaticamente
    const bruto = parseFloat(formData.valor_bruto) || 0;
    const desconto = parseFloat(formData.valor_desconto) || 0;
    const liquido = bruto - desconto;
    setFormData((prev) => ({ ...prev, valor_liquido: liquido.toFixed(2) }));
  }, [formData.valor_bruto, formData.valor_desconto]);

  const fetchLancamentos = async () => {
    const { data, error } = await supabase
      .from("lancamentos_financeiros")
      .select("*, corretoras(nome), atendimentos(numero)")
      .order("data_lancamento", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar lançamentos");
      console.error(error);
    } else {
      setLancamentos(data || []);
    }
  };

  const fetchCorretoras = async () => {
    const { data, error } = await supabase.from("corretoras").select("id, nome").order("nome");
    if (!error && data) {
      setCorretoras(data);
      // Selecionar a primeira corretora automaticamente se nenhuma estiver selecionada
      if (data.length > 0 && !corretoraFilter) {
        setCorretoraFilter(data[0].id);
      }
    }
  };

  const fetchSinistros = async () => {
    const { data, error } = await supabase
      .from("atendimentos")
      .select("id, numero, assunto")
      .eq("tipo_atendimento", "sinistro")
      .order("numero", { ascending: false })
      .limit(100);
    if (!error && data) setSinistros(data);
  };

  const filterLancamentos = () => {
    let filtered = lancamentos;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.numero_lancamento.toLowerCase().includes(term) ||
          l.descricao.toLowerCase().includes(term) ||
          l.corretoras?.nome.toLowerCase().includes(term) ||
          l.apolice_numero?.toLowerCase().includes(term),
      );
    }

    if (statusFilter !== "todos") {
      filtered = filtered.filter((l) => l.status === statusFilter);
    }

    if (tipoFilter !== "todos") {
      filtered = filtered.filter((l) => l.tipo_lancamento === tipoFilter);
    }

    if (corretoraFilter) {
      filtered = filtered.filter((l) => l.corretora_id === corretoraFilter);
    }

    setFilteredLancamentos(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }

    try {
      const lancamentoData: any = {
        data_lancamento: formData.data_lancamento,
        data_competencia: formData.data_competencia,
        tipo_lancamento: formData.tipo_lancamento,
        categoria: formData.categoria,
        subcategoria: formData.subcategoria || null,
        valor_bruto: parseFloat(formData.valor_bruto),
        valor_desconto: parseFloat(formData.valor_desconto),
        valor_liquido: parseFloat(formData.valor_liquido),
        descricao: formData.descricao,
        observacoes: formData.observacoes || null,
        corretora_id: formData.corretora_id || null,
        sinistro_id: formData.sinistro_id || null,
        apolice_numero: formData.apolice_numero || null,
        documento_fiscal: formData.documento_fiscal || null,
        data_vencimento: formData.data_vencimento || null,
        forma_pagamento: formData.forma_pagamento || null,
        created_by: user.id,
      };

      if (selectedLancamento) {
        const { error } = await supabase
          .from("lancamentos_financeiros")
          .update({ ...lancamentoData, updated_by: user.id })
          .eq("id", selectedLancamento.id);

        if (error) throw error;
        toast.success("Lançamento atualizado!");
      } else {
        const { error } = await supabase.from("lancamentos_financeiros").insert([lancamentoData]);

        if (error) throw error;
        toast.success("Lançamento criado!");
      }

      setDialogOpen(false);
      setSelectedLancamento(null);
      resetForm();
      fetchLancamentos();
    } catch (error: any) {
      console.error("Erro ao salvar lançamento:", error);
      toast.error(error.message || "Erro ao salvar lançamento");
    }
  };

  const handleApproval = async () => {
    if (!selectedLancamento || !approvalAction || !user) return;

    if (approvalAction === "rejeitar" && !motivoRejeicao.trim()) {
      toast.error("Informe o motivo da rejeição");
      return;
    }

    try {
      const updateData: any = {
        status: approvalAction === "aprovar" ? "aprovado" : "rejeitado",
        updated_by: user.id,
      };

      if (approvalAction === "aprovar") {
        updateData.aprovado_por = user.id;
        updateData.aprovado_em = new Date().toISOString();
      } else {
        updateData.rejeitado_por = user.id;
        updateData.rejeitado_em = new Date().toISOString();
        updateData.motivo_rejeicao = motivoRejeicao;
      }

      const { error } = await supabase
        .from("lancamentos_financeiros")
        .update(updateData)
        .eq("id", selectedLancamento.id);

      if (error) throw error;

      toast.success(approvalAction === "aprovar" ? "Lançamento aprovado!" : "Lançamento rejeitado!");
      setApprovalDialogOpen(false);
      setSelectedLancamento(null);
      setMotivoRejeicao("");
      fetchLancamentos();
    } catch (error: any) {
      console.error("Erro ao processar aprovação:", error);
      toast.error(error.message || "Erro ao processar aprovação");
    }
  };

  const handleMarcarPago = async (lancamento: Lancamento) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("lancamentos_financeiros")
        .update({
          status: "pago",
          data_pagamento: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq("id", lancamento.id);

      if (error) throw error;
      toast.success("Lançamento marcado como pago!");
      fetchLancamentos();
    } catch (error: any) {
      toast.error("Erro ao marcar como pago");
    }
  };

  const resetForm = () => {
    setFormData({
      data_lancamento: format(new Date(), "yyyy-MM-dd"),
      data_competencia: format(new Date(), "yyyy-MM-dd"),
      tipo_lancamento: "receita",
      categoria: "premio",
      subcategoria: "",
      valor_bruto: "",
      valor_desconto: "0",
      valor_liquido: "",
      descricao: "",
      observacoes: "",
      corretora_id: "",
      sinistro_id: "",
      apolice_numero: "",
      documento_fiscal: "",
      data_vencimento: "",
      forma_pagamento: "",
    });
  };

  const openEditDialog = (lancamento: Lancamento) => {
    setSelectedLancamento(lancamento);
    setFormData({
      data_lancamento: lancamento.data_lancamento,
      data_competencia: lancamento.data_competencia,
      tipo_lancamento: lancamento.tipo_lancamento,
      categoria: lancamento.categoria,
      subcategoria: lancamento.subcategoria || "",
      valor_bruto: lancamento.valor_bruto.toString(),
      valor_desconto: lancamento.valor_desconto.toString(),
      valor_liquido: lancamento.valor_liquido.toString(),
      descricao: lancamento.descricao,
      observacoes: lancamento.observacoes || "",
      corretora_id: lancamento.corretora_id || "",
      sinistro_id: lancamento.sinistro_id || "",
      apolice_numero: lancamento.apolice_numero || "",
      documento_fiscal: lancamento.documento_fiscal || "",
      data_vencimento: lancamento.data_vencimento || "",
      forma_pagamento: lancamento.forma_pagamento || "",
    });
    setDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      pendente: { variant: "secondary", icon: Clock },
      aprovado: { variant: "default", icon: CheckCircle },
      rejeitado: { variant: "destructive", icon: XCircle },
      pago: { variant: "default", icon: CheckCircle },
      cancelado: { variant: "outline", icon: XCircle },
    };

    const { variant, icon: Icon } = variants[status] || variants.pendente;

    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getTipoIcon = (tipo: string) => {
    return tipo === "receita" ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-600" />
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const totais = {
    receitas: filteredLancamentos
      .filter((l) => l.tipo_lancamento === "receita")
      .reduce((sum, l) => sum + l.valor_liquido, 0),
    despesas: filteredLancamentos
      .filter((l) => l.tipo_lancamento === "despesa")
      .reduce((sum, l) => sum + l.valor_liquido, 0),
    pendentes: filteredLancamentos.filter((l) => l.status === "pendente").length,
    aprovados: filteredLancamentos.filter((l) => l.status === "aprovado").length,
  };

  if (userRole !== "admin" && userRole !== "superintendente") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Lançamentos Financeiros</h1>
            <p className="text-muted-foreground">Gestão completa de lançamentos financeiros</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/dashboard-financeiro")}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Dashboard
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Lançamento
            </Button>
          </div>
        </div>
        
        {/* Corretora Selector */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <Label>Corretora</Label>
                <Select value={corretoraFilter} onValueChange={setCorretoraFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma corretora" />
                  </SelectTrigger>
                  <SelectContent>
                    {corretoras.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Receitas</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totais.receitas)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Despesas</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totais.despesas)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saldo</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totais.receitas - totais.despesas)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totais.pendentes}</div>
            <p className="text-xs text-muted-foreground">Aguardando aprovação</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="rejeitado">Rejeitado</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="receita">Receitas</SelectItem>
                <SelectItem value="despesa">Despesas</SelectItem>
                <SelectItem value="provisao">Provisões</SelectItem>
                <SelectItem value="ajuste">Ajustes</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("todos");
                setTipoFilter("todos");
                // Manter a corretora selecionada ou selecionar a primeira
                if (corretoras.length > 0 && !corretoraFilter) {
                  setCorretoraFilter(corretoras[0].id);
                }
              }}
            >
              <Filter className="h-4 w-4 mr-2" />
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Corretora</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLancamentos.map((lancamento) => (
                <TableRow key={lancamento.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-mono text-sm">{lancamento.numero_lancamento}</TableCell>
                  <TableCell>{format(new Date(lancamento.data_lancamento), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getTipoIcon(lancamento.tipo_lancamento)}
                      <span className="capitalize">{lancamento.tipo_lancamento}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{lancamento.categoria}</TableCell>
                  <TableCell className="max-w-xs truncate">{lancamento.descricao}</TableCell>
                  <TableCell>{lancamento.corretoras?.nome || "-"}</TableCell>
                  <TableCell className="text-right font-semibold">
                    <span className={lancamento.tipo_lancamento === "receita" ? "text-green-600" : "text-red-600"}>
                      {formatCurrency(lancamento.valor_liquido)}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(lancamento.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedLancamento(lancamento);
                          setDetailsDialogOpen(true);
                        }}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      {lancamento.status === "pendente" && userRole === "superintendente" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedLancamento(lancamento);
                              setApprovalAction("aprovar");
                              setApprovalDialogOpen(true);
                            }}
                          >
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedLancamento(lancamento);
                              setApprovalAction("rejeitar");
                              setApprovalDialogOpen(true);
                            }}
                          >
                            <XCircle className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                      {lancamento.status === "aprovado" && userRole === "superintendente" && (
                        <Button size="sm" variant="ghost" onClick={() => handleMarcarPago(lancamento)}>
                          <DollarSign className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedLancamento ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data do Lançamento *</Label>
                <Input
                  type="date"
                  value={formData.data_lancamento}
                  onChange={(e) => setFormData({ ...formData, data_lancamento: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label>Data de Competência *</Label>
                <Input
                  type="date"
                  value={formData.data_competencia}
                  onChange={(e) => setFormData({ ...formData, data_competencia: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label>Tipo *</Label>
                <Select
                  value={formData.tipo_lancamento}
                  onValueChange={(value) => setFormData({ ...formData, tipo_lancamento: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receita">Receita</SelectItem>
                    <SelectItem value="despesa">Despesa</SelectItem>
                    <SelectItem value="provisao">Provisão</SelectItem>
                    <SelectItem value="ajuste">Ajuste</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Categoria *</Label>
                <Select
                  value={formData.categoria}
                  onValueChange={(value) => setFormData({ ...formData, categoria: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="premio">Prêmio</SelectItem>
                    <SelectItem value="comissao">Comissão</SelectItem>
                    <SelectItem value="sinistro">Sinistro</SelectItem>
                    <SelectItem value="indenizacao">Indenização</SelectItem>
                    <SelectItem value="salvados">Salvados</SelectItem>
                    <SelectItem value="ressarcimento">Ressarcimento</SelectItem>
                    <SelectItem value="taxa_administrativa">Taxa Administrativa</SelectItem>
                    <SelectItem value="custo_operacional">Custo Operacional</SelectItem>
                    <SelectItem value="ajuste_tecnico">Ajuste Técnico</SelectItem>
                    <SelectItem value="estorno">Estorno</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Valor Bruto *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.valor_bruto}
                  onChange={(e) => setFormData({ ...formData, valor_bruto: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label>Valor Desconto</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.valor_desconto}
                  onChange={(e) => setFormData({ ...formData, valor_desconto: e.target.value })}
                />
              </div>

              <div>
                <Label>Valor Líquido</Label>
                <Input type="number" step="0.01" value={formData.valor_liquido} disabled />
              </div>

              <div>
                <Label>Corretora</Label>
                <Select
                  value={formData.corretora_id}
                  onValueChange={(value) => setFormData({ ...formData, corretora_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {corretoras.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Sinistro</Label>
                <Select
                  value={formData.sinistro_id}
                  onValueChange={(value) => setFormData({ ...formData, sinistro_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sinistros.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        #{s.numero} - {s.assunto}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Nº Apólice</Label>
                <Input
                  value={formData.apolice_numero}
                  onChange={(e) => setFormData({ ...formData, apolice_numero: e.target.value })}
                />
              </div>

              <div>
                <Label>Documento Fiscal</Label>
                <Input
                  value={formData.documento_fiscal}
                  onChange={(e) => setFormData({ ...formData, documento_fiscal: e.target.value })}
                />
              </div>

              <div>
                <Label>Data Vencimento</Label>
                <Input
                  type="date"
                  value={formData.data_vencimento}
                  onChange={(e) => setFormData({ ...formData, data_vencimento: e.target.value })}
                />
              </div>

              <div>
                <Label>Forma de Pagamento</Label>
                <Select
                  value={formData.forma_pagamento}
                  onValueChange={(value) => setFormData({ ...formData, forma_pagamento: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Descrição *</Label>
              <Input
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                required
              />
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setSelectedLancamento(null);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit">{selectedLancamento ? "Atualizar" : "Criar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Lançamento</DialogTitle>
          </DialogHeader>
          {selectedLancamento && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Número</Label>
                  <p className="font-mono">{selectedLancamento.numero_lancamento}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div>{getStatusBadge(selectedLancamento.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Tipo</Label>
                  <div className="flex items-center gap-2 capitalize">
                    {getTipoIcon(selectedLancamento.tipo_lancamento)}
                    {selectedLancamento.tipo_lancamento}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Categoria</Label>
                  <p className="capitalize">{selectedLancamento.categoria}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Valor Bruto</Label>
                  <p className="font-semibold">{formatCurrency(selectedLancamento.valor_bruto)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Valor Líquido</Label>
                  <p className="font-semibold text-lg">{formatCurrency(selectedLancamento.valor_liquido)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Data Lançamento</Label>
                  <p>
                    {format(new Date(selectedLancamento.data_lancamento), "dd/MM/yyyy", {
                      locale: ptBR,
                    })}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Competência</Label>
                  <p>
                    {format(new Date(selectedLancamento.data_competencia), "dd/MM/yyyy", {
                      locale: ptBR,
                    })}
                  </p>
                </div>
                {selectedLancamento.corretoras && (
                  <div>
                    <Label className="text-muted-foreground">Corretora</Label>
                    <p>{selectedLancamento.corretoras.nome}</p>
                  </div>
                )}
                {selectedLancamento.apolice_numero && (
                  <div>
                    <Label className="text-muted-foreground">Apólice</Label>
                    <p>{selectedLancamento.apolice_numero}</p>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-muted-foreground">Descrição</Label>
                <p>{selectedLancamento.descricao}</p>
              </div>
              {selectedLancamento.observacoes && (
                <div>
                  <Label className="text-muted-foreground">Observações</Label>
                  <p className="text-sm">{selectedLancamento.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{approvalAction === "aprovar" ? "Aprovar Lançamento" : "Rejeitar Lançamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedLancamento && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-mono text-sm">{selectedLancamento.numero_lancamento}</p>
                <p className="font-semibold">{selectedLancamento.descricao}</p>
                <p className="text-lg font-bold mt-2">{formatCurrency(selectedLancamento.valor_liquido)}</p>
              </div>
            )}

            {approvalAction === "rejeitar" && (
              <div>
                <Label>Motivo da Rejeição *</Label>
                <Textarea
                  value={motivoRejeicao}
                  onChange={(e) => setMotivoRejeicao(e.target.value)}
                  rows={3}
                  placeholder="Descreva o motivo da rejeição..."
                  required
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant={approvalAction === "aprovar" ? "default" : "destructive"} onClick={handleApproval}>
                {approvalAction === "aprovar" ? "Aprovar" : "Rejeitar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
