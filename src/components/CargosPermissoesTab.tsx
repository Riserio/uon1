import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Shield, Loader2, Eye, Edit, Search, Users as UsersIcon, Briefcase } from "lucide-react";

interface Cargo {
  id: string;
  nome: string;
  descricao?: string | null;
  cor?: string | null;
  ativo: boolean;
}

interface Permission {
  menu_item: string;
  pode_visualizar: boolean;
  pode_editar: boolean;
}

const MENU_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "atendimentos", label: "Atendimentos", icon: "📋" },
  { id: "vistorias", label: "Vistorias", icon: "🔍" },
  { id: "acompanhamento", label: "Acompanhamento", icon: "📈" },
  { id: "corretoras", label: "Corretoras", icon: "🏢" },
  { id: "contatos", label: "Contatos", icon: "👥" },
  { id: "usuarios", label: "Usuários", icon: "👤" },
  { id: "equipes", label: "Equipes", icon: "👨‍👩‍👧‍👦" },
  { id: "gestao", label: "Gestão", icon: "⚙️" },
  { id: "uon1sign", label: "UON1SIGN", icon: "✍️" },
  { id: "documentos", label: "Documentos", icon: "📁" },
  { id: "comunicados", label: "Comunicados", icon: "📢" },
  { id: "mensagens", label: "Mensagens", icon: "💬" },
  { id: "agenda", label: "Agenda", icon: "📅" },
  { id: "emails", label: "E-mails", icon: "📧" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "performance", label: "Performance", icon: "🎯" },
  { id: "termos_aceite", label: "Termos de Aceite", icon: "📄" },
  { id: "pid", label: "BI - Indicadores", icon: "📈" },
  { id: "lancamentos_financeiros", label: "Lançamentos Financeiros", icon: "💰" },
  { id: "sinistros", label: "Sinistros", icon: "🚨" },
];

const CORES = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#64748b",
];

