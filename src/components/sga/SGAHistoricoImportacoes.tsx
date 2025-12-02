import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { History, CheckCircle, Trash2, RefreshCw, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SGAHistoricoImportacoesProps {
  onActivate: () => void;
}

export default function SGAHistoricoImportacoes({ onActivate }: SGAHistoricoImportacoesProps) {
  const [importacoes, setImportacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchImportacoes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sga_importacoes")
        .select("*")
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
  }, []);

  const handleActivate = async (id: string) => {
    setActivating(id);
    try {
      // Desativar todas
      await supabase
        .from("sga_importacoes")
        .update({ ativo: false })
        .neq("id", id);

      // Ativar a selecionada
      await supabase
        .from("sga_importacoes")
        .update({ ativo: true })
        .eq("id", id);

      toast.success("Importação ativada com sucesso!");
      fetchImportacoes();
      onActivate();
    } catch (error) {
      console.error("Erro ao ativar:", error);
      toast.error("Erro ao ativar importação");
    } finally {
      setActivating(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      // Deletar eventos primeiro (cascade deveria fazer isso, mas por segurança)
      await supabase
        .from("sga_eventos")
        .delete()
        .eq("importacao_id", id);

      // Deletar importação
      await supabase
        .from("sga_importacoes")
        .delete()
        .eq("id", id);

      toast.success("Importação excluída com sucesso!");
      fetchImportacoes();
      onActivate();
    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir importação");
    } finally {
      setDeleting(null);
    }
  };

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
            <p>Nenhuma importação realizada ainda.</p>
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
                  <TableCell>{imp.total_registros?.toLocaleString()}</TableCell>
                  <TableCell>
                    {format(new Date(imp.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    {imp.ativo ? (
                      <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Ativa
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
                              Esta ação irá excluir permanentemente a importação "{imp.nome_arquivo}" 
                              e todos os {imp.total_registros?.toLocaleString()} registros associados.
                              Esta ação não pode ser desfeita.
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
