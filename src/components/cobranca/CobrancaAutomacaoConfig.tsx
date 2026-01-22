import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Save, Loader2, Eye, EyeOff, RefreshCw, CheckCircle, XCircle, Clock, Play, History } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import CobrancaAutomacaoLogs from "./CobrancaAutomacaoLogs";

interface CobrancaAutomacaoConfigProps {
  corretoraId: string;
  corretoraNome?: string;
}

interface AutomacaoConfig {
  id?: string;
  corretora_id: string;
  hinova_url: string;
  hinova_user: string;
  hinova_pass: string;
  hinova_codigo_cliente: string;
  layout_relatorio: string;
  ativo: boolean;
  ultima_execucao?: string;
  ultimo_status?: string;
  ultimo_erro?: string;
}

// Valores padrão vazios - cada associação deve configurar seus próprios dados
const DEFAULT_CONFIG: Omit<AutomacaoConfig, 'corretora_id'> = {
  hinova_url: '',
  hinova_user: '',
  hinova_pass: '',
  hinova_codigo_cliente: '',
  layout_relatorio: '',
  ativo: false,
};

export default function CobrancaAutomacaoConfig({ corretoraId, corretoraNome }: CobrancaAutomacaoConfigProps) {
  const [config, setConfig] = useState<AutomacaoConfig>({
    ...DEFAULT_CONFIG,
    corretora_id: corretoraId,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState("config");

  useEffect(() => {
    if (corretoraId) {
      loadConfig();
    }
  }, [corretoraId]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cobranca_automacao_config")
        .select("*")
        .eq("corretora_id", corretoraId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig(data);
      } else {
        setConfig({
          ...DEFAULT_CONFIG,
          corretora_id: corretoraId,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar configuração:", error);
      toast.error("Erro ao carregar configuração de automação");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.hinova_user || !config.hinova_pass) {
      toast.error("Usuário e senha são obrigatórios");
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        corretora_id: corretoraId,
        hinova_url: config.hinova_url,
        hinova_user: config.hinova_user,
        hinova_pass: config.hinova_pass,
        hinova_codigo_cliente: config.hinova_codigo_cliente,
        layout_relatorio: config.layout_relatorio,
        ativo: config.ativo,
      };

      if (config.id) {
        const { error } = await supabase
          .from("cobranca_automacao_config")
          .update(dataToSave)
          .eq("id", config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("cobranca_automacao_config")
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        setConfig(prev => ({ ...prev, id: data.id }));
      }

      toast.success("Configuração salva com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar: " + (error.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const handleExecute = async () => {
    if (!config.id) {
      toast.error("Salve a configuração antes de executar");
      return;
    }

    if (!config.hinova_user || !config.hinova_pass) {
      toast.error("Configure usuário e senha antes de executar");
      return;
    }

    setExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke('executar-cobranca-hinova', {
        body: { corretora_id: corretoraId }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Execução iniciada! Acompanhe o status no histórico.");
        setActiveTab("historico");
        loadConfig();
      } else {
        toast.error(data?.message || "Erro ao executar automação");
      }
    } catch (error: any) {
      console.error("Erro ao executar automação:", error);
      toast.error("Erro ao executar: " + (error.message || "Erro desconhecido"));
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com status e ações */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Automação Hinova
              </CardTitle>
              <CardDescription className="mt-1">
                {corretoraNome}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="ativo-switch" className="text-sm">Ativa</Label>
              <Switch
                id="ativo-switch"
                checked={config.ativo}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, ativo: checked }))}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Status da última execução */}
          {config.ultima_execucao && (
            <div className={`p-3 rounded-lg border mb-4 ${
              config.ultimo_status === 'sucesso' 
                ? 'bg-green-500/10 border-green-500/30' 
                : config.ultimo_status === 'erro'
                ? 'bg-red-500/10 border-red-500/30'
                : config.ultimo_status === 'executando'
                ? 'bg-yellow-500/10 border-yellow-500/30'
                : 'bg-muted border-border'
            }`}>
              <div className="flex items-center gap-3">
                {config.ultimo_status === 'sucesso' ? (
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                ) : config.ultimo_status === 'erro' ? (
                  <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                ) : config.ultimo_status === 'executando' ? (
                  <Loader2 className="h-4 w-4 text-yellow-600 animate-spin shrink-0" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">Última execução:</span>{" "}
                    {format(new Date(config.ultima_execucao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {config.ultimo_status === 'executando' && (
                      <span className="ml-2 text-yellow-600">(em andamento)</span>
                    )}
                  </p>
                  {config.ultimo_erro && (
                    <p className="text-xs text-red-600 mt-1 truncate">{config.ultimo_erro}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Botões de ação em linha */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadConfig} disabled={saving || executing}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Recarregar
            </Button>
            
            <Button 
              variant="secondary" 
              size="sm"
              onClick={handleExecute} 
              disabled={saving || executing || !config.id}
            >
              {executing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Executando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Executar Agora
                </>
              )}
            </Button>
            
            <Button size="sm" onClick={handleSave} disabled={saving || executing}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Configuração e Histórico */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Configurações de acesso */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="hinova-url">URL do Portal Hinova</Label>
                  <Input
                    id="hinova-url"
                    value={config.hinova_url}
                    onChange={(e) => setConfig(prev => ({ ...prev, hinova_url: e.target.value }))}
                    placeholder="https://eris.hinova.com.br/..."
                  />
                  <p className="text-xs text-muted-foreground">
                    URL completa da página de login do portal
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hinova-codigo">Código do Cliente</Label>
                  <Input
                    id="hinova-codigo"
                    value={config.hinova_codigo_cliente}
                    onChange={(e) => setConfig(prev => ({ ...prev, hinova_codigo_cliente: e.target.value }))}
                    placeholder="2363"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hinova-user">Usuário</Label>
                  <Input
                    id="hinova-user"
                    value={config.hinova_user}
                    onChange={(e) => setConfig(prev => ({ ...prev, hinova_user: e.target.value }))}
                    placeholder="usuario@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hinova-pass">Senha</Label>
                  <div className="relative">
                    <Input
                      id="hinova-pass"
                      type={showPassword ? "text" : "password"}
                      value={config.hinova_pass}
                      onChange={(e) => setConfig(prev => ({ ...prev, hinova_pass: e.target.value }))}
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="layout-relatorio">Layout do Relatório</Label>
                  <Input
                    id="layout-relatorio"
                    value={config.layout_relatorio}
                    onChange={(e) => setConfig(prev => ({ ...prev, layout_relatorio: e.target.value }))}
                    placeholder="BI - Vangard Cobrança"
                  />
                  <p className="text-xs text-muted-foreground">
                    Nome exato do layout a ser selecionado
                  </p>
                </div>
              </div>

              {/* Info sobre automação */}
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <h4 className="font-medium text-blue-700 mb-2 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Informações da Automação
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• A automação executa diariamente às 09:00 (horário de Brasília)</li>
                  <li>• Extrai boletos com vencimento no mês atual</li>
                  <li>• Filtra apenas boletos com situação "ABERTO"</li>
                  <li>• Os dados são atualizados automaticamente no dashboard</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          {config.id ? (
            <CobrancaAutomacaoLogs 
              configId={config.id} 
              corretoraId={corretoraId} 
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Salve a configuração para ver o histórico de execuções</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
