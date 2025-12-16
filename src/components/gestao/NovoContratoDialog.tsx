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
import { MaskedInput } from "@/components/ui/masked-input";
import { CurrencyInput } from "@/components/ui/currency-input";

interface Signatario {
  nome: string;
  email: string;
  cpf: string;
  tipo: "contratante" | "contratado" | "testemunha";
}

interface NovoContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: any[];
}

export default function NovoContratoDialog({ open, onOpenChange, templates }: NovoContratoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [contratoAnteriorId, setContratoAnteriorId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [titulo, setTitulo] = useState("");
  const [contratanteNome, setContratanteNome] = useState("");
  const [contratanteEmail, setContratanteEmail] = useState("");
  const [contratanteTipo, setContratanteTipo] = useState<"pf" | "pj">("pf");
  const [contratanteCpf, setContratanteCpf] = useState("");
  const [contratanteCnpj, setContratanteCnpj] = useState("");
  const [contratanteTelefone, setContratanteTelefone] = useState("");
  const [valorContrato, setValorContrato] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [prazoAssinatura, setPrazoAssinatura] = useState("");
  const [corretoraId, setCorretoraId] = useState<string>("");
  const [conteudoHtml, setConteudoHtml] = useState("");
  const [signatarios, setSignatarios] = useState<Signatario[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);
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
      }
    } else {
      setSelectedTemplate(null);
    }
  }, [templateId, templates]);

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
    setSignatarios([...signatarios, { nome: "", email: "", cpf: "", tipo: "testemunha" }]);
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
          valor_contrato: valorContrato ? parseFloat(valorContrato) : null,
          data_inicio: dataInicio || null,
          data_fim: dataFim || null,
          link_expires_at: linkExpiresAt,
          corretora_id: corretoraId || null,
          template_id: templateId || null,
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

      // Criar assinatura do contratante (pendente) e da contratada (já assinada automaticamente)
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
        {
          contrato_id: contrato.id,
          nome: "Vangard Gestora",
          email: "contatos@vangardgestora.com.br",
          cpf: null,
          tipo: "contratado",
          ordem: 0,
          status: "assinado",
          assinado_em: new Date().toISOString(),
          ip_assinatura: contratadaIp,
          latitude: contratadaLatitude,
          longitude: contratadaLongitude,
          hash_documento: contratadaHash,
          user_agent: navigator.userAgent,
        },
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
      toast.success("Contrato criado com sucesso!");
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Erro ao criar contrato: " + error.message);
    },
  });

  const resetForm = () => {
    setContratoAnteriorId("");
    setTemplateId("");
    setTitulo("");
    setContratanteNome("");
    setContratanteEmail("");
    setContratanteTipo("pf");
    setContratanteCpf("");
    setContratanteCnpj("");
    setContratanteTelefone("");
    setValorContrato("");
    setDataInicio("");
    setDataFim("");
    setPrazoAssinatura("");
    setCorretoraId("");
    setConteudoHtml("");
    setSignatarios([]);
    setShowReceipt(false);
    setSelectedTemplate(null);
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Contrato</DialogTitle>
          <DialogDescription>
            Crie um novo contrato para enviar para assinatura
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            <Label>Associação</Label>
            <Select value={corretoraId} onValueChange={setCorretoraId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma associação" />
              </SelectTrigger>
              <SelectContent>
                {corretoras?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dados do Contratante */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Dados do Contratante</h4>
              <div className="flex gap-2">
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

          {/* Signatários Adicionais */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Signatários Adicionais</h4>
              <Button variant="outline" size="sm" onClick={addSignatario}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </Button>
            </div>
            {signatarios.map((sig, index) => (
              <div key={index} className="grid grid-cols-4 gap-2 items-end">
                <Input
                  placeholder="Nome"
                  value={sig.nome}
                  onChange={(e) => updateSignatario(index, "nome", e.target.value)}
                />
                <Input
                  placeholder="E-mail"
                  type="email"
                  value={sig.email}
                  onChange={(e) => updateSignatario(index, "email", e.target.value)}
                />
                <Select
                  value={sig.tipo}
                  onValueChange={(v) => updateSignatario(index, "tipo", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contratado">Contratado</SelectItem>
                    <SelectItem value="testemunha">Testemunha</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSignatario(index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
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
            onClick={() => criarContrato.mutate()}
            disabled={criarContrato.isPending}
          >
            {criarContrato.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar Contrato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
