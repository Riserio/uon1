import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Search, Car, AlertTriangle, CreditCard, Loader2, FileText, DollarSign, Receipt, ShieldAlert, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import DetranMgCredenciais from "@/components/veiculos/DetranMgCredenciais";

interface VehicleInfo {
  license_plate: string;
  renavam?: string;
  owner_name?: string;
  state?: string;
  model?: string;
  brand?: string;
  year?: string;
}

interface Debt {
  id: string;
  title: string;
  description?: string;
  amount: number;
  due_date?: string;
  type?: string;
}

interface Installment {
  installment_number: number;
  installment_amount: number;
  total_amount: number;
  interest_rate?: number;
}

type Categoria = "multas" | "licenciamento" | "ipva" | "outros";

const CATEGORIA_LABELS: Record<Categoria, string> = {
  multas: "Multas",
  licenciamento: "Licenciamento",
  ipva: "IPVA",
  outros: "Outros débitos",
};

const CATEGORIA_ICONS: Record<Categoria, any> = {
  multas: ShieldAlert,
  licenciamento: FileText,
  ipva: Receipt,
  outros: AlertTriangle,
};

function categorizarDebito(debt: any): Categoria {
  const raw = (debt.type || debt.tipo || debt.title || debt.titulo || "").toString().toLowerCase();
  if (raw.includes("multa") || raw.includes("infra")) return "multas";
  if (raw.includes("licenciamento") || raw.includes("licenca") || raw.includes("licença")) return "licenciamento";
  if (raw.includes("ipva")) return "ipva";
  return "outros";
}

