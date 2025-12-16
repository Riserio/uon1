import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowUpRight, 
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Filter
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { registrarHistoricoFinanceiro } from "@/lib/financeiroHistorico";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  corretoraId: string;
}

export default function FinanceiroContasPagar({ corretoraId }: Props) {
  const { user } = useAuth();
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [filteredLancamentos, setFilteredLancamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    descricao: "",
    valor_bruto: "",
    valor_desconto: "0",
    data_vencimento: "",
    data_competencia: format(new Date(), "yyyy-MM-dd"),
    categoria: "sinistro",
    observacoes: "",
    banco_favorecido: "",
    banco_codigo: "",
    banco_agencia: "",
    banco_conta: "",
  });

  useEffect(() => {
    if (corretoraId) fetchLancamentos();
  }, [corretoraId]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('contas-pagar-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lancamentos_financeiros'
        },
        () => {
          fetchLancamentos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [corretoraId]);

  useEffect(() => {
    filterLancamentos();
  }, [lancamentos, searchTerm, statusFilter]);

  const fetchLancamentos = async () => {
    setLoading(true);
    let query = supabase
      .from("lancamentos_financeiros")
      .select("*")
      .eq("tipo_lancamento", "despesa")
      .order("data_vencimento", { ascending: true });
    
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
        l.banco_favorecido?.toLowerCase().includes(term)
      );
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

      const { error } = await supabase.from("lancamentos_financeiros").insert([{
        numero_lancamento: '',
        tipo_lancamento: "despesa",
        descricao: formData.descricao,
        valor_bruto: valorBruto,
        valor_desconto: valorDesconto,
        valor_liquido: valorBruto - valorDesconto,
        data_vencimento: formData.data_vencimento || null,
        data_competencia: formData.data_competencia,
        data_lancamento: format(new Date(), "yyyy-MM-dd"),
        categoria: formData.categoria,
        observacoes: formData.observacoes || null,
        banco_favorecido: formData.banco_favorecido || null,
        banco_codigo: formData.banco_codigo || null,
        banco_agencia: formData.banco_agencia || null,
        banco_conta: formData.banco_conta || null,
        corretora_id: corretoraId === "administradora" ? null : corretoraId,
        created_by: user.id,
        status: "pendente",
      }]);

      if (error) throw error;

      toast.success("Conta a pagar criada!");
      setDialogOpen(false);
      setFormData({
        descricao: "",
        valor_bruto: "",
        valor_desconto: "0",
        data_vencimento: "",
        data_competencia: format(new Date(), "yyyy-MM-dd"),
        categoria: "sinistro",
        observacoes: "",
        banco_favorecido: "",
        banco_codigo: "",
        banco_agencia: "",
        banco_conta: "",
      });
      fetchLancamentos();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar conta");
    }
  };

  const handlePagar = async (id: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("lancamentos_financeiros")
        .update({
          status: "pago",
          data_pagamento: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Pagamento confirmado!");
      fetchLancamentos();
    } catch (error) {
      toast.error("Erro ao confirmar pagamento");
    }
  };

  const getStatusInfo = (lancamento: any) => {
    const today = new Date().toISOString().split('T')[0];
    
    if (lancamento.status === "pago") {
      return { label: "Pago", variant: "default" as const, icon: CheckCircle };
    }
    
    if (lancamento.data_vencimento) {
      if (lancamento.data_vencimento < today) {
        return { label: "Vencido", variant: "destructive" as const, icon: AlertCircle };
      }
      if (lancamento.data_vencimento === today) {
        return { label: "Vence Hoje", variant: "secondary" as const, icon: Clock };
      }
    }
    
    return { label: "A Pagar", variant: "outline" as const, icon: Calendar };
  };

  const totals = {
    total: filteredLancamentos.reduce((sum, l) => sum + (l.valor_liquido || 0), 0),
    pago: filteredLancamentos
      .filter(l => l.status === "pago")
      .reduce((sum, l) => sum + (l.valor_liquido || 0), 0),
    pendente: filteredLancamentos
      .filter(l => l.status === "pendente")
      .reduce((sum, l) => sum + (l.valor_liquido || 0), 0),
    vencido: filteredLancamentos
      .filter(l => {
        const today = new Date().toISOString().split('T')[0];
        return l.status === "pendente" && l.data_vencimento && l.data_vencimento < today;
      })
      .reduce((sum, l) => sum + (l.valor_liquido || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold">{formatCurrency(totals.total)}</p>
          </CardContent>
        </Card>
        <Card className="border-green-500/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pago</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totals.pago)}</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pendente</p>
            <p className="text-xl font-bold text-yellow-600">{formatCurrency(totals.pendente)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Vencido</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totals.vencido)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex flex-1 gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" variant="destructive">
              <Plus className="h-4 w-4" />
              Nova Despesa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5 text-red-600" />
                Nova Conta a Pagar
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-2">
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
                      <SelectItem value="sinistro">Sinistro</SelectItem>
                      <SelectItem value="indenizacao">Indenização</SelectItem>
                      <SelectItem value="salvados">Salvados</SelectItem>
                      <SelectItem value="ressarcimento">Ressarcimento</SelectItem>
                      <SelectItem value="custo_operacional">Custo Operacional</SelectItem>
                      <SelectItem value="taxa_administrativa">Taxa Administrativa</SelectItem>
                      <SelectItem value="ajuste_tecnico">Ajuste Técnico</SelectItem>
                      <SelectItem value="estorno">Estorno</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Dados Bancários (opcional)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Favorecido</Label>
                    <Input 
                      value={formData.banco_favorecido}
                      onChange={(e) => setFormData({ ...formData, banco_favorecido: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Banco</Label>
                    <Input 
                      value={formData.banco_codigo}
                      onChange={(e) => setFormData({ ...formData, banco_codigo: e.target.value })}
                      placeholder="Ex: 001"
                    />
                  </div>
                  <div>
                    <Label>Agência</Label>
                    <Input 
                      value={formData.banco_agencia}
                      onChange={(e) => setFormData({ ...formData, banco_agencia: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Conta</Label>
                    <Input 
                      value={formData.banco_conta}
                      onChange={(e) => setFormData({ ...formData, banco_conta: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea 
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t sticky bottom-0 bg-background pb-1">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="destructive">Criar</Button>
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
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Favorecido</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLancamentos.map((l) => {
                const status = getStatusInfo(l);
                const StatusIcon = status.icon;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.descricao}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.categoria}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.banco_favorecido || "-"}
                    </TableCell>
                    <TableCell>
                      {l.data_vencimento 
                        ? format(parseISO(l.data_vencimento), "dd/MM/yyyy", { locale: ptBR })
                        : "-"
                      }
                    </TableCell>
                    <TableCell className="text-right font-bold text-red-600">
                      {formatCurrency(l.valor_liquido)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {l.status === "pendente" && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handlePagar(l.id)}
                        >
                          Pagar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredLancamentos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhuma conta a pagar encontrada
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
