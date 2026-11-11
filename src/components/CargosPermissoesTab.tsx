import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mensagemErroBanco } from "@/lib/dbErrors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2, Shield, Loader2, Search, Users as UsersIcon, Briefcase, Eye } from "lucide-react";
import { CargoEditorDialog, type CargoBasico } from "@/components/usuarios/CargoEditorDialog";
import { linhasParaMapa, resumoAcesso, type MapaPermissoes } from "@/lib/permissoes";
import { useInvalidarPermissoes } from "@/hooks/usePermissoes";

interface Cargo extends CargoBasico {
  ativo: boolean;
}

export default function CargosPermissoesTab() {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [usuariosPorCargo, setUsuariosPorCargo] = useState<Record<string, number>>({});
  const [permsPorCargo, setPermsPorCargo] = useState<Record<string, MapaPermissoes>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [editor, setEditor] = useState<{ open: boolean; cargo: Cargo | null }>({ open: false, cargo: null });
  const [deleteCargo, setDeleteCargo] = useState<Cargo | null>(null);
  const invalidar = useInvalidarPermissoes();

  const loadCargos = async () => {
    setLoading(true);
    const [{ data, error }, { data: profs }, { data: perms }] = await Promise.all([
      supabase.from("cargos").select("*").order("nome"),
      supabase.from("profiles").select("cargo_id").not("cargo_id", "is", null),
      supabase.from("cargo_menu_permissions").select("cargo_id, menu_item, pode_visualizar, pode_editar"),
    ]);
    if (error) {
      toast.error("Erro ao carregar cargos");
      setLoading(false);
      return;
    }
    setCargos(data as Cargo[]);
    const counts: Record<string, number> = {};
    (profs || []).forEach((p: any) => {
      if (p.cargo_id) counts[p.cargo_id] = (counts[p.cargo_id] || 0) + 1;
    });
    setUsuariosPorCargo(counts);
    const porCargo: Record<string, any[]> = {};
    (perms || []).forEach((p: any) => {
      (porCargo[p.cargo_id] ||= []).push(p);
    });
    setPermsPorCargo(Object.fromEntries(Object.entries(porCargo).map(([k, v]) => [k, linhasParaMapa(v)])));
    setLoading(false);
  };

  useEffect(() => {
    loadCargos();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return cargos;
    const q = search.toLowerCase();
    return cargos.filter((c) => c.nome.toLowerCase().includes(q) || c.descricao?.toLowerCase().includes(q));
  }, [cargos, search]);

  const handleDelete = async () => {
    if (!deleteCargo) return;
    const { error } = await supabase.from("cargos").delete().eq("id", deleteCargo.id);
    if (error) {
      toast.error(mensagemErroBanco(error));
      return;
    }
    toast.success("Cargo excluído");
    setDeleteCargo(null);
    invalidar();
    loadCargos();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium text-foreground">Como funciona</p>
        <p className="text-muted-foreground text-xs mt-1">
          Crie o cargo já definindo o que ele acessa (módulos e áreas internas). Depois, ao cadastrar ou editar um usuário,
          basta escolher o cargo: ele passa a ver exatamente o que foi liberado.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cargo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl" />
        </div>
        <Button onClick={() => setEditor({ open: true, cargo: null })} className="gap-2 rounded-xl">
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
            <p className="text-sm text-muted-foreground mt-1">Crie cargos e defina o que cada um pode acessar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const mapa = permsPorCargo[c.id];
            const resumo = mapa ? resumoAcesso(mapa) : null;
            return (
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
                  {!c.ativo && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                </div>

                {c.descricao && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.descricao}</p>}

                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mb-3">
                  <Eye className="h-3 w-3" />
                  {resumo
                    ? `${resumo.visiveis.length} de ${resumo.total} módulos visíveis`
                    : "Sem permissões definidas (segue o perfil de sistema)"}
                </p>

                <div className="flex gap-1.5 pt-3 border-t border-border/50">
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-8 text-xs" onClick={() => setEditor({ open: true, cargo: c })}>
                    <Shield className="h-3 w-3" />
                    Permissões
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditor({ open: true, cargo: c })} aria-label="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => setDeleteCargo(c)}
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CargoEditorDialog
        open={editor.open}
        onOpenChange={(o) => setEditor((p) => ({ ...p, open: o }))}
        cargo={editor.cargo}
        onSaved={() => loadCargos()}
      />

      <AlertDialog open={!!deleteCargo} onOpenChange={(o) => !o && setDeleteCargo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cargo "{deleteCargo?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {usuariosPorCargo[deleteCargo?.id ?? ""]
                ? `${usuariosPorCargo[deleteCargo!.id]} usuário(s) ficarão sem cargo e voltarão a usar só as permissões do perfil de sistema.`
                : "Nenhum usuário usa este cargo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
