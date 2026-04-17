import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Car, AlertTriangle, CreditCard, Loader2, FileText, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

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

export default function DebitosVeiculares() {
  const [placa, setPlaca] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"search" | "vehicle" | "debts" | "installments">("search");
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [debts, setDebts] = useState<any[]>([]);
  const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [protocol, setProtocol] = useState<string>("");
  const [rawDebtsResponse, setRawDebtsResponse] = useState<any>(null);

  const formatPlaca = (value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length <= 3) return clean;
    return clean.slice(0, 3) + "-" + clean.slice(3, 7);
  };

  const handlePlacaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaca(formatPlaca(e.target.value));
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

      if (debtsList.length === 0) {
        toast.info("Veículo não possui débitos!");
      } else {
        toast.success(`${debtsList.length} débito(s) encontrado(s)`);
      }
    } catch (error: any) {
      console.error("Erro na consulta:", error);
      toast.error(error.message || "Erro ao consultar veículo");
    } finally {
      setLoading(false);
    }
  };

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
  };

  const totalSelected = debts
    .filter((d: any) => selectedDebts.includes(d.id || d.debt_id))
    .reduce((sum: number, d: any) => sum + (d.amount || d.valor || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={Car}
        title="Débitos Veiculares"
        subtitle="Consulte débitos por placa e simule parcelamento"
        actions={
          step !== "search" ? (
            <Button variant="outline" onClick={resetConsulta} className="rounded-xl">
              Nova Consulta
            </Button>
          ) : null
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

      {/* Debts */}
      {step === "debts" && debts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Débitos Encontrados ({debts.length})
            </CardTitle>
            <CardDescription>Selecione os débitos que deseja parcelar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {debts.map((debt: any, idx: number) => {
              const debtId = debt.id || debt.debt_id || `debt-${idx}`;
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
                        <p className="font-medium">{debt.title || debt.titulo || debt.description || `Débito #${idx + 1}`}</p>
                        <p className="text-sm text-muted-foreground">
                          {debt.type || debt.tipo || "Débito veicular"}
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
