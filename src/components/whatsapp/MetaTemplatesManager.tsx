import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, Edit2, Loader2, MessageSquare, FileText, CheckCircle2 } from "lucide-react";

type MetaCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
type MetaStatus = "APPROVED" | "PENDING" | "REJECTED" | "IN_APPEAL" | "DISABLED" | "PAUSED" | string;
type HeaderFormat = "NONE" | "TEXT" | "DOCUMENT";

interface MetaTemplate {
  id?: string;
  name: string;
  status?: MetaStatus;
  language: string;
  category: MetaCategory;
  components: any[];
  rejected_reason?: string | null;
}

interface FormState {
  id?: string;
  name: string;
  language: string;
  category: MetaCategory;
  headerFormat: HeaderFormat;
  header: string; // usado quando headerFormat === "TEXT"
  headerHandle: string; // usado quando headerFormat === "DOCUMENT" (gerado via upload-meta-header-example)
  headerExampleFilename: string;
  body: string;
  footer: string;
  hasUrlButton: boolean;
  buttonText: string;
  buttonUrlBase: string;
  buttonUrlExample: string;
}

const emptyForm: FormState = {
  name: "",
  language: "pt_BR",
  category: "UTILITY",
  headerFormat: "NONE",
  header: "",
  headerHandle: "",
  headerExampleFilename: "",
  body: "",
  footer: "",
  hasUrlButton: false,
  buttonText: "Abrir Painel",
  buttonUrlBase: "https://uon1.com.br",
  buttonUrlExample: "",
};

// A Edge Function sempre responde com { error, details } no corpo quando algo dá
// errado (400/500/502), mas o supabase-js só expõe isso em `error.context`
// (o Response cru) — `error.message` é sempre a string genérica "Edge Function
// returned a non-2xx status code". Esta função extrai o motivo real, incluindo
// o erro específico devolvido pela própria API da Meta quando presente.
async function extractFunctionErrorMessage(error: any): Promise<string> {
  try {
    if (error?.context && typeof error.context.json === "function") {
      // O body de um Response só pode ser lido uma vez — clonar evita conflito
      // caso o supabase-js (ou outro código) também tente lê-lo.
      const res = typeof error.context.clone === "function" ? error.context.clone() : error.context;
      const body = await res.json();
      const metaErr = body?.details?.error;
      // A Meta quase sempre manda uma `message` genérica ("Invalid parameter"),
      // enquanto o motivo real fica em `error_data.details` ou `error_user_msg`.
      // Priorizamos os campos mais específicos primeiro.
      const metaMsg = metaErr?.error_data?.details || metaErr?.error_user_msg || metaErr?.message;
      if (metaMsg) return metaMsg as string;
      if (body?.error) return typeof body.error === "string" ? body.error : JSON.stringify(body.error);
      if (body?.details) return JSON.stringify(body.details);
    }
  } catch (_e) {
    // corpo não era JSON ou já foi consumido — cai no fallback abaixo
  }
  return error?.message || "Erro desconhecido";
}

