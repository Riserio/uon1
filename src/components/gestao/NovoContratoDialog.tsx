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
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { MaskedInput } from "@/components/ui/masked-input";

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
  
  const [templateId, setTemplateId] = useState<string>("");
  const [titulo, setTitulo] = useState("");
  const [contratanteNome, setContratanteNome] = useState("");
  const [contratanteEmail, setContratanteEmail] = useState("");
  const [contratanteCpf, setContratanteCpf] = useState("");
  const [contratanteTelefone, setContratanteTelefone] = useState("");
  const [valorContrato, setValorContrato] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [corretoraId, setCorretoraId] = useState<string>("");
  const [conteudoHtml, setConteudoHtml] = useState("");
  const [signatarios, setSignatarios] = useState<Signatario[]>([]);

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
        setConteudoHtml(template.conteudo_html);
        setTitulo(template.titulo);
      }
    }
  }, [templateId, templates]);

  // Substituir variáveis no conteúdo
  const processarConteudo = (html: string) => {
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

      // Criar contrato
      const { data: contrato, error: contratoError } = await supabase
        .from("contratos")
        .insert({
          template_id: templateId || null,
          titulo,
          conteudo_html: conteudoProcessado,
          contratante_nome: contratanteNome,
          contratante_email: contratanteEmail,
          contratante_cpf: contratanteCpf,
          contratante_telefone: contratanteTelefone,
          valor_contrato: valorContrato ? parseFloat(valorContrato) : null,
          data_inicio: dataInicio || null,
          data_fim: dataFim || null,
          corretora_id: corretoraId || null,
          status: "rascunho",
          created_by: user.id,
          variaveis_preenchidas: {
            nome: contratanteNome,
            cpf: contratanteCpf,
            email: contratanteEmail,
            telefone: contratanteTelefone,
            valor: valorContrato,
            data_inicio: dataInicio,
            data_fim: dataFim,
          },
        })
        .select()
        .single();

      if (contratoError) throw contratoError;

      // Criar assinatura do contratante
      const assinaturas = [
        {
          contrato_id: contrato.id,
          nome: contratanteNome,
          email: contratanteEmail,
          cpf: contratanteCpf,
          tipo: "contratante",
          ordem: 1,
        },
        ...signatarios.map((s, i) => ({
          contrato_id: contrato.id,
          nome: s.nome,
          email: s.email,
          cpf: s.cpf,
          tipo: s.tipo,
          ordem: i + 2,
        })),
      ];

      const { error: assinaturasError } = await supabase
        .from("contrato_assinaturas")
        .insert(assinaturas);

      if (assinaturasError) throw assinaturasError;

      // Registrar histórico
      await supabase.from("contrato_historico").insert({
        contrato_id: contrato.id,
        acao: "criado",
        descricao: "Contrato criado",
        user_id: user.id,
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
    setTemplateId("");
    setTitulo("");
    setContratanteNome("");
    setContratanteEmail("");
    setContratanteCpf("");
    setContratanteTelefone("");
    setValorContrato("");
    setDataInicio("");
    setDataFim("");
    setCorretoraId("");
    setConteudoHtml("");
    setSignatarios([]);
  };

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
            <h4 className="font-medium">Dados do Contratante</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={contratanteNome}
                  onChange={(e) => setContratanteNome(e.target.value)}
                  placeholder="Nome completo"
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
              <div className="space-y-2">
                <Label>CPF</Label>
                <MaskedInput
                  mask="999.999.999-99"
                  value={contratanteCpf}
                  onChange={(e) => setContratanteCpf(e.target.value)}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <MaskedInput
                  mask="(99) 99999-9999"
                  value={contratanteTelefone}
                  onChange={(e) => setContratanteTelefone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
          </div>

          {/* Valor e Datas */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Valor do Contrato</Label>
              <Input
                type="number"
                step="0.01"
                value={valorContrato}
                onChange={(e) => setValorContrato(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Fim</Label>
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

          {/* Conteúdo do Contrato */}
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
