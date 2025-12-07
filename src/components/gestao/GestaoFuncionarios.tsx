import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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

export default function GestaoFuncionarios() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [novoOpen, setNovoOpen] = useState(false);
  const [visualizar, setVisualizar] = useState<any>(null);
  const [editando, setEditando] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch funcionários
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

  // Excluir funcionário
  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("funcionarios")
        .update({ ativo: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funcionarios"] });
      toast.success("Funcionário excluído!");
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    },
  });

  const filteredFuncionarios = funcionarios?.filter((f) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      f.nome?.toLowerCase().includes(searchLower) ||
      f.email?.toLowerCase().includes(searchLower) ||
      f.cargo?.toLowerCase().includes(searchLower) ||
      f.departamento?.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    total: funcionarios?.length || 0,
    clt: funcionarios?.filter((f) => f.tipo_contrato === "CLT").length || 0,
    pj: funcionarios?.filter((f) => f.tipo_contrato === "PJ").length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header com Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Funcionários</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>CLT</CardDescription>
            <CardTitle className="text-2xl">{stats.clt}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>PJ</CardDescription>
            <CardTitle className="text-2xl">{stats.pj}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar funcionários..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setNovoOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Funcionário
        </Button>
      </div>

      {/* Lista de Funcionários */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Carregando...
          </div>
        ) : filteredFuncionarios?.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhum funcionário encontrado</h3>
              <p className="text-muted-foreground mt-1">
                Cadastre seu primeiro funcionário clicando no botão acima
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredFuncionarios?.map((funcionario) => (
            <Card key={funcionario.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={funcionario.foto_url} />
                    <AvatarFallback>
                      {funcionario.nome?.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium truncate">{funcionario.nome}</h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setVisualizar(funcionario)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setEditando(funcionario);
                            setNovoOpen(true);
                          }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteId(funcionario.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {funcionario.cargo && (
                        <Badge variant="secondary" className="text-xs">
                          {funcionario.cargo}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {funcionario.tipo_contrato}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {funcionario.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{funcionario.email}</span>
                        </div>
                      )}
                      {funcionario.telefone && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <span>{funcionario.telefone}</span>
                        </div>
                      )}
                      {funcionario.departamento && (
                        <div className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          <span>{funcionario.departamento}</span>
                        </div>
                      )}
                    </div>
                    {funcionario.data_admissao && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Admissão: {format(new Date(funcionario.data_admissao), "dd/MM/yyyy")}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
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
        <VisualizarFuncionarioDialog
          funcionario={visualizar}
          open={!!visualizar}
          onOpenChange={() => setVisualizar(null)}
        />
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
