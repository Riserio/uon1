import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, FileText, Download, Eye } from "lucide-react";
import { Check, FileSignature, Users, Settings2, ClipboardCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { MaskedInput } from "@/components/ui/masked-input";
import { CurrencyInput } from "@/components/ui/currency-input";
import PreviewContratoPDFDialog from "./PreviewContratoPDFDialog";
import { sugerirPapelContratante } from "./utils/papeisPorTipoContrato";
import { Switch } from "@/components/ui/switch";
import SignatariosSalvosPicker from "./SignatariosSalvosPicker";

function parseLembreteDias(s: string): number[] {
  return Array.from(
    new Set(
      s
        .split(/[,\s;]+/)
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 365)
    )
  ).sort((a, b) => a - b);
}

interface Signatario {
  nome: string;
  email: string;
  cpf: string;
  tipo: string;
  tipoPessoa?: "pf" | "pj";
  cnpj?: string;
  telefone?: string;
}

const PAPEIS_SIGNATARIO = [
  "Acionista",
  "Avalista",
  "Cedente",
  "Cessionário",
  "Cliente",
  "Comprador",
  "Contratado",
  "Contratante",
  "Cotista",
  "Fiador",
  "Fornecedor",
  "Franqueado",
  "Franqueador",
  "Gestora",
  "Locador",
  "Locatário",
  "Parte Interessada",
  "Prestador de Serviços",
  "Sócio",
  "Testemunha",
  "Tomador de Serviços",
  "Vendedor",
  "Outro",
].sort((a, b) => (a === "Outro" ? 1 : b === "Outro" ? -1 : a.localeCompare(b, "pt-BR")));

interface NovoContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: any[];
  contrato?: any | null;
}

