import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, TrendingDown, Minus, Calendar, Filter } from "lucide-react";

interface PIDHistoricoProps {
  corretoraId?: string;
}

interface HistoricoData {
  id: string;
  ano: number;
  mes: number;
  placas_ativas: number;
  total_associados: number;
  faturamento_operacional: number;
  total_recebido: number;
  sinistralidade_financeira: number;
  percentual_inadimplencia: number;
  cadastros_realizados: number;
  cancelamentos: number;
  crescimento_liquido: number;
  custo_total_eventos: number;
  abertura_total_eventos: number;
}

const mesesNome = [
  "", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

export default function PIDHistorico({ corretoraId }: PIDHistoricoProps) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<HistoricoData[]>([]);
  const [anoInicio, setAnoInicio] = useState((new Date().getFullYear() - 1).toString());
  const [anoFim, setAnoFim] = useState(new Date().getFullYear().toString());

  const anos = Array.from({ length: 6 }, (_, i) => (new Date().getFullYear() - i).toString());

  const fetchHistorico = async () => {
    if (!corretoraId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pid_operacional")
        .select("*")
        .eq("corretora_id", corretoraId)
        .gte("ano", parseInt(anoInicio))
        .lte("ano", parseInt(anoFim))
        .order("ano", { ascending: false })
        .order("mes", { ascending: false });

      if (error) throw error;
      setDados((data || []) as unknown as HistoricoData[]);
    } catch (error: any) {
      console.error("Error fetching historico:", error);
      toast.error("Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (corretoraId) {
      fetchHistorico();
    }
  }, [corretoraId, anoInicio, anoFim]);

  const getTrendIcon = (atual: number, anterior: number | undefined, invert = false) => {
    if (!anterior) return <Minus className="h-3 w-3 text-muted-foreground" />;
    const diff = atual - anterior;
    const isPositive = invert ? diff < 0 : diff > 0;
    if (Math.abs(diff) < 0.001) return <Minus className="h-3 w-3 text-muted-foreground" />;
    return isPositive 
      ? <TrendingUp className="h-3 w-3 text-green-500" />
      : <TrendingDown className="h-3 w-3 text-red-500" />;
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  // Calcular totais
  const totais = dados.reduce((acc, item) => ({
    faturamento: acc.faturamento + (item.faturamento_operacional || 0),
    recebido: acc.recebido + (item.total_recebido || 0),
    cadastros: acc.cadastros + (item.cadastros_realizados || 0),
    cancelamentos: acc.cancelamentos + (item.cancelamentos || 0),
    eventos: acc.eventos + (item.abertura_total_eventos || 0),
    custoEventos: acc.custoEventos + (item.custo_total_eventos || 0),
  }), { faturamento: 0, recebido: 0, cadastros: 0, cancelamentos: 0, eventos: 0, custoEventos: 0 });

  return (
    <div className="space-y-6">
      {/* Header e Filtros */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Histórico Comparativo
          </h2>
          <p className="text-sm text-muted-foreground">
            Visualize e compare dados de múltiplos períodos
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={anoInicio} onValueChange={setAnoInicio}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="De" />
            </SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">até</span>
          <Select value={anoFim} onValueChange={setAnoFim}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Até" />
            </SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards de Totais */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Faturamento Total</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(totais.faturamento)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Recebido</div>
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              {formatCurrency(totais.recebido)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Cadastros</div>
            <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
              {totais.cadastros.toLocaleString("pt-BR")}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Cancelamentos</div>
            <div className="text-lg font-bold text-red-600 dark:text-red-400">
              {totais.cancelamentos.toLocaleString("pt-BR")}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Eventos</div>
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {totais.eventos.toLocaleString("pt-BR")}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Custo Eventos</div>
            <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
              {formatCurrency(totais.custoEventos)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela Comparativa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Dados Mensais</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : dados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum dado encontrado para o período selecionado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Período</TableHead>
                    <TableHead className="text-right font-semibold">Placas</TableHead>
                    <TableHead className="text-right font-semibold">Faturamento</TableHead>
                    <TableHead className="text-right font-semibold">Recebido</TableHead>
                    <TableHead className="text-right font-semibold">Sinistralidade</TableHead>
                    <TableHead className="text-right font-semibold">Inadimpl.</TableHead>
                    <TableHead className="text-right font-semibold">Cadastros</TableHead>
                    <TableHead className="text-right font-semibold">Cancelam.</TableHead>
                    <TableHead className="text-right font-semibold">Cresc. Líq.</TableHead>
                    <TableHead className="text-right font-semibold">Eventos</TableHead>
                    <TableHead className="text-right font-semibold">Custo Eventos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.map((item, index) => {
                    const anterior = index > 0 ? dados[index - 1] : undefined;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell>
                          <Badge variant="outline" className="font-medium">
                            {mesesNome[item.mes]}/{item.ano}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {item.placas_ativas?.toLocaleString("pt-BR") || 0}
                            {getTrendIcon(item.placas_ativas, anterior?.placas_ativas)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <div className="flex items-center justify-end gap-1">
                            {formatCurrency(item.faturamento_operacional)}
                            {getTrendIcon(item.faturamento_operacional, anterior?.faturamento_operacional)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {formatCurrency(item.total_recebido)}
                            {getTrendIcon(item.total_recebido, anterior?.total_recebido)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className={item.sinistralidade_financeira > 0.5 ? "text-red-500" : ""}>
                              {formatPercent(item.sinistralidade_financeira || 0)}
                            </span>
                            {getTrendIcon(item.sinistralidade_financeira, anterior?.sinistralidade_financeira, true)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className={item.percentual_inadimplencia > 0.1 ? "text-amber-500" : ""}>
                              {formatPercent(item.percentual_inadimplencia || 0)}
                            </span>
                            {getTrendIcon(item.percentual_inadimplencia, anterior?.percentual_inadimplencia, true)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {item.cadastros_realizados?.toLocaleString("pt-BR") || 0}
                        </TableCell>
                        <TableCell className="text-right text-red-500">
                          {item.cancelamentos?.toLocaleString("pt-BR") || 0}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={item.crescimento_liquido >= 0 ? "text-green-600" : "text-red-500"}>
                            {formatPercent(item.crescimento_liquido || 0)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.abertura_total_eventos?.toLocaleString("pt-BR") || 0}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.custo_total_eventos)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
