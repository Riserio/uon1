import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Plus,
  Search,
  MoreHorizontal,
  User,
  Mail,
  Phone,
  Briefcase,
  Edit,
  Trash2,
  Eye,
  Users,
  FileBadge,
  Sparkles,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import NovoFuncionarioDialog from "./NovoFuncionarioDialog";
import VisualizarFuncionarioDialog from "./VisualizarFuncionarioDialog";
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
import { cn } from "@/lib/utils";

export default function GestaoFuncionarios() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [novoOpen, setNovoOpen] = useState(false);
  const [visualizar, setVisualizar] = useState<any>(null);
  const [editando, setEditando] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: funcionarios, isLoading } = useQuery({
    queryKey: ["funcionarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("funcionarios").update({ ativo: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funcionarios"] });
      toast.success("Funcionário excluído!");
      setDeleteId(null);
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const filtered = useMemo(() => {
    if (!search) return funcionarios || [];
    const q = search.toLowerCase();
    return (funcionarios || []).filter(
      (f) =>
        f.nome?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        f.cargo?.toLowerCase().includes(q) ||
        f.departamento?.toLowerCase().includes(q),
    );
  }, [funcionarios, search]);

  const stats = useMemo(() => {
    const total = funcionarios?.length || 0;
    const clt = funcionarios?.filter((f) => f.tipo_contrato === "CLT").length || 0;
    const pj = funcionarios?.filter((f) => f.tipo_contrato === "PJ").length || 0;
    const novos =
      funcionarios?.filter((f) => {
        if (!f.data_admissao) return false;
        const d = new Date(f.data_admissao);
        const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
        return days <= 30;
      }).length || 0;
    return { total, clt, pj, novos };
  }, [funcionarios]);

  const widgets = [
    { label: "Total", value: stats.total, icon: Users, color: "bg-primary/10 text-primary" },
    { label: "CLT", value: stats.clt, icon: FileBadge, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { label: "PJ", value: stats.pj, icon: Briefcase, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { label: "Novos (30d)", value: stats.novos, icon: Sparkles, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  ];

  return (
    <div className="space-y-5">
      {/* Stat widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {widgets.map((w) => {
          const Icon = w.icon;
          return (
            <div
              key={w.label}
              className="rounded-2xl border border-border/50 bg-card p-4 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", w.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-2xl font-bold tracking-tight">{w.value}</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium">{w.label}</p>
            </div>
          );
        })}
      </div>

      {/* Search + action */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar funcionário, cargo, departamento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
        <Button onClick={() => setNovoOpen(true)} className="rounded-xl gap-2">
          <Plus className="h-4 w-4" />
          Novo Funcionário
        </Button>
      </div>

      {/* List */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <Card className="col-span-full border-dashed">
            <CardContent className="py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold">Nenhum funcionário encontrado</h3>
              <p className="text-sm text-muted-foreground mt-1">Cadastre o primeiro funcionário no botão acima</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((f) => (
            <div
              key={f.id}
              className="group rounded-2xl border border-border/50 bg-card p-4 hover:shadow-md hover:border-border transition-all"
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 ring-2 ring-background shadow-sm">
                  <AvatarImage src={f.foto_url} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                    {f.nome?.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{f.nome}</h3>
                      {f.cargo && <p className="text-xs text-muted-foreground truncate">{f.cargo}</p>}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setVisualizar(f)}>
                          <Eye className="h-4 w-4 mr-2" /> Visualizar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditando(f);
                            setNovoOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteId(f.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-md font-medium">
                      {f.tipo_contrato || "—"}
                    </Badge>
                    {f.departamento && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-md font-normal">
                        {f.departamento}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {f.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{f.email}</span>
                      </div>
                    )}
                    {f.telefone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{f.telefone}</span>
                      </div>
                    )}
                  </div>

                  {f.data_admissao && (
                    <div className="mt-3 pt-2 border-t border-border/50">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Admissão</p>
                      <p className="text-xs font-medium">{format(new Date(f.data_admissao), "dd/MM/yyyy")}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Dialogs */}
      <NovoFuncionarioDialog
        open={novoOpen}
        onOpenChange={(open) => {
          setNovoOpen(open);
          if (!open) setEditando(null);
        }}
        funcionario={editando}
      />
      {visualizar && (
        <VisualizarFuncionarioDialog funcionario={visualizar} open={!!visualizar} onOpenChange={() => setVisualizar(null)} />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Funcionário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este funcionário? Os registros de ponto serão mantidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && excluir.mutate(deleteId)}
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
