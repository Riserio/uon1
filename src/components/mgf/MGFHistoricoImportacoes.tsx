import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, CheckCircle2, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MGFHistoricoImportacoesProps {
  onActivate: () => void;
  corretoraId: string;
}

export default function MGFHistoricoImportacoes({ onActivate, corretoraId }: MGFHistoricoImportacoesProps) {
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

    try {
      const { data, error } = await supabase
        .from("mgf_importacoes")
        .select("*")
        .eq("corretora_id", corretoraId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setImportacoes(data || []);
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImportacoes();
  }, [corretoraId]);

  const handleActivate = async (id: string) => {
    setActivating(id);
    try {
      // Desativar todas
      await supabase
        .from("mgf_importacoes")
        .update({ ativo: false })
        .eq("corretora_id", corretoraId);

      // Ativar a selecionada
      await supabase
        .from("mgf_importacoes")
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
    if (!confirm("Tem certeza que deseja excluir esta importação?")) return;

    setDeleting(id);
    try {
      // Deletar dados associados
      await supabase.from("mgf_dados").delete().eq("importacao_id", id);
      
      // Deletar importação
      await supabase.from("mgf_importacoes").delete().eq("id", id);

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

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (importacoes.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-5 w-5 text-orange-500" />
          Histórico de Importações
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {importacoes.map((imp) => (
            <div
              key={imp.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                imp.ativo ? "bg-green-500/10 border-green-500/30" : "bg-muted/50"
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{imp.nome_arquivo}</p>
                  {imp.ativo && (
                    <Badge variant="default" className="bg-green-500">
                      Ativo
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {imp.total_registros?.toLocaleString()} registros •{" "}
                  {format(new Date(imp.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>
              <div className="flex items-center gap-2">
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
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <span className="ml-1 hidden sm:inline">Ativar</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(imp.id)}
                  disabled={deleting === imp.id}
                  className="text-destructive hover:text-destructive"
                >
                  {deleting === imp.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