export default function CargosPermissoesTab() {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [usuariosPorCargo, setUsuariosPorCargo] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [editingCargo, setEditingCargo] = useState<Cargo | null>(null);
  const [cargoDialogOpen, setCargoDialogOpen] = useState(false);
  const [cargoForm, setCargoForm] = useState<Partial<Cargo>>({
    nome: "", descricao: "", cor: CORES[0], ativo: true,
  });

  const [permCargo, setPermCargo] = useState<Cargo | null>(null);
  const [permissions, setPermissions] = useState<Record<string, Permission>>({});
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);

  const [deleteCargo, setDeleteCargo] = useState<Cargo | null>(null);

  const loadCargos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cargos")
      .select("*")
      .order("nome");
    if (error) {
      toast.error("Erro ao carregar cargos");
    } else {
      setCargos(data as Cargo[]);
      // contar usuários por cargo
      const { data: profs } = await supabase.from("profiles").select("cargo_id").not("cargo_id", "is", null);
      const counts: Record<string, number> = {};
      (profs || []).forEach((p: any) => {
        if (p.cargo_id) counts[p.cargo_id] = (counts[p.cargo_id] || 0) + 1;
      });
      setUsuariosPorCargo(counts);
    }
    setLoading(false);
  };

  useEffect(() => { loadCargos(); }, []);

  const filtered = useMemo(() => {
    if (!search) return cargos;
    const q = search.toLowerCase();
    return cargos.filter((c) => c.nome.toLowerCase().includes(q) || c.descricao?.toLowerCase().includes(q));
  }, [cargos, search]);

  const openNovoCargo = () => {
    setEditingCargo(null);
    setCargoForm({ nome: "", descricao: "", cor: CORES[0], ativo: true });
    setCargoDialogOpen(true);
  };

  const openEditCargo = (c: Cargo) => {
    setEditingCargo(c);
    setCargoForm({ nome: c.nome, descricao: c.descricao || "", cor: c.cor || CORES[0], ativo: c.ativo });
    setCargoDialogOpen(true);
  };

  const saveCargo = async () => {
    if (!cargoForm.nome?.trim()) {
      toast.error("Informe o nome do cargo");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (editingCargo) {
      const { error } = await supabase.from("cargos").update({
        nome: cargoForm.nome.trim(),
        descricao: cargoForm.descricao || null,
        cor: cargoForm.cor,
        ativo: cargoForm.ativo,
      }).eq("id", editingCargo.id);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Cargo atualizado");
    } else {
      const { error } = await supabase.from("cargos").insert({
        nome: cargoForm.nome!.trim(),
        descricao: cargoForm.descricao || null,
        cor: cargoForm.cor,
        ativo: cargoForm.ativo,
        created_by: user?.id,
      });
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Cargo criado");
    }
    setCargoDialogOpen(false);
    loadCargos();
  };

  const handleDelete = async () => {
    if (!deleteCargo) return;
    const { error } = await supabase.from("cargos").delete().eq("id", deleteCargo.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Cargo excluído");
    setDeleteCargo(null);
    loadCargos();
  };

  const openPermissoes = async (c: Cargo) => {
    setPermCargo(c);
    setPermLoading(true);
    const { data } = await supabase
      .from("cargo_menu_permissions")
      .select("menu_item, pode_visualizar, pode_editar")
      .eq("cargo_id", c.id);
    const map: Record<string, Permission> = {};
    MENU_ITEMS.forEach((it) => {
      map[it.id] = { menu_item: it.id, pode_visualizar: true, pode_editar: true };
    });
    (data || []).forEach((p: any) => { map[p.menu_item] = p; });
    setPermissions(map);
    setPermLoading(false);
  };

  const togglePerm = (menuItem: string, type: "visualizar" | "editar", value: boolean) => {
    setPermissions((prev) => {
      const cur = prev[menuItem] || { menu_item: menuItem, pode_visualizar: true, pode_editar: true };
      if (type === "visualizar" && !value) {
        return { ...prev, [menuItem]: { ...cur, pode_visualizar: false, pode_editar: false } };
      }
      if (type === "editar" && value) {
        return { ...prev, [menuItem]: { ...cur, pode_visualizar: true, pode_editar: true } };
      }
      return { ...prev, [menuItem]: { ...cur, [`pode_${type}`]: value } };
    });
  };

  const savePermissoes = async () => {
    if (!permCargo) return;
    setPermSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("cargo_menu_permissions").delete().eq("cargo_id", permCargo.id);
      const toInsert = Object.values(permissions)
        .filter((p) => !p.pode_visualizar || !p.pode_editar)
        .map((p) => ({
          cargo_id: permCargo.id,
          menu_item: p.menu_item,
          pode_visualizar: p.pode_visualizar,
          pode_editar: p.pode_editar,
          created_by: user?.id,
        }));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("cargo_menu_permissions").insert(toInsert);
        if (error) throw error;
      }
      toast.success(`Permissões do cargo ${permCargo.nome} salvas`);
      setPermCargo(null);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setPermSaving(false);
    }
  };

  const visCount = Object.values(permissions).filter((p) => p.pode_visualizar).length;
  const editCount = Object.values(permissions).filter((p) => p.pode_editar).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cargo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
        <Button onClick={openNovoCargo} className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" />
          Novo Cargo
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Briefcase className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">Nenhum cargo cadastrado</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Crie cargos personalizados e defina as permissões de menu de cada um.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="group rounded-2xl border border-border/50 bg-card p-4 hover:shadow-md hover:border-border transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: (c.cor || "#6366f1") + "20", color: c.cor || "#6366f1" }}
                  >
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm truncate">{c.nome}</h3>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <UsersIcon className="h-3 w-3" />
                      {usuariosPorCargo[c.id] || 0} usuário(s)
                    </p>
                  </div>
                </div>
                {!c.ativo && (
                  <Badge variant="outline" className="text-[10px]">Inativo</Badge>
                )}
              </div>

              {c.descricao && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{c.descricao}</p>
              )}

              <div className="flex gap-1.5 pt-3 border-t border-border/50">
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-8 text-xs" onClick={() => openPermissoes(c)}>
                  <Shield className="h-3 w-3" />
                  Permissões
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEditCargo(c)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteCargo(c)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog criar/editar cargo */}
      <Dialog open={cargoDialogOpen} onOpenChange={setCargoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCargo ? "Editar Cargo" : "Novo Cargo"}</DialogTitle>
            <DialogDescription>Defina o nome, descrição e cor do cargo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={cargoForm.nome || ""}
                onChange={(e) => setCargoForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Analista de Sinistros"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                rows={3}
                value={cargoForm.descricao || ""}
                onChange={(e) => setCargoForm((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Resumo das responsabilidades deste cargo"
              />
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {CORES.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    onClick={() => setCargoForm((p) => ({ ...p, cor }))}
                    className={`h-8 w-8 rounded-lg border-2 transition-all ${
                      cargoForm.cor === cor ? "ring-2 ring-offset-2 ring-primary scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: cor }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="cargo-ativo"
                checked={cargoForm.ativo ?? true}
                onCheckedChange={(v) => setCargoForm((p) => ({ ...p, ativo: !!v }))}
              />
              <Label htmlFor="cargo-ativo" className="cursor-pointer">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCargoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveCargo}>{editingCargo ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog permissões */}
      <Dialog open={!!permCargo} onOpenChange={(o) => !o && setPermCargo(null)}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-3">
            <DialogTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Permissões do cargo: {permCargo?.nome}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Configure quais menus os usuários deste cargo podem visualizar e editar.
              Permissões individuais por usuário sobrescrevem as do cargo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 flex flex-col min-h-0 px-6 pb-4 space-y-3">
            {permLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{visCount}/{MENU_ITEMS.length} ver</span>
                  <span className="flex items-center gap-1"><Edit className="h-3 w-3" />{editCount}/{MENU_ITEMS.length} editar</span>
                </div>
                <div className="flex-1 min-h-0">
                  <ScrollArea className="h-full border rounded-lg p-3">
                    <div className="space-y-1.5">
                      {MENU_ITEMS.map((item) => {
                        const perm = permissions[item.id] || { menu_item: item.id, pode_visualizar: true, pode_editar: true };
                        return (
                          <div key={item.id} className="flex items-center gap-2 p-2 border rounded-md bg-card hover:bg-accent/50">
                            <span className="text-base shrink-0">{item.icon}</span>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-xs truncate">{item.label}</h4>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex items-center space-x-1.5">
                                <Checkbox
                                  id={`v-${item.id}`}
                                  checked={perm.pode_visualizar}
                                  onCheckedChange={(v) => togglePerm(item.id, "visualizar", !!v)}
                                  className="h-4 w-4"
                                />
                                <Label htmlFor={`v-${item.id}`} className="text-xs font-normal cursor-pointer flex items-center gap-1">
                                  <Eye className="h-3 w-3" />Ver
                                </Label>
                              </div>
                              <div className="flex items-center space-x-1.5">
                                <Checkbox
                                  id={`e-${item.id}`}
                                  checked={perm.pode_editar}
                                  onCheckedChange={(v) => togglePerm(item.id, "editar", !!v)}
                                  className="h-4 w-4"
                                />
                                <Label htmlFor={`e-${item.id}`} className="text-xs font-normal cursor-pointer flex items-center gap-1">
                                  <Edit className="h-3 w-3" />Editar
                                </Label>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="px-6 pb-6 flex-shrink-0">
            <Button variant="outline" onClick={() => setPermCargo(null)}>Cancelar</Button>
            <Button onClick={savePermissoes} disabled={permSaving}>
              {permSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Salvar Permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteCargo} onOpenChange={(o) => !o && setDeleteCargo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cargo "{deleteCargo?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Usuários vinculados a este cargo ficarão sem cargo personalizado e voltarão a usar somente as permissões do perfil de sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}