export default function NovoContratoDialog({ open, onOpenChange, templates, contrato: contratoEdicao }: NovoContratoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEdicao = !!contratoEdicao?.id;
  
  const [contratoAnteriorId, setContratoAnteriorId] = useState<string>("");
  const [currentStep, setCurrentStep] = useState(0);
  const [templateId, setTemplateId] = useState<string>("");
  const [titulo, setTitulo] = useState("");
  const [contratanteNome, setContratanteNome] = useState("");
  const [contratanteEmail, setContratanteEmail] = useState("");
  const [contratanteTipo, setContratanteTipo] = useState<"pf" | "pj">("pf");
  const [contratantePapel, setContratantePapel] = useState<string>("Contratante");
  const [contratanteCpf, setContratanteCpf] = useState("");
  const [contratanteCnpj, setContratanteCnpj] = useState("");
  const [contratanteTelefone, setContratanteTelefone] = useState("");
  const [valorContrato, setValorContrato] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [prazoAssinatura, setPrazoAssinatura] = useState("");
  const [corretoraId, setCorretoraId] = useState<string>("");
  const [corretoraManualMode, setCorretoraManualMode] = useState(false);
  const [corretoraNomeManual, setCorretoraNomeManual] = useState("");
  // Dados da Contratada (espelha o signatário)
  const [contratadaTipo, setContratadaTipo] = useState<"pf" | "pj">("pj");
  const [contratadaPapel, setContratadaPapel] = useState("Contratada");
  const [contratadaNome, setContratadaNome] = useState("");
  const [contratadaDocumento, setContratadaDocumento] = useState("");
  const [contratadaEmail, setContratadaEmail] = useState("");
  const [contratadaTelefone, setContratadaTelefone] = useState("");
  const [contratadaEndereco, setContratadaEndereco] = useState("");
  const [contratadaRepresentante, setContratadaRepresentante] = useState("");
  const [contratadaAssinaturaAutomatica, setContratadaAssinaturaAutomatica] = useState(true);
  const [contratadaManualMode, setContratadaManualMode] = useState(false);
  const [lembreteAtivo, setLembreteAtivo] = useState(true);
  const [lembreteDiasStr, setLembreteDiasStr] = useState("3, 7, 14");
  const [conteudoHtml, setConteudoHtml] = useState("");
  const [signatarios, setSignatarios] = useState<Signatario[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);
  const [previewPdfOpen, setPreviewPdfOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  // Fetch contratos anteriores para reaproveitar dados
  const { data: contratosAnteriores } = useQuery({
    queryKey: ["contratos-anteriores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos")
        .select("id, numero, titulo, contratante_nome, contratante_email, contratante_cpf, contratante_telefone, corretora_id")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Quando seleciona contrato anterior, preenche dados do cliente
  useEffect(() => {
    if (contratoAnteriorId) {
      const contratoAnterior = contratosAnteriores?.find((c) => c.id === contratoAnteriorId);
      if (contratoAnterior) {
        setContratanteNome(contratoAnterior.contratante_nome || "");
        setContratanteEmail(contratoAnterior.contratante_email || "");
        setContratanteCpf(contratoAnterior.contratante_cpf || "");
        setContratanteTelefone(contratoAnterior.contratante_telefone || "");
        setCorretoraId(contratoAnterior.corretora_id || "");
      }
    }
  }, [contratoAnteriorId, contratosAnteriores]);

  // Fetch corretoras
  const { data: corretoras } = useQuery({
    queryKey: ["corretoras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("corretoras")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  // Quando seleciona template, carrega conteúdo
  useEffect(() => {
    if (templateId) {
      const template = templates.find((t) => t.id === templateId);
      if (template) {
        setSelectedTemplate(template);
        setConteudoHtml(template.conteudo_html || "");
        setTitulo(template.titulo);
        // Sugerir papel do contratante conforme tipo do template
        if (!isEdicao) {
          setContratantePapel(sugerirPapelContratante(template));
        }
      }
    } else {
      setSelectedTemplate(null);
    }
  }, [templateId, templates, isEdicao]);

  // Modo edição: pré-preenche os campos com os dados do contrato existente
  useEffect(() => {
    if (!open || !contratoEdicao) return;
    setTemplateId(contratoEdicao.template_id || "");
    setTitulo(contratoEdicao.titulo || "");
    setContratanteNome(contratoEdicao.contratante_nome || "");
    setContratanteEmail(contratoEdicao.contratante_email || "");
    setContratanteTipo(contratoEdicao.contratado_cnpj ? "pj" : "pf");
    setContratantePapel(contratoEdicao.contratante_papel || "Contratante");
    setContratanteCpf(contratoEdicao.contratante_cpf || "");
    setContratanteCnpj(contratoEdicao.contratado_cnpj || "");
    setContratanteTelefone(contratoEdicao.contratante_telefone || "");
    setValorContrato(contratoEdicao.valor_contrato ? String(contratoEdicao.valor_contrato) : "");
    setDataInicio(contratoEdicao.data_inicio || "");
    setDataFim(contratoEdicao.data_fim || "");
    setCorretoraId(contratoEdicao.corretora_id || "");
    setCorretoraManualMode(!!contratoEdicao.corretora_nome_manual);
    setCorretoraNomeManual(contratoEdicao.corretora_nome_manual || "");
    setConteudoHtml(contratoEdicao.conteudo_html || "");
    // Contratada
    setContratadaTipo((contratoEdicao.contratada_tipo_pessoa as any) || "pj");
    setContratadaPapel(contratoEdicao.contratada_papel || "Contratada");
    setContratadaNome(contratoEdicao.contratada_nome || "");
    setContratadaDocumento(contratoEdicao.contratada_documento || "");
    setContratadaEmail(contratoEdicao.contratada_email || "");
    setContratadaTelefone(contratoEdicao.contratada_telefone || "");
    setContratadaEndereco(contratoEdicao.contratada_endereco || "");
    setContratadaRepresentante(contratoEdicao.contratada_representante || "");
    setContratadaAssinaturaAutomatica(contratoEdicao.contratada_assinatura_automatica !== false);
    setContratadaManualMode(!!contratoEdicao.contratada_manual_mode);
    setLembreteAtivo(contratoEdicao.lembrete_ativo !== false);
    const dias = (contratoEdicao.lembrete_dias as number[] | null) || [3, 7, 14];
    setLembreteDiasStr(dias.join(", "));
  }, [open, contratoEdicao]);

  // Substituir variáveis no conteúdo (apenas para templates HTML)
  const processarConteudo = (html: string) => {
    // Se o template é Word ou PDF, não processa variáveis
    if (selectedTemplate?.tipo_template === "word" || selectedTemplate?.tipo_template === "pdf") {
      return html;
    }
    
    return html
      .replace(/\{\{nome\}\}/gi, contratanteNome)
      .replace(/\{\{cpf\}\}/gi, contratanteCpf)
      .replace(/\{\{email\}\}/gi, contratanteEmail)
      .replace(/\{\{telefone\}\}/gi, contratanteTelefone)
      .replace(/\{\{valor\}\}/gi, valorContrato ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(valorContrato)) : "")
      .replace(/\{\{data_inicio\}\}/gi, dataInicio ? new Date(dataInicio).toLocaleDateString("pt-BR") : "")
      .replace(/\{\{data_fim\}\}/gi, dataFim ? new Date(dataFim).toLocaleDateString("pt-BR") : "")
      .replace(/\{\{data_atual\}\}/gi, new Date().toLocaleDateString("pt-BR"));
  };

  const addSignatario = () => {
    setSignatarios([
      ...signatarios,
      { nome: "", email: "", cpf: "", cnpj: "", telefone: "", tipo: "Testemunha", tipoPessoa: "pf" },
    ]);
  };

  const removeSignatario = (index: number) => {
    setSignatarios(signatarios.filter((_, i) => i !== index));
  };

  const updateSignatario = (index: number, field: keyof Signatario, value: string) => {
    const updated = [...signatarios];
    updated[index] = { ...updated[index], [field]: value };
    setSignatarios(updated);
  };

  const criarContrato = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      if (!titulo) throw new Error("Título é obrigatório");
      if (!contratanteNome || !contratanteEmail) throw new Error("Dados do contratante são obrigatórios");

      const conteudoProcessado = processarConteudo(conteudoHtml);

      // Calculate link expiration date if prazoAssinatura is set
      let linkExpiresAt: string | null = null;
      if (prazoAssinatura) {
        const expirationDate = new Date(prazoAssinatura);
        expirationDate.setHours(23, 59, 59, 999);
        linkExpiresAt = expirationDate.toISOString();
      }

      // MODO EDIÇÃO: somente atualiza dados, sem mexer em assinaturas já coletadas
      if (isEdicao && contratoEdicao?.id) {
        const { error: updErr } = await supabase
          .from("contratos")
          .update({
            titulo,
            conteudo_html: conteudoProcessado,
            contratante_nome: contratanteNome,
            contratante_email: contratanteEmail,
            contratante_cpf: contratanteTipo === "pf" ? contratanteCpf : null,
            contratado_cnpj: contratanteTipo === "pj" ? contratanteCnpj : null,
            contratante_telefone: contratanteTelefone,
            contratante_papel: contratantePapel || null,
            valor_contrato: valorContrato ? parseFloat(valorContrato) : null,
            data_inicio: dataInicio || null,
            data_fim: dataFim || null,
            corretora_id: corretoraManualMode ? null : (corretoraId || null),
            corretora_nome_manual: corretoraManualMode ? (corretoraNomeManual || null) : null,
            template_id: templateId || null,
            contratada_tipo_pessoa: contratadaTipo,
            contratada_papel: contratadaPapel || null,
            contratada_nome: contratadaNome || null,
            contratada_documento: contratadaDocumento || null,
            contratada_email: contratadaEmail || null,
            contratada_telefone: contratadaTelefone || null,
            contratada_endereco: contratadaEndereco || null,
            contratada_representante: contratadaRepresentante || null,
            contratada_assinatura_automatica: contratadaAssinaturaAutomatica,
            contratada_manual_mode: contratadaManualMode,
            lembrete_ativo: lembreteAtivo,
            lembrete_dias: parseLembreteDias(lembreteDiasStr),
          } as any)
          .eq("id", contratoEdicao.id);
        if (updErr) throw updErr;

        await supabase.from("contrato_historico").insert({
          contrato_id: contratoEdicao.id,
          acao: "editado",
          descricao: "Contrato editado antes da assinatura",
          user_id: user.id,
        });

        return contratoEdicao;
      }

      // Criar contrato
      const { data: contrato, error: contratoError } = await supabase
        .from("contratos")
        .insert({
          titulo,
          conteudo_html: conteudoProcessado,
          contratante_nome: contratanteNome,
          contratante_email: contratanteEmail,
          contratante_cpf: contratanteTipo === "pf" ? contratanteCpf : null,
          contratado_cnpj: contratanteTipo === "pj" ? contratanteCnpj : null,
          contratante_telefone: contratanteTelefone,
          contratante_papel: contratantePapel || null,
          valor_contrato: valorContrato ? parseFloat(valorContrato) : null,
          data_inicio: dataInicio || null,
          data_fim: dataFim || null,
          link_expires_at: linkExpiresAt,
          corretora_id: corretoraManualMode ? null : (corretoraId || null),
          corretora_nome_manual: corretoraManualMode ? (corretoraNomeManual || null) : null,
          template_id: templateId || null,
          contratada_tipo_pessoa: contratadaTipo,
          contratada_papel: contratadaPapel || null,
          contratada_nome: contratadaNome || null,
          contratada_documento: contratadaDocumento || null,
          contratada_email: contratadaEmail || null,
          contratada_telefone: contratadaTelefone || null,
          contratada_endereco: contratadaEndereco || null,
          contratada_representante: contratadaRepresentante || null,
          contratada_assinatura_automatica: contratadaAssinaturaAutomatica,
          contratada_manual_mode: contratadaManualMode,
          lembrete_ativo: lembreteAtivo,
          lembrete_dias: parseLembreteDias(lembreteDiasStr),
          status: "rascunho",
          created_by: user.id,
          variaveis_preenchidas: {
            nome: contratanteNome,
            cpf: contratanteCpf,
            cnpj: contratanteCnpj,
            email: contratanteEmail,
            telefone: contratanteTelefone,
            valor: valorContrato,
            data_inicio: dataInicio,
            data_fim: dataFim,
          },
        } as any)
        .select()
        .single();

      if (contratoError) throw contratoError;

      // Get current location and IP for contratada signature
      let contratadaLatitude: number | null = null;
      let contratadaLongitude: number | null = null;
      let contratadaIp = "N/A";

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        contratadaLatitude = position.coords.latitude;
        contratadaLongitude = position.coords.longitude;
      } catch (e) {
        console.log("Geolocation not available for contratada");
      }

      try {
        const ipResponse = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipResponse.json();
        contratadaIp = ipData.ip;
      } catch (e) {
        console.log("Could not get IP for contratada");
      }

      // Generate hash for contratada signature
      const encoder = new TextEncoder();
      const hashData = encoder.encode(conteudoProcessado + "contratada" + new Date().toISOString());
      const hashBuffer = await crypto.subtle.digest("SHA-256", hashData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const contratadaHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      // Assinaturas:
      // - Contratante sempre pendente
      // - Contratada: automática (já assinada) OU pendente conforme flag
      const contratadaDisplayNome = contratadaNome || "Vangard Gestora";
      const contratadaDisplayEmail = contratadaEmail || "contatos@vangardgestora.com.br";
      const contratadaAssinatura: any = contratadaAssinaturaAutomatica
        ? {
            contrato_id: contrato.id,
            nome: contratadaDisplayNome,
            email: contratadaDisplayEmail,
            cpf: null,
            tipo: contratadaPapel?.toLowerCase() || "contratada",
            ordem: 0,
            status: "assinado",
            assinado_em: new Date().toISOString(),
            ip_assinatura: contratadaIp,
            latitude: contratadaLatitude,
            longitude: contratadaLongitude,
            hash_documento: contratadaHash,
            user_agent: navigator.userAgent,
          }
        : {
            contrato_id: contrato.id,
            nome: contratadaDisplayNome,
            email: contratadaDisplayEmail,
            cpf: contratadaDocumento || null,
            tipo: contratadaPapel?.toLowerCase() || "contratada",
            ordem: 0,
            status: "pendente",
          };

      const assinaturas = [
        {
          contrato_id: contrato.id,
          nome: contratanteNome,
          email: contratanteEmail,
          cpf: contratanteCpf,
          tipo: "contratante",
          ordem: 1,
          status: "pendente",
        },
        contratadaAssinatura,
        ...signatarios.map((s, i) => ({
          contrato_id: contrato.id,
          nome: s.nome,
          email: s.email,
          cpf: s.cpf,
          tipo: s.tipo,
          ordem: i + 2,
          status: "pendente",
        })),
      ];

      const { error: assinaturasError } = await supabase
        .from("contrato_assinaturas")
        .insert(assinaturas);

      if (assinaturasError) throw assinaturasError;

      // Registrar histórico com dados de geração
      await supabase.from("contrato_historico").insert({
        contrato_id: contrato.id,
        acao: "criado",
        descricao: `Contrato criado e assinado automaticamente pela contratada. IP: ${contratadaIp}${contratadaLatitude ? `, Localização: ${contratadaLatitude.toFixed(6)}, ${contratadaLongitude?.toFixed(6)}` : ""}`,
        user_id: user.id,
        ip: contratadaIp,
        user_agent: navigator.userAgent,
      });

      return contrato;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos"] });
      toast.success(isEdicao ? "Contrato atualizado com sucesso!" : "Contrato criado com sucesso!");
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error((isEdicao ? "Erro ao salvar contrato: " : "Erro ao criar contrato: ") + error.message);
    },
  });

  const resetForm = () => {
    setContratoAnteriorId("");
    setTemplateId("");
    setTitulo("");
    setContratanteNome("");
    setContratanteEmail("");
    setContratanteTipo("pf");
    setContratantePapel("Contratante");
    setContratanteCpf("");
    setContratanteCnpj("");
    setContratanteTelefone("");
    setValorContrato("");
    setDataInicio("");
    setDataFim("");
    setPrazoAssinatura("");
    setCorretoraId("");
    setCorretoraManualMode(false);
    setCorretoraNomeManual("");
    setConteudoHtml("");
    setSignatarios([]);
    setShowReceipt(false);
    setSelectedTemplate(null);
    setContratadaTipo("pj");
    setContratadaPapel("Contratada");
    setContratadaNome("");
    setContratadaDocumento("");
    setContratadaEmail("");
    setContratadaTelefone("");
    setContratadaEndereco("");
    setContratadaRepresentante("");
    setContratadaAssinaturaAutomatica(true);
    setContratadaManualMode(false);
  };

  // Formatar valor para exibição
  const formatCurrency = (value: string) => {
    if (!value) return "-";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(value));
  };

  // Componente de Resumo/Recibo
  const ReceiptSummary = () => (
    <Card className="border-2 border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Resumo do Contrato
          </CardTitle>
          <Badge variant="outline">Pré-visualização</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Título</p>
            <p className="font-medium">{titulo || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Template</p>
            <p className="font-medium flex items-center gap-2">
              {selectedTemplate?.titulo || "Sem template"}
              {selectedTemplate?.tipo_template && (
                <Badge variant="secondary" className="text-xs">
                  {selectedTemplate.tipo_template.toUpperCase()}
                </Badge>
              )}
            </p>
          </div>
        </div>
        
        <Separator />
        
        <div>
          <p className="text-muted-foreground text-sm mb-2">Contratante</p>
          <div className="grid grid-cols-2 gap-3 text-sm bg-background/50 p-3 rounded-lg">
            <div>
              <p className="text-muted-foreground text-xs">Nome</p>
              <p className="font-medium">{contratanteNome || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">E-mail</p>
              <p className="font-medium">{contratanteEmail || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{contratanteTipo === "pf" ? "CPF" : "CNPJ"}</p>
              <p className="font-medium">{contratanteTipo === "pf" ? contratanteCpf || "-" : contratanteCnpj || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Telefone</p>
              <p className="font-medium">{contratanteTelefone || "-"}</p>
            </div>
          </div>
        </div>
        
        <Separator />
        
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Valor</p>
            <p className="font-bold text-lg text-primary">{formatCurrency(valorContrato)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Data Início</p>
            <p className="font-medium">{dataInicio ? new Date(dataInicio).toLocaleDateString("pt-BR") : "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Data Fim</p>
            <p className="font-medium">{dataFim ? new Date(dataFim).toLocaleDateString("pt-BR") : "-"}</p>
          </div>
        </div>

        {signatarios.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-muted-foreground text-sm mb-2">Signatários Adicionais ({signatarios.length})</p>
              <div className="space-y-2">
                {signatarios.map((sig, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="text-xs">{sig.tipo}</Badge>
                    <span>{sig.nome || "Sem nome"}</span>
                    <span className="text-muted-foreground">({sig.email || "sem email"})</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {selectedTemplate?.tipo_template !== "html" && selectedTemplate?.arquivo_url && (
          <>
            <Separator />
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <Download className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-700">
                Este contrato usa um documento {selectedTemplate.tipo_template?.toUpperCase()} pré-definido sem substituição de variáveis.
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[92vh] p-0 overflow-hidden flex flex-col gap-0">
        {(() => {
          const steps = [
            { id: 0, label: "Documento", desc: "Título, template e datas", icon: FileSignature },
            { id: 1, label: "Signatários", desc: "Quem irá assinar", icon: Users },
            { id: 2, label: "Configurações", desc: "Lembretes e prazo", icon: Settings2 },
            { id: 3, label: "Revisão", desc: "Confirme e envie", icon: ClipboardCheck },
          ];
          return null;
        })()}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl">{isEdicao ? "Editar Contrato" : "Novo Contrato"}</DialogTitle>
          <DialogDescription>
            {isEdicao
              ? "Atualize os dados antes da assinatura. Assinaturas já coletadas são preservadas."
              : "Siga as etapas abaixo para criar e enviar seu contrato."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Stepper lateral estilo Clicksign */}
          <aside className="w-64 shrink-0 border-r bg-muted/30 px-4 py-6 overflow-y-auto hidden md:block">
            <nav className="space-y-1">
              {[
                { id: 0, label: "Documento", desc: "Título, template e datas", icon: FileSignature },
                { id: 1, label: "Signatários", desc: "Quem irá assinar", icon: Users },
                { id: 2, label: "Configurações", desc: "Lembretes e prazo", icon: Settings2 },
                { id: 3, label: "Revisão", desc: "Confirme e envie", icon: ClipboardCheck },
              ].map((s) => {
                const Icon = s.icon;
                const isActive = currentStep === s.id;
                const isDone = currentStep > s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCurrentStep(s.id)}
                    className={`w-full text-left flex items-start gap-3 rounded-xl px-3 py-3 transition-all ${
                      isActive
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted border border-transparent"
                    }`}
                  >
                    <div
                      className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                        isDone
                          ? "bg-primary text-primary-foreground"
                          : isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border text-muted-foreground"
                      }`}
                    >
                      {isDone ? <Check className="h-4 w-4" /> : s.id + 1}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${isActive ? "text-foreground" : "text-foreground/80"}`}>
                        {s.label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{s.desc}</p>
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Conteúdo da etapa */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Stepper compacto mobile */}
            <div className="md:hidden mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Etapa {currentStep + 1} de 4</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${((currentStep + 1) / 4) * 100}%` }} />
              </div>
            </div>

        <div className="space-y-4">
          {currentStep === 0 && (<>
          {/* Reaproveitar dados de contrato anterior */}
          {contratosAnteriores && contratosAnteriores.length > 0 && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-dashed">
              <Label className="text-sm text-muted-foreground">Reaproveitar dados do cliente</Label>
              <Select value={contratoAnteriorId} onValueChange={setContratoAnteriorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um contrato anterior (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {contratosAnteriores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.numero} - {c.contratante_nome || "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Template */}
          <div className="space-y-2">
            <Label>Template (opcional)</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Título */}
          <div className="space-y-2">
            <Label>Título do Contrato *</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Contrato de Prestação de Serviços"
            />
          </div>

          {/* Associação */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Associação / Empresa</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setCorretoraManualMode(!corretoraManualMode);
                  setCorretoraId("");
                  setCorretoraNomeManual("");
                }}
              >
                {corretoraManualMode ? "Selecionar cadastrada" : "Informar outra empresa"}
              </Button>
            </div>
            {corretoraManualMode ? (
              <Input
                value={corretoraNomeManual}
                onChange={(e) => setCorretoraNomeManual(e.target.value)}
                placeholder="Nome da empresa (não cadastrada)"
              />
            ) : (
              <Select value={corretoraId} onValueChange={setCorretoraId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma associação (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {corretoras?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {/* Valor e Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor do Contrato</Label>
              <CurrencyInput
                value={valorContrato}
                onValueChange={(values) => setValorContrato(values.value)}
                placeholder="R$ 0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Início do Contrato</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Fim do Contrato</Label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </div>

          {/* Conteúdo do Contrato - apenas para HTML ou sem template */}
          {(!selectedTemplate || selectedTemplate?.tipo_template === "html") && (
            <div className="space-y-2">
              <Label>Conteúdo do Contrato</Label>
              <p className="text-xs text-muted-foreground">
                Use variáveis: {"{{nome}}"}, {"{{cpf}}"}, {"{{email}}"}, {"{{valor}}"}, {"{{data_inicio}}"}, {"{{data_fim}}"}, {"{{data_atual}}"}
              </p>
              <Textarea
                value={conteudoHtml}
                onChange={(e) => setConteudoHtml(e.target.value)}
                placeholder="Digite o conteúdo do contrato..."
                rows={10}
              />
            </div>
          )}

          {/* Aviso para templates Word/PDF */}
          {selectedTemplate?.tipo_template && selectedTemplate.tipo_template !== "html" && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <FileText className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-700">
                Este template usa um documento {selectedTemplate.tipo_template.toUpperCase()} pré-definido.
                As variáveis não serão substituídas automaticamente.
              </span>
              {selectedTemplate.arquivo_url && (
                <a
                  href={selectedTemplate.arquivo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto"
                >
                  <Button variant="outline" size="sm">
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>
                </a>
              )}
            </div>
          )}
          </>)}

          {currentStep === 1 && (<>
          {/* Dados do Signatário (principal) */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Dados do Signatário</h4>
              <div className="flex items-center gap-2 flex-wrap">
                <SignatariosSalvosPicker
                  currentData={{
                    nome: contratanteNome,
                    email: contratanteEmail,
                    telefone: contratanteTelefone,
                    documento: contratanteTipo === "pf" ? contratanteCpf : contratanteCnpj,
                    tipo_pessoa: contratanteTipo,
                    papel: contratantePapel,
                  }}
                  onSelect={(s) => {
                    setContratanteTipo(s.tipo_pessoa);
                    setContratanteNome(s.nome);
                    setContratanteEmail(s.email || "");
                    setContratanteTelefone(s.telefone || "");
                    if (s.tipo_pessoa === "pf") setContratanteCpf(s.documento || "");
                    else setContratanteCnpj(s.documento || "");
                    if (s.papel) setContratantePapel(s.papel);
                  }}
                />
                <Button
                  type="button"
                  variant={contratanteTipo === "pf" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setContratanteTipo("pf")}
                >
                  Pessoa Física
                </Button>
                <Button
                  type="button"
                  variant={contratanteTipo === "pj" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setContratanteTipo("pj")}
                >
                  Pessoa Jurídica
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Papel do Signatário</Label>
                <Select value={contratantePapel} onValueChange={setContratantePapel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o papel" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPEIS_SIGNATARIO.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ex.: locatário, franqueado, comprador, testemunha, etc.
                </p>
              </div>
              <div className="space-y-2">
                <Label>{contratanteTipo === "pf" ? "Nome Completo *" : "Razão Social *"}</Label>
                <Input
                  value={contratanteNome}
                  onChange={(e) => setContratanteNome(e.target.value)}
                  placeholder={contratanteTipo === "pf" ? "Nome completo" : "Razão Social"}
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail *</Label>
                <Input
                  type="email"
                  value={contratanteEmail}
                  onChange={(e) => setContratanteEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
              {contratanteTipo === "pf" ? (
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <MaskedInput
                    format="###.###.###-##"
                    value={contratanteCpf}
                    onValueChange={(values) => setContratanteCpf(values.value)}
                    placeholder="000.000.000-00"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <MaskedInput
                    format="##.###.###/####-##"
                    value={contratanteCnpj}
                    onValueChange={(values) => setContratanteCnpj(values.value)}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Telefone / WhatsApp</Label>
                <MaskedInput
                  format="(##) #####-####"
                  value={contratanteTelefone}
                  onValueChange={(values) => setContratanteTelefone(values.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
          </div>

          {/* Signatários Adicionais — logo abaixo do signatário principal */}
          {/* Dados da Contratada (espelha o signatário) */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="font-medium">Dados da Contratada</h4>
              <div className="flex gap-2">
                <Button type="button" variant={contratadaTipo === "pf" ? "default" : "outline"} size="sm" onClick={() => setContratadaTipo("pf")}>Pessoa Física</Button>
                <Button type="button" variant={contratadaTipo === "pj" ? "default" : "outline"} size="sm" onClick={() => setContratadaTipo("pj")}>Pessoa Jurídica</Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-sm">Assinatura automática da contratada</Label>
                <p className="text-xs text-muted-foreground">
                  Quando ligada, a contratada já é considerada assinada no momento da criação. Desligue para coletar a assinatura no mesmo fluxo do contratante.
                </p>
              </div>
              <Switch checked={contratadaAssinaturaAutomatica} onCheckedChange={setContratadaAssinaturaAutomatica} />
            </div>

            {contratadaAssinaturaAutomatica && (
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Informar dados manualmente</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setContratadaManualMode(!contratadaManualMode)}
              >
                {contratadaManualMode ? "Usar padrão da associação" : "Informar outra empresa"}
              </Button>
            </div>
            )}

            {(!contratadaAssinaturaAutomatica || contratadaManualMode) && (
            <div className="grid grid-cols-2 gap-4">
              {!contratadaAssinaturaAutomatica && (
                <div className="col-span-2 text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                  Como a assinatura automática está desligada, preencha os dados da contratada para que ela receba o link de assinatura.
                </div>
              )}
              <div className="space-y-2 col-span-2">
                <Label>Papel da Contratada</Label>
                <Select value={contratadaPapel} onValueChange={setContratadaPapel}>
                  <SelectTrigger><SelectValue placeholder="Selecione o papel" /></SelectTrigger>
                  <SelectContent>
                    {PAPEIS_SIGNATARIO.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{contratadaTipo === "pf" ? "Nome Completo" : "Razão Social"}</Label>
                <Input value={contratadaNome} onChange={(e) => setContratadaNome(e.target.value)} placeholder={contratadaTipo === "pf" ? "Nome completo" : "Razão Social"} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={contratadaEmail} onChange={(e) => setContratadaEmail(e.target.value)} placeholder="email@exemplo.com" />
              </div>
              {contratadaTipo === "pf" ? (
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <MaskedInput format="###.###.###-##" value={contratadaDocumento} onValueChange={(values) => setContratadaDocumento(values.value)} placeholder="000.000.000-00" />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <MaskedInput format="##.###.###/####-##" value={contratadaDocumento} onValueChange={(values) => setContratadaDocumento(values.value)} placeholder="00.000.000/0000-00" />
                </div>
              )}
              <div className="space-y-2">
                <Label>Telefone / WhatsApp</Label>
                <MaskedInput format="(##) #####-####" value={contratadaTelefone} onValueChange={(values) => setContratadaTelefone(values.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Endereço</Label>
                <Input value={contratadaEndereco} onChange={(e) => setContratadaEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade - UF" />
              </div>
              {contratadaTipo === "pj" && (
                <div className="space-y-2 col-span-2">
                  <Label>Representante Legal</Label>
                  <Input value={contratadaRepresentante} onChange={(e) => setContratadaRepresentante(e.target.value)} placeholder="Nome do representante legal" />
                </div>
              )}
            </div>
            )}
          </div>

          <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Signatários Adicionais</h4>
                <p className="text-xs text-muted-foreground">
                  Adicione testemunhas, fiadores, sócios ou qualquer outra parte do contrato.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={addSignatario}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar signatário
              </Button>
            </div>

            {signatarios.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
                Nenhum signatário adicional. Clique em "Adicionar signatário" para incluir.
              </div>
            ) : (
              <div className="space-y-3">
                {signatarios.map((sig, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3 bg-background">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        Signatário #{index + 2}
                      </Badge>
                      <div className="flex items-center gap-2 flex-wrap">
                        <SignatariosSalvosPicker
                          currentData={{
                            nome: sig.nome,
                            email: sig.email,
                            telefone: sig.telefone,
                            documento: sig.tipoPessoa === "pj" ? (sig.cnpj || "") : sig.cpf,
                            tipo_pessoa: (sig.tipoPessoa || "pf") as any,
                            papel: sig.tipo,
                          }}
                          onSelect={(s) => {
                            updateSignatario(index, "tipoPessoa" as any, s.tipo_pessoa);
                            updateSignatario(index, "nome", s.nome);
                            updateSignatario(index, "email", s.email || "");
                            updateSignatario(index, "telefone" as any, s.telefone || "");
                            if (s.tipo_pessoa === "pf") {
                              updateSignatario(index, "cpf", s.documento || "");
                            } else {
                              updateSignatario(index, "cnpj" as any, s.documento || "");
                            }
                            if (s.papel) updateSignatario(index, "tipo", s.papel);
                          }}
                        />
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant={(sig.tipoPessoa || "pf") === "pf" ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => updateSignatario(index, "tipoPessoa" as any, "pf")}
                          >
                            PF
                          </Button>
                          <Button
                            type="button"
                            variant={sig.tipoPessoa === "pj" ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => updateSignatario(index, "tipoPessoa" as any, "pj")}
                          >
                            PJ
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeSignatario(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5 col-span-2">
                        <Label className="text-xs">Papel do Signatário</Label>
                        <Select
                          value={sig.tipo}
                          onValueChange={(v) => updateSignatario(index, "tipo", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o papel" />
                          </SelectTrigger>
                          <SelectContent>
                            {PAPEIS_SIGNATARIO.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          {sig.tipoPessoa === "pj" ? "Razão Social" : "Nome Completo"}
                        </Label>
                        <Input
                          value={sig.nome}
                          onChange={(e) => updateSignatario(index, "nome", e.target.value)}
                          placeholder={sig.tipoPessoa === "pj" ? "Razão Social" : "Nome completo"}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">E-mail</Label>
                        <Input
                          type="email"
                          value={sig.email}
                          onChange={(e) => updateSignatario(index, "email", e.target.value)}
                          placeholder="email@exemplo.com"
                        />
                      </div>
                      {sig.tipoPessoa === "pj" ? (
                        <div className="space-y-1.5">
                          <Label className="text-xs">CNPJ</Label>
                          <MaskedInput
                            format="##.###.###/####-##"
                            value={sig.cnpj || ""}
                            onValueChange={(values) =>
                              updateSignatario(index, "cnpj" as any, values.value)
                            }
                            placeholder="00.000.000/0000-00"
                          />
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <Label className="text-xs">CPF</Label>
                          <MaskedInput
                            format="###.###.###-##"
                            value={sig.cpf}
                            onValueChange={(values) =>
                              updateSignatario(index, "cpf", values.value)
                            }
                            placeholder="000.000.000-00"
                          />
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Telefone / WhatsApp</Label>
                        <MaskedInput
                          format="(##) #####-####"
                          value={sig.telefone || ""}
                          onValueChange={(values) =>
                            updateSignatario(index, "telefone" as any, values.value)
                          }
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lembretes automáticos */}
          <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h4 className="font-medium text-sm">Lembretes automáticos por e-mail</h4>
                <p className="text-xs text-muted-foreground">
                  Cobra automaticamente os signatários que ainda não assinaram, nos dias configurados. Inspirado no Clicksign.
                </p>
              </div>
              <Switch checked={lembreteAtivo} onCheckedChange={setLembreteAtivo} />
            </div>
            {lembreteAtivo && (
              <div className="space-y-1.5">
                <Label className="text-xs">Dias após o envio para cobrar</Label>
                <Input
                  value={lembreteDiasStr}
                  onChange={(e) => setLembreteDiasStr(e.target.value)}
                  placeholder="Ex.: 3, 7, 14"
                />
                <p className="text-xs text-muted-foreground">
                  Separe por vírgula. Padrão: 3, 7 e 14 dias. O lembrete sai 09:00 (UTC) e respeita a data de expiração do link.
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {parseLembreteDias(lembreteDiasStr).map((d) => (
                    <Badge key={d} variant="secondary" className="text-xs">{d} dias</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Valor e Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor do Contrato</Label>
              <CurrencyInput
                value={valorContrato}
                onValueChange={(values) => setValorContrato(values.value)}
                placeholder="R$ 0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Prazo para Assinatura</Label>
              <Input
                type="date"
                value={prazoAssinatura}
                onChange={(e) => setPrazoAssinatura(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-muted-foreground">
                Após essa data, o link de assinatura expira
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Início do Contrato</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Fim do Contrato</Label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </div>

          {/* Conteúdo do Contrato - apenas para HTML ou sem template */}
          {(!selectedTemplate || selectedTemplate?.tipo_template === "html") && (
            <div className="space-y-2">
              <Label>Conteúdo do Contrato</Label>
              <p className="text-xs text-muted-foreground">
                Use variáveis: {"{{nome}}"}, {"{{cpf}}"}, {"{{email}}"}, {"{{valor}}"}, {"{{data_inicio}}"}, {"{{data_fim}}"}, {"{{data_atual}}"}
              </p>
              <Textarea
                value={conteudoHtml}
                onChange={(e) => setConteudoHtml(e.target.value)}
                placeholder="Digite o conteúdo do contrato..."
                rows={10}
              />
            </div>
          )}

          {/* Aviso para templates Word/PDF */}
          {selectedTemplate?.tipo_template && selectedTemplate.tipo_template !== "html" && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <FileText className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-700">
                Este template usa um documento {selectedTemplate.tipo_template.toUpperCase()} pré-definido.
                As variáveis não serão substituídas automaticamente.
              </span>
              {selectedTemplate.arquivo_url && (
                <a 
                  href={selectedTemplate.arquivo_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="ml-auto"
                >
                  <Button variant="outline" size="sm">
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>
                </a>
              )}
            </div>
          )}

          {/* Resumo do Contrato */}
          {(contratanteNome || valorContrato || dataInicio) && (
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReceipt(!showReceipt)}
                className="w-full justify-start text-muted-foreground hover:text-foreground"
              >
                <Eye className="h-4 w-4 mr-2" />
                {showReceipt ? "Ocultar Resumo" : "Ver Resumo do Contrato"}
              </Button>
              {showReceipt && <ReceiptSummary />}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => setPreviewPdfOpen(true)}
            disabled={!titulo && !conteudoHtml}
          >
            <Eye className="h-4 w-4 mr-2" />
            Visualizar PDF
          </Button>
          <Button
            onClick={() => criarContrato.mutate()}
            disabled={criarContrato.isPending}
          >
            {criarContrato.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdicao ? "Salvar Alterações" : "Criar Contrato"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <PreviewContratoPDFDialog
        open={previewPdfOpen}
        onOpenChange={setPreviewPdfOpen}
        contrato={{
          titulo,
          conteudo_html: processarConteudo(conteudoHtml),
          contratante_nome: contratanteNome,
          contratante_email: contratanteEmail,
          contratante_cpf: contratanteTipo === "pf" ? contratanteCpf : "",
          contratante_cnpj: contratanteTipo === "pj" ? contratanteCnpj : "",
          contratante_papel: contratantePapel,
          contratante_telefone: contratanteTelefone,
          valor_contrato: valorContrato ? parseFloat(valorContrato) : null,
          data_inicio: dataInicio,
          data_fim: dataFim,
          numero: "PRÉVIA",
        }}
        logoUrl={selectedTemplate?.logo_url}
        signatarios={signatarios.map((s) => ({
          nome: s.nome,
          email: s.email,
          cpf: s.tipoPessoa === "pj" ? "" : s.cpf,
          cnpj: s.tipoPessoa === "pj" ? s.cnpj : "",
          tipo: s.tipo,
        }))}
      />
    </Dialog>
  );
}
