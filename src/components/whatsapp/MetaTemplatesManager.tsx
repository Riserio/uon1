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
import { Plus, RefreshCw, Trash2, Edit2, Loader2, MessageSquare } from "lucide-react";

type MetaCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
type MetaStatus = "APPROVED" | "PENDING" | "REJECTED" | "IN_APPEAL" | "DISABLED" | "PAUSED" | string;

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
  header: string;
  body: string;
  footer: string;
}

const emptyForm: FormState = {
  name: "",
  language: "pt_BR",
  category: "UTILITY",
  header: "",
  body: "",
  footer: "",
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
function buildComponents(form: FormState) {
  const components: any[] = [];

  if (form.header.trim()) {
    const headerComp: any = { type: "HEADER", format: "TEXT", text: form.header.trim() };
    const headerVars = extractVariableIndexes(form.header);
    if (headerVars.length > 0) {
      headerComp.example = { header_text: headerVars.map((n) => `Exemplo${n}`) };
    }
    components.push(headerComp);
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
  return components;
}

function extractBody(t: MetaTemplate) {
  return (t.components || []).find((c: any) => c.type === "BODY")?.text || "";
}
function extractHeader(t: MetaTemplate) {
  const h = (t.components || []).find((c: any) => c.type === "HEADER");
  return h?.text || "";
}
function extractFooter(t: MetaTemplate) {
  return (t.components || []).find((c: any) => c.type === "FOOTER")?.text || "";
}

export function MetaTemplatesManager() {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<MetaTemplate | null>(null);

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
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (t: MetaTemplate) => {
    setEditing(t);
    setForm({
      id: t.id,
      name: t.name,
      language: t.language,
      category: (t.category as MetaCategory) || "UTILITY",
      header: extractHeader(t),
      body: extractBody(t),
      footer: extractFooter(t),
    });
    setDialogOpen(true);
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
    setSaving(true);
    try {
      const components = buildComponents(form);
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
        <DialogContent className="max-w-2xl">
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
              <Label>Cabeçalho (opcional)</Label>
              <Input
                value={form.header}
                onChange={(e) => setForm({ ...form, header: e.target.value })}
                placeholder="Ex.: Resumo diário de cobrança"
              />
            </div>

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
