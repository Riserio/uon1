import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tags, ChevronRight, ChevronDown, Power, ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface Props {
  corretoraId: string;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: "entrada" | "saida";
  parent_id: string | null;
  nivel: number;
  cor: string;
  descricao: string | null;
  ativo: boolean;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

const empty = { nome: "", tipo: "saida" as "entrada" | "saida", parent_id: null as string | null, cor: "#6366f1", descricao: "", ativo: true };

export default function FinanceiroCategorias({ corretoraId }: Props) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tipoTab, setTipoTab] = useState<"saida" | "entrada">("saida");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [form, setForm] = useState(empty);

  useEffect(() => { if (corretoraId) fetchCategorias(); }, [corretoraId]);

  const fetchCategorias = async () => {
    setLoading(true);
    let q = supabase.from("categorias_financeiras").select("*").order("nome");
    if (corretoraId === "administradora") q = q.is("corretora_id", null);
    else q = q.eq("corretora_id", corretoraId);
    const { data, error } = await q;
    if (error) toast.error("Erro ao carregar categorias");
    setCategorias((data as any) || []);
    setLoading(false);
  };

  const tree = useMemo(() => {
    const filtered = categorias.filter((c) => c.tipo === tipoTab);
    const byParent = new Map<string | null, Categoria[]>();
    filtered.forEach((c) => {
      const k = c.parent_id;
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(c);
    });
    return byParent;
  }, [categorias, tipoTab]);

  const possibleParents = useMemo(() => {
    return categorias.filter((c) => c.tipo === form.tipo && c.nivel < 4 && c.id !== editingId);
  }, [categorias, form.tipo, editingId]);

  const openCreate = (tipo: "entrada" | "saida", parentId: string | null = null) => {
    setEditingId(null);
    setForm({ ...empty, tipo, parent_id: parentId });
    setDialogOpen(true);
  };

  const openEdit = (c: Categoria) => {
    setEditingId(c.id);
    setForm({ nome: c.nome, tipo: c.tipo, parent_id: c.parent_id, cor: c.cor, descricao: c.descricao || "", ativo: c.ativo });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        nome: form.nome.trim(),
        tipo: form.tipo,
        parent_id: form.parent_id,
        cor: form.cor,
        descricao: form.descricao || null,
        ativo: form.ativo,
        corretora_id: corretoraId === "administradora" ? null : corretoraId,
      };
      if (editingId) {
        const { error } = await supabase.from("categorias_financeiras").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Categoria atualizada!");
      } else {
        const { error } = await supabase.from("categorias_financeiras").insert([payload]);
        if (error) throw error;
        toast.success("Categoria criada!");
      }
      setDialogOpen(false);
      fetchCategorias();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    }
  };

  const toggleAtivo = async (c: Categoria) => {
    const { error } = await supabase.from("categorias_financeiras").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) return toast.error("Erro ao alterar status");
    toast.success(!c.ativo ? "Categoria reativada" : "Categoria inativada");
    fetchCategorias();
  };

  const handleDelete = async (c: Categoria) => {
    const childCount = categorias.filter((x) => x.parent_id === c.id).length;
    const msg = childCount > 0
      ? `Excluir "${c.nome}" e suas ${childCount} subcategoria(s)? Esta ação não pode ser desfeita.`
      : `Excluir "${c.nome}"? Esta ação não pode ser desfeita.`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from("categorias_financeiras").delete().eq("id", c.id);
    if (error) return toast.error("Erro ao excluir");
    toast.success("Categoria excluída");
    fetchCategorias();
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderNode = (c: Categoria, depth: number): JSX.Element => {
    const children = tree.get(c.id) || [];
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(c.id);
    return (
      <div key={c.id}>
        <div
          className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors group"
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleExpand(c.id)} className="text-muted-foreground hover:text-foreground">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <div className="w-4" />
          )}
          <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />
          <span className={`font-medium ${!c.ativo ? "text-muted-foreground line-through" : ""}`}>{c.nome}</span>
          <Badge variant="outline" className="text-[10px] h-5">N{c.nivel}</Badge>
          {!c.ativo && <Badge variant="secondary" className="text-[10px] h-5">Inativa</Badge>}
          {c.descricao && <span className="text-xs text-muted-foreground truncate max-w-[300px]">— {c.descricao}</span>}
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {c.nivel < 4 && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => openCreate(c.tipo, c.id)}>
                <Plus className="h-3 w-3" />Sub
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="Editar">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleAtivo(c)} title={c.ativo ? "Inativar" : "Reativar"}>
              <Power className={`h-3.5 w-3.5 ${c.ativo ? "" : "text-muted-foreground"}`} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c)} title="Excluir">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {isOpen && hasChildren && (
          <div>{children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const roots = tree.get(null) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Categorias Financeiras</h2>
          <Badge variant="outline">{categorias.length}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => openCreate("entrada")}>
            <ArrowDownLeft className="h-4 w-4 text-emerald-600" />Nova Entrada
          </Button>
          <Button className="gap-2" onClick={() => openCreate("saida")}>
            <ArrowUpRight className="h-4 w-4" />Nova Saída
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Organize despesas e receitas em até 4 níveis hierárquicos. Subcategorias herdam o tipo da categoria pai.
      </p>

      <Tabs value={tipoTab} onValueChange={(v) => setTipoTab(v as any)}>
        <TabsList>
          <TabsTrigger value="saida" className="gap-2"><ArrowUpRight className="h-4 w-4" />Saídas (Despesas)</TabsTrigger>
          <TabsTrigger value="entrada" className="gap-2"><ArrowDownLeft className="h-4 w-4" />Entradas (Receitas)</TabsTrigger>
        </TabsList>
        <TabsContent value={tipoTab} className="mt-4">
          <Card>
            <CardContent className="p-3">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : roots.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma categoria de {tipoTab === "saida" ? "saída" : "entrada"} cadastrada.
                </div>
              ) : (
                <div className="space-y-0.5">{roots.map((r) => renderNode(r, 0))}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditingId(null); setForm(empty); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm({ ...form, tipo: v as any, parent_id: null })}
                  disabled={!!form.parent_id}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saida">Saída (Despesa)</SelectItem>
                    <SelectItem value="entrada">Entrada (Receita)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoria Pai</Label>
                <Select
                  value={form.parent_id || "__none"}
                  onValueChange={(v) => setForm({ ...form, parent_id: v === "__none" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Nenhuma (Nível 1) —</SelectItem>
                    {possibleParents.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {"›".repeat(p.nivel)} {p.nome} (N{p.nivel})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nome *</Label>
              <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, cor: c })}
                    className={`h-8 w-8 rounded-lg border-2 transition-all ${form.cor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label>Ativa</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit">{editingId ? "Atualizar" : "Criar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}