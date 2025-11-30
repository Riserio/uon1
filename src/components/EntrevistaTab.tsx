import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, FileText, Shield, ClipboardList } from "lucide-react";
// Se você quiser persistir no Supabase, descomente:
// import { supabase } from "@/integrations/supabase/client";
// import { toast } from "sonner";

interface EntrevistaTabProps {
  atendimentoId: string;
  vistoriaData?: any; // pode tipar melhor se quiser
}

type RiscoFraude = "baixo" | "medio" | "alto" | "critico";

export function EntrevistaTab({ atendimentoId, vistoriaData }: EntrevistaTabProps) {
  const [resumoCaso, setResumoCaso] = useState("");
  const [coerenciaRelato, setCoerenciaRelato] = useState<"sim" | "parcial" | "nao" | "nao_avaliado">("nao_avaliado");
  const [documentacaoOk, setDocumentacaoOk] = useState<"sim" | "pendente" | "incompleta" | "nao_avaliado">(
    "nao_avaliado",
  );
  const [indiciosFraude, setIndiciosFraude] = useState("");
  const [riscoFraude, setRiscoFraude] = useState<RiscoFraude>("baixo");
  const [pontosAtencao, setPontosAtencao] = useState("");
  const [recomendacaoFinal, setRecomendacaoFinal] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);

  // Se quiser carregar dados já salvos da análise, use esse effect:
  useEffect(() => {
    // TODO: Carregar análise já existente do backend, se houver.
    // Exemplo (adaptar para sua tabela):
    //
    // async function loadData() {
    //   const { data, error } = await supabase
    //     .from("atendimento_analise")
    //     .select("*")
    //     .eq("atendimento_id", atendimentoId)
    //     .maybeSingle();
    //
    //   if (error) {
    //     console.error("Erro ao carregar análise:", error);
    //     return;
    //   }
    //
    //   if (data) {
    //     setResumoCaso(data.resumo_caso || "");
    //     setCoerenciaRelato(data.coerencia_relato || "nao_avaliado");
    //     setDocumentacaoOk(data.documentacao_ok || "nao_avaliado");
    //     setIndiciosFraude(data.indicios_fraude || "");
    //     setRiscoFraude(data.risco_fraude || "baixo");
    //     setPontosAtencao(data.pontos_atencao || "");
    //     setRecomendacaoFinal(data.recomendacao_final || "");
    //     setUltimaAtualizacao(data.updated_at || null);
    //   }
    // }
    //
    // if (atendimentoId) loadData();
  }, [atendimentoId]);

  const handleSalvarAnalise = async () => {
    setIsSaving(true);

    try {
      // TODO: Persistir análise no backend (Supabase, etc)
      //
      // const payload = {
      //   atendimento_id: atendimentoId,
      //   resumo_caso: resumoCaso,
      //   coerencia_relato: coerenciaRelato,
      //   documentacao_ok: documentacaoOk,
      //   indicios_fraude: indiciosFraude,
      //   risco_fraude: riscoFraude,
      //   pontos_atencao: pontosAtencao,
      //   recomendacao_final: recomendacaoFinal,
      // };
      //
      // const { data, error } = await supabase
      //   .from("atendimento_analise")
      //   .upsert(payload, { onConflict: "atendimento_id" })
      //   .select("*")
      //   .single();
      //
      // if (error) {
      //   console.error("Erro ao salvar análise:", error);
      //   toast.error("Erro ao salvar análise");
      //   return;
      // }
      //
      // toast.success("Análise salva com sucesso");
      // setUltimaAtualizacao(data.updated_at || new Date().toISOString());

      // Enquanto você não pluga no backend, deixo um feedback visual simples:
      setUltimaAtualizacao(new Date().toISOString());
    } finally {
      setIsSaving(false);
    }
  };

  const riscoLabelMap: Record<RiscoFraude, string> = {
    baixo: "Baixo",
    medio: "Médio",
    alto: "Alto",
    critico: "Crítico",
  };

  const riscoColorMap: Record<RiscoFraude, string> = {
    baixo: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30",
    medio: "bg-amber-500/10 text-amber-600 border border-amber-500/30",
    alto: "bg-red-500/10 text-red-600 border border-red-500/30",
    critico: "bg-red-700/15 text-red-700 border border-red-700/40",
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho da análise */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium">Análise Técnica do Atendimento</p>
            <p className="text-xs text-muted-foreground">
              Atendimento #{atendimentoId?.slice(0, 8) || "—"}{" "}
              {vistoriaData?.veiculo_placa ? `• Veículo ${vistoriaData.veiculo_placa}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1 ${riscoColorMap[riscoFraude]}`}
          >
            {riscoFraude === "baixo" && <CheckCircle2 className="h-3 w-3" />}
            {riscoFraude !== "baixo" && <AlertTriangle className="h-3 w-3" />}
            Risco: {riscoLabelMap[riscoFraude]}
          </Badge>
          {ultimaAtualizacao && (
            <span className="text-[11px] text-muted-foreground">
              Última atualização: {new Date(ultimaAtualizacao).toLocaleString("pt-BR")}
            </span>
          )}
        </div>
      </div>

      {/* Card 1 – Resumo do caso */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" />
            Resumo estruturado do caso
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Faça um resumo objetivo do ocorrido, considerando versão do associado, dados da vistoria, boletim de
            ocorrência, laudos, fotos e demais documentos.
          </Label>
          <Textarea
            value={resumoCaso}
            onChange={(e) => setResumoCaso(e.target.value)}
            rows={4}
            placeholder="Ex: Associado relata colisão traseira em via urbana, velocidade aproximada de 40 km/h, sem vítimas. Fotos demonstram danos localizados em para-choque traseiro..."
          />
        </CardContent>
      </Card>

      {/* Card 2 – Coerência e documentação */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-primary" />
            Validação de relato e documentação
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Coerência do relato */}
          <div className="space-y-2">
            <Label className="text-xs">Coerência do relato x evidências</Label>
            <RadioGroup
              value={coerenciaRelato}
              onValueChange={(val: any) => setCoerenciaRelato(val)}
              className="space-y-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sim" id="coerencia-sim" />
                <Label htmlFor="coerencia-sim" className="text-xs">
                  Coerente
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="parcial" id="coerencia-parcial" />
                <Label htmlFor="coerencia-parcial" className="text-xs">
                  Coerente com ressalvas
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="nao" id="coerencia-nao" />
                <Label htmlFor="coerencia-nao" className="text-xs">
                  Não coerente
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="nao_avaliado" id="coerencia-na" />
                <Label htmlFor="coerencia-na" className="text-xs text-muted-foreground">
                  Não avaliado
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Documentação */}
          <div className="space-y-2">
            <Label className="text-xs">Documentação apresentada</Label>
            <RadioGroup
              value={documentacaoOk}
              onValueChange={(val: any) => setDocumentacaoOk(val)}
              className="space-y-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sim" id="doc-sim" />
                <Label htmlFor="doc-sim" className="text-xs">
                  Completa e adequada
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pendente" id="doc-pendente" />
                <Label htmlFor="doc-pendente" className="text-xs">
                  Pendente de documentos
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="incompleta" id="doc-incompleta" />
                <Label htmlFor="doc-incompleta" className="text-xs">
                  Incompleta / divergente
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="nao_avaliado" id="doc-na" />
                <Label htmlFor="doc-na" className="text-xs text-muted-foreground">
                  Não avaliado
                </Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Card 3 – Indícios e risco de fraude */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Indícios de fraude e pontos de atenção
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">
              Indícios / inconsistências observadas{" "}
              <span className="text-[10px] text-muted-foreground">
                (mudança de versão, incompatibilidade de danos, datas conflitantes, histórico de sinistros, etc.)
              </span>
            </Label>
            <Textarea
              value={indiciosFraude}
              onChange={(e) => setIndiciosFraude(e.target.value)}
              rows={3}
              placeholder="Descreva indícios ou inconsistências relevantes para avaliação de fraude, se houver..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="space-y-2">
              <Label className="text-xs">Classificação de risco de fraude</Label>
              <Select value={riscoFraude} onValueChange={(val: RiscoFraude) => setRiscoFraude(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o risco" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixo">Baixo</SelectItem>
                  <SelectItem value="medio">Médio</SelectItem>
                  <SelectItem value="alto">Alto</SelectItem>
                  <SelectItem value="critico">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Pontos de atenção para o comitê / diretoria</Label>
              <Textarea
                value={pontosAtencao}
                onChange={(e) => setPontosAtencao(e.target.value)}
                rows={3}
                placeholder="Liste os principais pontos que devem ser destacados para o comitê ou diretoria..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 4 – Recomendação final */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Conclusão e recomendação do analista
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label className="text-xs text-muted-foreground">
            Registre de forma clara se recomenda{" "}
            <span className="font-semibold text-foreground">aprovação, recusa, complementação de documentos</span> ou
            encaminhamento para instância superior (comitê, diretoria, jurídico, etc.).
          </Label>
          <Textarea
            value={recomendacaoFinal}
            onChange={(e) => setRecomendacaoFinal(e.target.value)}
            rows={4}
            placeholder="Ex: Recomendo aprovação do sinistro com pagamento de indenização conforme orçamento aprovado, sem indícios relevantes de fraude..."
          />

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Shield className="h-3 w-3" />
              <span>Este registro não é visível para o associado, apenas para uso interno.</span>
            </div>

            <Button size="sm" onClick={handleSalvarAnalise} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar Análise"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default EntrevistaTab;
