import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { 
  Plus, 
  Search, 
  TrendingUp,
  TrendingDown,
  Filter,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  Clock
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { registrarHistoricoFinanceiro } from "@/lib/financeiroHistorico";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  corretoraId: string;
}

export default function FinanceiroLancamentos({ corretoraId }: Props) {
  const { user } = useAuth();
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [filteredLancamentos, setFilteredLancamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userNome, setUserNome] = useState("");
  const [centrosCusto, setCentrosCusto] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    tipo_lancamento: "receita",
    descricao: "",
    valor_bruto: "",
    valor_desconto: "0",
    data_vencimento: "",
    data_competencia: format(new Date(), "yyyy-MM-dd"),
    categoria: "premio",
    observacoes: "",
    centro_custo_id: "",
  });

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("nome").eq("id", user.id).single()
        .then(({ data }) => setUserNome(data?.nome || user.email || ""));
    }
  }, [user]);

  useEffect(() => {
    if (corretoraId) { fetchLancamentos(); fetchCentrosCusto(); }
  }, [corretoraId]);

  useEffect(() => {
    filterLancamentos();
  }, [lancamentos, searchTerm, tipoFilter, statusFilter]);

  const fetchLancamentos = async () => {
    setLoading(true);
    let query = supabase
      .from("lancamentos_financeiros")
      .select("*")
      .order("data_lancamento", { ascending: false });
    
    if (corretoraId === "administradora") {
      query = query.is("corretora_id", null);
    } else {
      query = query.eq("corretora_id", corretoraId);
    }
    
    const { data, error } = await query;

    if (!error && data) {
      setLancamentos(data);
    }
    setLoading(false);
  };

  const filterLancamentos = () => {
    let filtered = lancamentos;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(l => 
        l.descricao?.toLowerCase().includes(term) ||
        l.categoria?.toLowerCase().includes(term) ||
        l.numero_lancamento?.toLowerCase().includes(term)
      );
    }

    if (tipoFilter !== "todos") {
      filtered = filtered.filter(l => l.tipo_lancamento === tipoFilter);
    }

    if (statusFilter !== "todos") {
      filtered = filtered.filter(l => l.status === statusFilter);
    }

    setFilteredLancamentos(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const valorBruto = parseFloat(formData.valor_bruto);
      const valorDesconto = parseFloat(formData.valor_desconto) || 0;

      const data = {
        tipo_lancamento: formData.tipo_lancamento,
        descricao: formData.descricao,
        valor_bruto: valorBruto,
        valor_desconto: valorDesconto,
        valor_liquido: valorBruto - valorDesconto,
        data_vencimento: formData.data_vencimento || null,
        data_competencia: formData.data_competencia,
        data_lancamento: format(new Date(), "yyyy-MM-dd"),
        categoria: formData.categoria,
        observacoes: formData.observacoes || null,
        corretora_id: corretoraId === "administradora" ? null : corretoraId,
        centro_custo_id: formData.centro_custo_id || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("lancamentos_financeiros")
          .update({ ...data, updated_by: user.id })
          .eq("id", editingId);

        if (error) throw error;
        
        await registrarHistoricoFinanceiro({
          lancamentoId: editingId,
          userId: user.id,
          userNome: userNome,
          acao: "edicao",
          dadosCompletos: data,
        });
        
        toast.success("Lançamento atualizado!");
      } else {
        const { data: inserted, error } = await supabase.from("lancamentos_financeiros").insert([{
          ...data,
          numero_lancamento: '',
          created_by: user.id,
          status: "pendente",
        }]).select().single();

        if (error) throw error;
        
        await registrarHistoricoFinanceiro({
          lancamentoId: inserted?.id,
          userId: user.id,
          userNome: userNome,
          acao: "criacao",
          dadosCompletos: { ...data, status: "pendente" },
        });
        
        toast.success("Lançamento criado!");
      }

      setDialogOpen(false);
      setEditingId(null);
      resetForm();
      fetchLancamentos();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar lançamento");
    }
  };

  const handleEdit = (lancamento: any) => {
    setEditingId(lancamento.id);
    setFormData({
      tipo_lancamento: lancamento.tipo_lancamento,
      descricao: lancamento.descricao,
      valor_bruto: lancamento.valor_bruto.toString(),
      valor_desconto: lancamento.valor_desconto?.toString() || "0",
      data_vencimento: lancamento.data_vencimento || "",
      data_competencia: lancamento.data_competencia,
      categoria: lancamento.categoria,
      observacoes: lancamento.observacoes || "",
      centro_custo_id: lancamento.centro_custo_id || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este lançamento?")) return;
    if (!user) return;

    try {
      // Registrar histórico antes de deletar
      const lancamento = lancamentos.find(l => l.id === id);
      await registrarHistoricoFinanceiro({
        lancamentoId: id,
        userId: user.id,
        userNome: userNome,
        acao: "exclusao",
        dadosCompletos: lancamento,
      });

      const { error } = await supabase
        .from("lancamentos_financeiros")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Lançamento excluído!");
      fetchLancamentos();
    } catch (error) {
      toast.error("Erro ao excluir lançamento");
    }
  };

  const handleAprovar = async (id: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("lancamentos_financeiros")
        .update({
          status: "aprovado",
          aprovado_por: user.id,
          aprovado_em: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      
      await registrarHistoricoFinanceiro({
        lancamentoId: id,
        userId: user.id,
        userNome: userNome,
        acao: "aprovacao",
        campoAlterado: "status",
        valorAnterior: "pendente",
        valorNovo: "aprovado",
      });
      
      toast.success("Lançamento aprovado!");
      fetchLancamentos();
    } catch (error) {
      toast.error("Erro ao aprovar lançamento");
    }
  };

  const resetForm = () => {
    setFormData({
      tipo_lancamento: "receita",
      descricao: "",
      valor_bruto: "",
      valor_desconto: "0",
      data_vencimento: "",
      data_competencia: format(new Date(), "yyyy-MM-dd"),
      categoria: "premio",
      observacoes: "",
      centro_custo_id: "",
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      pendente: { variant: "secondary", icon: Clock, label: "Pendente" },
      aprovado: { variant: "default", icon: CheckCircle, label: "Aprovado" },
      rejeitado: { variant: "destructive", icon: XCircle, label: "Rejeitado" },
      pago: { variant: "default", icon: CheckCircle, label: "Pago" },
    };

    const config = variants[status] || variants.pendente;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters & Actions */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex flex-1 gap-2 w-full md:w-auto flex-wrap">
          <div className="relative flex-1 md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="receita">Receita</SelectItem>
              <SelectItem value="despesa">Despesa</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="rejeitado">Rejeitado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingId(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Editar Lançamento" : "Novo Lançamento"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Tipo *</Label>
                <Select 
                  value={formData.tipo_lancamento}
                  onValueChange={(v) => setFormData({ ...formData, tipo_lancamento: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receita">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        Receita
                      </div>
                    </SelectItem>
                    <SelectItem value="despesa">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-red-600" />
                        Despesa
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição *</Label>
                <Input 
                  required
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valor *</Label>
                  <CurrencyInput 
                    required
                    value={formData.valor_bruto}
                    onValueChange={(values) => setFormData({ ...formData, valor_bruto: values.value || "" })}
                    placeholder="R$ 0,00"
                  />
                </div>
                <div>
                  <Label>Desconto</Label>
                  <CurrencyInput 
                    value={formData.valor_desconto}
                    onValueChange={(values) => setFormData({ ...formData, valor_desconto: values.value || "0" })}
                    placeholder="R$ 0,00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data Vencimento</Label>
                  <Input 
                    type="date"
                    value={formData.data_vencimento}
                    onChange={(e) => setFormData({ ...formData, data_vencimento: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select 
                    value={formData.categoria}
                    onValueChange={(v) => setFormData({ ...formData, categoria: v })}
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
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea 
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingId ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLancamentos.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    {l.tipo_lancamento === "receita" ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-red-600">
                        <TrendingDown className="h-4 w-4" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {l.descricao}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{l.categoria}</Badge>
                  </TableCell>
                  <TableCell>
                    {format(parseISO(l.data_lancamento), "dd/MM/yyyy", { locale: ptBR })}
                  </TableCell>
                  <TableCell className={`text-right font-bold ${l.tipo_lancamento === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                    {l.tipo_lancamento === 'receita' ? '+' : '-'}{formatCurrency(l.valor_liquido)}
                  </TableCell>
                  <TableCell>{getStatusBadge(l.status)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {l.status === "pendente" && (
                          <DropdownMenuItem onClick={() => handleAprovar(l.id)}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Aprovar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleEdit(l)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDelete(l.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredLancamentos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum lançamento encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
