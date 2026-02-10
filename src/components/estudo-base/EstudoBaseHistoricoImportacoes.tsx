import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { History, CheckCircle, Trash2, RefreshCw, FileSpreadsheet, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useBIAuditLog } from "@/hooks/useBIAuditLog";

interface Props {
  onActivate: () => void;
  corretoraId: string;
}

export default function EstudoBaseHistoricoImportacoes({ onActivate, corretoraId }: Props) {
  const { registrarLog } = useBIAuditLog();
  const [importacoes, setImportacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchImportacoes = async () => {
    if (!corretoraId) {
      setImportacoes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("estudo_base_importacoes")
        .select("*")
        .eq("corretora_id", corretoraId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setImportacoes(data || []);
    } catch (error) {
      console.error("Erro ao buscar importações:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImportacoes();
  }, [corretoraId]);

  // Realtime
  useEffect(() => {
    if (!corretoraId) return;
    const channel = supabase
      .channel("estudo-base-importacoes-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "estudo_base_importacoes" }, () => {
        fetchImportacoes();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [corretoraId]);

  const handleActivate = async (id: string) => {
    setActivating(id);
    try {
      const importacao = importacoes.find((i) => i.id === id);
      await supabase
        .from("estudo_base_importacoes")
        .update({ ativo: false })
        .eq("corretora_id", corretoraId)
        .neq("id", id);
      await supabase.from("estudo_base_importacoes").update({ ativo: true }).eq("id", id);
      await registrarLog({
        modulo: "estudo_base",
        acao: "alteracao",
        descricao: `Importação ativada: ${importacao?.nome_arquivo}`,
        corretoraId,
      });
      toast.success("Importação ativada!");
      fetchImportacoes();
      onActivate();
    } catch (error) {
      toast.error("Erro ao ativar importação");
    } finally {
      setActivating(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const importacao = importacoes.find((i) => i.id === id);
      await supabase.from("estudo_base_registros").delete().eq("importacao_id", id);
      await supabase.from("estudo_base_importacoes").delete().eq("id", id);
      await registrarLog({
        modulo: "estudo_base",
        acao: "exclusao",
        descricao: `Importação excluída: ${importacao?.nome_arquivo}`,
        corretoraId,
      });
      toast.success("Importação excluída!");
      fetchImportacoes();
      onActivate();
    } catch (error) {
      toast.error("Erro ao excluir importação");
    } finally {
      setDeleting(null);
    }
  };

  if (!corretoraId) {
    return (
      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="p-6">
          <div className="flex gap-3 items-center">
            <AlertCircle className="h-6 w-6 text-yellow-500" />
            <p className="font-medium text-yellow-600">Selecione uma Associação</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Histórico de Importações
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : importacoes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma importação realizada.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Registros</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {importacoes.map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-green-600" />
                      {imp.nome_arquivo}
                    </div>
                  </TableCell>
                  <TableCell>{imp.total_registros?.toLocaleString("pt-BR")}</TableCell>
                  <TableCell>{format(new Date(imp.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</TableCell>
                  <TableCell>
                    {imp.ativo ? (
                      <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
                        <CheckCircle className="h-3 w-3 mr-1" /> Ativa
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inativa</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!imp.ativo && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleActivate(imp.id)}
                          disabled={activating === imp.id}
                        >
                          {activating === imp.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Ativar
                            </>
                          )}
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={deleting === imp.id}
                          >
                            {deleting === imp.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir Importação?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Excluir permanentemente "{imp.nome_arquivo}" e todos os{" "}
                              {imp.total_registros?.toLocaleString("pt-BR")} registros.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(imp.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