function statusVariant(status?: MetaStatus): { className: string; label: string } {
  const s = (status || "").toUpperCase();
  if (s === "APPROVED")
    return {
      className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
      label: "APPROVED",
    };
  if (s === "PENDING" || s === "IN_APPEAL")
    return { className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", label: s };
  if (s === "REJECTED" || s === "DISABLED" || s === "PAUSED")
    return { className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30", label: s };
  return { className: "bg-muted text-muted-foreground border-border", label: s || "DESCONHECIDO" };
}

// Retorna os números de variável ({{1}}, {{2}}, ...) usados num texto, em ordem
// e sem repetição.
function extractVariableIndexes(text: string): number[] {
  const nums = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => parseInt(m[1], 10));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

// A API da Meta EXIGE um `example` para todo componente (HEADER ou BODY) que
// contenha variáveis {{n}} — sem isso, a criação do template falha com o erro
// genérico "Invalid parameter" (o motivo real, quando visível, é algo como
// "Message body text contains variables. Please provide example values.").
// Como o formulário atual não coleta exemplos, geramos valores de exemplo
// automáticos para satisfazer a validação da Meta.
//
// `originalComponents` (opcional) é usado quando o header é DOCUMENT e o
// usuário está apenas editando outro campo (sem gerar um novo exemplo/handle
// nesta sessão) — nesse caso reaproveitamos o HEADER já aprovado sem alterá-lo.
function buildComponents(form: FormState, originalComponents?: any[]) {
  const components: any[] = [];

  if (form.headerFormat === "TEXT" && form.header.trim()) {
    const headerComp: any = { type: "HEADER", format: "TEXT", text: form.header.trim() };
    const headerVars = extractVariableIndexes(form.header);
    if (headerVars.length > 0) {
      headerComp.example = { header_text: headerVars.map((n) => `Exemplo${n}`) };
    }
    components.push(headerComp);
  } else if (form.headerFormat === "DOCUMENT") {
    if (form.headerHandle) {
      components.push({ type: "HEADER", format: "DOCUMENT", example: { header_handle: [form.headerHandle] } });
    } else {
      const existing = (originalComponents || []).find((c: any) => c.type === "HEADER" && c.format === "DOCUMENT");
      if (existing) components.push(existing);
    }
  }

  const bodyComp: any = { type: "BODY", text: form.body };
  const bodyVars = extractVariableIndexes(form.body);
  if (bodyVars.length > 0) {
    bodyComp.example = { body_text: [bodyVars.map((n) => `Exemplo${n}`)] };
  }
  components.push(bodyComp);

  if (form.footer.trim()) {
    components.push({ type: "FOOTER", text: form.footer.trim() });
  }

  if (form.hasUrlButton && form.buttonText.trim() && form.buttonUrlBase.trim()) {
    const base = form.buttonUrlBase.trim().replace(/\/+$/, "");
    components.push({
      type: "BUTTONS",
      buttons: [
        {
          type: "URL",
          text: form.buttonText.trim(),
          url: `${base}/{{1}}`,
          example: [form.buttonUrlExample.trim() || `${base}/exemplo`],
        },
      ],
    });
  }

  return components;
}

function extractHeaderInfo(t: MetaTemplate): { format: HeaderFormat; text: string } {
  const h = (t.components || []).find((c: any) => c.type === "HEADER");
  if (!h) return { format: "NONE", text: "" };
  if (h.format === "DOCUMENT") return { format: "DOCUMENT", text: "" };
  return { format: "TEXT", text: h.text || "" };
}
function extractBody(t: MetaTemplate) {
  return (t.components || []).find((c: any) => c.type === "BODY")?.text || "";
}
function extractFooter(t: MetaTemplate) {
  return (t.components || []).find((c: any) => c.type === "FOOTER")?.text || "";
}
function extractButton(t: MetaTemplate) {
  const b = (t.components || []).find((c: any) => c.type === "BUTTONS");
  const urlBtn = (b?.buttons || []).find((x: any) => x.type === "URL");
  if (!urlBtn) return { has: false, text: "Abrir Painel", base: "https://uon1.com.br", example: "" };
  const url: string = urlBtn.url || "";
  const base = url.replace(/\/\{\{\d+\}\}\s*$/, "");
  return {
    has: true,
    text: urlBtn.text || "Abrir Painel",
    base: base || "https://uon1.com.br",
    example: (Array.isArray(urlBtn.example) && urlBtn.example[0]) || "",
  };
}

export function MetaTemplatesManager() {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<MetaTemplate | null>(null);
  const [corretoras, setCorretoras] = useState<{ id: string; nome: string; slug: string | null }[]>([]);
  const [exemploCorretoraId, setExemploCorretoraId] = useState<string>("");
  const [gerandoExemplo, setGerandoExemplo] = useState(false);

  const load = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerenciar-template-whatsapp", {
        body: { action: "get" },
      });
      if (error) throw new Error(await extractFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      setTemplates(data?.templates || []);
    } catch (e: any) {
      toast.error("Erro ao carregar templates Meta: " + (e?.message || "desconhecido"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    supabase
      .from("corretoras")
      .select("id, nome, slug")
      .order("nome")
      .then(({ data }) => {
        setCorretoras(data || []);
        if (data && data.length > 0) setExemploCorretoraId(data[0].id);
      });
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (t: MetaTemplate) => {
    setEditing(t);
    const headerInfo = extractHeaderInfo(t);
    const btn = extractButton(t);
    setForm({
      id: t.id,
      name: t.name,
      language: t.language,
      category: (t.category as MetaCategory) || "UTILITY",
      headerFormat: headerInfo.format,
      header: headerInfo.text,
      headerHandle: "", // handle não é recuperável a partir do template já aprovado — só necessário se gerar um novo exemplo
      headerExampleFilename: "",
      body: extractBody(t),
      footer: extractFooter(t),
      hasUrlButton: btn.has,
      buttonText: btn.text,
      buttonUrlBase: btn.base,
      buttonUrlExample: btn.example,
    });
    setDialogOpen(true);
  };

  const gerarExemploDocumento = async () => {
    setGerandoExemplo(true);
    try {
      const { data, error } = await supabase.functions.invoke("upload-meta-header-example", {
        body: exemploCorretoraId ? { corretora_id: exemploCorretoraId } : {},
      });
      if (error) throw new Error(await extractFunctionErrorMessage(error));
      if (!data?.success) throw new Error(data?.error || "Falha ao gerar exemplo");
      setForm((f) => ({ ...f, headerHandle: data.header_handle, headerExampleFilename: data.filename }));
      toast.success("PDF de exemplo gerado e enviado à Meta");
    } catch (e: any) {
      toast.error("Erro ao gerar exemplo: " + (e?.message || "desconhecido"));
    } finally {
      setGerandoExemplo(false);
    }
  };

  const handleSave = async () => {
    if (!form.body.trim()) {
      toast.error("Corpo da mensagem é obrigatório");
      return;
    }
    if (!editing && !/^[a-z0-9_]+$/.test(form.name)) {
      toast.error("Nome deve conter apenas letras minúsculas, números e _");
      return;
    }
    if (form.headerFormat === "DOCUMENT" && !form.headerHandle && !editing) {
      toast.error("Gere o PDF de exemplo antes de enviar para aprovação (cabeçalho tipo Documento)");
      return;
    }
    setSaving(true);
    try {
      const components = buildComponents(form, editing?.components);
      if (editing) {
        const { data, error } = await supabase.functions.invoke("gerenciar-template-whatsapp", {
          body: { action: "update", template_id: editing.id, components },
        });
        if (error) throw new Error(await extractFunctionErrorMessage(error));
        if (data?.error) throw new Error(data.error);
        toast.success("Template atualizado (aguardando revisão da Meta)");
      } else {
        const { data, error } = await supabase.functions.invoke("gerenciar-template-whatsapp", {
          body: {
            action: "create",
            name: form.name,
            language: form.language,
            category: form.category,
            components,
          },
        });
        if (error) throw new Error(await extractFunctionErrorMessage(error));
        if (data?.error) throw new Error(data.error);
        toast.success("Template criado (aguardando aprovação da Meta)");
      }
      setDialogOpen(false);
      await load(true);
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: MetaTemplate) => {
    if (!confirm(`Excluir template "${t.name}" da Meta? Esta ação é irreversível.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("gerenciar-template-whatsapp", {
        body: { action: "delete", name: t.name, template_id: t.id },
      });
      if (error) throw new Error(await extractFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      toast.success("Template excluído");
      await load(true);
    } catch (e: any) {
      toast.error("Erro ao excluir: " + (e?.message || "desconhecido"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Templates da Meta (WhatsApp Business)
            </CardTitle>
            <CardDescription>
              Gerencie os templates oficiais da Meta usados para iniciar conversas fora da janela de 24h.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar status
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Novo template
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : templates.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum template cadastrado na Meta</p>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => {
              const st = statusVariant(t.status);
              const body = extractBody(t);
              const headerInfo = extractHeaderInfo(t);
              return (
                <div
                  key={`${t.name}-${t.language}-${t.id ?? ""}`}
                  className="border rounded-2xl p-4 hover:bg-muted/40 transition-colors backdrop-blur"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h4 className="font-medium truncate">{t.name}</h4>
                        <Badge variant="outline" className={st.className}>
                          {st.label}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {t.language}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {t.category}
                        </Badge>
                        {headerInfo.format === "DOCUMENT" && (
                          <Badge variant="outline" className="text-[10px] gap-1 border-blue-500/30 text-blue-600 dark:text-blue-400">
                            <FileText className="h-3 w-3" /> Anexo PDF
                          </Badge>
                        )}
                      </div>
                      {t.rejected_reason && (
                        <p className="text-xs text-red-600 dark:text-red-400 mb-1">Motivo: {t.rejected_reason}</p>
                      )}
                      <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans line-clamp-3">
                        {body}
                      </pre>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)} title="Editar">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(t)} title="Excluir">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar template: ${editing.name}` : "Novo template Meta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-1">
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  disabled={!!editing}
                  onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })}
                  placeholder="ex: cobranca_diaria"
                />
                <p className="text-[10px] text-muted-foreground">Minúsculas, números e _</p>
              </div>
              <div className="space-y-2">
                <Label>Idioma *</Label>
                <Select
                  value={form.language}
                  onValueChange={(v) => setForm({ ...form, language: v })}
                  disabled={!!editing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">Português (BR)</SelectItem>
                    <SelectItem value="pt_PT">Português (PT)</SelectItem>
                    <SelectItem value="en_US">Inglês (US)</SelectItem>
                    <SelectItem value="es">Espanhol</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as MetaCategory })}
                  disabled={!!editing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTILITY">UTILITY</SelectItem>
                    <SelectItem value="MARKETING">MARKETING</SelectItem>
                    <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de cabeçalho</Label>
              <Select
                value={form.headerFormat}
                onValueChange={(v) => setForm({ ...form, headerFormat: v as HeaderFormat })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Nenhum</SelectItem>
                  <SelectItem value="TEXT">Texto</SelectItem>
                  <SelectItem value="DOCUMENT">Documento (PDF)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.headerFormat === "TEXT" && (
              <div className="space-y-2">
                <Label>Texto do cabeçalho</Label>
                <Input
                  value={form.header}
                  onChange={(e) => setForm({ ...form, header: e.target.value })}
                  placeholder="Ex.: Resumo diário de cobrança"
                />
              </div>
            )}

            {form.headerFormat === "DOCUMENT" && (
              <div className="space-y-2 rounded-xl border p-3 bg-muted/30">
                <Label className="text-xs text-muted-foreground">
                  Cabeçalho de documento (PDF) — a Meta exige um arquivo de exemplo real para aprovar o template. O
                  PDF de verdade (com os dados de cada associação) é gerado e anexado automaticamente em cada envio.
                </Label>
                {editing && extractHeaderInfo(editing).format === "DOCUMENT" && !form.headerHandle && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Cabeçalho Documento já aprovado — só gere um novo exemplo
                    se precisar reenviar para revisão.
                  </p>
                )}
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                  <Select value={exemploCorretoraId} onValueChange={setExemploCorretoraId}>
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder="Associação de exemplo" />
                    </SelectTrigger>
                    <SelectContent>
                      {corretoras.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={gerarExemploDocumento}
                    disabled={gerandoExemplo}
                  >
                    {gerandoExemplo ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Gerar PDF de exemplo e enviar à Meta
                  </Button>
                </div>
                {form.headerHandle && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Exemplo pronto ({form.headerExampleFilename})
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Corpo *</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={8}
                placeholder={"Olá {{1}}, seu resumo do dia está pronto.\nTotal: {{2}}"}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Use variáveis no formato {"{{1}}, {{2}}..."} — a Meta valida a ordem sequencial.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Rodapé (opcional)</Label>
              <Input
                value={form.footer}
                onChange={(e) => setForm({ ...form, footer: e.target.value })}
                placeholder="Ex.: Não responda a esta mensagem"
              />
            </div>

            <div className="space-y-2 rounded-xl border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.hasUrlButton}
                  onChange={(e) => setForm({ ...form, hasUrlButton: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                Adicionar botão de link (ex.: "Abrir Painel")
              </label>
              {form.hasUrlButton && (
                <div className="grid gap-2 md:grid-cols-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs">Texto do botão</Label>
                    <Input
                      value={form.buttonText}
                      onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
                      placeholder="Abrir Painel"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">URL base</Label>
                    <Input
                      value={form.buttonUrlBase}
                      onChange={(e) => setForm({ ...form, buttonUrlBase: e.target.value })}
                      placeholder="https://uon1.com.br"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">URL de exemplo (para aprovação da Meta)</Label>
                    <Input
                      value={form.buttonUrlExample}
                      onChange={(e) => setForm({ ...form, buttonUrlExample: e.target.value })}
                      placeholder="https://uon1.com.br/associacao-exemplo/dashboard"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Em cada envio, a URL final é montada automaticamente como URL base + "/associacao/dashboard" da
                      corretora de destino.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Salvar alterações" : "Enviar para aprovação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
