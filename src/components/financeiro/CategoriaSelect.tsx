import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface Categoria {
  id: string;
  nome: string;
  tipo: "entrada" | "saida";
  parent_id: string | null;
  nivel: number;
  cor: string;
  ativo: boolean;
}

interface Props {
  tipo: "entrada" | "saida";
  corretoraId: string;
  value: string; // stores categoria.nome (legacy text column)
  onChange: (value: string) => void;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

export function CategoriaSelect({ tipo, corretoraId, value, onChange }: Props) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<string | null>(null);
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const fetchCategorias = useCallback(async () => {
    if (!corretoraId) return;
    setLoading(true);
    let q = supabase
      .from("categorias_financeiras")
      .select("*")
      .eq("tipo", tipo)
      .eq("ativo", true)
      .order("nome");
    if (corretoraId === "administradora") q = q.is("corretora_id", null);
    else q = q.eq("corretora_id", corretoraId);
    const { data, error } = await q;
    if (error) {
      toast.error("Erro ao carregar categorias");
    } else {
      setCategorias((data as any) || []);
    }
    setLoading(false);
  }, [corretoraId, tipo]);

  useEffect(() => {
    fetchCategorias();
  }, [fetchCategorias]);

  // Build hierarchical flat list (depth-first) for the dropdown
  const ordered = useMemo(() => {
    const byParent = new Map<string | null, Categoria[]>();
    categorias.forEach((c) => {
      if (!byParent.has(c.parent_id)) byParent.set(c.parent_id, []);
      byParent.get(c.parent_id)!.push(c);
    });
    const result: { cat: Categoria; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      const items = byParent.get(parentId) || [];
      items.forEach((c) => {
        result.push({ cat: c, depth });
        walk(c.id, depth + 1);
      });
    };
    walk(null, 0);
    return result;
  }, [categorias]);

  const possibleParents = useMemo(
    () => ordered.filter((o) => o.cat.nivel < 4),
    [ordered]
  );

  // If current value isn't in the list (legacy text), keep showing it
  const valueExists = useMemo(
    () => ordered.some((o) => o.cat.nome === value),
    [ordered, value]
  );

  const openCreate = (parentId: string | null = null) => {
    setNewName("");
    setNewParent(parentId);
    setNewColor(PRESET_COLORS[0]);
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Informe o nome da categoria");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        nome: newName.trim(),
        tipo,
        parent_id: newParent,
        cor: newColor,
        ativo: true,
        corretora_id: corretoraId === "administradora" ? null : corretoraId,
      };
      const { data, error } = await supabase
        .from("categorias_financeiras")
        .insert([payload])
        .select()
        .single();
      if (error) throw error;
      toast.success("Categoria criada!");
      setDialogOpen(false);
      await fetchCategorias();
      if (data) onChange((data as any).nome);
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar categoria");
    } finally {
      setSaving(false);
    }
  };

  const selectedCat = useMemo(
    () => ordered.find((o) => o.cat.nome === value)?.cat ?? null,
    [ordered, value]
  );

  return (
    <>
      <div className="flex gap-2">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={loading ? "Carregando..." : "Selecione"} />
          </SelectTrigger>
          <SelectContent>
            {!valueExists && value && (
              <SelectGroup>
                <SelectLabel className="text-xs">Atual</SelectLabel>
                <SelectItem value={value}>{value}</SelectItem>
                <SelectSeparator />
              </SelectGroup>
            )}
            {ordered.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                Nenhuma categoria. Clique em + para criar.
              </div>
            ) : (
              ordered.map(({ cat, depth }) => (
                <SelectItem key={cat.id} value={cat.nome}>
                  <div className="flex items-center gap-2">
                    <span style={{ paddingLeft: `${depth * 12}px` }} className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full inline-block"
                        style={{ backgroundColor: cat.cor }}
                      />
                      {depth > 0 && <span className="text-muted-foreground text-xs">└</span>}
                      {cat.nome}
                    </span>
                  </div>
                </SelectItem>
              ))
            )}
            <SelectSeparator />
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-primary hover:bg-accent rounded-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Defer so the Select closes first
                setTimeout(() => openCreate(null), 0);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Nova categoria
            </button>
            {selectedCat && selectedCat.nivel < 4 && (
              <button
                type="button"
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-primary hover:bg-accent rounded-sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => openCreate(selectedCat.id), 0);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Nova subcategoria de "{selectedCat.nome}"
              </button>
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => openCreate(null)}
          title="Nova categoria"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {newParent ? "Nova subcategoria" : "Nova categoria"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Categoria pai</Label>
              <Select
                value={newParent || "__none"}
                onValueChange={(v) => setNewParent(v === "__none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Nenhuma (Nível 1) —</SelectItem>
                  {possibleParents.map(({ cat, depth }) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {"  ".repeat(depth)}
                      {depth > 0 ? "└ " : ""}
                      {cat.nome} (N{cat.nivel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Combustível"
                autoFocus
              />
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`h-8 w-8 rounded-lg border-2 transition-all ${
                      newColor === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreate} disabled={saving}>
              {saving ? "Salvando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}