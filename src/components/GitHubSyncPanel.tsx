import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  GitBranch, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  Play,
  AlertTriangle,
  PauseCircle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SyncConfig {
  id: string;
  ativo: boolean;
  corretora_nome: string;
  hinova_url: string;
  ultima_execucao: string | null;
  ultimo_status: string | null;
  ultimo_erro: string | null;
}

export function GitHubSyncPanel() {
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("cobranca_automacao_config")
        .select(`
          id,
          ativo,
          hinova_url,
          ultima_execucao,
          ultimo_status,
          ultimo_erro,
          corretoras!cobranca_automacao_config_corretora_id_fkey(nome)
        `)
        .order("corretoras(nome)");

      if (error) throw error;

      const formatted = (data || []).map((item: any) => ({
        id: item.id,
        ativo: item.ativo,
        corretora_nome: item.corretoras?.nome || "Desconhecida",
        hinova_url: item.hinova_url,
        ultima_execucao: item.ultima_execucao,
        ultimo_status: item.ultimo_status,
        ultimo_erro: item.ultimo_erro,
      }));

      setConfigs(formatted);
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
      toast.error("Erro ao carregar configurações de sincronização");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAtivo = async (id: string, currentAtivo: boolean) => {
    try {
      const { error } = await supabase
        .from("cobranca_automacao_config")
        .update({ ativo: !currentAtivo })
        .eq("id", id);

      if (error) throw error;
      toast.success(`Sincronização ${!currentAtivo ? "ativada" : "desativada"}`);
      loadConfigs();
    } catch (error) {
      console.error("Erro ao alterar status:", error);
      toast.error("Erro ao alterar status");
    }
  };

  const handleExecutar = async (config: SyncConfig) => {
    setExecutingId(config.id);
    try {
      const { data, error } = await supabase.functions.invoke("disparar-github-workflow", {
        body: {
          action: "start",
          config_id: config.id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Sincronização iniciada com sucesso!");
        loadConfigs();
      } else {
        toast.error(data?.message || "Erro ao iniciar sincronização");
      }
    } catch (error: any) {
      console.error("Erro ao executar:", error);
      toast.error(error.message || "Erro ao iniciar sincronização");
    } finally {
      setExecutingId(null);
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) {
      return <Badge variant="secondary">Nunca executado</Badge>;
    }

    switch (status) {
      case "sucesso":
        return (
          <Badge className="bg-green-500 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Sucesso
          </Badge>
        );
      case "erro":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Erro
          </Badge>
        );
      case "executando":
        return (
          <Badge className="bg-blue-500 text-white">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Executando
          </Badge>
        );
      case "parado":
        return (
          <Badge variant="outline">
            <PauseCircle className="h-3 w-3 mr-1" />
            Parado
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const activeConfigs = configs.filter(c => c.ativo);
  const inactiveConfigs = configs.filter(c => !c.ativo);
  const withErrors = configs.filter(c => c.ultimo_status === "erro");

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Sincronização GitHub
            </CardTitle>
            <CardDescription>
              Associações configuradas para sincronização automática de cobrança
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadConfigs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{activeConfigs.length}</p>
            <p className="text-xs text-muted-foreground">Ativas</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-600">{inactiveConfigs.length}</p>
            <p className="text-xs text-muted-foreground">Inativas</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{withErrors.length}</p>
            <p className="text-xs text-muted-foreground">Com Erro</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : configs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma associação configurada para sincronização.
          </div>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {configs.map((config) => (
              <div
                key={config.id}
                className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                  config.ativo ? "bg-card" : "bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <Switch
                    checked={config.ativo}
                    onCheckedChange={() => handleToggleAtivo(config.id, config.ativo)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{config.corretora_nome}</p>
                      {getStatusBadge(config.ultimo_status)}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {config.hinova_url}
                    </p>
                    {config.ultima_execucao && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        Última execução:{" "}
                        {format(new Date(config.ultima_execucao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    )}
                    {config.ultimo_status === "erro" && config.ultimo_erro && (
                      <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3" />
                        {config.ultimo_erro}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExecutar(config)}
                    disabled={!config.ativo || executingId === config.id || config.ultimo_status === "executando"}
                  >
                    {executingId === config.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    <span className="ml-1 hidden sm:inline">Executar</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
