import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, FileText, DollarSign, Calendar, CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

interface SinistroData {
  id: string;
  numero: number;
  status: string;
  created_at: string;
  custo_oficina: number | null;
  custo_reparo: number | null;
  custo_acordo: number | null;
  custo_terceiros: number | null;
  custo_perda_total: number | null;
  custo_perda_parcial: number | null;
  valor_franquia: number | null;
  valor_indenizacao: number | null;
  cliente_nome: string | null;
  veiculo_placa: string | null;
  atendimentos: {
    corretora_id: string | null;
    assunto: string;
    data_concluido: string | null;
  };
}

export default function CustosSinistros() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>(
    searchParams.get("corretora") || "todos"
  );
  const [sinistros, setSinistros] = useState<SinistroData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCorretoras();
    fetchSinistros();
  }, [selectedCorretora]);

  const fetchCorretoras = async () => {
    const { data, error } = await supabase
      .from("corretoras")
      .select("id, nome")
      .order("nome");
    if (!error && data) setCorretoras(data);
  };

  const fetchSinistros = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("vistorias")
        .select(`
          id,
          numero,
          status,
          created_at,
          custo_oficina,
          custo_reparo,
          custo_acordo,
          custo_terceiros,
          custo_perda_total,
          custo_perda_parcial,
          valor_franquia,
          valor_indenizacao,
          cliente_nome,
          veiculo_placa,
          atendimentos!inner(corretora_id, assunto, data_concluido)
        `)
        .order("numero", { ascending: false });

      if (selectedCorretora !== "todos") {
        query = query.eq("atendimentos.corretora_id", selectedCorretora);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSinistros(data || []);
    } catch (error) {
      toast.error("Erro ao carregar sinistros");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const calcularCustoTotal = (sinistro: SinistroData) => {
    return (
      (sinistro.custo_oficina || 0) +
      (sinistro.custo_reparo || 0) +
      (sinistro.custo_acordo || 0) +
      (sinistro.custo_terceiros || 0) +
      (sinistro.custo_perda_total || 0) +
      (sinistro.custo_perda_parcial || 0) +
      (sinistro.valor_franquia || 0) +
      (sinistro.valor_indenizacao || 0)
    );
  };

  const formatDate = (date: string | null) => {
    if (!date) return "Não concluído";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <DollarSign className="h-7 w-7 text-primary" />
            </div>
            Custos de Sinistros
          </h1>
          <p className="text-muted-foreground mt-1">Resumo detalhado dos custos por sinistro</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-full md:w-64">
            <Label>Filtrar por Corretora</Label>
            <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as Corretoras</SelectItem>
                {corretoras.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {sinistros.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum sinistro encontrado</p>
            </CardContent>
          </Card>
        ) : (
          sinistros.map((sinistro) => {
            const custoTotal = calcularCustoTotal(sinistro);
            return (
              <Card key={sinistro.id} className="border-2 hover:border-primary/40 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        Sinistro #{sinistro.numero}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {sinistro.atendimentos.assunto}
                      </p>
                      {sinistro.cliente_nome && (
                        <p className="text-sm font-medium mt-1">
                          {sinistro.cliente_nome}
                          {sinistro.veiculo_placa && ` - ${sinistro.veiculo_placa}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {formatCurrency(custoTotal)}
                      </div>
                      <p className="text-xs text-muted-foreground">Custo Total</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Abertura</p>
                        <p className="font-medium">{formatDate(sinistro.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Conclusão</p>
                        <p className="font-medium">{formatDate(sinistro.atendimentos.data_concluido)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <p className="font-medium capitalize">{sinistro.status}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <p className="text-sm font-medium mb-2">Detalhamento de Custos:</p>
                    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4 text-sm">
                      {sinistro.custo_oficina && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Oficina:</span>
                          <span className="font-medium">{formatCurrency(sinistro.custo_oficina)}</span>
                        </div>
                      )}
                      {sinistro.custo_reparo && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Reparo:</span>
                          <span className="font-medium">{formatCurrency(sinistro.custo_reparo)}</span>
                        </div>
                      )}
                      {sinistro.custo_acordo && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Acordo:</span>
                          <span className="font-medium">{formatCurrency(sinistro.custo_acordo)}</span>
                        </div>
                      )}
                      {sinistro.custo_terceiros && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Terceiros:</span>
                          <span className="font-medium">{formatCurrency(sinistro.custo_terceiros)}</span>
                        </div>
                      )}
                      {sinistro.custo_perda_total && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Perda Total:</span>
                          <span className="font-medium">{formatCurrency(sinistro.custo_perda_total)}</span>
                        </div>
                      )}
                      {sinistro.custo_perda_parcial && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Perda Parcial:</span>
                          <span className="font-medium">{formatCurrency(sinistro.custo_perda_parcial)}</span>
                        </div>
                      )}
                      {sinistro.valor_franquia && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Franquia:</span>
                          <span className="font-medium">{formatCurrency(sinistro.valor_franquia)}</span>
                        </div>
                      )}
                      {sinistro.valor_indenizacao && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Indenização:</span>
                          <span className="font-medium">{formatCurrency(sinistro.valor_indenizacao)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
