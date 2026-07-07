import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Search, Car, Loader2, FileText, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export default function DebitosVeiculares() {
  const { user } = useAuth();
  const [placa, setPlaca] = useState("");
  const [status, setStatus] = useState<"idle" | "executando" | "sucesso" | "erro">("idle");
  const [resultado, setResultado] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatPlaca = (value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length <= 3) return clean;
    return clean.slice(0, 3) + "-" + clean.slice(3, 7);
  };

  const handlePlacaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaca(formatPlaca(e.target.value));
  };

  const pararPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => pararPolling();
  }, []);

  const consultar = async () => {
    const cleanPlaca = placa.replace(/[^A-Z0-9]/gi, "");
    if (cleanPlaca.length < 7) {
      toast.error("Informe uma placa válida (7 caracteres)");
      return;
    }
    if (!user) return;

    // Resolve a associação do usuário logado apenas para fins de auditoria
    // (detran_mg_execucoes.corretora_id é NOT NULL) - o login usado na consulta
    // em si é único e compartilhado para toda a plataforma (GOV_BR_CPF/GOV_BR_SENHA).
    const { data: cu } = await supabase
      .from("corretora_usuarios")
      .select("corretora_id")
      .eq("profile_id", user.id)
      .eq("ativo", true)
      .maybeSingle();
    const corretoraId = (cu as any)?.corretora_id ?? null;

    if (!corretoraId) {
      toast.error("Não foi possível identificar a associação do usuário");
      return;
    }

    setStatus("executando");
    setResultado(null);
    setErro(null);

    try {
      const { data, error } = await supabase.functions.invoke("disparar-detran-mg-workflow", {
        body: {
          corretora_id: corretoraId,
          placa: cleanPlaca,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Erro ao iniciar consulta Detran-MG");

      toast.info("Consulta ao Detran-MG iniciada, isso pode levar 1-2 minutos...");

      pararPolling();
      pollRef.current = setInterval(async () => {
        const { data: exec } = await (supabase as any)
          .from("detran_mg_execucoes")
          .select("status, erro, resultado_json")
          .eq("id", data.execucao_id)
          .maybeSingle();
        if (!exec || exec.status === "executando") return;
        pararPolling();
        setStatus(exec.status === "sucesso" ? "sucesso" : "erro");
        setResultado(exec.resultado_json || null);
        setErro(exec.erro || null);
        if (exec.status === "sucesso") toast.success("Consulta concluída");
        else toast.error(exec.erro || "Falha na consulta ao Detran-MG");
      }, 4000);
    } catch (error: any) {
      setStatus("erro");
      setErro(error.message || "Erro ao iniciar consulta");
      toast.error(error.message || "Erro ao iniciar consulta Detran-MG");
    }
  };

  const resetConsulta = () => {
    setPlaca("");
    pararPolling();
    setStatus("idle");
    setResultado(null);
    setErro(null);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={Car}
        title="Débitos Veiculares"
        subtitle="Consulte débitos direto no Detran-MG por placa"
        actions={
          status !== "idle" && (
            <Button variant="outline" onClick={resetConsulta} className="rounded-xl">
              Nova Consulta
            </Button>
          )
        }
      />

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Consultar Veículo
          </CardTitle>
          <CardDescription>Informe a placa do veículo para consultar débitos no Detran-MG</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="ABC-1234 ou ABC1D23"
              value={placa}
              onChange={handlePlacaChange}
              maxLength={8}
              className="max-w-xs font-mono text-lg tracking-wider uppercase"
              disabled={status === "executando"}
              onKeyDown={(e) => e.key === "Enter" && consultar()}
            />
            <Button onClick={consultar} disabled={status === "executando" || placa.replace(/[^A-Z0-9]/gi, "").length < 7}>
              {status === "executando" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Consultar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Consulta oficial via login Gov.br</p>
        </CardContent>
      </Card>

      {/* Resultado da consulta ao Detran-MG */}
      {status !== "idle" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Resultado da Consulta
            </CardTitle>
            <CardDescription>Dados brutos retornados pelo Detran-MG</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {status === "executando" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Robô fazendo login no Gov.br e consultando o Detran-MG... isso pode levar 1-2 minutos.
              </div>
            )}

            {status === "sucesso" && resultado && (
              <div className="rounded-lg border p-4 space-y-3 bg-emerald-500/5 border-emerald-500/20">
                <p className="text-sm font-medium flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Consulta concluída
                </p>
                {resultado.multas_raw && (
                  <div>
                    <p className="text-sm font-semibold">Multas</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{resultado.multas_raw}</p>
                  </div>
                )}
                {resultado.licenciamento_raw && (
                  <div>
                    <p className="text-sm font-semibold">Licenciamento</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{resultado.licenciamento_raw}</p>
                  </div>
                )}
                {resultado.ipva_raw && (
                  <div>
                    <p className="text-sm font-semibold">IPVA</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{resultado.ipva_raw}</p>
                  </div>
                )}
                {!resultado.multas_raw && !resultado.licenciamento_raw && !resultado.ipva_raw && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    Nenhum débito retornado para esta placa.
                  </div>
                )}
              </div>
            )}

            {status === "erro" && (
              <div className="rounded-lg border p-4 flex gap-2 bg-destructive/5 border-destructive/20">
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{erro || "Falha na consulta ao Detran-MG"}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