export default function DebitosVeiculares() {
  const { user } = useAuth();
  const [placa, setPlaca] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"search" | "vehicle" | "debts" | "installments">("search");
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [debts, setDebts] = useState<any[]>([]);
  const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [protocol, setProtocol] = useState<string>("");
  const [rawDebtsResponse, setRawDebtsResponse] = useState<any>(null);

  // Consulta direta ao Detran-MG via Gov.br (complementar à Zapay) - assíncrona:
  // dispara o robô no GitHub Actions e faz polling do resultado.
  const [detranMgExecucaoId, setDetranMgExecucaoId] = useState<string | null>(null);
  const [detranMgStatus, setDetranMgStatus] = useState<"idle" | "executando" | "sucesso" | "erro">("idle");
  const [detranMgResultado, setDetranMgResultado] = useState<any>(null);
  const [detranMgErro, setDetranMgErro] = useState<string | null>(null);
  const detranMgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatPlaca = (value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length <= 3) return clean;
    return clean.slice(0, 3) + "-" + clean.slice(3, 7);
  };

  const handlePlacaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaca(formatPlaca(e.target.value));
  };

  // Registra toda consulta (sucesso ou falha) na tabela de auditoria consultas_veiculo,
  // para termos histórico de quem consultou o quê e quando - independente da fonte
  // (hoje Zapay; futuramente também Detran-MG/Gov.br).
  const registrarAuditoria = async (params: {
    cleanPlaca: string;
    uf?: string | null;
    renavam?: string | null;
    sucesso: boolean;
    erro?: string | null;
    resultado?: any;
  }) => {
    if (!user) return;
    try {
      let corretoraId: string | null = null;
      const { data: cu } = await supabase
        .from("corretora_usuarios")
        .select("corretora_id")
        .eq("profile_id", user.id)
        .eq("ativo", true)
        .maybeSingle();
      corretoraId = (cu as any)?.corretora_id ?? null;

      await (supabase as any).from("consultas_veiculo").insert({
        placa: params.cleanPlaca,
        renavam: params.renavam || null,
        uf: params.uf || null,
        usuario_id: user.id,
        corretora_id: corretoraId,
        fonte: "zapay",
        sucesso: params.sucesso,
        erro: params.erro || null,
        resultado_json: params.resultado || null,
      });
    } catch (e) {
      // Log de auditoria nunca deve travar o fluxo principal de consulta
      console.error("Erro ao registrar auditoria da consulta:", e);
    }
  };

  const consultarVeiculo = async () => {
    const cleanPlaca = placa.replace(/[^A-Z0-9]/gi, "");
    if (cleanPlaca.length < 7) {
      toast.error("Informe uma placa válida (7 caracteres)");
      return;
    }

    setLoading(true);
    try {
      // Step 1: Enriquecer placa
      const { data: vehicleData, error: vehicleError } = await supabase.functions.invoke("zapay-proxy", {
        body: { action: "vehicle", license_plate: cleanPlaca },
      });

      if (vehicleError) throw vehicleError;
      if (!vehicleData?.success) throw new Error(vehicleData?.error || "Erro ao consultar veículo");

      const vehicle = vehicleData.data;
      setVehicleInfo({
        license_plate: cleanPlaca,
        renavam: vehicle.renavam,
        owner_name: vehicle.owner_name || vehicle.nome_proprietario,
        state: vehicle.state || vehicle.uf,
        model: vehicle.model || vehicle.modelo,
        brand: vehicle.brand || vehicle.marca,
        year: vehicle.year || vehicle.ano,
      });

      // Step 2: Buscar débitos
      const debtsPayload: any = {
        action: "debts",
        license_plate: cleanPlaca,
      };
      if (vehicle.renavam) debtsPayload.renavam = vehicle.renavam;
      if (vehicle.state || vehicle.uf) debtsPayload.state = vehicle.state || vehicle.uf;

      const { data: debtsData, error: debtsError } = await supabase.functions.invoke("zapay-proxy", {
        body: debtsPayload,
      });

      if (debtsError) throw debtsError;
      if (!debtsData?.success) throw new Error(debtsData?.error || "Erro ao consultar débitos");

      setRawDebtsResponse(debtsData.data);
      const debtsList = debtsData.data?.debts || debtsData.data?.debitos || [];
      setDebts(debtsList);
      setProtocol(debtsData.data?.protocol || debtsData.data?.protocolo || "");
      setStep(debtsList.length > 0 ? "debts" : "vehicle");

      await registrarAuditoria({
        cleanPlaca,
        uf: vehicle.state || vehicle.uf,
        renavam: vehicle.renavam,
        sucesso: true,
        resultado: debtsData.data,
      });

      if (debtsList.length === 0) {
        toast.info("Veículo não possui débitos!");
      } else {
        toast.success(`${debtsList.length} débito(s) encontrado(s)`);
      }
    } catch (error: any) {
      console.error("Erro na consulta:", error);
      toast.error(error.message || "Erro ao consultar veículo");
      await registrarAuditoria({
        cleanPlaca,
        sucesso: false,
        erro: error.message || "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  };

  const pararPollingDetranMg = () => {
    if (detranMgPollRef.current) {
      clearInterval(detranMgPollRef.current);
      detranMgPollRef.current = null;
    }
  };

  const consultarDetranMg = async () => {
    if (!vehicleInfo || !user) return;
    let corretoraId: string | null = null;
    const { data: cu } = await supabase
      .from("corretora_usuarios")
      .select("corretora_id")
      .eq("profile_id", user.id)
      .eq("ativo", true)
      .maybeSingle();
    corretoraId = (cu as any)?.corretora_id ?? null;

    if (!corretoraId) {
      toast.error("Não foi possível identificar a associação do usuário");
      return;
    }

    setDetranMgStatus("executando");
    setDetranMgResultado(null);
    setDetranMgErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("disparar-detran-mg-workflow", {
        body: {
          corretora_id: corretoraId,
          placa: vehicleInfo.license_plate,
          renavam: vehicleInfo.renavam,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Erro ao iniciar consulta Detran-MG");

      setDetranMgExecucaoId(data.execucao_id);
      toast.info("Consulta ao Detran-MG iniciada, isso pode levar 1-2 minutos...");

      pararPollingDetranMg();
      detranMgPollRef.current = setInterval(async () => {
        const { data: exec } = await (supabase as any)
          .from("detran_mg_execucoes")
          .select("status, erro, resultado_json")
          .eq("id", data.execucao_id)
          .maybeSingle();
        if (!exec || exec.status === "executando") return;
        pararPollingDetranMg();
        setDetranMgStatus(exec.status === "sucesso" ? "sucesso" : "erro");
        setDetranMgResultado(exec.resultado_json || null);
        setDetranMgErro(exec.erro || null);
        if (exec.status === "sucesso") toast.success("Consulta Detran-MG concluída");
        else toast.error(exec.erro || "Falha na consulta ao Detran-MG");
      }, 4000);
    } catch (error: any) {
      setDetranMgStatus("erro");
      setDetranMgErro(error.message || "Erro ao iniciar consulta");
      toast.error(error.message || "Erro ao iniciar consulta Detran-MG");
    }
  };

  useEffect(() => {
    return () => pararPollingDetranMg();
  }, []);

  const toggleDebt = (debtId: string) => {
    setSelectedDebts((prev) =>
      prev.includes(debtId) ? prev.filter((id) => id !== debtId) : [...prev, debtId]
    );
  };

  const simularParcelas = async () => {
    if (selectedDebts.length === 0) {
      toast.error("Selecione pelo menos um débito");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("zapay-proxy", {
        body: {
          action: "installments",
          protocol,
          debts: selectedDebts,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao simular parcelas");

      const installmentsList = data.data?.installments || data.data?.parcelas || [];
      setInstallments(installmentsList);
      setStep("installments");
      toast.success("Simulação de parcelamento carregada");
    } catch (error: any) {
      console.error("Erro na simulação:", error);
      toast.error(error.message || "Erro ao simular parcelas");
    } finally {
      setLoading(false);
    }
  };

  const resetConsulta = () => {
    setPlaca("");
    setStep("search");
    setVehicleInfo(null);
    setDebts([]);
    setSelectedDebts([]);
    setInstallments([]);
    setProtocol("");
    setRawDebtsResponse(null);
    pararPollingDetranMg();
    setDetranMgExecucaoId(null);
    setDetranMgStatus("idle");
    setDetranMgResultado(null);
    setDetranMgErro(null);
  };

  const totalSelected = debts
    .filter((d: any) => selectedDebts.includes(d.id || d.debt_id))
    .reduce((sum: number, d: any) => sum + (d.amount || d.valor || 0), 0);

  // Agrupa os débitos retornados pela Zapay em multas / licenciamento / IPVA / outros,
  // já que hoje eles chegam como uma lista genérica.
  const debtsPorCategoria: Record<Categoria, any[]> = { multas: [], licenciamento: [], ipva: [], outros: [] };
  debts.forEach((debt: any, idx: number) => {
    const cat = categorizarDebito(debt);
    debtsPorCategoria[cat].push({ ...debt, __idx: idx });
  });
  const categoriasComDebito = (Object.keys(CATEGORIA_LABELS) as Categoria[]).filter(
    (c) => debtsPorCategoria[c].length > 0
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={Car}
        title="Débitos Veiculares"
        subtitle="Consulte débitos por placa e simule parcelamento"
        actions={
          <div className="flex items-center gap-2">
            <DetranMgCredenciais />
            {step !== "search" && (
              <Button variant="outline" onClick={resetConsulta} className="rounded-xl">
                Nova Consulta
              </Button>
            )}
          </div>
        }
      />

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Consultar Veículo
          </CardTitle>
          <CardDescription>Informe a placa do veículo para consultar débitos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="ABC-1234 ou ABC1D23"
              value={placa}
              onChange={handlePlacaChange}
              maxLength={8}
              className="max-w-xs font-mono text-lg tracking-wider uppercase"
              disabled={loading || step !== "search"}
              onKeyDown={(e) => e.key === "Enter" && consultarVeiculo()}
            />
            <Button onClick={consultarVeiculo} disabled={loading || placa.replace(/[^A-Z0-9]/gi, "").length < 7 || step !== "search"}>
              {loading && step === "search" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Consultar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Ambiente: Sandbox (homologação) • Powered by Zapay
          </p>
        </CardContent>
      </Card>

      {/* Vehicle Info */}
      {vehicleInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Dados do Veículo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Placa</p>
                <p className="font-semibold font-mono">{vehicleInfo.license_plate}</p>
              </div>
              {vehicleInfo.renavam && (
                <div>
                  <p className="text-sm text-muted-foreground">Renavam</p>
                  <p className="font-semibold">{vehicleInfo.renavam}</p>
                </div>
              )}
              {vehicleInfo.owner_name && (
                <div>
                  <p className="text-sm text-muted-foreground">Proprietário</p>
                  <p className="font-semibold">{vehicleInfo.owner_name}</p>
                </div>
              )}
              {vehicleInfo.brand && (
                <div>
                  <p className="text-sm text-muted-foreground">Marca</p>
                  <p className="font-semibold">{vehicleInfo.brand}</p>
                </div>
              )}
              {vehicleInfo.model && (
                <div>
                  <p className="text-sm text-muted-foreground">Modelo</p>
                  <p className="font-semibold">{vehicleInfo.model}</p>
                </div>
              )}
              {vehicleInfo.year && (
                <div>
                  <p className="text-sm text-muted-foreground">Ano</p>
                  <p className="font-semibold">{vehicleInfo.year}</p>
                </div>
              )}
              {vehicleInfo.state && (
                <div>
                  <p className="text-sm text-muted-foreground">UF</p>
                  <p className="font-semibold">{vehicleInfo.state}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Consulta direta ao Detran-MG via Gov.br (complementar à Zapay) */}
      {vehicleInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Consulta Direta Detran-MG (Gov.br)
            </CardTitle>
            <CardDescription>
              Consulta oficial de multas, licenciamento e IPVA direto no Detran-MG, usando o login Gov.br configurado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={consultarDetranMg}
              disabled={detranMgStatus === "executando"}
              variant="outline"
              className="rounded-xl"
            >
              {detranMgStatus === "executando" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Consultar via Detran-MG
            </Button>

            {detranMgStatus === "executando" && (
              <p className="text-sm text-muted-foreground">
                Robô fazendo login no Gov.br e consultando o Detran-MG... isso pode levar 1-2 minutos.
              </p>
            )}

            {detranMgStatus === "sucesso" && detranMgResultado && (
              <div className="rounded-lg border p-4 space-y-2 bg-emerald-500/5 border-emerald-500/20">
                <p className="text-sm font-medium flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Consulta concluída
                </p>
                {detranMgResultado.multas_raw && (
                  <p className="text-xs text-muted-foreground"><strong>Multas:</strong> {detranMgResultado.multas_raw}</p>
                )}
                {detranMgResultado.licenciamento_raw && (
                  <p className="text-xs text-muted-foreground"><strong>Licenciamento:</strong> {detranMgResultado.licenciamento_raw}</p>
                )}
                {detranMgResultado.ipva_raw && (
                  <p className="text-xs text-muted-foreground"><strong>IPVA:</strong> {detranMgResultado.ipva_raw}</p>
                )}
              </div>
            )}

            {detranMgStatus === "erro" && (
              <div className="rounded-lg border p-4 flex gap-2 bg-destructive/5 border-destructive/20">
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{detranMgErro || "Falha na consulta ao Detran-MG"}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Debts - agrupados por categoria: Multas / Licenciamento / IPVA / Outros */}
      {step === "debts" && debts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Débitos Encontrados ({debts.length})
            </CardTitle>
            <CardDescription>Selecione os débitos que deseja parcelar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {categoriasComDebito.map((cat) => {
              const CatIcon = CATEGORIA_ICONS[cat];
              const itens = debtsPorCategoria[cat];
              const subtotal = itens.reduce((sum, d) => sum + (d.amount || d.valor || 0), 0);
              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CatIcon className="h-4 w-4" />
                      {CATEGORIA_LABELS[cat]}
                      <Badge variant="secondary" className="text-xs">{itens.length}</Badge>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">
                      Subtotal:{" "}
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(subtotal)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {itens.map((debt: any) => {
                      const debtId = debt.id || debt.debt_id || `debt-${debt.__idx}`;
                      const isSelected = selectedDebts.includes(debtId);
                      return (
                        <div
                          key={debtId}
                          className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                          onClick={() => toggleDebt(debtId)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleDebt(debtId)}
                              className="h-4 w-4 rounded border-border"
                            />
                            <div>
                              <p className="font-medium">
                                {debt.title || debt.titulo || debt.description || `Débito`}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {debt.type || debt.tipo || CATEGORIA_LABELS[cat]}
                                  {debt.due_date || debt.data_vencimento
                                    ? ` • Venc: ${debt.due_date || debt.data_vencimento}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-lg">
                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                                  debt.amount || debt.valor || 0
                                )}
                              </p>
                              {debt.expiration_date === null && (
                                <Badge variant="destructive" className="text-xs">Vencido</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {selectedDebts.length} débito(s) selecionado(s)
                </p>
                <p className="font-bold text-lg">
                  Total: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalSelected)}
                </p>
              </div>
              <Button onClick={simularParcelas} disabled={loading || selectedDebts.length === 0}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Simular Parcelamento
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Installments */}
      {step === "installments" && installments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Opções de Parcelamento
            </CardTitle>
            <CardDescription>
              Protocolo: <span className="font-mono">{protocol}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {installments.map((inst: any, idx: number) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">
                      {inst.installment_number || inst.parcelas || idx + 1}x
                    </Badge>
                    {(inst.interest_rate || inst.taxa_juros) != null && (
                      <span className="text-xs text-muted-foreground">
                        Juros: {((inst.interest_rate || inst.taxa_juros || 0) * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {inst.installment_number || inst.parcelas || idx + 1}x de{" "}
                    <span className="font-semibold text-foreground">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                        inst.installment_amount || inst.valor_parcela || 0
                      )}
                    </span>
                  </p>
                  <p className="text-lg font-bold mt-1">
                    Total:{" "}
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                      inst.total_amount || inst.valor_total || 0
                    )}
                  </p>
                </div>
              ))}
            </div>

            <Separator className="my-4" />
            <p className="text-sm text-muted-foreground text-center">
              Para prosseguir com o pagamento, configure as credenciais de produção da Zapay.
            </p>
          </CardContent>
        </Card>
      )}

      {/* No debts */}
      {step === "vehicle" && vehicleInfo && debts.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-medium">Nenhum débito encontrado</p>
            <p className="text-muted-foreground">Este veículo não possui débitos pendentes.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
