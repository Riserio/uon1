import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Search, 
  CheckCircle2,
  Circle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Filter
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { registrarHistoricoFinanceiro } from "@/lib/financeiroHistorico";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  corretoraId: string;
}

export default function FinanceiroConciliacao({ corretoraId }: Props) {
  const { user } = useAuth();
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [filteredLancamentos, setFilteredLancamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [conciliadoFilter, setConciliadoFilter] = useState("todos");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (corretoraId) fetchLancamentos();
  }, [corretoraId]);

  useEffect(() => {
    filterLancamentos();
  }, [lancamentos, searchTerm, conciliadoFilter]);

  const fetchLancamentos = async () => {
    setLoading(true);
    let query = supabase
      .from("lancamentos_financeiros")
      .select("*")
      .in("status", ["aprovado", "pago"])
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
        l.categoria?.toLowerCase().includes(term)
      );
    }

    if (conciliadoFilter !== "todos") {
      const isConciliado = conciliadoFilter === "conciliado";
      filtered = filtered.filter(l => l.conciliado === isConciliado);
    }

    setFilteredLancamentos(filtered);
  };

  const handleConciliar = async (ids: string[]) => {
    if (!user || ids.length === 0) return;

    try {
      const { error } = await supabase
        .from("lancamentos_financeiros")
        .update({
          conciliado: true,
          data_conciliacao: new Date().toISOString(),
          conciliado_por: user.id,
        })
        .in("id", ids);

      if (error) throw error;
      
      toast.success(`${ids.length} lançamento(s) conciliado(s)!`);
      setSelectedIds([]);
      fetchLancamentos();
    } catch (error) {
      toast.error("Erro ao conciliar lançamentos");
    }
  };

  const handleDesfazerConciliacao = async (id: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("lancamentos_financeiros")
        .update({
          conciliado: false,
          data_conciliacao: null,
          conciliado_por: null,
        })
        .eq("id", id);

      if (error) throw error;
      
      toast.success("Conciliação desfeita!");
      fetchLancamentos();
    } catch (error) {
      toast.error("Erro ao desfazer conciliação");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const pendentes = filteredLancamentos.filter(l => !l.conciliado).map(l => l.id);
    if (selectedIds.length === pendentes.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendentes);
    }
  };

  const stats = {
    total: filteredLancamentos.length,
    conciliados: filteredLancamentos.filter(l => l.conciliado).length,
    pendentes: filteredLancamentos.filter(l => !l.conciliado).length,
    valorConciliado: filteredLancamentos
      .filter(l => l.conciliado)
      .reduce((sum, l) => {
        return l.tipo_lancamento === "receita" 
          ? sum + (l.valor_liquido || 0)
          : sum - (l.valor_liquido || 0);
      }, 0),
    valorPendente: filteredLancamentos
      .filter(l => !l.conciliado)
      .reduce((sum, l) => {
        return l.tipo_lancamento === "receita" 
          ? sum + (l.valor_liquido || 0)
          : sum - (l.valor_liquido || 0);
      }, 0),
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total de Lançamentos</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-green-500/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Conciliados</p>
            <p className="text-xl font-bold text-green-600">{stats.conciliados}</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-xl font-bold text-yellow-600">{stats.pendentes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Saldo Pendente</p>
            <p className={`text-xl font-bold ${stats.valorPendente >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(stats.valorPendente)}
            </p>
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
          <Select value={conciliadoFilter} onValueChange={setConciliadoFilter}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="conciliado">Conciliados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={fetchLancamentos}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {selectedIds.length > 0 && (
            <Button onClick={() => handleConciliar(selectedIds)}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Conciliar ({selectedIds.length})
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox 
                    checked={
                      filteredLancamentos.filter(l => !l.conciliado).length > 0 &&
                      selectedIds.length === filteredLancamentos.filter(l => !l.conciliado).length
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLancamentos.map((l) => (
                <TableRow key={l.id} className={l.conciliado ? "bg-green-50/50 dark:bg-green-950/20" : ""}>
                  <TableCell>
                    {!l.conciliado && (
                      <Checkbox 
                        checked={selectedIds.includes(l.id)}
                        onCheckedChange={() => toggleSelect(l.id)}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {l.tipo_lancamento === "receita" ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {l.descricao}
                  </TableCell>
                  <TableCell>
                    {format(parseISO(l.data_lancamento), "dd/MM/yyyy", { locale: ptBR })}
                  </TableCell>
                  <TableCell className={`text-right font-bold ${l.tipo_lancamento === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                    {l.tipo_lancamento === 'receita' ? '+' : '-'}{formatCurrency(l.valor_liquido)}
                  </TableCell>
                  <TableCell>
                    {l.conciliado ? (
                      <Badge variant="default" className="gap-1 bg-green-600">
                        <CheckCircle2 className="h-3 w-3" />
                        Conciliado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Circle className="h-3 w-3" />
                        Pendente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.conciliado ? (
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleDesfazerConciliacao(l.id)}
                      >
                        Desfazer
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleConciliar([l.id])}
                      >
                        Conciliar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredLancamentos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum lançamento encontrado para conciliação
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Conciliação Bancária:</strong> Compare os lançamentos do sistema com o extrato bancário 
            e marque como conciliados aqueles que foram confirmados. Isso ajuda a garantir que todas as 
            movimentações financeiras estejam corretamente registradas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
