import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Car, AlertTriangle, Loader2, FileText, MapPin, Info, History, RefreshCw } from "lucide-react";

interface IPVAInfo {
  situacao: string;
  parcelas: { ano: number; valor: number; status: string }[];
  total_devido: number;
}

interface MultaInfo {
  auto_infracao: string;
  data: string;
  descricao: string;
  valor: number;
  status: string;
}

interface LicenciamentoInfo {
  exercicio: number;
  situacao: string;
  valor: number;
}

interface ConsultaResult {
  placa: string;
  renavam: string;
  uf: string;
  ipva: IPVAInfo;
  multas: MultaInfo[];
  licenciamento: LicenciamentoInfo;
  situacao: string;
  fonte: string;
  aviso: string;
}

interface HistoricoConsulta {
  id: string;
  placa: string;
  renavam: string | null;
  uf: string | null;
  data_consulta: string;
  resultado_json: ConsultaResult;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const formatPlaca = (value: string) => {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length <= 3) return clean;
  return clean.slice(0, 3) + "-" + clean.slice(3, 7);
};

export default function DebitosVeiculares() {
  const [placa, setPlaca] = useState("");
  const [renavam, setRenavam] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ConsultaResult | null>(null);
  const [historico, setHistorico] = useState<HistoricoConsulta[]>([]);
  const [showHistorico, setShowHistorico] = useState(false);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const consultarVeiculo = async () => {
    const cleanPlaca = placa.replace(/[^A-Z0-9]/gi, "");
    if (cleanPlaca.length < 7) {
      toast.error("Informe uma placa válida (7 caracteres)");
      return;
    }

    setLoading(true);
    setResultado(null);
    try {
      const { data, error } = await supabase.functions.invoke("consulta-veiculo", {
        body: { placa: cleanPlaca, renavam: renavam.replace(/\D/g, "") },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro na consulta");

      setResultado(data.data);
      toast.success("Consulta realizada com sucesso");
    } catch (error: any) {
      console.error("Erro:", error);
      toast.error(error.message || "Erro ao consultar veículo");
    } finally {
      setLoading(false);
    }
  };

  const carregarHistorico = async () => {
    setLoadingHistorico(true);
    try {
      const { data, error } = await supabase
        .from("consultas_veiculo")
        .select("*")
        .order("data_consulta", { ascending: false })
        .limit(20);

      if (error) throw error;
      setHistorico((data || []) as unknown as HistoricoConsulta[]);
      setShowHistorico(true);
    } catch (error: any) {
      toast.error("Erro ao carregar histórico");
    } finally {
      setLoadingHistorico(false);
    }
  };

  const resetConsulta = () => {
    setPlaca("");
    setRenavam("");
    setResultado(null);
  };

  const situacaoColor = (sit: string) => {
    if (sit.includes("regular")) return "default";
    if (sit.includes("nao_identificada")) return "secondary";
    return "outline";
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Débitos Veiculares</h1>
          <p className="text-muted-foreground">Consulte IPVA, multas e licenciamento por placa e RENAVAM</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={carregarHistorico} disabled={loadingHistorico}>
            {loadingHistorico ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
            <span className="ml-1 hidden sm:inline">Histórico</span>
          </Button>
          {resultado && (
            <Button variant="outline" size="sm" onClick={resetConsulta}>
              <RefreshCw className="h-4 w-4 mr-1" /> Nova Consulta
            </Button>
          )}
        </div>
      </div>

      {/* Formulário de Consulta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Consultar Veículo
          </CardTitle>
          <CardDescription>Informe a placa e opcionalmente o RENAVAM</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="ABC-1234 ou ABC1D23"
              value={placa}
              onChange={(e) => setPlaca(formatPlaca(e.target.value))}
              maxLength={8}
              className="max-w-[200px] font-mono text-lg tracking-wider uppercase"
              disabled={loading}
              onKeyDown={(e) => e.key === "Enter" && consultarVeiculo()}
            />
            <Input
              placeholder="RENAVAM (opcional)"
              value={renavam}
              onChange={(e) => setRenavam(e.target.value.replace(/\D/g, "").slice(0, 11))}
              maxLength={11}
              className="max-w-[200px] font-mono"
              disabled={loading}
              onKeyDown={(e) => e.key === "Enter" && consultarVeiculo()}
            />
            <Button
              onClick={consultarVeiculo}
              disabled={loading || placa.replace(/[^A-Z0-9]/gi, "").length < 7}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Consultar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Consulta em portais públicos estaduais (DETRAN / Secretaria da Fazenda)
          </p>
        </CardContent>
      </Card>

      {/* Resultado */}
      {resultado && (
        <>
          {/* Info do Veículo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5" />
                Dados do Veículo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Placa</p>
                  <p className="font-semibold font-mono">{resultado.placa}</p>
                </div>
                {resultado.renavam && (
                  <div>
                    <p className="text-sm text-muted-foreground">RENAVAM</p>
                    <p className="font-semibold font-mono">{resultado.renavam}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> UF
                  </p>
                  <p className="font-semibold">{resultado.uf}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Situação</p>
                  <Badge variant={situacaoColor(resultado.situacao)}>
                    {resultado.situacao.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* IPVA */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                IPVA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Situação:</span>
                  <span className="font-medium">{resultado.ipva.situacao.replace(/_/g, " ")}</span>
                </div>
                {resultado.ipva.parcelas.length > 0 ? (
                  resultado.ipva.parcelas.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <div>
                        <span className="font-medium">Exercício {p.ano}</span>
                        <Badge variant="outline" className="ml-2 text-xs">{p.status.replace(/_/g, " ")}</Badge>
                      </div>
                      <span className="font-bold">{p.valor > 0 ? formatCurrency(p.valor) : "—"}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma parcela encontrada</p>
                )}
                {resultado.ipva.total_devido > 0 && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between font-bold">
                      <span>Total devido:</span>
                      <span className="text-lg">{formatCurrency(resultado.ipva.total_devido)}</span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Multas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Multas ({resultado.multas.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resultado.multas.length > 0 ? (
                <div className="space-y-3">
                  {resultado.multas.map((m, i) => (
                    <div key={i} className="p-3 rounded-lg border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{m.descricao}</p>
                          <p className="text-sm text-muted-foreground">
                            Auto: {m.auto_infracao} • Data: {m.data}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{formatCurrency(m.valor)}</p>
                          <Badge variant="outline" className="text-xs">{m.status}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma multa encontrada nesta consulta
                </p>
              )}
            </CardContent>
          </Card>

          {/* Licenciamento */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5 text-green-500" />
                Licenciamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Exercício</p>
                  <p className="font-semibold">{resultado.licenciamento.exercicio}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Situação</p>
                  <Badge variant="outline">{resultado.licenciamento.situacao.replace(/_/g, " ")}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Valor</p>
                  <p className="font-semibold">
                    {resultado.licenciamento.valor > 0 ? formatCurrency(resultado.licenciamento.valor) : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Aviso */}
          {resultado.aviso && (
            <Card className="border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-950/10">
              <CardContent className="pt-4">
                <div className="flex gap-3 items-start">
                  <Info className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">{resultado.aviso}</p>
                    <p className="text-xs text-muted-foreground mt-1">Fonte: {resultado.fonte}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Histórico */}
      {showHistorico && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Consultas
            </CardTitle>
            <CardDescription>Últimas 20 consultas realizadas</CardDescription>
          </CardHeader>
          <CardContent>
            {historico.length > 0 ? (
              <div className="space-y-2">
                {historico.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      setResultado(h.resultado_json);
                      setPlaca(formatPlaca(h.placa));
                      setRenavam(h.renavam || "");
                      setShowHistorico(false);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold">{h.placa}</span>
                      {h.uf && <Badge variant="secondary">{h.uf}</Badge>}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(h.data_consulta).toLocaleDateString("pt-BR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma consulta anterior</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
